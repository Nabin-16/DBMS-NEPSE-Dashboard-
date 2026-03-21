'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
    symbol: string
    name: string
    sector?: string
    price?: number
    change?: number
    onClose: () => void
}

export default function WatchlistPopup({ symbol, name, sector, price, change, onClose }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const overlayRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onEsc)
        return () => window.removeEventListener('keydown', onEsc)
    }, [onClose])

    async function handleAdd() {
        setBusy(true)
        setErr('')

        try {
            const wRes = await fetch('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol }),
            })
            const wData = await wRes.json()

            if (wRes.status === 409) {
                router.push(`/dashboard/watchlist?sym=${symbol}`)
                onClose()
                return
            }

            if (!wRes.ok) {
                setErr(String(wData?.error ?? 'Failed to add'))
                setBusy(false)
                return
            }

            router.push(`/dashboard/watchlist?fetching=${symbol}`)
            onClose()
        } catch {
            setErr('Network error. Please try again.')
            setBusy(false)
        }
    }

    const isUp = Number(change ?? 0) >= 0

    return (
        <div
            ref={overlayRef}
            onClick={(e) => {
                if (e.target === overlayRef.current) onClose()
            }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
            <div onClick={(e) => e.stopPropagation()} className="bg-gray-900 border border-gray-700/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-emerald-600/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
                                {symbol.slice(0, 2)}
                            </div>
                            <div>
                                <p className="font-semibold text-white text-sm">{symbol}</p>
                                <p className="text-xs text-gray-500 mt-0.5 max-w-[190px] truncate">{name}</p>
                            </div>
                        </div>
                        <button onClick={onClose} disabled={busy} className="text-gray-600 hover:text-white transition-colors p-0.5 mt-0.5 disabled:opacity-30">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {price != null && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800">
                            <span className="text-lg font-semibold text-white">Rs. {price.toLocaleString()}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isUp ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}`}>
                                {isUp ? '+' : ''}{Number(change ?? 0).toFixed(2)}%
                            </span>
                            {sector && (
                                <span className="ml-auto text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                                    {sector.split(' ').slice(0, 2).join(' ')}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-5">
                    <p className="text-sm font-medium text-white mb-4">Add {symbol} to your watchlist?</p>

                    <div className="bg-gray-800/50 rounded-xl p-4 space-y-2.5 mb-5">
                        <div className="flex items-center gap-2.5"><span className="text-xs text-gray-400">Daily price tracking and percent change</span></div>
                        <div className="flex items-center gap-2.5"><span className="text-xs text-gray-400">30 days of history auto-loaded</span></div>
                        <div className="flex items-center gap-2.5"><span className="text-xs text-gray-400">Interactive OHLCV chart</span></div>
                        <div className="flex items-center gap-2.5"><span className="text-xs text-gray-400">Expand to 90D, 180D, custom on demand</span></div>
                    </div>

                    {err && (
                        <div className="bg-red-950 border border-red-800 text-red-400 text-xs rounded-lg px-3 py-2 mb-4">
                            {err}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={onClose} disabled={busy} className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-40">
                            Cancel
                        </button>
                        <button onClick={handleAdd} disabled={busy} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                            {busy ? (
                                <>
                                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Adding...
                                </>
                            ) : 'Add to watchlist'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
