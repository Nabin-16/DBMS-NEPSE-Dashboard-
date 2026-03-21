'use client'

import { useState } from 'react'

export default function FetchForm() {
    const [status, setStatus] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleFetch() {
        setLoading(true)
        setStatus('Running NEPSE pipeline...')

        try {
            const res = await fetch('/api/fetch/batch', { method: 'POST' })
            const data = await res.json()

            if (!res.ok) {
                setStatus(data.message ?? 'Pipeline failed')
                return
            }

            setStatus(data.message ?? 'Pipeline completed')
        } catch {
            setStatus('Could not run pipeline')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Fetch Latest Data</h3>
            <p className="mt-1 text-sm text-slate-600">
                Trigger your nepse_pipeline.py process from the dashboard.
            </p>
            <button
                type="button"
                onClick={handleFetch}
                disabled={loading}
                className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
                {loading ? 'Fetching...' : 'Run Pipeline'}
            </button>
            {status ? <p className="mt-2 text-sm text-slate-700">{status}</p> : null}
        </div>
    )
}
