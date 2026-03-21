'use client'

import { useState } from 'react'

type DateMode = 'today' | 'specific' | 'range'

export default function DataFetchForm() {
    const [fetchMode, setFetchMode] = useState<'all' | 'specific'>('all')
    const [dateMode, setDateMode] = useState<DateMode>('today')
    const [selectedCompanies, setSelectedCompanies] = useState<string[]>([])
    const [specificDate, setSpecificDate] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    async function handleFetch(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        setMessage('')

        try {
            const payload: Record<string, unknown> = {
                mode: fetchMode === 'all' ? 'all' : 'specific',
            }

            if (fetchMode === 'specific' && selectedCompanies.length > 0) {
                payload.symbol = selectedCompanies[0].toUpperCase()
            }

            if (dateMode === 'today') {
                payload.range = 'today'
            } else if (dateMode === 'specific' && specificDate) {
                payload.range = 'specific'
                payload.fromDate = specificDate
                payload.toDate = specificDate
            } else if (dateMode === 'range' && startDate && endDate) {
                payload.range = 'range'
                payload.fromDate = startDate
                payload.toDate = endDate
            } else {
                setMessage('Please select valid date(s)')
                return
            }

            const res = await fetch('/api/fetch/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const data = await res.json()
            if (!res.ok) {
                setMessage(`Error: ${data.error || 'Failed to fetch data'}`)
                return
            }

            setMessage(`✓ Data fetch completed successfully`)
            setSelectedCompanies([])
            setSpecificDate('')
            setStartDate('')
            setEndDate('')
        } catch (err) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Something went wrong'}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleFetch} className="space-y-4">
            {/* Company Selection */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    Data Scope
                </label>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => { setFetchMode('all'); setSelectedCompanies([]); }}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${fetchMode === 'all'
                            ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                            : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:text-gray-300'
                            }`}
                    >
                        All Companies
                    </button>
                    <button
                        type="button"
                        onClick={() => setFetchMode('specific')}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${fetchMode === 'specific'
                            ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                            : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:text-gray-300'
                            }`}
                    >
                        Specific Company
                    </button>
                </div>
            </div>

            {/* Date Selection */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    Date Range
                </label>
                <div className="grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        onClick={() => setDateMode('today')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${dateMode === 'today'
                            ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                            : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:text-gray-300'
                            }`}
                    >
                        Today
                    </button>
                    <button
                        type="button"
                        onClick={() => setDateMode('specific')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${dateMode === 'specific'
                            ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                            : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:text-gray-300'
                            }`}
                    >
                        Specific Day
                    </button>
                    <button
                        type="button"
                        onClick={() => setDateMode('range')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${dateMode === 'range'
                            ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                            : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:text-gray-300'
                            }`}
                    >
                        Date Range
                    </button>
                </div>
            </div>

            {/* Specific Date Input */}
            {dateMode === 'specific' && (
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                        Select Date
                    </label>
                    <input
                        type="date"
                        value={specificDate}
                        onChange={(e) => setSpecificDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                </div>
            )}

            {/* Date Range Inputs */}
            {dateMode === 'range' && (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">
                            From Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">
                            To Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                        />
                    </div>
                </div>
            )}

            {/* Company Input (for specific mode) */}
            {fetchMode === 'specific' && (
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                        Company Symbols (comma-separated)
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., SOHU, AAPL, MSFT"
                        value={selectedCompanies.join(', ')}
                        onChange={(e) => setSelectedCompanies(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder-gray-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">{selectedCompanies.length} company(ies) selected</p>
                </div>
            )}

            {/* Submit Button */}
            <button
                type="submit"
                disabled={loading || (fetchMode === 'specific' && selectedCompanies.length === 0)}
                className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 disabled:opacity-50 text-white text-sm font-semibold transition-all disabled:cursor-not-allowed"
            >
                {loading ? 'Fetching...' : 'Fetch Data'}
            </button>

            {/* Status Message */}
            {message && (
                <div className={`text-xs p-2 rounded-lg ${message.startsWith('✓')
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}>
                    {message}
                </div>
            )}
        </form>
    )
}
