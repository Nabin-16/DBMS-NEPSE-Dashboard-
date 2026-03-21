'use client'

import { useEffect } from 'react'

export default function AutoFetchProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const key = `nepse_synced_${new Date().toISOString().split('T')[0]}`
        if (localStorage.getItem(key)) return

        fetch('/api/auto-fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'today' }),
        })
            .then((r) => r.json())
            .then((d) => {
                if (d?.loaded >= 0) localStorage.setItem(key, '1')
            })
            .catch(() => {
                // silent background sync
            })
    }, [])

    return <>{children}</>
}
