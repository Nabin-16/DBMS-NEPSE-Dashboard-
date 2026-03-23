'use client'

import { useEffect, useState } from 'react'

type MarketStatus = {
    isOpen: boolean
    label: string
    lastTradingDay: string
    nextOpen: string
}

function toIso(date: Date): string {
    return date.toISOString().split('T')[0]
}

function nptNow(): Date {
    const now = new Date()
    return new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000)
}

function getMarketStatus(): MarketStatus {
    const npt = nptNow()
    const day = npt.getUTCDay() // 0=Sun .. 6=Sat
    const hour = npt.getUTCHours()
    const minute = npt.getUTCMinutes()
    const timeMin = hour * 60 + minute

    // NEPSE: Sun-Thu, 11:00-15:00 NPT
    const isWeekday = day >= 0 && day <= 4
    const isDuring = timeMin >= 11 * 60 && timeMin < 15 * 60
    const isOpen = isWeekday && isDuring

    const last = new Date(npt)
    last.setUTCHours(0, 0, 0, 0)
    if (!isWeekday || timeMin < 11 * 60) {
        do {
            last.setUTCDate(last.getUTCDate() - 1)
        } while (last.getUTCDay() === 5 || last.getUTCDay() === 6)
    }

    const next = new Date(npt)
    next.setUTCHours(0, 0, 0, 0)
    do {
        next.setUTCDate(next.getUTCDate() + 1)
    } while (next.getUTCDay() === 5 || next.getUTCDay() === 6)

    return {
        isOpen,
        label: isOpen ? 'Market open' : 'Market closed',
        lastTradingDay: toIso(last),
        nextOpen: toIso(next),
    }
}

export default function MarketStatusBadge() {
    const [status, setStatus] = useState<MarketStatus | null>(null)

    useEffect(() => {
        const s = getMarketStatus()
        setStatus(s)

        const key = `nepse_synced_${s.lastTradingDay}`
        if (localStorage.getItem(key)) return

        fetch('/api/auto-fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'today', date: s.lastTradingDay }),
        })
            .then((r) => r.json())
            .then((d) => {
                localStorage.setItem(key, '1')
            })
            .catch(() => { })
    }, [])

    if (!status) return null

    return (
        <div className="flex items-center gap-3">
            <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.isOpen
                    ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400'
                    }`}
            >
                <span className="relative flex h-2 w-2">
                    {status.isOpen && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${status.isOpen ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                </span>
                {status.label}
            </div>

        </div>
    )
}

export { getMarketStatus }
