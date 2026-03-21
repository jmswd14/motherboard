// daily-snapshot — computes EOD portfolio value for every positions account
// and upserts a row into portfolio_snapshots for today.
//
// Triggered by pg_cron at ~10pm UTC (6pm ET) on weekdays.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FINNHUB_KEY               = Deno.env.get('FINNHUB_KEY')!

const POSITIONS_TYPES = new Set([
  'Brokerage/Investments', 'Retirement', 'Health Savings Account (HSA)', 'Crypto'
])
const TXN_CASH_POSITIVE = new Set(['sell', 'deposit', 'dividend', 'interest'])
const TXN_CASH_NEGATIVE = new Set(['buy', 'withdrawal', 'fee'])

// ── helpers ──────────────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function isPositionsAccount(asset: any): boolean {
  if (asset.tracking_mode) return asset.tracking_mode === 'positions'
  return POSITIONS_TYPES.has(asset.type)
}

function computePositions(transactions: any[]) {
  const pos: Record<string, any> = {}
  const sorted = [...transactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  for (const t of sorted) {
    const sym = t.symbol?.toUpperCase()
    if (!sym) continue
    if (!pos[sym]) pos[sym] = { symbol: sym, quantity: 0, totalCost: 0, avgCost: 0 }
    const p   = pos[sym]
    const qty = parseFloat(t.quantity) || 0
    const amt = parseFloat(t.amount)   || 0
    if (['buy', 'transfer_in', 'dividend_reinvested'].includes(t.type)) {
      p.quantity  += qty
      p.totalCost += amt
      p.avgCost    = p.quantity > 0 ? p.totalCost / p.quantity : 0
    } else if (t.type === 'sell') {
      const reduced = p.avgCost * qty
      p.quantity    = Math.max(0, p.quantity  - qty)
      p.totalCost   = Math.max(0, p.totalCost - reduced)
      p.avgCost     = p.quantity > 0 ? p.totalCost / p.quantity : 0
    }
  }
  return Object.values(pos).filter((p: any) => p.quantity > 0.000001)
}

function computeCash(transactions: any[]): number {
  let cash = 0
  for (const t of transactions) {
    const amt = parseFloat(t.amount) || 0
    if (TXN_CASH_POSITIVE.has(t.type))      cash += amt
    else if (TXN_CASH_NEGATIVE.has(t.type)) cash -= amt
  }
  return cash
}

// Staggered Finnhub quote fetch — 200ms between requests to stay within rate limit
async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}
  for (let i = 0; i < symbols.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 200))
    const sym = symbols[i]
    try {
      const res  = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`
      )
      const data = await res.json()
      if (data?.c) prices[sym] = data.c
    } catch { /* skip symbol on error */ }
  }
  return prices
}

// ── handler ──────────────────────────────────────────────────────────────────

Deno.serve(async () => {
  const db    = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const today = todayUTC()

  // 1. Load all positions accounts across all users
  const { data: accounts, error: acctErr } = await db
    .from('assets')
    .select('id, user_id, type, tracking_mode')

  if (acctErr) {
    console.error('Failed to load accounts:', acctErr)
    return new Response(JSON.stringify({ error: acctErr.message }), { status: 500 })
  }

  const posAccounts = (accounts ?? []).filter(isPositionsAccount)
  if (!posAccounts.length) {
    return new Response(JSON.stringify({ ok: true, accounts: 0 }), { status: 200 })
  }

  // 2. Collect all unique symbols across all accounts so we batch price fetches
  const { data: allTxns } = await db
    .from('transactions')
    .select('asset_id, user_id, type, symbol, quantity, amount, date')
    .in('asset_id', posAccounts.map(a => a.id))

  const txnsByAccount: Record<string, any[]> = {}
  for (const t of (allTxns ?? [])) {
    if (!txnsByAccount[t.asset_id]) txnsByAccount[t.asset_id] = []
    txnsByAccount[t.asset_id].push(t)
  }

  const allSymbols = [
    ...new Set(
      (allTxns ?? []).map(t => t.symbol?.toUpperCase()).filter(Boolean) as string[]
    )
  ]

  // 3. Fetch EOD prices for every symbol once
  console.log(`Fetching prices for ${allSymbols.length} symbols…`)
  const prices = await fetchPrices(allSymbols)

  // 4. Compute portfolio value per account and upsert snapshot
  const snapshots = []
  for (const account of posAccounts) {
    const txns     = txnsByAccount[account.id] ?? []
    const positions = computePositions(txns)
    const cash      = computeCash(txns)

    let holdingsMV = 0
    for (const p of positions) {
      const price = prices[p.symbol] ?? p.avgCost ?? 0
      holdingsMV += p.quantity * price
    }

    snapshots.push({
      asset_id: account.id,
      user_id:  account.user_id,
      date:     today,
      value:    holdingsMV + cash,
    })
  }

  const { error: upsertErr } = await db
    .from('portfolio_snapshots')
    .upsert(snapshots, { onConflict: 'asset_id,date' })

  if (upsertErr) {
    console.error('Upsert failed:', upsertErr)
    return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500 })
  }

  console.log(`Saved ${snapshots.length} snapshots for ${today}`)
  return new Response(
    JSON.stringify({ ok: true, date: today, accounts: snapshots.length }),
    { status: 200 }
  )
})
