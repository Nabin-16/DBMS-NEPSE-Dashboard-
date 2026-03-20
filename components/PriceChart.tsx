'use client'

import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'

type PricePoint = {
    name: string
    price: number
}

type PriceChartProps = {
    data: PricePoint[]
}

export default function PriceChart({ data }: PriceChartProps) {
    return (
        <div className="h-72 w-full rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-semibold text-slate-900">Price Trend</h3>
            <ResponsiveContainer width="100%" height="85%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={['dataMin - 10', 'dataMax + 10']} />
                    <Tooltip />
                    <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
