import { Router, type IRouter, type Request, type Response } from "express";
import { AnalyzeStockBody, AnalyzeStockResponse, GetMarketOverviewResponse } from "@workspace/api-zod";

type Bar = { date: string; open: number; high: number; low: number; close: number; volume: number };
type YahooResult = { meta?: Record<string, unknown>; timestamp?: number[]; indicators?: { quote?: Array<Record<string, Array<number | null>>> } };

const router: IRouter = Router();
const cache = new Map<string, { expires: number; value: unknown }>();
const symbols = new Map([
  ["TCS", "TCS.NS"], ["INFY", "INFY.NS"], ["RELIANCE", "RELIANCE.NS"], ["HDFCBANK", "HDFCBANK.NS"],
  ["TATAMOTORS", "TATAMOTORS.NS"], ["ITC", "ITC.NS"], ["HCLTECH", "HCLTECH.NS"], ["SBIN", "SBIN.NS"],
]);

function mean(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function sma(values: number[], period: number, index: number) { return index + 1 < period ? null : mean(values.slice(index + 1 - period, index + 1)); }
function ema(values: number[], period: number) {
  const result: Array<number | null> = [];
  let previous: number | null = null;
  const multiplier = 2 / (period + 1);
  values.forEach((value, index) => {
    if (index + 1 < period) result.push(null);
    else if (previous === null) { previous = mean(values.slice(index + 1 - period, index + 1)); result.push(previous); }
    else { previous = (value - previous) * multiplier + previous; result.push(previous); }
  });
  return result;
}
function rsi(values: number[], period = 14) {
  if (values.length <= period) return null;
  let gains = 0; let losses = 0;
  for (let i = 1; i <= period; i++) { const delta = values[i] - values[i - 1]; gains += Math.max(delta, 0); losses += Math.max(-delta, 0); }
  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
}
function round(value: number | null, digits = 2) { return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits)); }
function cleanSymbol(input: string) { return input.trim().toUpperCase().replace(/[^A-Z0-9.&_-]/g, "").slice(0, 20); }
function sourceSymbol(input: string) { return input.includes(".") ? input : symbols.get(input) ?? `${input}.NS`; }
function periodRange(period: string) {
  if (period === "1mo") return "1mo"; if (period === "3mo") return "3mo"; if (period === "1y") return "1y";
  if (period === "2y") return "2y"; if (period === "max") return "max"; return "6mo";
}
async function yahoo(symbol: string, period: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${periodRange(period)}&interval=1d&events=history`;
  const response = await fetch(url, { headers: { "User-Agent": "StockPilotAI/1.0" } });
  if (!response.ok) throw new Error(`Market data provider returned ${response.status}`);
  const payload = await response.json() as { chart?: { result?: YahooResult[]; error?: unknown } };
  const result = payload.chart?.result?.[0];
  if (!result?.timestamp || !result.indicators?.quote?.[0]) throw new Error("No market data was found for that symbol");
  const quote = result.indicators.quote[0];
  const bars: Bar[] = result.timestamp.map((stamp, index) => ({
    date: new Date(stamp * 1000).toISOString().slice(0, 10),
    open: Number(quote.open?.[index]), high: Number(quote.high?.[index]), low: Number(quote.low?.[index]),
    close: Number(quote.close?.[index]), volume: Number(quote.volume?.[index]),
  })).filter((bar) => [bar.open, bar.high, bar.low, bar.close, bar.volume].every((value) => Number.isFinite(value)));
  if (bars.length < 20) throw new Error("Not enough historical data is available for a reliable analysis");
  return { result, bars };
}

function buildAnalysis(input: { symbol: string; horizon: number; result: YahooResult; bars: Bar[] }) {
  const { symbol, horizon, result, bars } = input;
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  const last = bars[bars.length - 1]; const previous = bars[bars.length - 2];
  const sma20 = sma(closes, 20, closes.length - 1); const sma50 = sma(closes, 50, closes.length - 1); const sma200 = sma(closes, 200, closes.length - 1);
  const ema20 = ema(closes, 20).at(-1) ?? null; const ema50 = ema(closes, 50).at(-1) ?? null;
  const rsiValue = rsi(closes) ?? 50; const avgVolume = mean(volumes.slice(-20)) ?? 0; const relativeVolume = avgVolume ? last.volume / avgVolume : 1;
  const trueRanges = bars.slice(1).map((bar, index) => Math.max(bar.high - bar.low, Math.abs(bar.high - bars[index].close), Math.abs(bar.low - bars[index].close)));
  const atr = mean(trueRanges.slice(-14)) ?? 0;
  const support = Math.min(...bars.slice(-20).map((bar) => bar.low)); const resistance = Math.max(...bars.slice(-20).map((bar) => bar.high));
  const trendScore = (sma20 !== null && last.close > sma20 ? 1 : -1) + (sma50 !== null && last.close > sma50 ? 1 : -1) + (ema20 !== null && last.close > ema20 ? 1 : -1);
  const momentumScore = (rsiValue >= 52 && rsiValue <= 72 ? 1 : rsiValue < 42 ? -1 : 0) + (ema20 !== null && ema50 !== null && ema20 > ema50 ? 1 : -1);
  const volumeScore = relativeVolume >= 1.1 ? 1 : relativeVolume < 0.75 ? -1 : 0;
  const marketBias = trendScore + momentumScore + volumeScore;
  const bullishProbability = Math.max(18, Math.min(86, Math.round(50 + marketBias * 7 + Math.min(horizon, 10) * 0.7)));
  const bearishProbability = 100 - bullishProbability;
  const action = bullishProbability >= 64 && trendScore >= 1 ? "BUY" : bullishProbability <= 40 ? "AVOID" : "HOLD";
  const risk = atr / last.close > 0.045 ? "High" : atr / last.close > 0.025 ? "Moderate" : "Low";
  const confidence = Math.max(42, Math.min(91, Math.round(54 + Math.abs(marketBias) * 7)));
  const direction = trendScore >= 2 ? "Bullish" : trendScore <= -2 ? "Bearish" : "Mixed";
  const tradeAvailable = action === "BUY" && support < last.close && resistance > last.close;
  const stopLoss = round(Math.max(support, last.close - atr * 1.5)); const entryLow = round(Math.max(support, last.close - atr * 0.5)); const entryHigh = round(last.close);
  const targetOne = round(last.close + atr * 2); const targetTwo = round(last.close + atr * 3.5);
  const riskReward = tradeAvailable && stopLoss && targetTwo ? round((targetTwo - last.close) / (last.close - stopLoss), 1) : null;
  const meta = result.meta ?? {};
  const companyName = typeof meta.shortName === "string" ? meta.shortName : symbol;
  const indicators = [
    { key: "trend", label: "Trend", value: round(sma50), displayValue: direction, interpretation: direction === "Bullish" ? "Price structure is holding above its medium-term trend." : "Price structure needs confirmation before taking a directional view.", tone: direction === "Bullish" ? "positive" : direction === "Bearish" ? "negative" : "neutral" },
    { key: "rsi", label: "RSI (14)", value: round(rsiValue), displayValue: `${Math.round(rsiValue)}`, interpretation: rsiValue > 70 ? "Momentum is stretched near overbought territory." : rsiValue < 40 ? "Momentum is weak and sellers remain active." : "Momentum is constructive without being stretched.", tone: rsiValue > 70 || rsiValue < 40 ? "caution" : "positive" },
    { key: "volume", label: "Relative volume", value: round(relativeVolume, 2), displayValue: `${relativeVolume.toFixed(2)}x`, interpretation: relativeVolume >= 1.1 ? "Above-average participation confirms the move." : "Participation is close to or below its recent average.", tone: relativeVolume >= 1.1 ? "positive" : "neutral" },
    { key: "atr", label: "ATR (14)", value: round(atr), displayValue: `₹${round(atr) ?? "—"}`, interpretation: `${risk} risk based on recent daily range.`, tone: risk === "High" ? "caution" : "neutral" },
  ];
  const candles = bars.slice(-120).map((bar, index, all) => ({ ...bar, sma20: round(sma(closes, 20, closes.length - all.length + index)), sma50: round(sma(closes, 50, closes.length - all.length + index)), sma200: round(sma(closes, 200, closes.length - all.length + index)), ema20: round(ema20), ema50: round(ema50) }));
  const reasons = [
    ...(trendScore >= 1 ? ["Price is above key short-term trend measures."] : ["Price is below key short-term trend measures."]),
    ...(rsiValue >= 52 ? ["Momentum is holding in a constructive range."] : ["Momentum is not yet confirming a bullish move."]),
    ...(relativeVolume >= 1.1 ? ["Participation is above the recent average."] : ["Volume confirmation is limited."]),
  ];
  const warnings = [...(resistance - last.close < atr * 1.2 ? ["Nearby resistance may limit immediate upside."] : []), ...(risk === "High" ? ["Recent price range is elevated; size risk carefully."] : [])];
  return {
    symbol, companyName, exchange: "NSE", currency: "INR", currentPrice: round(last.close) ?? last.close, change: round(last.close - previous.close) ?? 0,
    changePercent: round(((last.close - previous.close) / previous.close) * 100) ?? 0, previousClose: round(previous.close), dayHigh: round(last.high), dayLow: round(last.low),
    week52High: round(Math.max(...closes.slice(-252))), week52Low: round(Math.min(...closes.slice(-252))), volume: last.volume, averageVolume: round(avgVolume),
    lastUpdated: new Date().toISOString(), dataSource: "Yahoo Finance chart feed", dataDelayed: true, horizon, bullishProbability, bearishProbability,
    prediction: bullishProbability >= 50 ? "BULLISH" : "BEARISH", predictionConfidence: confidence >= 72 ? "HIGH" : confidence >= 58 ? "MEDIUM" : "LOW",
    signal: { action, strength: Math.max(1, Math.min(5, Math.round(Math.abs(marketBias) / 1.2) + 2)), confidence, risk, trend: direction, momentum: momentumScore > 0 ? "Positive" : momentumScore < 0 ? "Weak" : "Neutral", volatility: risk, volumeConfirmation: relativeVolume >= 1.1 ? "Confirmed" : "Unconfirmed" },
    tradeSetup: { available: tradeAvailable, entryLow, entryHigh, stopLoss, targetOne, targetTwo, riskReward, quality: tradeAvailable ? (riskReward && riskReward >= 2 ? "Good" : "Moderate") : "Weak", note: tradeAvailable ? "Hypothetical levels derived from recent support and ATR." : "No reliable trade setup detected." },
    indicators, candles, reasons, warnings, support: round(support), resistance: round(resistance), atr: round(atr), modelInfo: { type: "Explainable technical scoring", methodology: "Directional score from trend, momentum, volatility and volume; not a trained price target model.", features: 8 },
  };
}

router.get("/market/overview", async (_req: Request, res: Response) => {
  const cached = cache.get("overview"); if (cached && cached.expires > Date.now()) return res.json(cached.value);
  try {
    const results: Array<PromiseSettledResult<{ symbol: string; name: string; value: number; changePercent: number; trend: string }>> = [];
    for (const [symbol, name] of [["^NSEI", "NIFTY 50"], ["^NSEBANK", "BANK NIFTY"], ["^BSESN", "SENSEX"]] as const) {
      try {
        const { bars } = await yahoo(symbol, "1mo"); const last = bars.at(-1)!; const previous = bars.at(-2)!;
        results.push({ status: "fulfilled", value: { symbol, name, value: round(last.close) ?? last.close, changePercent: round(((last.close - previous.close) / previous.close) * 100) ?? 0, trend: last.close >= mean(bars.slice(-20).map((bar) => bar.close))! ? "Bullish" : "Bearish" } });
      } catch { results.push({ status: "rejected", reason: "index unavailable" }); }
    }
    const pairs = results.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
    const data = { indices: pairs, sentiment: pairs.filter((item) => item.changePercent > 0).length >= 2 ? "Constructive" : pairs.filter((item) => item.changePercent < 0).length >= 2 ? "Cautious" : "Mixed", lastUpdated: new Date().toISOString(), dataSource: "Yahoo Finance chart feed", dataDelayed: true };
    const parsed = GetMarketOverviewResponse.parse(data); cache.set("overview", { value: parsed, expires: Date.now() + 300_000 }); return res.json(parsed);
  } catch { return res.json({ indices: [], sentiment: "Unavailable", lastUpdated: new Date().toISOString(), dataSource: "Unavailable", dataDelayed: true }); }
});

router.post("/stocks/analyze", async (req: Request, res: Response) => {
  const parsed = AnalyzeStockBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid stock symbol and analysis settings.", code: "INVALID_INPUT" });
  const symbol = cleanSymbol(parsed.data.symbol); const horizon = parsed.data.horizon ?? 5; const period = parsed.data.period ?? "6mo";
  const key = `${symbol}:${horizon}:${period}`; const cached = cache.get(key); if (cached && cached.expires > Date.now()) return res.json(cached.value);
  try { const { result, bars } = await yahoo(sourceSymbol(symbol), period); const data = AnalyzeStockResponse.parse(buildAnalysis({ symbol, horizon, result, bars })); cache.set(key, { value: data, expires: Date.now() + 300_000 }); return res.json(data); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Market data is temporarily unavailable. Try again shortly.", code: "MARKET_DATA_UNAVAILABLE" }); }
});

export default router;