'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import WatchlistPopup from '@/components/WatchlistPopup'

interface Stock {
    symbol: string
    name: string
    sector: string
    close_price: number
    percent_change: number
    volume: number
    turnover: number
    trading_date: string
}

type SortKey = 'symbol' | 'close_price' | 'percent_change' | 'volume' | 'turnover'
type SortDir = 'asc' | 'desc'
type Tab = 'all' | 'gainers' | 'losers'

function fmtVol(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
    return n.toLocaleString()
}
function fmtTO(n: number) {
    if (n >= 1_00_00_000) return `Rs. ${(n / 1_00_00_000).toFixed(2)}Cr`
    if (n >= 1_00_000) return `Rs. ${(n / 1_00_000).toFixed(1)}L`
    return `Rs. ${n.toLocaleString()}`
}

function normalizeDate(value: unknown): string {
    const raw = String(value ?? '')
    if (!raw) return ''
    if (raw.length >= 10) return raw.slice(0, 10)
    return raw
}

function derivePercent(row: any): number {
    const rawPercent = row?.percent_change
    const parsedPercent = Number(rawPercent)
    if (rawPercent !== null && rawPercent !== undefined && Number.isFinite(parsedPercent)) {
        return parsedPercent
    }

    const close = Number(row?.close_price ?? 0)
    const prevClose = Number(row?.prev_close ?? 0)
    if (Number.isFinite(close) && Number.isFinite(prevClose) && prevClose > 0) {
        return ((close - prevClose) / prevClose) * 100
    }

    const open = Number(row?.open_price ?? 0)
    if (Number.isFinite(close) && Number.isFinite(open) && open > 0) {
        return ((close - open) / open) * 100
    }

    return 0
}

export default function DashboardPage() {
    const [stocks, setStocks] = useState<Stock[]>([])
    const [loading, setLoading] = useState(true)
    const [watchlist, setWatchlist] = useState<Set<string>>(new Set())
    const [popup, setPopup] = useState<Stock | null>(null)
    const [tab, setTab] = useState<Tab>('all')
    const [search, setSearch] = useState('')
    const [sector, setSector] = useState('All')
    const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'turnover', dir: 'desc' })

    useEffect(() => {
        fetch('/api/stocks/all')
            .then(r => r.json())
            .then(d => setStocks((d.rows ?? []).map((r: any) => ({
                symbol: String(r.symbol ?? ''),
                name: String(r.name ?? r.company_name ?? ''),
                sector: String(r.sector ?? r.sector_name ?? 'Others'),
                close_price: Number(r.close_price ?? 0),
                percent_change: derivePercent(r),
                volume: Number(r.volume ?? 0),
                turnover: Number(r.turnover ?? 0),
                trading_date: normalizeDate(r.trading_date ?? r.updated_at ?? ''),
            }))))
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [])

    // Load watchlist symbols so "+ Watch" becomes "✓ Watching" if already added
    useEffect(() => {
        fetch('/api/watchlist')
            .then(r => r.json())
            .then(d => setWatchlist(new Set((Array.isArray(d) ? d : []).map((w: any) => String(w.symbol)))))
            .catch(() => { })
    }, [])

    const gainers = stocks.filter(s => s.percent_change > 0)
    const losers = stocks.filter(s => s.percent_change < 0)
    const totalTO = stocks.reduce((s, r) => s + r.turnover, 0)

    const topG = useMemo(() => [...gainers].sort((a, b) => b.percent_change - a.percent_change).slice(0, 8), [gainers])
    const topL = useMemo(() => [...losers].sort((a, b) => a.percent_change - b.percent_change).slice(0, 8), [losers])

    const sectors = useMemo(() => ['All', ...Array.from(new Set(stocks.map(s => s.sector))).sort()], [stocks])

    const visible = useMemo(() => {
        let rows = tab === 'gainers' ? gainers : tab === 'losers' ? losers : stocks
        if (sector !== 'All') rows = rows.filter(r => r.sector === sector)
        if (search.trim()) rows = rows.filter(r =>
            r.symbol.toUpperCase().includes(search.toUpperCase()) ||
            r.name.toLowerCase().includes(search.toLowerCase()))
        return [...rows].sort((a, b) => {
            const av = a[sort.key], bv = b[sort.key]
            const cmp = av > bv ? 1 : av < bv ? -1 : 0
            return sort.dir === 'asc' ? cmp : -cmp
        })
    }, [stocks, gainers, losers, tab, sector, search, sort])

    const toggleSort = useCallback((key: SortKey) => {
        setSort(p => p.key === key ? { key, dir: p.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' })
    }, [])

    function SortArrow({ col }: { col: SortKey }) {
        if (sort.key !== col) return <span className="opacity-20 ml-0.5 text-xs">↕</span>
        return <span className="text-emerald-400 ml-0.5 text-xs">{sort.dir === 'desc' ? '↓' : '↑'}</span>
    }

    const tradingDate = stocks[0]?.trading_date ?? ''

    return (
        <div className="space-y-6 max-w-7xl mx-auto">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Market Overview</h1>
                <p className="text-gray-400 text-sm mt-1">
                    {loading ? 'Loading…' : `${stocks.length} companies · ${tradingDate}`}
                </p>
            </div>

            {/* Stat cards */}
            {!loading && stocks.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'COMPANIES', value: stocks.length, sub: '' },
                        { label: 'GAINERS', value: gainers.length, sub: '' },
                        { label: 'LOSERS', value: losers.length, sub: '' },
                    ].map(s => (
                        <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                            <p className="text-xs text-gray-500 font-medium tracking-wide">{s.label}</p>
                            <p className="text-3xl font-bold text-white mt-2">{s.value}</p>
                            {s.sub && <p className="text-xs text-gray-600 mt-1">{s.sub}</p>}
                        </div>
                    ))}
                </div>
            )}

            {/* Gainers / Losers */}
            {!loading && stocks.length > 0 && (
                <div className="grid grid-cols-2 gap-5">
                    {[
                        { title: 'Top Gainers', subtitle: 'Best performing companies', data: topG, up: true },
                        { title: 'Top Losers', subtitle: 'Worst performing companies', data: topL, up: false },
                    ].map(({ title, subtitle, data, up }) => (
                        <div key={title} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4">
                                <h2 className={`font-bold text-lg ${up ? 'text-emerald-400' : 'text-red-400'}`}>{title}</h2>
                                <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-500 border-t border-gray-800">
                                        <th className="text-left px-5 py-2.5 font-medium">Symbol</th>
                                        <th className="text-right px-4 py-2.5 font-medium">Price</th>
                                        <th className="text-right px-5 py-2.5 font-medium">Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((s, idx) => (
                                        <tr key={`${s.symbol}-${idx}`} className="border-t border-gray-800/60 hover:bg-gray-800/40 group">
                                            <td className="px-5 py-3">
                                                <Link href={`/dashboard/stock/${s.symbol}`}
                                                    className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                                                    {s.symbol}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-200">
                                                Rs. {s.close_price.toLocaleString()}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <span className={`font-bold text-sm ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {up ? '↑' : '↓'} {Math.abs(s.percent_change).toFixed(2)}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Main market table ── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

                {/* Toolbar */}
                <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-3 flex-wrap">
                    <div>
                        <h2 className="text-sm font-semibold text-white">Latest Market Prices</h2>
                        <p className="text-xs text-gray-500">All companies · Loaded from database</p>
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                        {/* Tab buttons */}
                        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                            {([['all', 'All'], ['gainers', 'Gainers'], ['losers', 'Losers']] as [Tab, string][]).map(([id, label]) => (
                                <button key={id} onClick={() => setTab(id)}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors
                                        ${tab === id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                                    {label}
                                    {id === 'gainers' && <span className="ml-1 text-emerald-400">{gainers.length}</span>}
                                    {id === 'losers' && <span className="ml-1 text-red-400">{losers.length}</span>}
                                </button>
                            ))}
                        </div>

                        {/* Sector */}
                        <select value={sector} onChange={e => setSector(e.target.value)}
                            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs px-2.5 py-1.5
                                rounded-lg focus:outline-none focus:border-emerald-500">
                            {sectors.map(s => <option key={s} value={s}>{s === 'All' ? 'All sectors' : s}</option>)}
                        </select>

                        {/* Search */}
                        <div className="relative">
                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search…"
                                className="bg-gray-800 border border-gray-700 text-white text-xs pl-8 pr-3 py-1.5
                                    rounded-lg placeholder-gray-500 focus:outline-none focus:border-emerald-500 w-36" />
                        </div>

                        <p className="text-xs text-gray-500">{visible.length} companies</p>
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center">
                        <div className="w-8 h-8 border-4 border-gray-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">Loading market data…</p>
                    </div>
                ) : stocks.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="text-gray-500 text-sm">No data yet.</p>
                        <p className="text-gray-600 text-xs mt-1">Run: python load_history.py --all --days 90</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 border-b border-gray-800">
                                    {/* Symbol col — wider to fit avatar + bold name + full company name */}
                                    <th className="text-left px-5 py-3 font-medium w-64">Symbol</th>
                                    <th className="text-left px-4 py-3 font-medium">Sector</th>
                                    <th className="text-right px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300"
                                        onClick={() => toggleSort('close_price')}>
                                        Close <SortArrow col="close_price" />
                                    </th>
                                    <th className="text-right px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300"
                                        onClick={() => toggleSort('percent_change')}>
                                        Change <SortArrow col="percent_change" />
                                    </th>
                                    <th className="text-right px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300"
                                        onClick={() => toggleSort('volume')}>
                                        Volume <SortArrow col="volume" />
                                    </th>
                                    {/* + Watch column — always visible, right-most */}
                                    <th className="px-5 py-3 font-medium text-right">Watch</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((s, idx) => {
                                    const up = s.percent_change >= 0
                                    const inWList = watchlist.has(s.symbol)
                                    return (
                                        <tr key={`${s.symbol}-${idx}`}
                                            className="border-b border-gray-800/40 hover:bg-gray-800/40 group transition-colors">

                                            {/* Symbol cell — avatar + bold symbol + full company name, exactly like image 2 */}
                                            <td className="px-5 py-3">
                                                <Link href={`/dashboard/stock/${s.symbol}`}
                                                    className="flex items-center gap-3">
                                                    {/* Two-letter avatar badge */}
                                                    <div className="w-9 h-9 rounded-lg bg-gray-700/80 text-gray-200 text-xs
                                                        font-bold flex items-center justify-center shrink-0
                                                        group-hover:bg-emerald-900/50 group-hover:text-emerald-300 transition-colors">
                                                        {s.symbol.slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                                                            {s.symbol}
                                                        </p>
                                                        <p className="text-xs text-gray-400 truncate max-w-[200px]">{s.name}</p>
                                                    </div>
                                                </Link>
                                            </td>

                                            {/* Sector pill */}
                                            <td className="px-4 py-3">
                                                <span className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full border border-gray-700/50">
                                                    {s.sector.split(' ').slice(0, 2).join(' ')}
                                                </span>
                                            </td>

                                            {/* Close price — bold */}
                                            <td className="px-4 py-3 text-right font-bold text-white">
                                                Rs. {s.close_price.toLocaleString()}
                                            </td>

                                            {/* Change % — coloured pill */}
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded
                                                    ${up
                                                        ? 'bg-emerald-900/60 text-emerald-400'
                                                        : 'bg-red-900/60 text-red-400'}`}>
                                                    {up ? '↑' : '↓'} {Math.abs(s.percent_change).toFixed(2)}%
                                                </span>
                                            </td>

                                            {/* Volume */}
                                            <td className="px-4 py-3 text-right text-gray-400 text-sm">
                                                {fmtVol(s.volume)}
                                            </td>

                                            {/* + Watch — text button, exactly like image 4 */}
                                            <td className="px-5 py-3 text-right">
                                                {inWList ? (
                                                    <span className="text-xs text-emerald-500 font-medium">
                                                        ✓ Watching
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => setPopup(s)}
                                                        className="text-xs text-gray-400 hover:text-emerald-400
                                                            transition-colors font-medium">
                                                        + Watch
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Popup */}
            {popup && (
                <WatchlistPopup
                    symbol={popup.symbol}
                    name={popup.name}
                    sector={popup.sector}
                    price={popup.close_price}
                    change={popup.percent_change}
                    onClose={() => setPopup(null)}
                    onAdded={sym => setWatchlist(prev => new Set([...prev, sym]))}
                />
            )}
        </div>
    )
}
