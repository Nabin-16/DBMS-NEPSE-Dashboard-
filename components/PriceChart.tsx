'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Area,
    AreaChart,
    Bar,
    ComposedChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'

type PricePoint = {
    date: string
    open: number
    high: number
    low: number
    close: number
    volume: number
}

type PriceChartProps = {
    data?: Array<{
        name: string
        open?: number
        high?: number
        low?: number
        close: number
        volume?: number
    }>
    initialData?: PricePoint[]
    symbol?: string
    title?: string
    onRangeChange?: (range: { from: string; to: string; mode: 'quick' | 'custom'; days?: number }) => void
}

const QUICK_RANGES = [
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
    { label: '180D', days: 180 },
    { label: 'All', days: 9999 },
]

function localIso(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function quickBounds(days: number) {
    const toDate = new Date()
    const to = localIso(toDate)
    if (days >= 9999) return { from: '2020-01-01', to }
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)
    return { from: localIso(fromDate), to }
}

function normalizeDateString(value: unknown) {
    const raw = String(value ?? '')
    if (!raw) return ''
    return raw.length >= 10 ? raw.slice(0, 10) : raw
}

function hasEnoughRangeData(rows: PricePoint[], from: string, to: string) {
    const inRange = rows.filter((r) => {
        const d = normalizeDateString(r.date)
        return d >= from && d <= to
    })
    return inRange.length >= 2
}

function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-NP', { month: 'short', day: 'numeric' })
}

function fmtVol(v: number) {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
    return String(v)
}

const Tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl min-w-[150px]">
            <p className="text-gray-400 mb-2 font-medium">{fmtDate(String(label ?? ''))}</p>
            {[
                ['Open', 'open', 'text-white'],
                ['High', 'high', 'text-emerald-400'],
                ['Low', 'low', 'text-red-400'],
                ['Close', 'close', 'text-white'],
            ].map(([l, k, c]) => (
                <div key={String(k)} className="flex justify-between gap-4 mb-0.5">
                    <span className="text-gray-500">{l}</span>
                    <span className={`font-medium ${c}`}>Rs. {Number(d?.[String(k)] ?? 0).toLocaleString()}</span>
                </div>
            ))}
            <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between gap-4">
                <span className="text-gray-500">Volume</span>
                <span className="text-gray-300">{Number(d?.volume ?? 0).toLocaleString()}</span>
            </div>
        </div>
    )
}

export default function PriceChart({ data, initialData, symbol, title = 'Price Trend', onRangeChange }: PriceChartProps) {
    const staticData = useMemo<PricePoint[]>(() => {
        if (!data) return []
        return data.map((d) => ({
            date: normalizeDateString(d.name),
            open: Number(d.open ?? d.close ?? 0),
            high: Number(d.high ?? d.close ?? 0),
            low: Number(d.low ?? d.close ?? 0),
            close: Number(d.close ?? 0),
            volume: Number(d.volume ?? 0),
        }))
    }, [data])

    const canAutoFetch = Boolean(symbol && initialData)
    const [rows, setRows] = useState<PricePoint[]>(initialData ?? staticData)
    const [mode, setMode] = useState<'quick' | 'custom'>('quick')
    const [rangeDays, setRangeDays] = useState(30)
    const [customFrom, setCustomFrom] = useState('')
    const [customTo, setCustomTo] = useState('')
    const [fetching, setFetching] = useState(false)
    const [msg, setMsg] = useState('')
    const [activeFrom, setActiveFrom] = useState('')
    const [activeTo, setActiveTo] = useState('')
    const loadedRanges = useRef<Set<string>>(new Set(['30']))

    useEffect(() => {
        if (!canAutoFetch) {
            setRows(staticData)
            return
        }
        setRows(
            (initialData ?? []).map((r) => ({
                date: normalizeDateString(r.date),
                open: Number(r.open ?? 0),
                high: Number(r.high ?? 0),
                low: Number(r.low ?? 0),
                close: Number(r.close ?? 0),
                volume: Number(r.volume ?? 0),
            }))
        )
    }, [canAutoFetch, staticData, initialData])

    const reloadDB = useCallback(async (from: string, to: string) => {
        if (!symbol) return [] as PricePoint[]
        const res = await fetch(`/api/stocks/${symbol}/history?from=${from}&to=${to}`)
        const json = await res.json()
        if (!Array.isArray(json.history)) return [] as PricePoint[]

        let nextRows: PricePoint[] = []
        setRows((prev) => {
            const merged = [...prev, ...json.history]
            const seen = new Set<string>()
            nextRows = merged
                .filter((r) => {
                    const k = normalizeDateString(r.date)
                    if (seen.has(k)) return false
                    seen.add(k)
                    return true
                })
                .map((r: any) => ({
                    date: normalizeDateString(r.date),
                    open: Number(r.open ?? 0),
                    high: Number(r.high ?? 0),
                    low: Number(r.low ?? 0),
                    close: Number(r.close ?? 0),
                    volume: Number(r.volume ?? 0),
                }))
                .sort((a, b) => a.date.localeCompare(b.date))
            return nextRows
        })
        return nextRows
    }, [symbol])

    const ensureRange = useCallback(async (from: string, to: string, rangeKey: string) => {
        if (!symbol) return

        const dbRows = await reloadDB(from, to)

        if (loadedRanges.current.has(rangeKey) || hasEnoughRangeData(dbRows, from, to)) {
            loadedRanges.current.add(rangeKey)
            return
        }

        setFetching(true)
        setMsg('Checking for missing data...')

        try {
            const res = await fetch('/api/auto-fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'range', symbol, from, to }),
            })
            const json = await res.json()
            const loaded = Number(json.loaded ?? 0)

            if (loaded > 0) {
                setMsg(`Fetched ${loaded} new trading days, updating chart...`)
            } else {
                setMsg('Loading from database...')
            }

            const refreshed = await reloadDB(from, to)

            if (loaded > 0 || hasEnoughRangeData(refreshed, from, to)) {
                loadedRanges.current.add(rangeKey)
            }

            if (loaded > 0) {
                setMsg(`Loaded ${loaded} new trading days`)
                setTimeout(() => {
                    setFetching(false)
                    setMsg('')
                }, 3000)
            } else {
                setFetching(false)
                setMsg('')
            }
        } catch {
            setFetching(false)
            setMsg('')
        }
    }, [symbol, reloadDB])

    useEffect(() => {
        if (!canAutoFetch) return
        if (mode !== 'quick') return
        const { from, to } = quickBounds(rangeDays)
        setActiveFrom(from)
        setActiveTo(to)

        if (rangeDays >= 9999) {
            onRangeChange?.({ from, to, mode: 'quick' })
            void reloadDB(from, to)
            return
        }

        onRangeChange?.({ from, to, mode: 'quick', days: rangeDays })
        void ensureRange(from, to, String(rangeDays))
    }, [canAutoFetch, mode, rangeDays, ensureRange, reloadDB, onRangeChange])

    useEffect(() => {
        if (!canAutoFetch) return
        if (mode !== 'custom' || !customFrom || !customTo) return
        setActiveFrom(customFrom)
        setActiveTo(customTo)
        onRangeChange?.({ from: customFrom, to: customTo, mode: 'custom' })
        void ensureRange(customFrom, customTo, `${customFrom}_${customTo}`)
    }, [canAutoFetch, mode, customFrom, customTo, ensureRange, onRangeChange])

    let filtered = rows
    if (canAutoFetch && activeFrom && activeTo) {
        filtered = rows.filter((d) => {
            const ds = normalizeDateString(d.date)
            return ds >= activeFrom && ds <= activeTo
        })
    }

    const isUp = (filtered.at(-1)?.close ?? 0) >= (filtered[0]?.close ?? 0)
    const color = isUp ? '#10b981' : '#f87171'

    return (
        <div className="space-y-4">
            {canAutoFetch && (
                <div className="flex items-center gap-3 flex-wrap">
                    {(['quick', 'custom'] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${mode === m
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                        >
                            {m === 'quick' ? 'Quick' : 'Custom'}
                        </button>
                    ))}

                    {mode === 'quick' && QUICK_RANGES.map((r) => (
                        <button
                            key={r.label}
                            onClick={() => setRangeDays(r.days)}
                            disabled={fetching}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${rangeDays === r.days
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                        >
                            {r.label}
                        </button>
                    ))}

                    {mode === 'custom' && (
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                disabled={fetching}
                                className="bg-gray-800 border border-gray-700 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                            />
                            <span className="text-gray-600 text-xs">to</span>
                            <input
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                disabled={fetching}
                                className="bg-gray-800 border border-gray-700 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                            />
                        </div>
                    )}

                    {(fetching || msg) && (
                        <div className="ml-auto flex items-center gap-2">
                            {fetching && (
                                <svg className="animate-spin w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            )}
                            <span className={`text-xs ${fetching ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {msg}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {filtered.length < 2 ? (
                <div className="h-48 flex flex-col items-center justify-center gap-3">
                    {fetching ? (
                        <>
                            <svg className="animate-spin w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <p className="text-gray-400 text-sm">Fetching {symbol ?? 'symbol'} history from live chart API...</p>
                            <p className="text-gray-600 text-xs">This may take 20 to 60 seconds</p>
                        </>
                    ) : (
                        <>
                            <p className="text-gray-500 text-sm">No data for selected range</p>
                            <p className="text-gray-600 text-xs">Select a range to auto-sync from live chart API</p>
                        </>
                    )}
                </div>
            ) : (
                <>
                    <div>
                        <p className="text-xs text-gray-500 mb-2">{title}</p>
                        <ResponsiveContainer width="100%" height={220} minWidth={0}>
                            <AreaChart data={filtered} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id={`g-${symbol ?? 'chart'}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={fmtDate}
                                    tick={{ fill: '#6b7280', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval="preserveStartEnd"
                                />
                                <YAxis
                                    domain={['auto', 'auto']}
                                    tick={{ fill: '#6b7280', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v) => `Rs.${Number(v).toLocaleString()}`}
                                    width={80}
                                />
                                <Tooltip content={<Tip />} />
                                <Area
                                    type="monotone"
                                    dataKey="close"
                                    stroke={color}
                                    strokeWidth={1.5}
                                    fill={`url(#g-${symbol ?? 'chart'})`}
                                    dot={false}
                                    activeDot={{ r: 3, fill: color }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    <div>
                        <p className="text-xs text-gray-500 mb-1">Volume</p>
                        <ResponsiveContainer width="100%" height={65} minWidth={0}>
                            <ComposedChart data={filtered} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                                <XAxis dataKey="date" hide />
                                <YAxis
                                    tick={{ fill: '#6b7280', fontSize: 9 }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={80}
                                    tickFormatter={(v) => fmtVol(Number(v))}
                                />
                                <Bar dataKey="volume" fill="#374151" radius={[2, 2, 0, 0]} />
                                <Tooltip
                                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: 11 }}
                                    formatter={(v: any) => [Number(v).toLocaleString(), 'Volume']}
                                    labelFormatter={(l) => fmtDate(String(l))}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}
        </div>
    )
}
