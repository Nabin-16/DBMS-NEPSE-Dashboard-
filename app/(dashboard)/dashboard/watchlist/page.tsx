'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ComposedChart, Bar
} from 'recharts'

interface WatchlistItem {
    watchlist_id: number
    symbol: string
    name: string
    sector?: string
    close_price?: number
    percent_change?: number
    trading_date?: string
}

interface PriceRow {
    date: string
    open: number; high: number; low: number; close: number
    volume: number; percent_change: number
}

// ── Module-level history cache ────────────────────────────────────────────────
const _cache = new Map<string, { rows: PriceRow[]; ts: number }>()
const TTL = 5 * 60_000

function cKey(sym: string, days: number) { return `${sym}:${days}` }
function cGet(k: string) {
    const e = _cache.get(k)
    if (!e || Date.now() - e.ts > TTL) { _cache.delete(k); return null }
    return e.rows
}
function cSet(k: string, rows: PriceRow[]) {
    if (_cache.size > 300) { const f = _cache.keys().next().value; if (f) _cache.delete(f) }
    _cache.set(k, { rows, ts: Date.now() })
}

function toN(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function fmt2(v: unknown) { return toN(v).toFixed(2) }
function daysAgo(n: number) {
    const d = new Date(); d.setDate(d.getDate() - n)
    return d.toISOString().split('T')[0]
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function fmtDate(s: string) {
    return new Date(s).toLocaleDateString('en-NP', { month: 'short', day: 'numeric' })
}
function fmtVol(v: number) {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
    return v.toLocaleString()
}

// ── Inline chart (self-contained, no PriceChart dependency) ──────────────────
function MiniChart({ rows, symbol }: { rows: PriceRow[]; symbol: string }) {
    if (rows.length < 2) return null
    const isUp = rows[rows.length - 1].close >= rows[0].close
    const color = isUp ? '#10b981' : '#f87171'

    const Tip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null
        const d = payload[0]?.payload
        return (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl min-w-[150px]">
                <p className="text-gray-400 mb-2 font-medium">{fmtDate(String(label ?? ''))}</p>
                {(['open', 'high', 'low', 'close'] as const).map((k, i) => (
                    <div key={k} className="flex justify-between gap-4 mb-0.5">
                        <span className="text-gray-500 capitalize">{k}</span>
                        <span className={`font-medium ${k === 'high' ? 'text-emerald-400' : k === 'low' ? 'text-red-400' : 'text-white'
                            }`}>Rs. {Number(d?.[k] ?? 0).toLocaleString()}</span>
                    </div>
                ))}
                <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between">
                    <span className="text-gray-500">Volume</span>
                    <span className="text-gray-300">{fmtVol(Number(d?.volume ?? 0))}</span>
                </div>
                {d?.percent_change != null && (
                    <div className="flex justify-between mt-1">
                        <span className="text-gray-500">Change</span>
                        <span className={d.percent_change >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {d.percent_change >= 0 ? '+' : ''}{toN(d.percent_change).toFixed(2)}%
                        </span>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <ResponsiveContainer width="100%" height={200} minWidth={0}>
                <AreaChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`g-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtDate}
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={['auto', 'auto']}
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        axisLine={false} tickLine={false}
                        tickFormatter={v => `Rs.${Number(v).toLocaleString()}`} width={80} />
                    <Tooltip content={<Tip />} />
                    <Area type="monotone" dataKey="close" stroke={color} strokeWidth={1.5}
                        fill={`url(#g-${symbol})`} dot={false} activeDot={{ r: 3, fill: color }} />
                </AreaChart>
            </ResponsiveContainer>

            <ResponsiveContainer width="100%" height={60} minWidth={0}>
                <ComposedChart data={rows} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" hide />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false}
                        width={80} tickFormatter={v => fmtVol(Number(v))} />
                    <Bar dataKey="volume" fill="#374151" radius={[2, 2, 0, 0]} />
                    <Tooltip
                        contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: 11 }}
                        formatter={(v: any) => [fmtVol(Number(v)), 'Volume']}
                        labelFormatter={l => fmtDate(String(l))} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )
}

// ── State per expanded symbol ────────────────────────────────────────────────
interface ExpandState {
    open: boolean
    days: number   // 30 | 90 | 180 | 0=custom
    rows: PriceRow[]
    loading: boolean
    customFrom: string
    customTo: string
    loaded: boolean   // first load done
}
function mkExp(): ExpandState {
    return { open: false, days: 30, rows: [], loading: false, customFrom: '', customTo: '', loaded: false }
}

const TABS = [
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
    { label: '180D', days: 180 },
    { label: 'Custom', days: 0 },
]

export default function WatchlistPage() {
    const searchParams = useSearchParams()
    const highlightSym = (searchParams.get('sym') ?? '').toUpperCase()

    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expMap, setExpMap] = useState<Record<string, ExpandState>>({})

    const loadList = useCallback(async () => {
        try {
            const res = await fetch('/api/watchlist')
            if (!res.ok) throw new Error('Failed')
            const data = await res.json()
            setItems((Array.isArray(data) ? data : []).map((item: any) => ({
                watchlist_id: Number(item.watchlist_id ?? 0),
                symbol: String(item.symbol ?? ''),
                name: String(item.name ?? ''),
                sector: item.sector ?? undefined,
                close_price: item.close_price == null ? undefined : toN(item.close_price),
                percent_change: item.percent_change == null ? undefined : toN(item.percent_change),
                trading_date: item.trading_date ?? undefined,
            })))
        } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { loadList() }, [loadList])

    // Core fetch — cache-first, then DB, then trigger auto-fetch if empty
    const doFetch = useCallback(async (symbol: string, days: number, from?: string, to?: string): Promise<PriceRow[]> => {
        const fromDate = from ?? daysAgo(days || 30)
        const toDate = to ?? todayStr()
        const ck = days > 0 ? cKey(symbol, days) : `${symbol}:${fromDate}:${toDate}`

        const cached = cGet(ck)
        if (cached && (days === 0 || cached.length >= 2)) return cached

        // Fetch from DB via history API
        const url = `/api/stocks/${encodeURIComponent(symbol)}/history?from=${fromDate}&to=${toDate}`
        const res = await fetch(url)
        const json = await res.json()

        let rows: PriceRow[] = Array.isArray(json.history)
            ? json.history.map((r: any) => ({
                date: String(r.date ?? ''),
                open: toN(r.open),
                high: toN(r.high),
                low: toN(r.low),
                close: toN(r.close),
                volume: toN(r.volume),
                percent_change: toN(r.percent_change),
            }))
            : []

        // DB miss — trigger auto-fetch from merolagani, wait for it, reload
        if (rows.length < 2) {
            const refillDays = days > 0 ? Math.max(days, 180) : 180
            const afRes = await fetch('/api/auto-fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'symbol_history', symbol, days: refillDays }),
            })
            const afJson = await afRes.json()

            if (Number(afJson.loaded ?? 0) > 0) {
                // Data was fetched — reload from DB
                const res2 = await fetch(url)
                const json2 = await res2.json()
                rows = Array.isArray(json2.history)
                    ? json2.history.map((r: any) => ({
                        date: String(r.date ?? ''),
                        open: toN(r.open),
                        high: toN(r.high),
                        low: toN(r.low),
                        close: toN(r.close),
                        volume: toN(r.volume),
                        percent_change: toN(r.percent_change),
                    }))
                    : []
            }
        }

        cSet(ck, rows)
        return rows
    }, [])

    const loadHistory = useCallback(async (symbol: string, days: number, from?: string, to?: string) => {
        setExpMap(prev => ({
            ...prev,
            [symbol]: { ...(prev[symbol] ?? mkExp()), open: true, days, loading: true }
        }))
        const rows = await doFetch(symbol, days, from, to)
        setExpMap(prev => ({
            ...prev,
            [symbol]: { ...(prev[symbol] ?? mkExp()), open: true, days, rows, loading: false, loaded: true }
        }))
    }, [doFetch])

    const toggleExpand = useCallback(async (symbol: string) => {
        const cur = expMap[symbol]
        if (cur?.open) {
            setExpMap(prev => ({ ...prev, [symbol]: { ...(prev[symbol] ?? mkExp()), open: false } }))
            return
        }
        if (cur?.loaded) {
            setExpMap(prev => ({ ...prev, [symbol]: { ...(prev[symbol] ?? mkExp()), open: true } }))
            return
        }
        await loadHistory(symbol, 30)
    }, [expMap, loadHistory])

    const switchTab = useCallback(async (symbol: string, days: number) => {
        if (days === 0) {
            setExpMap(prev => ({ ...prev, [symbol]: { ...(prev[symbol] ?? mkExp()), days: 0 } }))
            return
        }
        await loadHistory(symbol, days)
    }, [loadHistory])

    const applyCustom = useCallback(async (symbol: string, from: string, to: string) => {
        await loadHistory(symbol, 0, from, to)
    }, [loadHistory])

    const remove = useCallback(async (symbol: string) => {
        await fetch('/api/watchlist', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol }),
        })
        setItems(p => p.filter(i => i.symbol !== symbol))
        setExpMap(p => { const n = { ...p }; delete n[symbol]; return n })
        _cache.forEach((_, k) => { if (k.startsWith(symbol + ':')) _cache.delete(k) })
    }, [])

    if (loading) return (
        <div className="max-w-5xl mx-auto p-8 text-center">
            <div className="w-8 h-8 border-4 border-gray-700 border-t-emerald-500 rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 mt-4 text-sm">Loading watchlist…</p>
        </div>
    )

    if (error) return (
        <div className="max-w-5xl mx-auto p-8 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => { setError(null); setLoading(true); loadList() }}
                className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">Retry</button>
        </div>
    )

    return (
        <div className="max-w-5xl mx-auto space-y-5">
            <div>
                <h1 className="text-lg font-semibold text-white">Watchlist</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    {items.length} {items.length === 1 ? 'company' : 'companies'} tracked
                </p>
            </div>

            {highlightSym && (
                <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl px-4 py-3 flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-amber-400">{highlightSym} is already in your watchlist</span>
                </div>
            )}

            {items.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                    <p className="text-gray-400 text-sm">Your watchlist is empty</p>
                    <Link href="/dashboard"
                        className="inline-block mt-4 text-xs text-emerald-400 hover:text-emerald-300">
                        Go to dashboard and click + Watch on any company →
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {items.map(item => {
                        const up = (item.percent_change ?? 0) >= 0
                        const exp = expMap[item.symbol]
                        const isOpen = exp?.open ?? false
                        const isLoading = exp?.loading ?? false

                        return (
                            <div key={item.watchlist_id || item.symbol}
                                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

                                {/* Item row — matches image 3 layout */}
                                <div className="flex items-center px-5 py-4 hover:bg-gray-800/30 transition-colors">
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center
                                        justify-center text-xs font-bold text-gray-300 shrink-0 mr-4">
                                        {item.symbol.slice(0, 2)}
                                    </div>

                                    {/* Symbol + name + sector */}
                                    <div className="flex-1 min-w-0 mr-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Link href={`/dashboard/stock/${item.symbol}`}
                                                className="font-bold text-white hover:text-emerald-400 transition-colors">
                                                {item.symbol}
                                            </Link>
                                            {item.sector && (
                                                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                                                    {item.sector.split(' ').slice(0, 2).join(' ')}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">{item.name}</p>
                                    </div>

                                    {/* Price + change */}
                                    <div className="text-right mr-4 shrink-0">
                                        {item.close_price != null ? (
                                            <>
                                                <p className="font-bold text-white">
                                                    Rs. {item.close_price.toLocaleString()}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {item.trading_date
                                                        ? new Date(item.trading_date).toLocaleDateString('en-NP',
                                                            { month: 'short', day: 'numeric' })
                                                        : ''}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="text-xs text-gray-600">No price</p>
                                        )}
                                    </div>

                                    {/* % change badge */}
                                    {item.percent_change != null && (
                                        <div className={`mr-4 shrink-0 text-sm font-bold px-3 py-1 rounded
                                            ${up ? 'bg-red-900/60 text-red-400' : 'bg-red-900/60 text-red-400'}
                                            ${up ? '!bg-transparent text-emerald-400' : ''}`}
                                            style={{
                                                background: up ? 'rgba(16,185,129,0.15)' : 'rgba(248,113,113,0.15)',
                                                color: up ? '#34d399' : '#f87171'
                                            }}>
                                            {up ? '' : ''}{fmt2(item.percent_change)}%
                                        </div>
                                    )}

                                    {/* History / Close button */}
                                    <button onClick={() => toggleExpand(item.symbol)}
                                        className={`mr-3 shrink-0 text-xs px-4 py-1.5 rounded border transition-colors
                                            ${isOpen
                                                ? 'border-gray-600 bg-gray-700 text-white'
                                                : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                        {isOpen ? 'Close' : 'History'}
                                    </button>

                                    {/* Remove */}
                                    <button onClick={() => remove(item.symbol)}
                                        className="shrink-0 text-gray-600 hover:text-red-400 transition-colors p-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Expanded history panel */}
                                {isOpen && (
                                    <div className="border-t border-gray-800 bg-gray-950/60 px-5 py-4 space-y-4">

                                        {/* Range tabs — 30D / 90D / 180D / Custom */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {TABS.map(t => (
                                                <button key={t.label}
                                                    onClick={() => switchTab(item.symbol, t.days)}
                                                    disabled={isLoading}
                                                    className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-colors
                                                        disabled:opacity-50
                                                        ${(exp?.days ?? 30) === t.days
                                                            ? 'bg-emerald-600 border-emerald-600 text-white'
                                                            : 'border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white'}`}>
                                                    {t.label}
                                                </button>
                                            ))}

                                            {/* Custom date pickers */}
                                            {(exp?.days ?? 30) === 0 && (
                                                <div className="flex items-center gap-2 ml-1">
                                                    <input type="date"
                                                        value={exp?.customFrom ?? ''}
                                                        onChange={e => setExpMap(p => ({
                                                            ...p, [item.symbol]: { ...(p[item.symbol] ?? mkExp()), customFrom: e.target.value }
                                                        }))}
                                                        className="bg-gray-800 border border-gray-700 text-white text-xs
                                                            px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500" />
                                                    <span className="text-gray-600 text-xs">to</span>
                                                    <input type="date"
                                                        value={exp?.customTo ?? ''}
                                                        onChange={e => setExpMap(p => ({
                                                            ...p, [item.symbol]: { ...(p[item.symbol] ?? mkExp()), customTo: e.target.value }
                                                        }))}
                                                        className="bg-gray-800 border border-gray-700 text-white text-xs
                                                            px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500" />
                                                    <button
                                                        onClick={() => {
                                                            const f = exp?.customFrom ?? '', t2 = exp?.customTo ?? ''
                                                            if (f && t2) void applyCustom(item.symbol, f, t2)
                                                        }}
                                                        disabled={!exp?.customFrom || !exp?.customTo || isLoading}
                                                        className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500
                                                            text-white rounded-lg transition-colors disabled:opacity-50">
                                                        Apply
                                                    </button>
                                                </div>
                                            )}

                                            {isLoading && (
                                                <div className="ml-auto flex items-center gap-1.5 text-xs text-amber-400">
                                                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10"
                                                            stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor"
                                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>
                                                    Loading…
                                                </div>
                                            )}
                                        </div>

                                        {/* Chart */}
                                        {isLoading && (!exp?.rows?.length) ? (
                                            <div className="animate-pulse space-y-3">
                                                <div className="h-[200px] bg-gray-800/60 rounded-lg" />
                                                <div className="h-[60px]  bg-gray-800/40 rounded-lg" />
                                            </div>
                                        ) : !exp?.rows?.length ? (
                                            <div className="py-10 text-center">
                                                <p className="text-gray-500 text-sm">No data for this range</p>
                                                <p className="text-gray-600 text-xs mt-1">
                                                    Try a different range — data will be fetched from the API if missing
                                                </p>
                                            </div>
                                        ) : (
                                            <MiniChart rows={exp.rows} symbol={item.symbol} />
                                        )}

                                        {/* Price history table */}
                                        {(exp?.rows?.length ?? 0) > 0 && !isLoading && (
                                            <div className="overflow-x-auto">
                                                <p className="text-xs text-gray-500 mb-2">
                                                    {exp.rows.length} trading days
                                                </p>
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="border-b border-gray-700">
                                                            <th className="text-left  px-3 py-2 text-gray-500 font-medium">Date</th>
                                                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Open</th>
                                                            <th className="text-right px-3 py-2 text-gray-500 font-medium">High</th>
                                                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Low</th>
                                                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Close</th>
                                                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Change%</th>
                                                            <th className="text-right px-3 py-2 text-gray-500 font-medium">Volume</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {exp.rows.map((r, i) => (
                                                            <tr key={i} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                                                                <td className="px-3 py-2 text-gray-300">
                                                                    {new Date(r.date).toLocaleDateString('en-NP', {
                                                                        year: 'numeric', month: 'numeric', day: 'numeric'
                                                                    })}
                                                                </td>
                                                                <td className="text-right px-3 py-2 text-gray-300">{fmt2(r.open)}</td>
                                                                <td className="text-right px-3 py-2 text-gray-300">{fmt2(r.high)}</td>
                                                                <td className="text-right px-3 py-2 text-gray-300">{fmt2(r.low)}</td>
                                                                <td className="text-right px-3 py-2 font-bold text-white">{fmt2(r.close)}</td>
                                                                <td className={`text-right px-3 py-2 font-semibold
                                                                    ${r.percent_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                    {r.percent_change >= 0 ? '+' : ''}{fmt2(r.percent_change)}%
                                                                </td>
                                                                <td className="text-right px-3 py-2 text-gray-400">
                                                                    {r.volume.toLocaleString()}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
