"use client"

import { signOut } from 'next-auth/react'
import MarketStatusBadge from '@/components/MarketStatusBadge'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useRef, useState } from 'react'

type Suggestion = {
    symbol: string
    name?: string | null
    sector?: string | null
    close_price?: number | null
    percent_change?: number | null
}

type TopBarUser = {
    name?: string | null
    email?: string | null
}

export default function TopBar({ user }: { user?: TopBarUser }) {
    const router = useRouter()
    const [q, setQ] = useState('')
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const wrapRef = useRef<HTMLDivElement | null>(null)

    function handleSearch(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const query = q.trim().toUpperCase()
        if (!query) return
        setOpen(false)
        router.push(`/dashboard/search?q=${encodeURIComponent(query)}`)
    }

    function pick(symbol: string) {
        setQ(symbol)
        setOpen(false)
    }

    useEffect(() => {
        const query = q.trim()
        if (query.length < 1) {
            setSuggestions([])
            setOpen(false)
            setLoading(false)
            setActiveIndex(-1)
            return
        }

        const ctrl = new AbortController()
        const t = setTimeout(async () => {
            try {
                setLoading(true)
                const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
                const payload = await res.json()
                if (!res.ok) {
                    setSuggestions([])
                    setOpen(false)
                    return
                }
                const rows = Array.isArray(payload?.results) ? payload.results : []
                setSuggestions(rows)
                setOpen(true)
                setActiveIndex(rows.length ? 0 : -1)
            } catch {
                if (!ctrl.signal.aborted) {
                    setSuggestions([])
                    setOpen(false)
                }
            } finally {
                if (!ctrl.signal.aborted) setLoading(false)
            }
        }, 180)

        return () => {
            ctrl.abort()
            clearTimeout(t)
        }
    }, [q])

    useEffect(() => {
        function onDocMouseDown(e: MouseEvent) {
            if (!wrapRef.current) return
            if (!wrapRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', onDocMouseDown)
        return () => document.removeEventListener('mousedown', onDocMouseDown)
    }, [])

    const displayName = user?.name?.trim() || 'User'
    const email = user?.email?.trim() || ''
    const initials = (displayName || email || 'U')
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

    return (
        <header className="shrink-0 border-b border-gray-800 bg-gray-900/95 px-6 py-3 backdrop-blur">
            <div className="flex items-center gap-4">
                <form onSubmit={handleSearch} className="flex-1 max-w-md">
                    <div className="relative" ref={wrapRef}>
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                        </svg>
                        <input
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            onFocus={() => {
                                if (suggestions.length) setOpen(true)
                            }}
                            onKeyDown={(e) => {
                                if (!open || !suggestions.length) return
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault()
                                    setActiveIndex((i) => (i + 1) % suggestions.length)
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault()
                                    setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
                                } else if (e.key === 'Enter' && activeIndex >= 0) {
                                    e.preventDefault()
                                    pick(String(suggestions[activeIndex]?.symbol || '').toUpperCase())
                                } else if (e.key === 'Escape') {
                                    setOpen(false)
                                }
                            }}
                            placeholder="Search symbol (NABIL, ADBL...)"
                            className="w-full bg-gray-800 border border-gray-700 text-white text-sm pl-10 pr-10 py-2.5 rounded-full placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                            type="submit"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                            title="Search"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 12h14m0 0-6-6m6 6-6 6" />
                            </svg>
                        </button>

                        {open && (
                            <div className="absolute z-40 top-[calc(100%+8px)] left-0 right-0 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden">
                                {loading && (
                                    <div className="px-4 py-3 text-xs text-gray-400">Searching...</div>
                                )}

                                {!loading && suggestions.length === 0 && (
                                    <div className="px-4 py-3 text-xs text-gray-500">No matching company</div>
                                )}

                                {!loading && suggestions.length > 0 && (
                                    <div className="max-h-72 overflow-auto">
                                        {suggestions.map((s, idx) => {
                                            const active = idx === activeIndex
                                            const pct = Number(s.percent_change ?? 0)
                                            return (
                                                <div
                                                    key={`${s.symbol}-${idx}`}
                                                    onMouseEnter={() => setActiveIndex(idx)}
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => pick(String(s.symbol || '').toUpperCase())}
                                                    className={`w-full text-left px-4 py-3 border-b border-gray-800/80 last:border-b-0 transition-colors cursor-default ${active ? 'bg-gray-800/80' : 'hover:bg-gray-800/50'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-md bg-gray-800 text-gray-300 text-xs font-bold flex items-center justify-center shrink-0">
                                                            {String(s.symbol || '').slice(0, 2)}
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-semibold text-white">{s.symbol}</span>
                                                                <span className="text-[11px] text-gray-500">{s.sector || 'Others'}</span>
                                                            </div>
                                                            <p className="text-xs text-gray-400 truncate">{s.name || 'Unknown company'}</p>
                                                        </div>

                                                        <div className="text-right shrink-0">
                                                            <p className="text-sm text-gray-200">{s.close_price != null ? `Rs. ${Number(s.close_price).toLocaleString()}` : '—'}</p>
                                                            <p className={`text-xs ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                {pct >= 0 ? '↑ ' : '↓ '}{Math.abs(pct).toFixed(2)}%
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </form>

                <MarketStatusBadge />

                <div className="ml-auto flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm leading-tight font-medium text-white">{displayName}</p>
                        {email && <p className="text-xs text-gray-500">{email}</p>}
                    </div>

                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center">
                        {initials}
                    </div>

                    <button
                        type="button"
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                        title="Sign out"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="m16 17 5-5m0 0-5-5m5 5H9m4 5v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
                        </svg>
                    </button>
                </div>
            </div>
        </header>
    )
}
