'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PriceChart from '@/components/PriceChart'
import WatchlistFetchBanner from '@/components/WatchlistFetchBanner'

interface WatchlistItem {
    watchlist_id: number
    symbol: string
    name: string
    sector?: string
    close_price?: number
    percent_change?: number
    trading_date?: string
}

interface HistoryData {
    trading_date: string
    open_price: number
    high_price: number
    low_price: number
    close_price: number
    volume: number
    percent_change: number
}

interface ExpandedItem {
    symbol: string
    data: HistoryData[]
    loading: boolean
    syncing?: boolean
    syncError?: string | null
    syncInfo?: string | null
    availableFrom?: string | null
    availableTo?: string | null
    totalRows?: number
}

interface DateFilter {
    fromDate?: string
    toDate?: string
    days?: number
    mode?: 'quick' | 'custom'
}

function toNumber(value: unknown): number {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

function fmt2(value: unknown): string {
    return toNumber(value).toFixed(2)
}

export default function WatchlistPage() {
    const searchParams = useSearchParams()
    const fetchingSym = (searchParams.get('fetching') ?? '').toUpperCase()
    const highlightSym = (searchParams.get('sym') ?? '').toUpperCase()

    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<Record<string, ExpandedItem>>({})
    const [filters, setFilters] = useState<Record<string, DateFilter>>({})

    useEffect(() => {
        fetchWatchlist()
    }, [])

    const fetchWatchlist = async () => {
        try {
            const res = await fetch('/api/watchlist')
            if (!res.ok) throw new Error('Failed to fetch watchlist')
            const payload = await res.json()
            const data = Array.isArray(payload) ? payload : []
            const normalized: WatchlistItem[] = data.map((item: any) => ({
                watchlist_id: Number(item.watchlist_id ?? 0),
                symbol: String(item.symbol ?? ''),
                name: String(item.name ?? ''),
                sector: item.sector ?? undefined,
                close_price: item.close_price == null ? undefined : toNumber(item.close_price),
                percent_change: item.percent_change == null ? undefined : toNumber(item.percent_change),
                trading_date: item.trading_date ?? undefined,
            }))
            setItems(normalized)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setLoading(false)
        }
    }

    const toggleExpand = async (symbol: string) => {
        if (expanded[symbol]) {
            setExpanded(prev => {
                const next = { ...prev }
                delete next[symbol]
                return next
            })
        } else {
            setFilters(prev => ({
                ...prev,
                [symbol]: prev[symbol] ?? { mode: 'quick', days: 30 }
            }))
            setExpanded(prev => ({
                ...prev,
                [symbol]: { symbol, data: [], loading: true }
            }))
            await fetchHistoryData(symbol)
        }
    }

    const fetchHistoryData = async (symbol: string, fromDate?: string, toDate?: string, days = 30) => {
        try {
            let url = `/api/watchlist/${symbol}/history?days=${days}`
            if (fromDate && toDate) {
                url = `/api/watchlist/${symbol}/history?fromDate=${fromDate}&toDate=${toDate}`
            } else if (fromDate) {
                url = `/api/watchlist/${symbol}/history?fromDate=${fromDate}`
            } else if (toDate) {
                url = `/api/watchlist/${symbol}/history?toDate=${toDate}&days=${days}`
            }

            const res = await fetch(url)
            if (!res.ok) throw new Error('Failed to fetch history')
            const result = await res.json()
            const normalizedRows: HistoryData[] = Array.isArray(result.data)
                ? result.data.map((record: any) => ({
                    trading_date: String(record.trading_date ?? ''),
                    open_price: toNumber(record.open_price),
                    high_price: toNumber(record.high_price),
                    low_price: toNumber(record.low_price),
                    close_price: toNumber(record.close_price),
                    volume: toNumber(record.volume),
                    percent_change: toNumber(record.percent_change),
                }))
                : []

            setExpanded(prev => ({
                ...prev,
                [symbol]: {
                    symbol,
                    data: normalizedRows,
                    loading: false,
                    syncing: prev[symbol]?.syncing ?? false,
                    syncError: prev[symbol]?.syncError ?? null,
                    syncInfo: prev[symbol]?.syncInfo ?? null,
                    availableFrom: result.availableFrom ?? null,
                    availableTo: result.availableTo ?? null,
                    totalRows: Number(result.totalRows ?? normalizedRows.length),
                }
            }))
        } catch (err) {
            console.error('History fetch error:', err)
            setExpanded(prev => ({
                ...prev,
                [symbol]: {
                    symbol,
                    data: [],
                    loading: false,
                    syncing: prev[symbol]?.syncing ?? false,
                    syncError: prev[symbol]?.syncError ?? null,
                    syncInfo: prev[symbol]?.syncInfo ?? null,
                    availableFrom: prev[symbol]?.availableFrom ?? null,
                    availableTo: prev[symbol]?.availableTo ?? null,
                    totalRows: prev[symbol]?.totalRows ?? 0,
                }
            }))
        }
    }

    const syncAndFetchHistory = async (symbol: string, filter: DateFilter) => {
        setExpanded(prev => ({
            ...prev,
            [symbol]: {
                ...(prev[symbol] ?? { symbol, data: [], loading: false }),
                loading: true,
                syncInfo: null,
            }
        }))

        // Always fetch from DB first so chart/table are usable even if pipeline sync fails.
        await fetchHistoryData(symbol, filter.fromDate, filter.toDate, filter.days ?? 30)

        setExpanded(prev => ({
            ...prev,
            [symbol]: {
                ...(prev[symbol] ?? { symbol, data: [], loading: false }),
                syncing: true,
                syncError: null,
                syncInfo: null,
            }
        }))

        try {
            const res = await fetch(`/api/watchlist/${symbol}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromDate: filter.fromDate,
                    toDate: filter.toDate,
                    days: filter.days,
                })
            })

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}))
                throw new Error(payload.details || payload.error || 'Pipeline sync failed')
            }

            const payload = await res.json().catch(() => ({}))

            await fetchHistoryData(symbol, filter.fromDate, filter.toDate, filter.days ?? 30)

            setExpanded(prev => ({
                ...prev,
                [symbol]: {
                    ...(prev[symbol] ?? { symbol, data: [], loading: false }),
                    syncInfo: payload?.hint || payload?.message || 'Synced and refreshed from database',
                }
            }))
        } catch (err) {
            setExpanded(prev => ({
                ...prev,
                [symbol]: {
                    ...(prev[symbol] ?? { symbol, data: [], loading: false }),
                    syncing: false,
                    syncError: null,
                    syncInfo: `Using database data only. ${err instanceof Error ? err.message : 'Pipeline sync unavailable.'}`,
                }
            }))
            return
        }

        setExpanded(prev => ({
            ...prev,
            [symbol]: {
                ...(prev[symbol] ?? { symbol, data: [], loading: false }),
                syncing: false,
                syncError: null,
                loading: false,
            }
        }))
    }

    const applyCustomFilter = (symbol: string) => {
        const filter = filters[symbol] ?? {}
        syncAndFetchHistory(symbol, {
            mode: 'custom',
            fromDate: filter.fromDate,
            toDate: filter.toDate,
            days: filter.days ?? 30,
        })
    }

    const applyPresetFilter = (symbol: string, days: number) => {
        setFilters(prev => ({
            ...prev,
            [symbol]: {
                mode: 'quick',
                fromDate: undefined,
                toDate: undefined,
                days,
            },
        }))
        syncAndFetchHistory(symbol, {
            mode: 'quick',
            days,
        })
    }

    const getFilterLabel = (symbol: string) => {
        const filter = filters[symbol]
        const meta = expanded[symbol]
        if ((meta?.totalRows ?? 0) <= 1 && meta?.availableTo && !filter?.fromDate && !filter?.toDate) {
            return `Latest available: ${meta.availableTo}`
        }
        if (!filter) return 'Last 30 days'
        if (filter.mode === 'quick') return `Last ${filter.days ?? 30} days`
        if (filter.fromDate && filter.toDate) return `${filter.fromDate} to ${filter.toDate}`
        if (filter.fromDate) return `From ${filter.fromDate}`
        return `Last ${filter.days ?? 30} days`
    }

    const removeFromWatchlist = async (symbol: string) => {
        try {
            const res = await fetch('/api/watchlist', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol })
            })
            if (res.ok) {
                setItems(prev => prev.filter(item => item.symbol !== symbol))
            }
        } catch (err) {
            console.error('Remove error:', err)
        }
    }

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto p-8 text-center">
                <div className="inline-block">
                    <div className="w-8 h-8 border-4 border-gray-700 border-t-emerald-500 rounded-full animate-spin"></div>
                </div>
                <p className="text-gray-500 mt-4">Loading watchlist...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="max-w-5xl mx-auto p-8 text-center">
                <p className="text-red-400">{error}</p>
                <button
                    onClick={() => {
                        setError(null)
                        setLoading(true)
                        fetchWatchlist()
                    }}
                    className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                    Retry
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-white">Watchlist</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {items.length} {items.length === 1 ? 'company' : 'companies'} tracked
                    </p>
                </div>
            </div>

            {fetchingSym && <WatchlistFetchBanner symbol={fetchingSym} />}

            {highlightSym && !fetchingSym && (
                <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl px-4 py-3 flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-amber-400">{highlightSym} is already in your watchlist</span>
                </div>
            )}

            {items.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                    <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                    </div>
                    <p className="text-gray-400 text-sm">Your watchlist is empty</p>
                    <p className="text-gray-600 text-xs mt-1">Select a company from portfolio and add it to your watchlist</p>
                    <Link href="/dashboard/portfolio" className="inline-block mt-4 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                        Go to portfolio →
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4">
                    {items.map((item) => {
                        const up = (item.percent_change ?? 0) >= 0
                        const isExpanded = !!expanded[item.symbol]
                        const expandData = expanded[item.symbol]
                        const isFetching = item.symbol.toUpperCase() === fetchingSym

                        return (
                            <div key={item.watchlist_id || item.symbol} className={`bg-gray-900 border rounded-xl overflow-hidden ${isFetching ? 'border-emerald-800/60 shadow-sm shadow-emerald-900/30' : 'border-gray-800'}`}>
                                {/* Main item row */}
                                <div className="p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${isFetching ? 'bg-emerald-600/20 text-emerald-400' : 'bg-gray-800 text-gray-300'}`}>
                                            {item.symbol?.slice(0, 2)}
                                        </div>
                                        <div className="flex-1">
                                            <Link href={`/dashboard/stock/${item.symbol}`}
                                                className="font-semibold text-white hover:text-emerald-400 transition-colors text-sm">
                                                {item.symbol}
                                            </Link>
                                            <p className="text-xs text-gray-500 mt-0.5 max-w-[200px] truncate">{item.name}</p>
                                        </div>
                                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full hidden sm:inline-block">
                                            {item.sector?.split(' ').slice(0, 2).join(' ')}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        {isFetching ? (
                                            <div className="flex items-center gap-2 text-emerald-400">
                                                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                </svg>
                                                <span className="text-xs">Loading 30-day history...</span>
                                            </div>
                                        ) : item.close_price != null ? (
                                            <>
                                                <div className="text-right">
                                                    <p className="text-sm font-medium text-white">
                                                        Rs. {item.close_price?.toLocaleString()}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {item.trading_date
                                                            ? new Date(item.trading_date).toLocaleDateString('en-NP', { month: 'short', day: 'numeric' })
                                                            : ''}
                                                    </p>
                                                </div>
                                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${up ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}`}>
                                                    {up ? '+' : ''}{fmt2(item.percent_change)}%
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-xs text-gray-600">No price data</span>
                                        )}

                                        {/* View History Button */}
                                        <button
                                            onClick={() => toggleExpand(item.symbol)}
                                            className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded transition-colors"
                                        >
                                            {isExpanded ? '✕' : '📊 History'}
                                        </button>

                                        {/* Remove button */}
                                        <button
                                            onClick={() => removeFromWatchlist(item.symbol)}
                                            className="text-xs px-2 py-1.5 text-gray-400 hover:text-red-400 transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded History Section */}
                                {isExpanded && (
                                    <div className="border-t border-gray-800 bg-gray-950/50 p-4">
                                        <div className="mb-4">
                                            <label className="block text-xs text-gray-400 mb-2">Date Range Filter</label>
                                            <div className="flex items-center gap-2 mb-3">
                                                <button
                                                    onClick={() => setFilters(prev => ({
                                                        ...prev,
                                                        [item.symbol]: {
                                                            ...prev[item.symbol],
                                                            mode: 'quick',
                                                            fromDate: undefined,
                                                            toDate: undefined,
                                                            days: prev[item.symbol]?.days ?? 30,
                                                        }
                                                    }))}
                                                    className={`text-xs px-2.5 py-1 rounded border ${(filters[item.symbol]?.mode ?? 'quick') === 'quick'
                                                        ? 'bg-emerald-700/30 border-emerald-600 text-emerald-300'
                                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                                        }`}
                                                >
                                                    Quick
                                                </button>
                                                <button
                                                    onClick={() => setFilters(prev => ({
                                                        ...prev,
                                                        [item.symbol]: {
                                                            ...prev[item.symbol],
                                                            mode: 'custom',
                                                            days: undefined,
                                                        }
                                                    }))}
                                                    className={`text-xs px-2.5 py-1 rounded border ${(filters[item.symbol]?.mode ?? 'quick') === 'custom'
                                                        ? 'bg-emerald-700/30 border-emerald-600 text-emerald-300'
                                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                                        }`}
                                                >
                                                    Custom
                                                </button>
                                                <span className="text-[11px] text-gray-500 ml-1">
                                                    Active: {getFilterLabel(item.symbol)}
                                                </span>
                                                {expandData?.syncing && (
                                                    <span className="text-[11px] text-amber-300 ml-1">Syncing pipeline...</span>
                                                )}
                                            </div>

                                            {(filters[item.symbol]?.mode ?? 'quick') === 'quick' ? (
                                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                                    {[30, 90, 180].map((days) => (
                                                        <button
                                                            key={days}
                                                            onClick={() => applyPresetFilter(item.symbol, days)}
                                                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${(filters[item.symbol]?.days ?? 30) === days && !filters[item.symbol]?.fromDate
                                                                ? 'bg-emerald-700/30 border-emerald-600 text-emerald-300'
                                                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                                                }`}
                                                        >
                                                            {days}D
                                                        </button>
                                                    ))}
                                                    {(expandData?.totalRows ?? 0) <= 1 && (
                                                        <span className="text-[11px] text-gray-500 ml-1">
                                                            Only today data exists in DB right now.
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                    <input
                                                        type="date"
                                                        placeholder="From date"
                                                        value={filters[item.symbol]?.fromDate ?? ''}
                                                        min={expandData?.availableFrom ?? undefined}
                                                        max={expandData?.availableTo ?? undefined}
                                                        onChange={(e) => setFilters(prev => ({
                                                            ...prev,
                                                            [item.symbol]: {
                                                                ...prev[item.symbol],
                                                                fromDate: e.target.value || undefined,
                                                            }
                                                        }))}
                                                        className="text-xs px-2 py-1.5 bg-gray-800 border border-gray-700 text-white rounded placeholder-gray-600"
                                                    />
                                                    <input
                                                        type="date"
                                                        placeholder="To date"
                                                        value={filters[item.symbol]?.toDate ?? ''}
                                                        min={expandData?.availableFrom ?? undefined}
                                                        max={expandData?.availableTo ?? undefined}
                                                        onChange={(e) => setFilters(prev => ({
                                                            ...prev,
                                                            [item.symbol]: {
                                                                ...prev[item.symbol],
                                                                toDate: e.target.value || undefined,
                                                            }
                                                        }))}
                                                        className="text-xs px-2 py-1.5 bg-gray-800 border border-gray-700 text-white rounded placeholder-gray-600"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => applyCustomFilter(item.symbol)}
                                                            className="text-xs px-2 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
                                                        >
                                                            Apply
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setFilters(prev => ({ ...prev, [item.symbol]: { mode: 'quick', days: 30 } }))
                                                                syncAndFetchHistory(item.symbol, { mode: 'quick', days: 30 })
                                                            }}
                                                            className="text-xs px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors"
                                                        >
                                                            Clear
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {expandData?.syncError && (
                                            <p className="text-xs text-red-400 mb-3">{expandData.syncError}</p>
                                        )}

                                        {expandData?.syncInfo && (
                                            <p className="text-xs text-amber-300 mb-3">{expandData.syncInfo}</p>
                                        )}

                                        {expandData?.loading ? (
                                            <div className="p-4 text-center text-gray-500 text-xs">
                                                <div className="inline-block w-4 h-4 border-2 border-gray-700 border-t-emerald-500 rounded-full animate-spin"></div>
                                            </div>
                                        ) : expandData?.data?.length === 0 ? (
                                            <p className="text-xs text-gray-600 p-4 text-center">No historical data found</p>
                                        ) : (
                                            <div className="space-y-4">
                                                <PriceChart
                                                    title="Price vs Date"
                                                    data={expandData.data.map((record) => ({
                                                        name: record.trading_date,
                                                        open: toNumber(record.open_price),
                                                        high: toNumber(record.high_price),
                                                        low: toNumber(record.low_price),
                                                        close: toNumber(record.close_price),
                                                        volume: toNumber(record.volume),
                                                    }))}
                                                />

                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="border-b border-gray-700 text-gray-500">
                                                                <th className="text-left px-2 py-2">Date</th>
                                                                <th className="text-right px-2 py-2">Open</th>
                                                                <th className="text-right px-2 py-2">High</th>
                                                                <th className="text-right px-2 py-2">Low</th>
                                                                <th className="text-right px-2 py-2">Close</th>
                                                                <th className="text-right px-2 py-2">Change %</th>
                                                                <th className="text-right px-2 py-2">Volume</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {expandData?.data?.map((record, idx) => (
                                                                <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                                                                    <td className="px-2 py-2 text-gray-300">
                                                                        {new Date(record.trading_date).toLocaleDateString('en-NP')}
                                                                    </td>
                                                                    <td className="text-right px-2 py-2 text-gray-300">{fmt2(record.open_price)}</td>
                                                                    <td className="text-right px-2 py-2 text-gray-300">{fmt2(record.high_price)}</td>
                                                                    <td className="text-right px-2 py-2 text-gray-300">{fmt2(record.low_price)}</td>
                                                                    <td className="text-right px-2 py-2 font-semibold text-white">{fmt2(record.close_price)}</td>
                                                                    <td className={`text-right px-2 py-2 font-semibold ${record.percent_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                        {record.percent_change >= 0 ? '+' : ''}{fmt2(record.percent_change)}%
                                                                    </td>
                                                                    <td className="text-right px-2 py-2 text-gray-400">{record.volume?.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
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
