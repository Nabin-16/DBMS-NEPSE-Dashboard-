'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface Holding {
    holding_id: number
    symbol: string
    name: string
    sector: string
    quantity: number
    buy_price: number
    bought_at: string
    notes: string | null
    current_price: number | null
    percent_change: number | null
    price_date: string | null
}

interface SearchResult {
    symbol: string
    name: string
    sector?: string
    close_price?: number | null
    percent_change?: number | null
}

function fmt(n: number) { return n.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtInt(n: number) { return n.toLocaleString('en-NP') }

// ── Inline company search with price preview ──────────────────────────────────
function CompanySearchInput({
    value, onChange, onSelect, disabled
}: {
    value: string
    onChange: (v: string) => void
    onSelect: (r: SearchResult) => void
    disabled?: boolean
}) {
    const [results, setResults] = useState<SearchResult[]>([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [activeIdx, setActive] = useState(0)
    const wrapRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const q = value.trim()
        if (q.length < 1) { setResults([]); setOpen(false); return }

        const ctrl = new AbortController()
        const t = setTimeout(async () => {
            try {
                setLoading(true)
                const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
                const json = await res.json()
                const rows = Array.isArray(json?.results) ? json.results : []
                setResults(rows)
                setOpen(rows.length > 0)
                setActive(0)
            } catch { if (!ctrl.signal.aborted) { setResults([]); setOpen(false) } }
            finally { if (!ctrl.signal.aborted) setLoading(false) }
        }, 180)

        return () => { ctrl.abort(); clearTimeout(t) }
    }, [value])

    useEffect(() => {
        function onDown(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [])

    return (
        <div ref={wrapRef} className="relative">
            <div className="relative">
                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value.toUpperCase())}
                    onFocus={() => { if (results.length) setOpen(true) }}
                    onKeyDown={e => {
                        if (!open || !results.length) return
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % results.length) }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => i <= 0 ? results.length - 1 : i - 1) }
                        else if (e.key === 'Enter' && results[activeIdx]) { e.preventDefault(); onSelect(results[activeIdx]); setOpen(false) }
                        else if (e.key === 'Escape') setOpen(false)
                    }}
                    placeholder="e.g. NABIL"
                    disabled={disabled}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 rounded-lg
                        focus:outline-none focus:border-emerald-500 placeholder-gray-600 disabled:opacity-50"
                />
                {loading && (
                    <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin w-3.5 h-3.5 text-gray-500"
                        fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                )}
            </div>

            {open && results.length > 0 && (
                <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-gray-900 border border-gray-700
                    rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                    {results.map((s, idx) => {
                        const pct = Number(s.percent_change ?? 0)
                        return (
                            <div key={`${s.symbol}-${s.name ?? ''}-${idx}`}
                                onMouseEnter={() => setActive(idx)}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { onSelect(s); setOpen(false) }}
                                className={`px-4 py-3 border-b border-gray-800 last:border-0 cursor-pointer transition-colors
                                    ${idx === activeIdx ? 'bg-gray-800' : 'hover:bg-gray-800/60'}`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded bg-gray-700 text-gray-300 text-xs font-bold flex items-center justify-center shrink-0">
                                        {s.symbol.slice(0, 2)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-white">{s.symbol}</span>
                                            {s.sector && <span className="text-xs text-gray-500">{s.sector}</span>}
                                        </div>
                                        <p className="text-xs text-gray-400 truncate">{s.name}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm text-gray-200">
                                            {s.close_price != null ? `Rs. ${Number(s.close_price).toLocaleString()}` : '—'}
                                        </p>
                                        {s.percent_change != null && (
                                            <p className={`text-xs ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {pct >= 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(2)}%
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── Portfolio page ────────────────────────────────────────────────────────────
export default function PortfolioPage() {
    const searchParams = useSearchParams()
    const router = useRouter()

    // Pre-fill from TopBar search — if user searched "NABIL" and navigated here
    const preSymbol = (searchParams.get('symbol') ?? '').toUpperCase()

    const [holdings, setHoldings] = useState<Holding[]>([])
    const [pageLoad, setPageLoad] = useState(true)
    const [deleting, setDeleting] = useState<number | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [fErr, setFErr] = useState('')
    const [fBusy, setFBusy] = useState(false)

    // Form state
    const [fSymbol, setFSymbol] = useState(preSymbol)
    const [fName, setFName] = useState('')
    const [fLTP, setFLTP] = useState<number | null>(null)       // live LTP from search
    const [fQty, setFQty] = useState('')
    const [fPrice, setFPrice] = useState('')
    const [fDate, setFDate] = useState('')
    const [fNotes, setFNotes] = useState('')

    // If TopBar sent a symbol, open form automatically
    useEffect(() => {
        if (preSymbol) {
            setShowForm(true)
            setFSymbol(preSymbol)
            // Clear the query param so back/refresh doesn't re-open form
            router.replace('/dashboard/portfolio', { scroll: false })
        }
    }, [preSymbol, router])

    const loadHoldings = useCallback(async () => {
        try {
            const res = await fetch('/api/portfolio')
            const json = await res.json()
            setHoldings(json.rows ?? [])
        } catch { /* silently */ }
        finally { setPageLoad(false) }
    }, [])

    useEffect(() => { loadHoldings() }, [loadHoldings])

    // When user selects a company from the search dropdown:
    // auto-fill symbol, name, and pre-fill buy_price with current LTP
    function handleCompanySelect(r: SearchResult) {
        setFSymbol(r.symbol)
        setFName(r.name ?? '')
        setFLTP(r.close_price ?? null)
        // Pre-fill buy_price with LTP as a convenience — user can override
        if (r.close_price != null) setFPrice(String(r.close_price))
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        if (!fSymbol.trim() || !fQty || !fPrice || !fDate) {
            setFErr('All fields except notes are required')
            return
        }
        setFBusy(true)
        setFErr('')
        try {
            const res = await fetch('/api/portfolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: fSymbol.trim().toUpperCase(),
                    quantity: Number(fQty),
                    buy_price: Number(fPrice),
                    bought_at: fDate,
                    notes: fNotes || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) { setFErr(json.error ?? 'Failed'); setFBusy(false); return }
            // Reset form
            setFSymbol(''); setFName(''); setFLTP(null)
            setFQty(''); setFPrice(''); setFDate(''); setFNotes('')
            setShowForm(false)
            await loadHoldings()
        } catch { setFErr('Network error') }
        finally { setFBusy(false) }
    }

    async function handleDelete(id: number) {
        setDeleting(id)
        try {
            await fetch('/api/portfolio', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ holding_id: id }),
            })
            await loadHoldings()
        } catch { /* silently */ }
        finally { setDeleting(null) }
    }

    // Summary
    const totalInvested = holdings.reduce((s, h) => s + h.quantity * h.buy_price, 0)
    const totalCurrent = holdings.reduce((s, h) => s + h.quantity * (h.current_price ?? h.buy_price), 0)
    const totalPnl = totalCurrent - totalInvested
    const pnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
    const isGain = totalPnl >= 0

    return (
        <div className="max-w-5xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-white">Portfolio</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {holdings.length} holding{holdings.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button onClick={() => { setShowForm(v => !v); setFErr('') }}
                    className="flex items-center gap-2 text-sm px-4 py-2 bg-emerald-600
                        hover:bg-emerald-500 text-white rounded-xl transition-colors font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Holding
                </button>
            </div>

            {/* Add form */}
            {showForm && (
                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4">Add a holding</h2>

                    {/* Company info preview — shown after selecting from dropdown */}
                    {fSymbol && fName && (
                        <div className="mb-4 flex items-center gap-3 bg-gray-800/60 rounded-xl px-4 py-3">
                            <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center
                                text-emerald-400 font-bold text-xs shrink-0">
                                {fSymbol.slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white">{fSymbol}</p>
                                <p className="text-xs text-gray-400 truncate">{fName}</p>
                            </div>
                            {fLTP != null && (
                                <div className="text-right shrink-0">
                                    <p className="text-xs text-gray-500">Last traded price</p>
                                    <p className="text-sm font-semibold text-white">Rs. {fLTP.toLocaleString()}</p>
                                </div>
                            )}
                        </div>
                    )}

                    <form onSubmit={handleAdd}>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="col-span-2 space-y-1">
                                <label className="text-xs text-gray-500">Symbol *</label>
                                <CompanySearchInput
                                    value={fSymbol}
                                    onChange={v => { setFSymbol(v); setFName(''); setFLTP(null) }}
                                    onSelect={handleCompanySelect}
                                    disabled={fBusy}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-500">Quantity *</label>
                                <input type="number" min="1" value={fQty}
                                    onChange={e => setFQty(e.target.value)}
                                    placeholder="e.g. 50" required disabled={fBusy}
                                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm
                                        px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500
                                        placeholder-gray-600 disabled:opacity-50" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-500">
                                    Buy Price (Rs.) *
                                    {fLTP != null && (
                                        <button type="button"
                                            onClick={() => setFPrice(String(fLTP))}
                                            className="ml-2 text-emerald-400 hover:text-emerald-300 text-xs">
                                            use LTP
                                        </button>
                                    )}
                                </label>
                                <input type="number" min="0.01" step="0.01" value={fPrice}
                                    onChange={e => setFPrice(e.target.value)}
                                    placeholder="e.g. 1250.00" required disabled={fBusy}
                                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm
                                        px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500
                                        placeholder-gray-600 disabled:opacity-50" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-500">Buy Date *</label>
                                <input type="date" value={fDate}
                                    onChange={e => setFDate(e.target.value)}
                                    required disabled={fBusy}
                                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm
                                        px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500 disabled:opacity-50" />
                            </div>
                            <div className="col-span-2 sm:col-span-3 space-y-1">
                                <label className="text-xs text-gray-500">Notes (optional)</label>
                                <input value={fNotes} onChange={e => setFNotes(e.target.value)}
                                    placeholder="e.g. IPO allotment" disabled={fBusy}
                                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm
                                        px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500
                                        placeholder-gray-600 disabled:opacity-50" />
                            </div>
                        </div>

                        {/* Live P&L preview */}
                        {fQty && fPrice && fLTP != null && (
                            <div className="mt-3 flex items-center gap-6 bg-gray-800/50 rounded-xl px-4 py-3 text-sm">
                                <div>
                                    <p className="text-xs text-gray-500">Invested</p>
                                    <p className="font-semibold text-white">
                                        Rs. {fmtInt(Math.round(Number(fQty) * Number(fPrice)))}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Current value</p>
                                    <p className="font-semibold text-white">
                                        Rs. {fmtInt(Math.round(Number(fQty) * fLTP))}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Unrealised P&L</p>
                                    {(() => {
                                        const pnl = (fLTP - Number(fPrice)) * Number(fQty)
                                        const pct = Number(fPrice) > 0 ? (fLTP - Number(fPrice)) / Number(fPrice) * 100 : 0
                                        return (
                                            <p className={`font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {pnl >= 0 ? '+' : ''}Rs. {fmtInt(Math.round(Math.abs(pnl)))}
                                                {' '}({pnl >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                                            </p>
                                        )
                                    })()}
                                </div>
                            </div>
                        )}

                        {fErr && (
                            <p className="mt-3 text-xs text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
                                {fErr}
                            </p>
                        )}

                        <div className="flex gap-3 mt-4">
                            <button type="submit" disabled={fBusy}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm
                                    font-medium rounded-xl transition-colors disabled:opacity-60">
                                {fBusy ? 'Adding…' : 'Add Holding'}
                            </button>
                            <button type="button" onClick={() => setShowForm(false)}
                                className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm
                                    font-medium rounded-xl transition-colors border border-gray-700">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Summary cards */}
            {holdings.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: 'Invested', value: `Rs. ${fmtInt(Math.round(totalInvested))}`, color: 'text-white' },
                        { label: 'Current Value', value: `Rs. ${fmtInt(Math.round(totalCurrent))}`, color: 'text-white' },
                        {
                            label: 'Total P&L',
                            value: `${isGain ? '+' : ''}Rs. ${fmtInt(Math.round(Math.abs(totalPnl)))}`,
                            color: isGain ? 'text-emerald-400' : 'text-red-400'
                        },
                        {
                            label: 'Return',
                            value: `${isGain ? '+' : ''}${pnlPct.toFixed(2)}%`,
                            color: isGain ? 'text-emerald-400' : 'text-red-400'
                        },
                    ].map(s => (
                        <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                            <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Holdings table */}
            {pageLoad ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                    <div className="w-6 h-6 border-2 border-gray-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Loading…</p>
                </div>
            ) : holdings.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                    <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <p className="text-gray-400 text-sm font-medium">No holdings yet</p>
                    <p className="text-gray-600 text-xs mt-1">Click "Add Holding" to start tracking</p>
                </div>
            ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                        <h2 className="text-sm font-medium text-white">Holdings</h2>
                        <p className="text-xs text-gray-500">{holdings.length} entries</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 border-b border-gray-800">
                                    <th className="text-left px-5 py-3 font-medium">Symbol</th>
                                    <th className="text-right px-4 py-3 font-medium">Qty</th>
                                    <th className="text-right px-4 py-3 font-medium">Buy Price</th>
                                    <th className="text-right px-4 py-3 font-medium">LTP</th>
                                    <th className="text-right px-4 py-3 font-medium">Invested</th>
                                    <th className="text-right px-4 py-3 font-medium">Current</th>
                                    <th className="text-right px-4 py-3 font-medium">P&L</th>
                                    <th className="text-right px-4 py-3 font-medium">Buy Date</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {holdings.map(h => {
                                    const invested = h.quantity * h.buy_price
                                    const current = h.quantity * (h.current_price ?? h.buy_price)
                                    const pnl = current - invested
                                    const pnlPct = (pnl / invested) * 100
                                    const up = pnl >= 0
                                    return (
                                        <tr key={h.holding_id}
                                            className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center
                                                        justify-center text-xs font-bold text-gray-300 shrink-0">
                                                        {h.symbol.slice(0, 2)}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-white text-sm">{h.symbol}</p>
                                                        <p className="text-xs text-gray-500 max-w-[120px] truncate">{h.name}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-white font-medium">{fmtInt(h.quantity)}</td>
                                            <td className="px-4 py-3 text-right text-gray-300">Rs. {fmt(h.buy_price)}</td>
                                            <td className="px-4 py-3 text-right">
                                                {h.current_price != null ? (
                                                    <div>
                                                        <p className="text-white font-medium">Rs. {fmt(h.current_price)}</p>
                                                        {h.percent_change != null && (
                                                            <p className={`text-xs ${h.percent_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                {h.percent_change >= 0 ? '↑' : '↓'} {Math.abs(h.percent_change).toFixed(2)}%
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : <span className="text-gray-600 text-xs">No data</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-400">Rs. {fmtInt(Math.round(invested))}</td>
                                            <td className="px-4 py-3 text-right text-white">Rs. {fmtInt(Math.round(current))}</td>
                                            <td className="px-4 py-3 text-right">
                                                <p className={`font-semibold text-sm ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {up ? '+' : ''}Rs. {fmtInt(Math.round(Math.abs(pnl)))}
                                                </p>
                                                <p className={`text-xs ${up ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                                                    {up ? '+' : ''}{pnlPct.toFixed(2)}%
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-500 text-xs">
                                                {new Date(h.bought_at).toLocaleDateString('en-NP',
                                                    { year: 'numeric', month: 'short', day: 'numeric' })}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => handleDelete(h.holding_id)}
                                                    disabled={deleting === h.holding_id}
                                                    className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-40 p-1">
                                                    {deleting === h.holding_id ? (
                                                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
