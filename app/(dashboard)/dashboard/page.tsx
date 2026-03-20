'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Stock {
    symbol: string
    name: string
    close_price: number
    percent_change: number
    sector?: string
    volume?: number
    turnover?: number
}

export default function DashboardHome() {
    const [stocks, setStocks] = useState<Stock[]>([])
    const [gainers, setGainers] = useState<Stock[]>([])
    const [losers, setLosers] = useState<Stock[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [stats, setStats] = useState({ total_companies: 0, total_dates: 0, total_records: 0 })

    useEffect(() => {
        const initializeDashboard = async () => {
            try {
                await fetchStocks()
            } catch (err) {
                console.error('Dashboard init error:', err)
                setError('Failed to initialize dashboard')
                setLoading(false)
            }
        }

        initializeDashboard()
    }, [])

    const fetchStocks = async () => {
        try {
            const res = await fetch('/api/stocks/all')
            if (!res.ok) throw new Error('Failed to fetch stocks')
            const payload = await res.json()
            const rawRows = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.rows)
                    ? payload.rows
                    : []

            const data: Stock[] = rawRows.map((row: any) => ({
                symbol: String(row.symbol ?? '').toUpperCase(),
                name: row.name ?? row.company_name ?? 'Unknown',
                close_price: Number(row.close_price ?? row.last_price ?? 0),
                percent_change: Number(row.percent_change ?? row.change_percent ?? 0),
                sector: row.sector ?? row.sector_name ?? 'Others',
                volume: row.volume != null ? Number(row.volume) : undefined,
                turnover: row.turnover != null ? Number(row.turnover) : undefined,
            }))

            // Sort for gainers and losers
            const sorted = [...data].sort((a, b) => (b.percent_change || 0) - (a.percent_change || 0))

            setStocks(data)
            setGainers(sorted.filter(s => (s.percent_change || 0) > 0).slice(0, 10))
            setLosers(sorted.filter(s => (s.percent_change || 0) < 0).slice(0, 10))

            // Calculate stats
            setStats({
                total_companies: data.length,
                total_dates: 1, // Latest date only
                total_records: data.length
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setLoading(false)
        }
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                    onClick={() => {
                        setError(null)
                        setLoading(true)
                        fetchStocks()
                    }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                    Retry
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                <p className="text-gray-400 mt-1">Monitor market trends and company performance</p>
            </div>

            <div className="bg-gray-900/40 border border-gray-800 text-gray-300 px-4 py-3 rounded-lg text-sm">
                Data is loaded from MySQL. Run <span className="font-semibold">npm run pipeline:sync</span> in terminal to refresh from CSV.
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { label: 'Listed companies', value: stats.total_companies.toLocaleString(), icon: '📊' },
                    { label: 'Trading sessions', value: stats.total_dates.toLocaleString(), icon: '📅' },
                    { label: 'Price records', value: stats.total_records.toLocaleString(), icon: '💾' },
                ].map(s => (
                    <div key={s.label}
                        className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl p-6 hover:border-emerald-500/30 transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-400 text-sm mb-1">{s.label}</p>
                                <p className="text-3xl font-bold text-white">{s.value}</p>
                            </div>
                            <span className="text-4xl opacity-20">{s.icon}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Top Gainers and Losers - Side by Side */}
            {!loading && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Gainers */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-800 bg-gradient-to-r from-gray-800 to-gray-900">
                            <h2 className="text-lg font-semibold text-green-400">🔥 Top Gainers</h2>
                            <p className="text-xs text-gray-500">Best performing companies</p>
                        </div>

                        {gainers.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No gainers found</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 border-b border-gray-800 bg-gray-800/50">
                                            <th className="text-left px-6 py-3 font-medium">Symbol</th>
                                            <th className="text-right px-4 py-3 font-medium">Price</th>
                                            <th className="text-right px-6 py-3 font-medium">Change</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gainers.map((stock) => (
                                            <tr key={stock.symbol} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors group">
                                                <td className="px-6 py-3">
                                                    <Link href={`/dashboard/stock/${stock.symbol}`}
                                                        className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
                                                        {stock.symbol}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 text-right text-white">
                                                    Rs. {stock.close_price?.toLocaleString('en-NP', { maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <span className="text-green-400 font-bold">↑ {(stock.percent_change || 0).toFixed(2)}%</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Top Losers */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-800 bg-gradient-to-r from-gray-800 to-gray-900">
                            <h2 className="text-lg font-semibold text-red-400">📉 Top Losers</h2>
                            <p className="text-xs text-gray-500">Worst performing companies</p>
                        </div>

                        {losers.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No losers found</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 border-b border-gray-800 bg-gray-800/50">
                                            <th className="text-left px-6 py-3 font-medium">Symbol</th>
                                            <th className="text-right px-4 py-3 font-medium">Price</th>
                                            <th className="text-right px-6 py-3 font-medium">Change</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {losers.map((stock) => (
                                            <tr key={stock.symbol} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors group">
                                                <td className="px-6 py-3">
                                                    <Link href={`/dashboard/stock/${stock.symbol}`}
                                                        className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
                                                        {stock.symbol}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 text-right text-white">
                                                    Rs. {stock.close_price?.toLocaleString('en-NP', { maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <span className="text-red-400 font-bold">↓ {Math.abs(stock.percent_change || 0).toFixed(2)}%</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Latest prices table */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-800 bg-gradient-to-r from-gray-800 to-gray-900">
                    <h2 className="text-lg font-semibold text-white mb-1">Latest Market Prices</h2>
                    <p className="text-xs text-gray-500">All companies · Loaded from database</p>
                </div>

                {loading ? (
                    <div className="p-12 text-center">
                        <div className="inline-block">
                            <div className="w-8 h-8 border-4 border-gray-700 border-t-emerald-500 rounded-full animate-spin"></div>
                        </div>
                        <p className="text-gray-500 mt-4">Loading market data...</p>
                    </div>
                ) : stocks.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="text-gray-500">No price data available.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-xs text-gray-500 border-b border-gray-800 bg-gray-800/50">
                                    <th className="text-left px-6 py-4 font-medium">Symbol</th>
                                    <th className="text-left px-4 py-4 font-medium">Company</th>
                                    <th className="text-left px-4 py-4 font-medium">Sector</th>
                                    <th className="text-right px-4 py-4 font-medium">Close</th>
                                    <th className="text-right px-4 py-4 font-medium">Change</th>
                                    <th className="text-right px-6 py-4 font-medium">Volume</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stocks.slice(0, 20).map((stock) => (
                                    <tr key={stock.symbol}
                                        className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors group">
                                        <td className="px-6 py-4">
                                            <Link href={`/dashboard/stock/${stock.symbol}`}
                                                className="font-semibold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                                                <span className="w-8 h-8 bg-gray-700/50 group-hover:bg-emerald-500/20 rounded flex items-center justify-center text-xs font-bold group-hover:text-emerald-400 transition-all">
                                                    {stock.symbol?.slice(0, 2)}
                                                </span>
                                                {stock.symbol}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-300">
                                            {stock.name}
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="text-xs bg-gray-800/50 text-gray-400 px-2.5 py-1 rounded-full border border-gray-700/50">
                                                {stock.sector?.split(' ')[0] || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <p className="font-semibold text-white">Rs. {stock.close_price?.toLocaleString('en-NP', { maximumFractionDigits: 2 })}</p>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <span className={`text-sm font-semibold px-2 py-1 rounded-full transition-colors ${(stock.percent_change ?? 0) >= 0
                                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                                                : 'bg-red-950/60 text-red-400 border border-red-800/50'}`}>
                                                {(stock.percent_change ?? 0) >= 0 ? '↑ ' : '↓ '}
                                                {Math.abs(stock.percent_change ?? 0).toFixed(2)}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-400 font-medium">
                                            {stock.volume?.toLocaleString('en-NP') || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
