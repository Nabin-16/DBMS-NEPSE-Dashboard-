import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const q = req.nextUrl.searchParams.get('q')?.toUpperCase().trim()
    if (!q) return NextResponse.json({ results: [] })

    const [rows] = await nepsePool.query<RowDataPacket[]>(
        `SELECT
       c.symbol, c.name, s.name AS sector,
       p.close_price, p.percent_change, p.volume,
       p.open_price, p.high_price, p.low_price,
       p.prev_close, p.turnover,
       t.trading_date
     FROM company c
     JOIN sector         s ON c.sector_id  = s.sector_id
     LEFT JOIN price_data p ON c.company_id = p.company_id
     LEFT JOIN trading_session t ON p.session_id = t.session_id
       AND t.trading_date = (
         SELECT MAX(ts2.trading_date)
         FROM price_data p2
         JOIN trading_session ts2 ON p2.session_id = ts2.session_id
         WHERE p2.company_id = c.company_id
       )
     WHERE c.symbol LIKE ? OR c.name LIKE ?
     AND c.is_active = 1
     ORDER BY c.symbol
     LIMIT 20`,
        [`${q}%`, `%${q}%`]
    )

    return NextResponse.json({ results: rows })
}
