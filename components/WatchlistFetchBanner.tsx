'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
    symbol: string
}

export default function WatchlistFetchBanner({ symbol }: Props) {
    const router = useRouter()
    const [phase, setPhase] = useState<'fetching' | 'done' | 'error'>('fetching')
    const [loaded, setLoaded] = useState(0)
    const [msg, setMsg] = useState(`Syncing 30 days of ${symbol} price history from live chart API...`)

    useEffect(() => {
        let cancelled = false

        async function run() {
            try {
                setPhase('fetching')
                setMsg(`Downloading ${symbol} price history from live chart API...`)

                const res = await fetch('/api/auto-fetch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'symbol_history', symbol, days: 30 }),
                })
                const data = await res.json()
                if (cancelled) return

                const loadedRows = Number(data?.loaded ?? 0)
                setLoaded(loadedRows)
                setPhase('done')
                setMsg(
                    loadedRows > 0
                        ? `Loaded ${loadedRows} trading days for ${symbol}. Refreshing...`
                        : `${symbol} history is up to date`
                )

                setTimeout(() => {
                    if (!cancelled) router.push('/dashboard/watchlist')
                }, 1800)
            } catch {
                if (!cancelled) {
                    setPhase('error')
                    setMsg('Failed to fetch history. You can retry from the stock detail page.')
                }
            }
        }

        void run()
        return () => {
            cancelled = true
        }
    }, [symbol, router])

    return (
        <div className={`rounded-xl border px-5 py-4 transition-all ${phase === 'done'
            ? 'bg-emerald-950/40 border-emerald-800/60'
            : phase === 'error'
                ? 'bg-red-950/40 border-red-800/60'
                : 'bg-blue-950/30 border-blue-800/40'
            }`}>
            <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${phase === 'done'
                    ? 'bg-emerald-600'
                    : phase === 'error'
                        ? 'bg-red-700'
                        : 'bg-blue-600/20'
                    }`}>
                    {phase === 'fetching' && (
                        <svg className="animate-spin w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    )}
                    {phase === 'done' && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                    {phase === 'error' && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${phase === 'done' ? 'text-emerald-400' : phase === 'error' ? 'text-red-400' : 'text-blue-300'}`}>
                        {phase === 'fetching' && `Loading ${symbol} history`}
                        {phase === 'done' && `${symbol} history ready`}
                        {phase === 'error' && 'Fetch failed'}
                    </p>
                    <p className={`text-xs mt-0.5 ${phase === 'done' ? 'text-emerald-500/80' : phase === 'error' ? 'text-red-400/70' : 'text-blue-400/70'}`}>
                        {msg}
                    </p>
                </div>

                {phase === 'fetching' && (
                    <div className="flex gap-1 shrink-0 mt-1">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                    </div>
                )}

                {phase === 'done' && loaded > 0 && (
                    <div className="shrink-0">
                        <span className="text-xs bg-emerald-900 text-emerald-400 px-2.5 py-1 rounded-full font-medium border border-emerald-800">
                            {loaded} days
                        </span>
                    </div>
                )}
            </div>

            {phase === 'fetching' && (
                <div className="mt-3 bg-blue-900/30 rounded-full h-1 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
            )}
        </div>
    )
}
