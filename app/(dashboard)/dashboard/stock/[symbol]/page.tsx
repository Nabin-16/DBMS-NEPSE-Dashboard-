import { notFound } from 'next/navigation'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'
import PriceChart from '@/components/PriceChart'

export const runtime = 'nodejs'

interface PriceData extends RowDataPacket {
    date: string
    open: number | null
    high: number | null
    low: number | null
    close: number | null
    volume: number | null
}

async function getStockData(symbol: string) {
    try {
        const [[company]] = await nepsePool.query<RowDataPacket[]>(
            `SELECT c.*, s.name AS sector_name
       FROM company c JOIN sector s ON c.sector_id = s.sector_id
       WHERE c.symbol = ?`,
            [symbol.toUpperCase()]
        )
        if (!company) return null

        const [[latest]] = await nepsePool.query<RowDataPacket[]>(
            `SELECT p.*, t.trading_date
       FROM price_data p
       JOIN trading_session t ON p.session_id = t.session_id
       WHERE p.company_id = ?
       ORDER BY t.trading_date DESC LIMIT 1`,
            [company.company_id]
        )

        const [history] = await nepsePool.query<RowDataPacket[]>(
            `SELECT t.trading_date AS date,
              p.open_price  AS open,
              p.high_price  AS high,
              p.low_price   AS low,
              p.close_price AS close,
              p.volume
       FROM price_data p
       JOIN trading_session t ON p.session_id = t.session_id
       WHERE p.company_id = ?
       ORDER BY t.trading_date ASC
       LIMIT 90`,
            [company.company_id]
        )

        const [[range52]] = await nepsePool.query<RowDataPacket[]>(
            `SELECT MAX(p.high_price) AS high52, MIN(p.low_price) AS low52
       FROM price_data p
       JOIN trading_session t ON p.session_id = t.session_id
       WHERE p.company_id = ?
         AND t.trading_date >= DATE_SUB(CURDATE(), INTERVAL 52 WEEK)`,
            [company.company_id]
        )

        return { company, latest, history, range52 }
    } catch { return null }
}

export default async function StockPage({
    params,
}: {
    params: { symbol: string }
}) {
    const data = await getStockData(params.symbol)
    if (!data) notFound()

    const { company, latest, history, range52 } = data
    const change = latest?.percent_change ?? 0
    const isUp = change >= 0

    const stats = [
        { label: 'Open', value: `Rs. ${latest?.open_price?.toLocaleString() ?? '—'}` },
        { label: 'High', value: `Rs. ${latest?.high_price?.toLocaleString() ?? '—'}`, sub: `(${change.toFixed(2)}%)` },
        { label: 'Low', value: `Rs. ${latest?.low_price?.toLocaleString() ?? '—'}` },
        { label: 'Pr. Close', value: `Rs. ${latest?.prev_close?.toLocaleString() ?? '—'}` },
        { label: 'Turnover', value: latest?.turnover ? Number(latest.turnover).toLocaleString() : '—' },
        { label: 'Volume', value: latest?.volume?.toLocaleString() ?? '—' },
        { label: '52W High', value: `Rs. ${range52?.high52?.toLocaleString() ?? '—'}` },
        { label: '52W Low', value: `Rs. ${range52?.low52?.toLocaleString() ?? '—'}` },
    ]

    return (
        <div className="max-w-5xl mx-auto space-y-5">

            {/* Header card — matches the image */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">

                    {/* Left: symbol + name + badges */}
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-600/20 rounded-xl flex items-center
              justify-center text-emerald-400 font-bold text-sm">
                            {company.symbol?.slice(0, 2)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-semibold text-white">{company.symbol}</h1>
                                <span className="text-xs bg-emerald-900/60 text-emerald-400 border
                  border-emerald-800 px-2 py-0.5 rounded-full">
                                    {company.sector_name}
                                </span>
                                <span className="text-xs bg-green-900/40 text-green-400 border
                  border-green-800 px-2 py-0.5 rounded-full">
                                    Active
                                </span>
                            </div>
                            <p className="text-sm text-gray-400 mt-0.5">{company.name}</p>
                        </div>
                    </div>

                    {/* Right: price + change */}
                    <div className="text-right">
                        <div className="flex items-center gap-3 justify-end">
                            <span className="text-3xl font-semibold text-white">
                                Rs. {latest?.close_price?.toLocaleString() ?? '—'}
                            </span>
                            <span className={`text-sm font-medium px-2.5 py-1 rounded-full flex items-center gap-1
                ${isUp ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}`}>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d={isUp ? 'M5 10l7-7m0 0l7 7m-7-7v18' : 'M19 14l-7 7m0 0l-7-7m7 7V3'} />
                                </svg>
                                {Math.abs(change).toFixed(2)}%
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            {latest?.trading_date
                                ? new Date(latest.trading_date).toLocaleDateString('en-NP', {
                                    year: 'numeric', month: 'short', day: 'numeric'
                                })
                                : 'No data'}
                        </p>
                    </div>
                </div>

                {/* Stats grid — matches image layout */}
                <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-gray-800">
                    {stats.map(s => (
                        <div key={s.label}
                            className="bg-gray-800/50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                            <p className="text-sm font-medium text-white">
                                {s.value}
                                {s.sub && <span className="text-xs text-gray-500 ml-1">{s.sub}</span>}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Price chart */}
            {history.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h2 className="text-sm font-medium text-white mb-4">Price history</h2>
                    <PriceChart
                        data={(history as PriceData[]).map((h: PriceData) => ({
                            name: h.date,
                            price: h.close ?? 0
                        }))}
                    />
                </div>
            )}

            {/* No history message */}
            {history.length === 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                    <p className="text-gray-500 text-sm">
                        No price history yet. Use the fetch form to load historical data.
                    </p>
                </div>
            )}
        </div>
    )
}
