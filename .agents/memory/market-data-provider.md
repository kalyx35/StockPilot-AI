---
name: Market data provider
description: Constraints learned from the public Yahoo Finance chart feed used by StockPilot.
---

The public chart feed is useful for delayed NSE/BSE daily bars without an API key, but responses must be treated as unavailable on errors, cached briefly, and labeled delayed. A one-month range may contain fewer than 30 trading bars, so minimum-history checks must allow shorter windows while indicators remain nullable.

**Why:** Indian index ranges commonly contain about 20–25 daily bars in a one-month request; requiring 30 made valid market overview requests appear empty.

**How to apply:** Keep all external-data calculations server-side, never substitute synthetic market values, and preserve explicit unavailable/error states in the UI.