import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'

export const runtime = 'nodejs'

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { symbol } = await params
    const from = req.nextUrl.searchParams.get('from') ?? '2020-01-01'
    const to = req.nextUrl.searchParams.get('to') ?? new Date().toISOString().split('T')[0]

    const [history] = await nepsePool.query<RowDataPacket[]>(
        `SELECT
       DATE_FORMAT(t.trading_date, '%Y-%m-%d') AS date,
       p.open_price   AS open,
       p.high_price   AS high,
       p.low_price    AS low,
       p.close_price  AS close,
       p.volume
     FROM price_data p
     JOIN company c ON p.company_id = c.company_id
     JOIN trading_session t ON p.session_id = t.session_id
     WHERE c.symbol = ?
       AND t.trading_date BETWEEN ? AND ?
     ORDER BY t.trading_date ASC`,
        [symbol.toUpperCase(), from, to]
    )

    const normalized = history.map((r) => ({
        date: String(r.date),
        open: Number(r.open ?? 0),
        high: Number(r.high ?? 0),
        low: Number(r.low ?? 0),
        close: Number(r.close ?? 0),
        volume: Number(r.volume ?? 0),
    }))

    return NextResponse.json({ history: normalized })
}
