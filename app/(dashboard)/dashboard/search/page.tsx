import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'
import Link from 'next/link'

export const runtime = 'nodejs'

interface PriceRow extends RowDataPacket {
    symbol: string
    name: string | null
    sector: string | null
    close_price: number | null
    percent_change: number | null
    volume: number | null
    trading_date: string | null
}

async function search(q: string) {
    if (!q) return []
    const [rows] = await nepsePool.query<RowDataPacket[]>(
        `SELECT c.symbol, c.name, s.name AS sector,
            p.close_price, p.percent_change, p.volume, t.trading_date
     FROM company c
     JOIN sector s ON c.sector_id = s.sector_id
     LEFT JOIN price_data p ON c.company_id = p.company_id
     LEFT JOIN trading_session t ON p.session_id = t.session_id
       AND t.trading_date = (
         SELECT MAX(ts2.trading_date)
         FROM price_data p2
         JOIN trading_session ts2 ON p2.session_id = ts2.session_id
         WHERE p2.company_id = c.company_id
       )
     WHERE (c.symbol LIKE ? OR c.name LIKE ?)
       AND c.is_active = 1
     ORDER BY c.symbol
         LIMIT 500`,
        [`${q}%`, `%${q}%`]
    )
    return rows
}

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>
}) {
    const session = await auth()
    if (!session) redirect('/login')

    const params = await searchParams
    const q = (params.q ?? '').toUpperCase().trim()
    const results = await search(q)

    return (
        <div className="max-w-5xl mx-auto space-y-5">
            <div>
                <h1 className="text-lg sm:text-xl font-semibold text-white">
                    Search companies
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">Mobile contact-style quick lookup</p>
            </div>

            <form action="/dashboard/search" method="get" className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur py-1">
                <div className="relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                    </svg>
                    <input
                        name="q"
                        defaultValue={q}
                        placeholder="Search symbol or company name"
                        className="w-full rounded-full bg-gray-900 border border-gray-800 text-white text-sm pl-11 pr-24 py-3 placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                        type="submit"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500"
                    >
                        Search
                    </button>
                </div>
            </form>

            {q && (
                <p className="text-sm text-gray-500">
                    {results.length} result{results.length !== 1 ? 's' : ''} found for <span className="text-white">&quot;{q}&quot;</span>
                </p>
            )}

            {results.length === 0 && q && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                    <p className="text-gray-500 text-sm">
                        No companies found for <span className="text-white">&quot;{q}&quot;</span>.
                    </p>
                    <p className="text-gray-600 text-xs mt-1">
                        Try fetching data first from the home page.
                    </p>
                </div>
            )}

            {results.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800/70">
                    {(results as PriceRow[]).map((r: PriceRow) => (
                        <Link
                            key={r.symbol}
                            href={`/dashboard/stock/${r.symbol}`}
                            className="block px-4 sm:px-5 py-3 hover:bg-gray-800/40 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-gray-800 text-gray-300 text-xs font-bold flex items-center justify-center shrink-0">
                                    {r.symbol?.slice(0, 2)}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-white">{r.symbol}</p>
                                        <span className="text-[11px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700">
                                            {r.sector?.split(' ').slice(0, 2).join(' ') || 'Others'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-400 truncate">{r.name ?? 'Unknown company'}</p>
                                </div>

                                <div className="text-right shrink-0">
                                    <p className="text-white font-medium">
                                        {r.close_price ? `Rs. ${r.close_price.toLocaleString()}` : '—'}
                                    </p>
                                    {r.percent_change != null ? (
                                        <p className={`text-xs font-medium ${r.percent_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {r.percent_change >= 0 ? '↑ ' : '↓ '}{Math.abs(r.percent_change).toFixed(2)}%
                                        </p>
                                    ) : (
                                        <p className="text-xs text-gray-600">No data</p>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
