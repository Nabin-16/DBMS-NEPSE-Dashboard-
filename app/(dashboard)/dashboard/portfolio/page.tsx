'use client'

import { useEffect, useState } from 'react'
import WatchlistPopup from '@/components/WatchlistPopup'

interface CompanyMetrics {
    symbol: string
    company_name: string
    sector_name: string
    last_price: number | null
    change_percent: number | null
    updated_at: string | null
    open_price?: number | null
    high_price?: number | null
    low_price?: number | null
    close_price?: number | null
    prev_close?: number | null
    turnover?: number | null
    volume?: number | null
}

function toNumber(value: unknown): number {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

function fmt2(value: unknown): string {
    return toNumber(value).toFixed(2)
}

function fmtCurrency(value: unknown): string {
    const n = toNumber(value)
    if (!Number.isFinite(n) || n <= 0) return '—'
    return `Rs. ${n.toLocaleString('en-NP', { maximumFractionDigits: 2 })}`
}

function safePct(num: number, den: number): number | null {
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
    return (num / den) * 100
}

export default function PortfolioPage() {
    const [companies, setCompanies] = useState<CompanyMetrics[]>([])
    const [query, setQuery] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(0)
    const [selectedCompany, setSelectedCompany] = useState('')
    const [selectedMetrics, setSelectedMetrics] = useState<CompanyMetrics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [showWatchlistPopup, setShowWatchlistPopup] = useState(false)

    useEffect(() => {
        async function fetchCompanies() {
            try {
                const res = await fetch('/api/stocks/all')
                if (!res.ok) throw new Error('Failed to fetch companies')
                const payload = await res.json()
                const rows = Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload?.rows)
                        ? payload.rows
                        : []

                const normalized: CompanyMetrics[] = rows.map((row: any) => ({
                    symbol: String(row.symbol ?? ''),
                    company_name: String(row.company_name ?? row.name ?? ''),
                    sector_name: String(row.sector_name ?? row.sector ?? 'Others'),
                    last_price: row.last_price == null ? null : toNumber(row.last_price),
                    change_percent: row.change_percent == null ? null : toNumber(row.change_percent),
                    updated_at: row.updated_at ?? null,
                    open_price: row.open_price == null ? null : toNumber(row.open_price),
                    high_price: row.high_price == null ? null : toNumber(row.high_price),
                    low_price: row.low_price == null ? null : toNumber(row.low_price),
                    close_price: row.close_price == null ? null : toNumber(row.close_price),
                    prev_close: row.prev_close == null ? null : toNumber(row.prev_close),
                    turnover: row.turnover == null ? null : toNumber(row.turnover),
                    volume: row.volume == null ? null : toNumber(row.volume),
                }))

                setCompanies(normalized)
                if (normalized.length > 0) {
                    setSelectedCompany(normalized[0].symbol)
                    setSelectedMetrics(normalized[0])
                    setQuery(normalized[0].symbol)
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error loading companies')
            } finally {
                setLoading(false)
            }
        }

        fetchCompanies()
    }, [])

    const handleCompanyChange = (symbol: string) => {
        setSelectedCompany(symbol)
        const company = companies.find(c => c.symbol === symbol)
        if (company) {
            setSelectedMetrics(company)
            setQuery(company.symbol)
            setIsOpen(false)
        }
    }

    const filteredCompanies = companies.filter((company) => {
        const q = query.trim().toLowerCase()
        if (!q) return true
        return (
            company.symbol.toLowerCase().includes(q) ||
            company.company_name.toLowerCase().includes(q) ||
            company.sector_name.toLowerCase().includes(q)
        )
    })

    const topMatches = filteredCompanies.slice(0, 80)

    const closePrice = selectedMetrics ? (selectedMetrics.close_price ?? selectedMetrics.last_price ?? null) : null
    const openPrice = selectedMetrics?.open_price ?? null
    const highPrice = selectedMetrics?.high_price ?? null
    const lowPrice = selectedMetrics?.low_price ?? null
    const prevClose = selectedMetrics?.prev_close ?? null

    const dayRange = highPrice != null && lowPrice != null ? highPrice - lowPrice : null
    const intradayVolPct = openPrice != null && dayRange != null ? safePct(dayRange, openPrice) : null
    const gapPct = closePrice != null && prevClose != null ? safePct(closePrice - prevClose, prevClose) : null
    const highDistancePct = closePrice != null && highPrice != null ? safePct(highPrice - closePrice, highPrice) : null
    const lowDistancePct = closePrice != null && lowPrice != null ? safePct(closePrice - lowPrice, lowPrice) : null

    function selectNextCompany() {
        if (!selectedMetrics || companies.length === 0) return
        const idx = companies.findIndex((c) => c.symbol === selectedMetrics.symbol)
        const next = companies[(idx + 1 + companies.length) % companies.length]
        handleCompanyChange(next.symbol)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="w-12 h-12 rounded-full border-4 border-gray-600 border-t-emerald-500 animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading portfolio data...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">My Portfolio</h1>
                <p className="text-gray-400 mt-1">View detailed metrics of companies</p>
            </div>

            {/* Company Selector */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                    Select Company
                </label>
                <div className="relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                    </svg>
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                            setIsOpen(true)
                            setActiveIndex(0)
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={(e) => {
                            if (!isOpen || !topMatches.length) return
                            if (e.key === 'ArrowDown') {
                                e.preventDefault()
                                setActiveIndex((idx) => (idx + 1) % topMatches.length)
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault()
                                setActiveIndex((idx) => (idx <= 0 ? topMatches.length - 1 : idx - 1))
                            } else if (e.key === 'Enter') {
                                e.preventDefault()
                                const selected = topMatches[activeIndex]
                                if (selected) handleCompanyChange(selected.symbol)
                            } else if (e.key === 'Escape') {
                                setIsOpen(false)
                            }
                        }}
                        onBlur={() => {
                            setTimeout(() => setIsOpen(false), 120)
                        }}
                        placeholder="Search by symbol or company name"
                        className="w-full rounded-xl border border-gray-700 bg-gray-800 pl-11 pr-20 py-3 text-white text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => {
                                setQuery('')
                                setIsOpen(true)
                            }}
                            className="absolute right-12 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            aria-label="Clear search"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsOpen((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        aria-label="Toggle company list"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                        </svg>
                    </button>
                    {isOpen && (
                        <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-700 bg-gray-900 shadow-xl max-h-80 overflow-y-auto">
                            {topMatches.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-gray-500">No company found</p>
                            ) : (
                                topMatches.map((company, idx) => (
                                    <button
                                        key={company.symbol}
                                        type="button"
                                        onClick={() => handleCompanyChange(company.symbol)}
                                        onMouseEnter={() => setActiveIndex(idx)}
                                        className={`w-full text-left px-4 py-3 border-b border-gray-800/70 last:border-b-0 transition-colors ${(selectedCompany === company.symbol || activeIndex === idx) ? 'bg-emerald-900/20' : 'hover:bg-gray-800'}`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm text-white font-medium">{company.symbol} <span className="text-gray-400 font-normal">- {company.company_name}</span></p>
                                                <p className="text-xs text-gray-500 truncate">{company.sector_name}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xs text-gray-300">{fmtCurrency(company.close_price ?? company.last_price)}</p>
                                                <p className={`text-[11px] ${(company.change_percent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {(company.change_percent ?? 0) >= 0 ? '↑' : '↓'} {fmt2(Math.abs(company.change_percent ?? 0))}%
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    Showing {topMatches.length} of {companies.length} companies
                </p>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {selectedMetrics && (
                <div className="space-y-6">
                    {/* Header Card */}
                    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-8">
                        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
                            {/* Left: Company Info */}
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 font-bold text-lg">
                                    {selectedMetrics.symbol?.slice(0, 2)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-2xl font-bold text-white">{selectedMetrics.symbol}</h2>
                                        <span className="text-xs bg-emerald-900/60 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-full">
                                            {selectedMetrics.sector_name || 'N/A'}
                                        </span>
                                    </div>
                                    <p className="text-gray-400 mt-1">{selectedMetrics.company_name}</p>
                                </div>
                            </div>

                            {/* Right: Price Info */}
                            <div className="text-right">
                                <div className="flex items-center gap-3 justify-end">
                                    <div>
                                        <p className="text-4xl font-bold text-white">
                                            Rs. {selectedMetrics.close_price?.toLocaleString('en-NP', { maximumFractionDigits: 2 }) || selectedMetrics.last_price?.toLocaleString('en-NP', { maximumFractionDigits: 2 }) || '—'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">+Rs. {fmt2(selectedMetrics.change_percent)}</p>
                                    </div>
                                    <div className={`flex items-center gap-1 px-3 py-2 rounded-lg font-medium ${(selectedMetrics.change_percent ?? 0) >= 0
                                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                                        : 'bg-red-950/80 text-red-400 border border-red-800'
                                        }`}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d={(selectedMetrics.change_percent ?? 0) >= 0 ? 'M5 10l7-7m0 0l7 7m-7-7v18' : 'M19 14l-7 7m0 0l-7-7m7 7V3'} />
                                        </svg>
                                        {fmt2(Math.abs(selectedMetrics.change_percent ?? 0))}%
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    {selectedMetrics.updated_at
                                        ? new Date(selectedMetrics.updated_at).toLocaleDateString('en-NP', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                        })
                                        : 'No data'}
                                </p>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-6 border-t border-gray-700">
                            <StatCard label="Open" value={fmtCurrency(selectedMetrics.open_price)} icon="⏺" />
                            <StatCard label="High" value={fmtCurrency(selectedMetrics.high_price)} icon="▲" />
                            <StatCard label="Low" value={fmtCurrency(selectedMetrics.low_price)} icon="▼" />
                            <StatCard label="Pr. Close" value={fmtCurrency(selectedMetrics.prev_close)} icon="↩" />
                            <StatCard label="Day Range" value={dayRange != null ? fmtCurrency(dayRange) : '—'} icon="↔" />
                            <StatCard label="Gap vs Prev" value={gapPct != null ? `${gapPct >= 0 ? '+' : ''}${fmt2(gapPct)}%` : '—'} icon="Δ" />
                        </div>
                    </div>

                    {/* Additional Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                            <h3 className="text-sm font-medium text-gray-300 mb-4">Trading Information</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                                    <span className="text-gray-500 text-sm">Volume</span>
                                    <span className="text-white font-medium">{selectedMetrics.volume?.toLocaleString() || '—'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                                    <span className="text-gray-500 text-sm">Intraday Volatility</span>
                                    <span className="text-white font-medium">{intradayVolPct != null ? `${fmt2(intradayVolPct)}%` : '—'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                                    <span className="text-gray-500 text-sm">Distance from Day High</span>
                                    <span className="text-white font-medium">{highDistancePct != null ? `${fmt2(highDistancePct)}%` : '—'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                                    <span className="text-gray-500 text-sm">Distance from Day Low</span>
                                    <span className="text-white font-medium">{lowDistancePct != null ? `${fmt2(lowDistancePct)}%` : '—'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-gray-500 text-sm">Last Updated</span>
                                    <span className="text-emerald-400 text-sm font-medium">
                                        {selectedMetrics.updated_at
                                            ? new Date(selectedMetrics.updated_at).toLocaleTimeString('en-NP')
                                            : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                            <h3 className="text-sm font-medium text-gray-200 mb-4">Quick Actions</h3>
                            <p className="text-xs text-gray-500 mb-4">Simple actions for faster review workflow.</p>

                            <div className="space-y-2.5">
                                <button
                                    onClick={() => setShowWatchlistPopup(true)}
                                    className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600/25 to-blue-500/10 border border-blue-500/40 text-blue-200 hover:border-blue-400 transition-colors text-sm font-semibold text-left"
                                >
                                    Add to Watchlist
                                </button>

                                <button
                                    onClick={selectNextCompany}
                                    className="w-full px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 transition-colors text-sm font-semibold text-left"
                                >
                                    Next Company
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedMetrics && showWatchlistPopup && (
                <WatchlistPopup
                    symbol={selectedMetrics.symbol}
                    name={selectedMetrics.company_name}
                    sector={selectedMetrics.sector_name}
                    price={selectedMetrics.close_price ?? selectedMetrics.last_price ?? undefined}
                    change={selectedMetrics.change_percent ?? undefined}
                    onClose={() => setShowWatchlistPopup(false)}
                />
            )}
        </div>
    )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
    return (
        <div className="bg-gray-800/50 backdrop-blur rounded-lg p-3 border border-gray-700/50 hover:border-emerald-500/30 transition-colors">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <span>{icon}</span> {label}
            </p>
            <p className="text-sm font-semibold text-white">{value}</p>
        </div>
    )
}
