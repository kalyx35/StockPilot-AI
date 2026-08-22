import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Gauge,
  LayoutDashboard,
  LineChart,
  Menu,
  Minus,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import {
  AnalyzeInputPeriod,
  getGetMarketOverviewQueryKey,
  useAnalyzeStock,
  useGetMarketOverview,
} from '@workspace/api-client-react';
import type { Indicator, MarketOverview, StockAnalysis } from '@workspace/api-client-react';

type View = 'cockpit' | 'watchlist' | 'compare';
type Period = keyof typeof AnalyzeInputPeriod;

const QUICK_SYMBOLS = ['RELIANCE.NS', 'TATAMOTORS.NS', 'INFY.NS', 'HDFCBANK.NS'];
const PERIODS: { label: string; value: Period }[] = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
];
const HORIZONS = [3, 5, 10, 20] as const;
type Horizon = (typeof HORIZONS)[number];

function formatPrice(value?: number | null, currency = 'INR') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompact(value?: number | null) {
  if (value === null || value === undefined) return '—';
  if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString('en-IN');
}

function formatTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function SignalPill({ action, large = false }: { action: string; large?: boolean }) {
  const config = {
    BUY: { className: 'bg-[hsl(171_42%_39%/0.12)] text-[hsl(171_42%_30%)] border-[hsl(171_42%_39%/0.24)]', icon: TrendingUp },
    HOLD: { className: 'bg-[hsl(43_96%_51%/0.15)] text-[hsl(30_67%_30%)] border-[hsl(43_96%_51%/0.32)]', icon: Minus },
    AVOID: { className: 'bg-[hsl(4_70%_52%/0.11)] text-[hsl(4_59%_39%)] border-[hsl(4_70%_52%/0.22)]', icon: TrendingDown },
  }[action] ?? { className: 'bg-muted text-muted-foreground border-border', icon: Minus };
  const Icon = config.icon;
  return (
    <span data-testid={`status-signal-${action.toLowerCase()}`} className={cn('inline-flex items-center gap-1.5 rounded-full border font-bold tracking-wide', large ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-[11px]', config.className)}>
      <Icon className={large ? 'size-4' : 'size-3'} strokeWidth={2.4} />
      {action}
    </span>
  );
}

function MiniSparkline({ positive = true }: { positive?: boolean }) {
  return (
    <svg viewBox="0 0 86 28" className="h-7 w-[86px]" aria-hidden="true">
      <path d={positive ? 'M1 23 C 11 22, 13 16, 22 18 S 34 20, 41 13 S 51 17, 58 10 S 68 13, 85 3' : 'M1 5 C 13 7, 16 11, 25 9 S 38 5, 44 15 S 57 12, 64 19 S 76 16, 85 24'} fill="none" stroke={positive ? 'hsl(171 42% 39%)' : 'hsl(4 70% 52%)'} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AppMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-[0_5px_14px_hsl(43_96%_51%/0.24)]">
        <span className="font-display text-lg font-bold leading-none">S</span>
      </div>
      <div>
        <div className="font-display text-[17px] font-bold leading-none tracking-tight text-sidebar-foreground">StockPilot</div>
        <div className="mt-1 font-mono-app text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/45">AI / SWING DESK</div>
      </div>
    </div>
  );
}

function Sidebar({ view, setView, open, setOpen, watchCount }: { view: View; setView: (view: View) => void; open: boolean; setOpen: (open: boolean) => void; watchCount: number }) {
  const items: { id: View; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { id: 'cockpit', label: 'Cockpit', icon: LayoutDashboard },
    { id: 'watchlist', label: 'Watchlist', icon: Bookmark, count: watchCount },
    { id: 'compare', label: 'Compare', icon: BarChart3 },
  ];
  return (
    <>
      <aside className={cn('fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar px-5 py-6 transition-transform duration-300 lg:static lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between">
          <AppMark />
          <button type="button" onClick={() => setOpen(false)} data-testid="button-close-sidebar" className="rounded-md p-1 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden" aria-label="Close navigation">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-12">
          <p className="mb-3 px-3 font-mono-app text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/35">Workspace</p>
          <nav className="space-y-1" aria-label="Primary navigation">
            {items.map(({ id, label, icon: Icon, count }) => (
              <button key={id} type="button" onClick={() => { setView(id); setOpen(false); }} data-testid={`button-nav-${id}`} className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors', view === id ? 'bg-sidebar-accent text-sidebar-foreground shadow-[inset_3px_0_0_hsl(43_96%_56%)]' : 'text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')}>
                <span className="flex items-center gap-3"><Icon className="size-[17px]" strokeWidth={view === id ? 2.2 : 1.8} />{label}</span>
                {count ? <span className="rounded-md bg-sidebar-foreground/10 px-1.5 py-0.5 font-mono-app text-[10px]">{count}</span> : null}
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto">
          <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sidebar-foreground/75">
              <div className="grid size-6 place-items-center rounded-lg bg-[hsl(171_42%_39%/0.2)] text-[hsl(171_65%_63%)]"><ShieldAlert className="size-3.5" /></div>
              <span className="text-xs font-bold">Decision guardrails</span>
            </div>
            <p className="text-[11px] leading-relaxed text-sidebar-foreground/45">Signals are a second opinion. Size risk before you size conviction.</p>
            <button type="button" data-testid="button-read-methodology" onClick={() => window.alert('StockPilot combines trend, momentum, volatility and volume into a single explainable swing view.')} className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">How it works <ChevronRight className="size-3" /></button>
          </div>
          <div className="mt-5 flex items-center justify-between px-2">
            <span className="font-mono-app text-[10px] text-sidebar-foreground/30">v0.9.4 · NSE/BSE</span>
            <button type="button" data-testid="button-help" onClick={() => window.alert('Need a hand? Start with a symbol search, then review the evidence before acting.')} className="text-sidebar-foreground/40 hover:text-sidebar-foreground" aria-label="Help"><CircleHelp className="size-4" /></button>
          </div>
        </div>
      </aside>
      {open ? <button type="button" data-testid="button-sidebar-overlay" className="fixed inset-0 z-20 bg-[hsl(222_25%_10%/0.38)] lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation overlay" /> : null}
    </>
  );
}

function Topbar({ onMenu, onRefresh, refreshing }: { onMenu: () => void; onRefresh: () => void; refreshing: boolean }) {
  return (
    <header className="flex h-[74px] items-center justify-between border-b border-border/80 px-5 sm:px-8">
      <button type="button" data-testid="button-open-sidebar" onClick={onMenu} className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Open navigation"><Menu className="size-5" /></button>
      <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-[hsl(171_42%_39%)]" /> Markets <span className="text-border">/</span> NSE & BSE</div>
      <div className="ml-auto flex items-center gap-2.5">
        <button type="button" data-testid="button-refresh-market" onClick={onRefresh} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} /> <span className="hidden sm:inline">Refresh data</span>
        </button>
        <button type="button" data-testid="button-notifications" onClick={() => window.alert('No new risk alerts.')} className="relative rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-foreground" aria-label="Notifications"><Bell className="size-4" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" /></button>
        <div className="ml-1 grid size-8 place-items-center rounded-full bg-[hsl(220_24%_23%)] font-mono-app text-[10px] font-medium text-primary">RK</div>
      </div>
    </header>
  );
}

function MarketStrip({ overview, loading, error }: { overview?: MarketOverview; loading: boolean; error: boolean }) {
  if (loading) return <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-[78px] bg-card p-4"><div className="skeleton h-3 w-20 rounded" /><div className="skeleton mt-3 h-5 w-28 rounded" /></div>)}</div>;
  if (error || !overview) return <div data-testid="status-market-error" className="flex items-center justify-between border-b border-border bg-[hsl(4_70%_52%/0.05)] px-5 py-3 text-xs text-[hsl(4_59%_39%)] sm:px-8"><span className="flex items-center gap-2"><AlertCircle className="size-3.5" /> Market overview is temporarily unavailable.</span><span className="font-mono-app text-[10px]">Try refresh</span></div>;
  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
      {overview.indices.slice(0, 4).map((index) => {
        const positive = index.changePercent >= 0;
        return <div key={index.symbol} data-testid={`market-index-${index.symbol}`} className="bg-card px-5 py-3.5 sm:px-8">
          <div className="flex items-center justify-between"><span className="font-mono-app text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{index.name}</span><MiniSparkline positive={positive} /></div>
          <div className="mt-1 flex items-baseline gap-2"><span className="font-display text-[19px] font-bold tracking-tight">{index.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span><span className={cn('font-mono-app text-[10px] font-medium', positive ? 'text-[hsl(171_42%_32%)]' : 'text-destructive')}>{positive ? '+' : ''}{index.changePercent.toFixed(2)}%</span></div>
        </div>;
      })}
    </div>
  );
}

function SearchPanel({ onAnalyze, pending, initialSymbol }: { onAnalyze: (symbol: string, horizon: Horizon, period: Period) => void; pending: boolean; initialSymbol: string }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [horizon, setHorizon] = useState<number>(5);
  const [period, setPeriod] = useState<Period>('6mo');
  const submit = (event: FormEvent) => { event.preventDefault(); if (symbol.trim()) onAnalyze(symbol.trim().toUpperCase(), horizon as Horizon, period); };
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-6 shadow-[0_10px_35px_hsl(220_24%_15%/0.045)] sm:px-8 sm:py-7">
      <div className="pointer-events-none absolute -right-12 -top-20 size-56 rounded-full border-[28px] border-primary/10" />
      <div className="pointer-events-none absolute right-16 top-4 size-24 rounded-full border border-[hsl(171_42%_39%/0.16)]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div><div className="mb-2 flex items-center gap-2 font-mono-app text-[10px] uppercase tracking-[0.2em] text-accent"><Sparkles className="size-3" /> Analyst desk</div><h1 className="font-display text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-[38px]">What are you watching?</h1><p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Get a grounded swing-trade read with the evidence in plain sight.</p></div>
          <div className="hidden rounded-xl border border-border/80 bg-background/65 p-3 text-right sm:block"><div className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Lens</div><div className="mt-1 flex items-center gap-1.5 text-xs font-bold"><Target className="size-3.5 text-primary" /> Next action</div></div>
        </div>
        <form onSubmit={submit} className="mt-7 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" /><input value={symbol} onChange={(event) => setSymbol(event.target.value)} data-testid="input-symbol-search" aria-label="Search stock symbol" placeholder="Search NSE or BSE symbol, e.g. INFY" className="h-12 w-full rounded-xl border border-input bg-background pl-11 pr-4 text-sm font-semibold uppercase outline-none transition-colors placeholder:normal-case placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15" /><kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono-app text-[9px] text-muted-foreground sm:block">⌘ K</kbd></div>
          <button type="submit" disabled={pending || !symbol.trim()} data-testid="button-analyze-stock" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-[0_5px_14px_hsl(43_96%_51%/0.22)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">{pending ? <RefreshCw className="size-4 animate-spin" /> : <Zap className="size-4" />}{pending ? 'Reading market...' : 'Analyze stock'}</button>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Popular</span>
          {QUICK_SYMBOLS.map((quick) => <button type="button" key={quick} data-testid={`button-quick-${quick}`} onClick={() => { setSymbol(quick); onAnalyze(quick, horizon as Horizon, period); }} className="rounded-md border border-border bg-background px-2.5 py-1.5 font-mono-app text-[10px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground">{quick.replace('.NS', '')}</button>)}
        </div>
        <div className="mt-6 flex flex-col gap-4 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><span className="font-mono-app text-[10px] uppercase tracking-widest text-muted-foreground">Holding horizon</span><div className="flex rounded-lg border border-border bg-background p-0.5">{HORIZONS.map((item) => <button type="button" key={item} onClick={() => setHorizon(item)} data-testid={`button-horizon-${item}`} className={cn('rounded-md px-2.5 py-1.5 font-mono-app text-[10px] transition-colors', horizon === item ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{item}D</button>)}</div></div>
          <div className="flex items-center gap-2"><span className="font-mono-app text-[10px] uppercase tracking-widest text-muted-foreground">Lookback</span><select value={period} onChange={(event) => setPeriod(event.target.value as Period)} data-testid="select-lookback-period" className="rounded-lg border border-border bg-background px-2.5 py-2 font-mono-app text-[10px] outline-none focus:border-primary">{PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="hidden text-[10px] text-muted-foreground sm:inline">Analysis uses {horizon}D / {period}</span></div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ onPick }: { onPick: (symbol: string) => void }) {
  return <div data-testid="empty-analysis-state" className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
    <div className="relative mb-5 grid size-16 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary"><LineChart className="size-7" /><span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-accent" /></div>
    <h2 className="font-display text-2xl font-bold tracking-tight">Your calm read starts here</h2>
    <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Search a symbol above. StockPilot will map the trend, pressure-test the setup, and tell you what would change the view.</p>
    <button type="button" data-testid="button-empty-example" onClick={() => onPick('HDFCBANK.NS')} className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-bold transition-colors hover:border-primary/60 hover:bg-primary/5">Try HDFCBANK <ChevronRight className="size-3.5" /></button>
    <div className="mt-10 grid w-full max-w-lg grid-cols-3 gap-3 text-left"><div className="rounded-xl border border-border/70 bg-background/60 p-3"><Activity className="mb-3 size-4 text-accent" /><p className="text-[11px] font-bold">One clear signal</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">No indicator soup.</p></div><div className="rounded-xl border border-border/70 bg-background/60 p-3"><ShieldAlert className="mb-3 size-4 text-primary" /><p className="text-[11px] font-bold">Risk first</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Levels, not promises.</p></div><div className="rounded-xl border border-border/70 bg-background/60 p-3"><Sparkles className="mb-3 size-4 text-accent" /><p className="text-[11px] font-bold">Explainable</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Reasons beside the call.</p></div></div>
  </div>;
}

function PriceHeader({ analysis, isWatched, onWatch }: { analysis: StockAnalysis; isWatched: boolean; onWatch: () => void }) {
  const positive = analysis.change >= 0;
  return <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div><div className="flex flex-wrap items-center gap-2"><span className="font-mono-app text-[11px] font-medium tracking-[0.16em] text-muted-foreground">{analysis.exchange} · {analysis.symbol}</span>{analysis.dataDelayed ? <span className="rounded bg-primary/12 px-1.5 py-0.5 font-mono-app text-[9px] text-[hsl(30_67%_30%)]">DELAYED</span> : <span className="flex items-center gap-1 font-mono-app text-[9px] text-[hsl(171_42%_32%)]"><span className="size-1.5 rounded-full bg-[hsl(171_42%_39%)]" /> LIVE</span>}</div><h2 data-testid="text-company-name" className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-[30px]">{analysis.companyName}</h2><div className="mt-3 flex items-baseline gap-3"><span data-testid="text-current-price" className="font-display text-4xl font-bold tracking-[-0.05em]">{formatPrice(analysis.currentPrice, analysis.currency)}</span><span className={cn('flex items-center gap-1 font-mono-app text-sm font-medium', positive ? 'text-[hsl(171_42%_32%)]' : 'text-destructive')}>{positive ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}{positive ? '+' : ''}{analysis.change.toFixed(2)} ({positive ? '+' : ''}{analysis.changePercent.toFixed(2)}%)</span></div></div>
    <div className="flex items-center gap-2"><SignalPill action={analysis.signal.action} large /><button type="button" onClick={onWatch} data-testid="button-toggle-watchlist" className={cn('grid size-10 place-items-center rounded-lg border transition-colors', isWatched ? 'border-primary/50 bg-primary/10 text-[hsl(30_67%_30%)]' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground')} aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}>{isWatched ? <Bookmark className="size-4 fill-current" /> : <BookmarkPlus className="size-4" />}</button></div>
  </div>;
}

function ProbabilityBar({ analysis }: { analysis: StockAnalysis }) {
  const bull = Math.round(analysis.bullishProbability);
  const bear = Math.round(analysis.bearishProbability);
  return <div className="rounded-xl border border-border/80 bg-background/55 p-4"><div className="flex items-center justify-between"><span className="font-mono-app text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Model lean</span><span className="font-mono-app text-[10px] text-muted-foreground">{analysis.predictionConfidence} confidence</span></div><div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted"><div className="bg-[hsl(171_42%_39%)]" style={{ width: `${bull}%` }} /><div className="bg-[hsl(4_70%_52%)]" style={{ width: `${bear}%` }} /></div><div className="mt-2 flex justify-between font-mono-app text-[10px]"><span className="text-[hsl(171_42%_32%)]">Bullish {bull}%</span><span className="text-destructive">Bearish {bear}%</span></div></div>;
}

function CandlestickChart({ analysis, period, setPeriod, activeIndicators, setActiveIndicators }: { analysis: StockAnalysis; period: Period; setPeriod: (period: Period) => void; activeIndicators: string[]; setActiveIndicators: (items: string[]) => void }) {
  const candles = analysis.candles.slice(-44);
  const closes = candles.map((candle) => candle.close);
  const min = Math.min(...candles.map((candle) => candle.low));
  const max = Math.max(...candles.map((candle) => candle.high));
  const range = max - min || 1;
  const xStep = 760 / Math.max(candles.length - 1, 1);
  const point = (value: number, index: number) => `${index * xStep + 8},${176 - ((value - min) / range) * 132}`;
  const closePath = closes.map((close, index) => point(close, index)).join(' ');
  const selected = (key: string) => activeIndicators.includes(key);
  const lines: Record<string, { color: string; values: Array<number | null | undefined> }> = { sma20: { color: 'hsl(43 96% 51%)', values: candles.map((candle) => candle.sma20) }, sma50: { color: 'hsl(171 42% 39%)', values: candles.map((candle) => candle.sma50) }, ema20: { color: 'hsl(28 80% 56%)', values: candles.map((candle) => candle.ema20) } };
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><LineChart className="size-4 text-primary" /><h3 className="font-display text-lg font-bold">Price action</h3></div><p className="mt-1 text-xs text-muted-foreground">Daily candles · close with selected trend overlays</p></div><div className="flex items-center gap-3"><div className="flex rounded-lg border border-border bg-background p-0.5">{PERIODS.map((item) => <button type="button" key={item.value} onClick={() => setPeriod(item.value)} data-testid={`button-chart-period-${item.value}`} className={cn('px-2 py-1 font-mono-app text-[9px] rounded-md', period === item.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{item.label}</button>)}</div><button type="button" data-testid="button-chart-settings" onClick={() => document.getElementById('indicator-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground" aria-label="Open chart settings"><SlidersHorizontal className="size-3.5" /></button></div></div>
    <div className="mt-5 overflow-hidden rounded-xl border border-border/70 bg-[hsl(220_24%_15%)] p-3"><svg viewBox="0 0 780 205" className="h-[210px] w-full" role="img" aria-label="Stock price chart"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(43 96% 51%)" stopOpacity=".18" /><stop offset="100%" stopColor="hsl(43 96% 51%)" stopOpacity="0" /></linearGradient></defs>{[24, 74, 124, 174].map((y) => <line key={y} x1="8" x2="772" y1={y} y2={y} stroke="hsl(40 25% 91%/.09)" strokeDasharray="3 5" />)}<polyline points={`8,176 ${closePath} 772,176`} fill="url(#chart-fill)" stroke="none" />{candles.map((candle, index) => { const x = index * xStep + 8; const yHigh = 176 - ((candle.high - min) / range) * 132; const yLow = 176 - ((candle.low - min) / range) * 132; const yOpen = 176 - ((candle.open - min) / range) * 132; const yClose = 176 - ((candle.close - min) / range) * 132; const color = candle.close >= candle.open ? 'hsl(171 54% 58%)' : 'hsl(4 78% 66%)'; return <g key={`${candle.date}-${index}`}><line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1.2" /><rect x={x - 2.1} y={Math.min(yOpen, yClose)} width="4.2" height={Math.max(Math.abs(yClose - yOpen), 1.5)} fill={color} rx="1" /></g>; })}<polyline points={closePath} fill="none" stroke="hsl(43 96% 56%)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />{Object.entries(lines).map(([key, line]) => selected(key) ? <polyline key={key} points={line.values.map((value, index) => value === null || value === undefined ? '' : point(value, index)).filter(Boolean).join(' ')} fill="none" stroke={line.color} strokeWidth="1.25" strokeDasharray="4 3" opacity=".9" /> : null)}</svg><div className="mt-1 flex justify-between px-1 font-mono-app text-[9px] text-[hsl(40_25%_91%/.4)]"><span>{candles[0]?.date?.slice(0, 7) ?? '—'}</span><span>{candles.at(-1)?.date?.slice(0, 7) ?? '—'}</span></div></div>
    <div id="indicator-panel" className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Overlays</span>{Object.entries(lines).map(([key, line]) => <button type="button" key={key} onClick={() => setActiveIndicators(selected(key) ? activeIndicators.filter((item) => item !== key) : [...activeIndicators, key])} data-testid={`button-toggle-${key}`} className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono-app text-[9px] transition-colors', selected(key) ? 'border-border bg-muted text-foreground' : 'border-border/70 text-muted-foreground')}><span className="size-1.5 rounded-full" style={{ backgroundColor: line.color }} />{key.toUpperCase()}</button>)}</div>
  </div>;
}

function SignalCard({ analysis }: { analysis: StockAnalysis }) {
  const signal = analysis.signal;
  const tone = signal.action === 'BUY' ? 'text-[hsl(171_42%_32%)]' : signal.action === 'AVOID' ? 'text-destructive' : 'text-[hsl(30_67%_30%)]';
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><Gauge className="size-4 text-primary" /><h3 className="font-display text-lg font-bold">The read</h3></div><p className="mt-1 text-xs text-muted-foreground">A compact view of what is moving the signal.</p></div><SignalPill action={signal.action} /></div><div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">{[['Strength', `${Math.round(signal.strength * 20)}%`], ['Confidence', `${Math.round(signal.confidence)}%`], ['Risk', signal.risk], ['Trend', signal.trend]].map(([label, value]) => <div key={label}><div className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div><div className={cn('mt-1 text-sm font-bold', label === 'Strength' || label === 'Confidence' ? tone : '')}>{value}</div></div>)}</div><div className="mt-6 rounded-xl bg-muted/60 p-4"><div className="flex items-start gap-3"><div className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" /><p data-testid="text-prediction" className="text-sm font-semibold leading-relaxed">{analysis.prediction}</p></div></div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-3"><div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/50 px-3 py-2"><span className="text-muted-foreground">Momentum</span><span className="font-semibold">{signal.momentum}</span></div><div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/50 px-3 py-2"><span className="text-muted-foreground">Volatility</span><span className="font-semibold">{signal.volatility}</span></div><div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/50 px-3 py-2"><span className="text-muted-foreground">Volume</span><span className="font-semibold">{signal.volumeConfirmation}</span></div></div></div>;
}

function TradeSetupCard({ analysis }: { analysis: StockAnalysis }) {
  const setup = analysis.tradeSetup;
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><Target className="size-4 text-primary" /><h3 className="font-display text-lg font-bold">Trade map</h3></div><p className="mt-1 text-xs text-muted-foreground">Levels to plan around, not predictions to chase.</p></div>{setup.available ? <span className="flex items-center gap-1 rounded-full bg-[hsl(171_42%_39%/0.11)] px-2.5 py-1 font-mono-app text-[9px] text-[hsl(171_42%_32%)]"><Check className="size-3" /> SETUP READY</span> : <span className="rounded-full bg-muted px-2.5 py-1 font-mono-app text-[9px] text-muted-foreground">NO SETUP</span>}</div>{setup.available ? <><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl border border-primary/30 bg-primary/8 p-3"><span className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Entry zone</span><p className="mt-1 font-mono-app text-sm font-medium">{formatPrice(setup.entryLow, analysis.currency)} – {formatPrice(setup.entryHigh, analysis.currency)}</p></div><div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3"><span className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Invalidation</span><p className="mt-1 font-mono-app text-sm font-medium text-destructive">{formatPrice(setup.stopLoss, analysis.currency)}</p></div><div className="rounded-xl border border-border bg-background/55 p-3"><span className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Target 1</span><p className="mt-1 font-mono-app text-sm font-medium">{formatPrice(setup.targetOne, analysis.currency)}</p></div><div className="rounded-xl border border-border bg-background/55 p-3"><span className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Target 2</span><p className="mt-1 font-mono-app text-sm font-medium">{formatPrice(setup.targetTwo, analysis.currency)}</p></div></div><div className="mt-4 flex items-center justify-between border-t border-border pt-4"><span className="text-xs text-muted-foreground">{setup.note}</span><span className="font-mono-app text-xs font-medium text-[hsl(171_42%_32%)]">R:R {setup.riskReward?.toFixed(1) ?? '—'}</span></div></> : <div className="mt-6 rounded-xl bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">{setup.note || 'Wait for a cleaner entry and defined invalidation before considering a trade.'}</div>}</div>;
}

function ReasonsCard({ analysis }: { analysis: StockAnalysis }) {
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /><h3 className="font-display text-lg font-bold">Why this view</h3></div><div className="mt-5 space-y-3">{analysis.reasons.slice(0, 4).map((reason, index) => <div key={`${reason}-${index}`} className="flex gap-3"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[hsl(171_42%_39%/0.12)] font-mono-app text-[9px] text-[hsl(171_42%_32%)]">{index + 1}</span><p data-testid={`text-reason-${index}`} className="text-sm leading-relaxed text-foreground/80">{reason}</p></div>)}</div>{analysis.warnings.length > 0 ? <div className="mt-5 border-t border-border pt-4"><div className="mb-3 flex items-center gap-2 text-[hsl(30_67%_30%)]"><AlertCircle className="size-3.5" /><span className="font-mono-app text-[9px] uppercase tracking-widest">Things to respect</span></div><div className="space-y-2">{analysis.warnings.slice(0, 2).map((warning, index) => <p key={`${warning}-${index}`} className="text-xs leading-relaxed text-muted-foreground">{warning}</p>)}</div></div> : null}</div>;
}

function IndicatorsCard({ indicators }: { indicators: Indicator[] }) {
  const toneClass = (tone: string) => tone === 'positive' ? 'text-[hsl(171_42%_32%)]' : tone === 'negative' ? 'text-destructive' : tone === 'caution' ? 'text-[hsl(30_67%_30%)]' : 'text-muted-foreground';
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><div className="flex items-center gap-2"><Activity className="size-4 text-accent" /><h3 className="font-display text-lg font-bold">Signal inputs</h3></div><p className="mt-1 text-xs text-muted-foreground">Only the indicators that affect the read.</p></div><span className="font-mono-app text-[10px] text-muted-foreground">{indicators.length} tracked</span></div><div className="mt-5 divide-y divide-border/70">{indicators.slice(0, 6).map((indicator) => <div key={indicator.key} data-testid={`indicator-row-${indicator.key}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-xs font-semibold">{indicator.label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{indicator.interpretation}</p></div><span className={cn('shrink-0 font-mono-app text-xs font-medium', toneClass(indicator.tone))}>{indicator.displayValue}</span></div>)}</div></div>;
}

function StatsCard({ analysis }: { analysis: StockAnalysis }) {
  const stats = [['Prev close', formatPrice(analysis.previousClose, analysis.currency)], ['Day range', `${formatPrice(analysis.dayLow, analysis.currency)} – ${formatPrice(analysis.dayHigh, analysis.currency)}`], ['52W range', `${formatPrice(analysis.week52Low, analysis.currency)} – ${formatPrice(analysis.week52High, analysis.currency)}`], ['Volume', `${formatCompact(analysis.volume)} / ${formatCompact(analysis.averageVolume)}`]];
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center gap-2"><BarChart3 className="size-4 text-muted-foreground" /><h3 className="font-display text-lg font-bold">Market detail</h3></div><div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5">{stats.map(([label, value]) => <div key={label}><div className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-1 text-xs font-semibold">{value}</div></div>)}</div><div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 className="size-3" /> Updated {formatTime(analysis.lastUpdated)}</span><span>{analysis.dataSource}</span></div></div>;
}

function ModelInfoCard({ analysis }: { analysis: StockAnalysis }) {
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldAlert className="size-4 text-primary" /><h3 className="font-display text-lg font-bold">Model health</h3></div><p className="mt-1 text-xs text-muted-foreground">Know what this read can—and cannot—tell you.</p><div className="mt-5 grid gap-4 sm:grid-cols-3"><div><p className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Method</p><p className="mt-1 text-xs font-semibold">{analysis.modelInfo.type}</p></div><div><p className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Inputs</p><p className="mt-1 text-xs font-semibold">{analysis.modelInfo.features} signals</p></div><div><p className="font-mono-app text-[9px] uppercase tracking-widest text-muted-foreground">Horizon</p><p className="mt-1 text-xs font-semibold">{analysis.horizon} trading days</p></div></div><div className="mt-5 rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground">{analysis.modelInfo.methodology} Historical indicators are not a guarantee of future returns.</div></div>;
}

function WatchlistView({ symbols, compareSymbols, setCompareSymbols, onAnalyze, onRemove }: { symbols: string[]; compareSymbols: string[]; setCompareSymbols: (items: string[]) => void; onAnalyze: (symbol: string) => void; onRemove: (symbol: string) => void }) {
  return <div className="rise-in"><div className="mb-7"><p className="font-mono-app text-[10px] uppercase tracking-[0.2em] text-accent">Your saved names</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Watchlist</h1><p className="mt-2 text-sm text-muted-foreground">Keep a short list. Review it when the market gives you a reason.</p></div>{symbols.length === 0 ? <div data-testid="empty-watchlist-state" className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"><BookmarkPlus className="mx-auto size-8 text-primary" /><h2 className="mt-4 font-display text-xl font-bold">Nothing saved yet</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Add a stock from its analysis header and it will stay here on this device.</p></div> : <div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-4"><span className="font-mono-app text-[10px] uppercase tracking-widest text-muted-foreground">{symbols.length} {symbols.length === 1 ? 'name' : 'names'}</span><span className="text-[11px] text-muted-foreground">Select up to 3 for compare</span></div><div className="divide-y divide-border">{symbols.map((symbol) => { const selected = compareSymbols.includes(symbol); return <div key={symbol} data-testid={`watchlist-row-${symbol}`} className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/35"><button type="button" onClick={() => onAnalyze(symbol)} data-testid={`button-analyze-watch-${symbol}`} className="flex min-w-0 items-center gap-3 text-left"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted font-mono-app text-[10px] font-medium text-foreground">{symbol.slice(0, 2)}</span><span><span className="block text-sm font-bold">{symbol.replace('.NS', '').replace('.BO', '')}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{symbol.endsWith('.BO') ? 'BSE' : 'NSE'} · click to analyze</span></span></button><div className="flex items-center gap-2"><button type="button" onClick={() => setCompareSymbols(selected ? compareSymbols.filter((item) => item !== symbol) : compareSymbols.length < 3 ? [...compareSymbols, symbol] : compareSymbols)} data-testid={`button-compare-${symbol}`} className={cn('rounded-lg border px-2.5 py-1.5 font-mono-app text-[9px]', selected ? 'border-primary/50 bg-primary/10 text-[hsl(30_67%_30%)]' : 'border-border text-muted-foreground hover:text-foreground')}>{selected ? 'Selected' : 'Compare'}</button><button type="button" onClick={() => onRemove(symbol)} data-testid={`button-remove-watch-${symbol}`} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${symbol}`}><X className="size-3.5" /></button></div></div>; })}</div></div>}</div>;
}

function CompareView({ symbols, analyses, onAnalyze }: { symbols: string[]; analyses: Record<string, StockAnalysis>; onAnalyze: (symbol: string) => void }) {
  return <div className="rise-in"><div className="mb-7"><p className="font-mono-app text-[10px] uppercase tracking-[0.2em] text-accent">Side by side</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Compare</h1><p className="mt-2 text-sm text-muted-foreground">Put conviction next to conviction. Analysis stays one click away.</p></div>{symbols.length < 2 ? <div data-testid="empty-compare-state" className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"><BarChart3 className="mx-auto size-8 text-primary" /><h2 className="mt-4 font-display text-xl font-bold">Choose two names to compare</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Go to your watchlist, select up to three symbols, then return here for a clean side-by-side view.</p></div> : <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b border-border bg-muted/40">{['Metric', ...symbols].map((item) => <th key={item} className="px-5 py-4 font-mono-app text-[10px] uppercase tracking-widest text-muted-foreground">{item.replace('.NS', '').replace('.BO', '')}</th>)}</tr></thead><tbody>{['Signal', 'Confidence', 'Risk profile', 'Trend', 'Momentum', 'Next step'].map((metric) => <tr key={metric} className="border-b border-border/70 last:border-0"><th className="px-5 py-4 text-xs font-semibold text-muted-foreground">{metric}</th>{symbols.map((symbol) => { const item = analyses[symbol]; const value = metric === 'Signal' ? item?.signal.action : metric === 'Confidence' ? `${item?.signal.confidence ?? '—'}%` : metric === 'Risk profile' ? item?.signal.risk : metric === 'Trend' ? item?.signal.trend : metric === 'Momentum' ? item?.signal.momentum : null; return <td key={symbol} className="px-5 py-4 text-sm">{metric === 'Next step' ? <button type="button" onClick={() => onAnalyze(symbol)} data-testid={`button-compare-analyze-${symbol}`} className="flex items-center gap-1 text-xs font-bold text-[hsl(30_67%_30%)] hover:underline">Analyze <ChevronRight className="size-3" /></button> : <span className={cn('font-semibold', value === 'BUY' ? 'text-[hsl(171_42%_32%)]' : value === 'AVOID' ? 'text-destructive' : '')}>{value ?? <button type="button" onClick={() => onAnalyze(symbol)} className="text-xs font-semibold text-[hsl(30_67%_30%)] hover:underline">Load analysis</button>}</span>}</td>; })}</tr>)}</tbody></table></div>}</div>;
}

export default function Dashboard() {
  const [view, setView] = useState<View>('cockpit');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [analysis, setAnalysis] = useState<StockAnalysis>();
  const [analyses, setAnalyses] = useState<Record<string, StockAnalysis>>({});
  const [lastSymbol, setLastSymbol] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const saved = window.localStorage.getItem('stockpilot-watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
  const [chartPeriod, setChartPeriod] = useState<Period>('6mo');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(['sma20']);
  const overviewQuery = useGetMarketOverview({ query: { queryKey: getGetMarketOverviewQueryKey(), staleTime: 60000 } });
  const analyzeMutation = useAnalyzeStock();
  const symbols = useMemo(() => watchlist, [watchlist]);

  useEffect(() => { window.localStorage.setItem('stockpilot-watchlist', JSON.stringify(watchlist)); }, [watchlist]);

  const analyze = (symbol: string, horizon: Horizon = 5, period: Period = chartPeriod) => {
    setLastSymbol(symbol);
    setChartPeriod(period);
    setView('cockpit');
    analyzeMutation.mutate({ data: { symbol, horizon, period: AnalyzeInputPeriod[period] } }, { onSuccess: (result) => { setAnalysis(result); setAnalyses((current) => ({ ...current, [result.symbol]: result })); }, onError: () => setAnalysis(undefined) });
  };
  const toggleWatch = () => { if (!analysis) return; setWatchlist((current) => current.includes(analysis.symbol) ? current.filter((item) => item !== analysis.symbol) : [...current, analysis.symbol]); };
  const refresh = () => { overviewQuery.refetch(); if (analysis) analyze(analysis.symbol); };

 return <div className="grain app-shell flex min-h-[100dvh] text-foreground"><Sidebar view={view} setView={setView} open={sidebarOpen} setOpen={setSidebarOpen} watchCount={symbols.length} /><div className="min-w-0 flex-1"><Topbar onMenu={() => setSidebarOpen(true)} onRefresh={refresh} refreshing={overviewQuery.isFetching || analyzeMutation.isPending} /><MarketStrip overview={overviewQuery.data} loading={overviewQuery.isLoading} error={!!overviewQuery.isError} /><main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-9">{view === 'watchlist' ? <WatchlistView symbols={symbols} compareSymbols={compareSymbols} setCompareSymbols={setCompareSymbols} onAnalyze={analyze} onRemove={(symbol) => { setWatchlist((current) => current.filter((item) => item !== symbol)); setCompareSymbols((current) => current.filter((item) => item !== symbol)); }} /> : view === 'compare' ? <CompareView symbols={compareSymbols} analyses={analyses} onAnalyze={analyze} /> : <div className="space-y-7"><SearchPanel onAnalyze={analyze} pending={analyzeMutation.isPending} initialSymbol={lastSymbol} />{analyzeMutation.isError ? <div data-testid="status-analysis-error" className="flex items-start justify-between gap-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-[hsl(4_59%_39%)]"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>We could not analyze that symbol. Check the exchange suffix and try again.</span></div><button type="button" data-testid="button-retry-analysis" onClick={() => lastSymbol && analyze(lastSymbol)} className="shrink-0 font-semibold underline">Retry</button></div> : null}{analyzeMutation.isPending ? <div data-testid="loading-analysis-state" className="grid gap-5 lg:grid-cols-[1.5fr_1fr]"><div className="rounded-2xl border border-border bg-card p-6"><div className="skeleton h-4 w-28 rounded" /><div className="skeleton mt-4 h-9 w-64 rounded" /><div className="skeleton mt-7 h-[220px] w-full rounded-xl" /></div><div className="rounded-2xl border border-border bg-card p-6"><div className="skeleton h-4 w-24 rounded" /><div className="skeleton mt-5 h-24 w-full rounded-xl" /><div className="skeleton mt-5 h-28 w-full rounded-xl" /></div></div> : analysis ? <div className="rise-in space-y-6"><PriceHeader analysis={analysis} isWatched={watchlist.includes(analysis.symbol)} onWatch={toggleWatch} /><ProbabilityBar analysis={analysis} /><div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]"><CandlestickChart analysis={analysis} period={chartPeriod} setPeriod={setChartPeriod} activeIndicators={activeIndicators} setActiveIndicators={setActiveIndicators} /><SignalCard analysis={analysis} /></div><div className="grid gap-6 lg:grid-cols-2"><TradeSetupCard analysis={analysis} /><ReasonsCard analysis={analysis} /></div><div className="grid gap-6 lg:grid-cols-2"><IndicatorsCard indicators={analysis.indicators} /><StatsCard analysis={analysis} /></div><ModelInfoCard analysis={analysis} /><p className="flex items-center justify-end gap-1.5 font-mono-app text-[9px] text-muted-foreground"><Clock3 className="size-3" /> Last read {formatTime(analysis.lastUpdated)} · {analysis.dataSource}{analysis.dataDelayed ? ' · delayed data' : ''}</p></div> : <EmptyState onPick={analyze} />}</div>}</main></div></div>;
}