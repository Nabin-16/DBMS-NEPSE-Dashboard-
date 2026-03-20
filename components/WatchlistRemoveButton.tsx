'use client'

import { useState } from 'react'

type Props = {
    symbol: string
    onRemoved?: () => void
}

export default function WatchlistRemoveButton({ symbol, onRemoved }: Props) {
    const [loading, setLoading] = useState(false)

    async function handleRemove() {
        setLoading(true)

        try {
            const res = await fetch('/api/watchlist', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol }),
            })

            if (res.ok) {
                onRemoved?.()
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleRemove}
            disabled={loading}
            className="rounded-md border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
            {loading ? 'Removing...' : 'Remove'}
        </button>
    )
}
