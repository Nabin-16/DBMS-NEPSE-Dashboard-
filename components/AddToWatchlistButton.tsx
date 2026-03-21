'use client'

import { useState } from 'react'
import WatchlistPopup from '@/components/WatchlistPopup'

type Props = {
    symbol: string
    name?: string
    sector?: string
    price?: number
    change?: number
}

export default function AddToWatchlistButton({ symbol, name, sector, price, change }: Props) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
                Add to Watchlist
            </button>
            {open && (
                <WatchlistPopup
                    symbol={symbol}
                    name={name ?? symbol}
                    sector={sector}
                    price={price}
                    change={change}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}
