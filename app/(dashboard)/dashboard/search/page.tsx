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
     LIMIT 30`,
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
        <div className="max-w-4xl mx-auto space-y-5">
            <div>
                <h1 className="text-lg font-semibold text-white">
                    {q ? `Search results for "${q}"` : 'Search companies'}
                </h1>
                {q && (
                    <p className="text-sm text-gray-500 mt-0.5">
                        {results.length} result{results.length !== 1 ? 's' : ''} found
                    </p>
                )}
            </div>

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
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-gray-500 border-b border-gray-800">
                                <th className="text-left px-5 py-3 font-medium">Symbol</th>
                                <th className="text-left px-3 py-3 font-medium">Name</th>
                                <th className="text-left px-3 py-3 font-medium">Sector</th>
                                <th className="text-right px-3 py-3 font-medium">Close</th>
                                <th className="text-right px-5 py-3 font-medium">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(results as PriceRow[]).map((r: PriceRow) => (
                                <tr key={r.symbol}
                                    className="border-b border-gray-800/50 hover:bg-gray-800/40">
                                    <td className="px-5 py-3">
                                        <Link href={`/dashboard/stock/${r.symbol}`}
                                            className="font-semibold text-white hover:text-emerald-400 transition-colors">
                                            {r.symbol}
                                        </Link>
                                    </td>
                                    <td className="px-3 py-3 text-gray-300 max-w-[200px] truncate">
                                        {r.name}
                                    </td>
                                    <td className="px-3 py-3">
                                        <span className="text-xs bg-gray-800 text-gray-400
                      px-2 py-0.5 rounded-full">
                                            {r.sector?.split(' ').slice(0, 2).join(' ')}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-right font-medium text-white">
                                        {r.close_price ? `Rs. ${r.close_price.toLocaleString()}` : '—'}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {r.percent_change != null ? (
                                            <span className={`text-xs font-medium
                        ${r.percent_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {r.percent_change >= 0 ? '+' : ''}{r.percent_change.toFixed(2)}%
                                            </span>
                                        ) : <span className="text-gray-600 text-xs">No data</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
