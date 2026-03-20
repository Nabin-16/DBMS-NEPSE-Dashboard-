'use client'

import { useState } from 'react'

type Props = {
    symbol: string
}

export default function AddToWatchlistButton({ symbol }: Props) {
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    async function handleAdd() {
        setLoading(true)
        setMessage('')

        try {
            const res = await fetch('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol }),
            })

            const data = await res.json()
            setMessage(data.message ?? (res.ok ? 'Added' : 'Failed'))
        } catch {
            setMessage('Failed to add')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col items-start gap-1">
            <button
                type="button"
                onClick={handleAdd}
                disabled={loading}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            >
                {loading ? 'Adding...' : 'Add to Watchlist'}
            </button>
            {message ? <p className="text-xs text-slate-600">{message}</p> : null}
        </div>
    )
}
