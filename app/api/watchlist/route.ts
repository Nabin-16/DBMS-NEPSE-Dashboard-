import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'

export const runtime = 'nodejs'

// GET /api/watchlist — list user's watchlist
export async function GET() {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [rows] = await nepsePool.query<RowDataPacket[]>(
        `SELECT
       w.watchlist_id, w.added_at, w.notes,
       c.symbol, c.name,
       s.name         AS sector,
       p.close_price, p.percent_change, p.volume,
       t.trading_date
     FROM watchlist w
     JOIN company        c ON w.company_id  = c.company_id
     JOIN sector         s ON c.sector_id   = s.sector_id
     LEFT JOIN price_data       p ON c.company_id  = p.company_id
     LEFT JOIN trading_session  t ON p.session_id  = t.session_id
       AND t.trading_date = (
         SELECT MAX(ts2.trading_date)
         FROM price_data p2
         JOIN trading_session ts2 ON p2.session_id = ts2.session_id
         WHERE p2.company_id = c.company_id
       )
     WHERE w.user_id = ?
     ORDER BY w.added_at DESC`,
        [session.user.id]
    )
    return NextResponse.json(rows)
}

// POST /api/watchlist — add symbol
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { symbol, notes } = await req.json()
    if (!symbol) return NextResponse.json({ error: 'Symbol required' }, { status: 400 })

    const [[company]] = await nepsePool.query<RowDataPacket[]>(
        'SELECT company_id FROM company WHERE symbol = ?',
        [symbol.toUpperCase()]
    )
    if (!company)
        return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    try {
        await nepsePool.query(
            'INSERT INTO watchlist (user_id, company_id, notes) VALUES (?, ?, ?)',
            [session.user.id, company.company_id, notes ?? null]
        )
        return NextResponse.json({ message: `${symbol} added to watchlist` })
    } catch (e: unknown) {
        if ((e as { code?: string })?.code === 'ER_DUP_ENTRY')
            return NextResponse.json({ error: 'Already in watchlist' }, { status: 409 })
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

// DELETE /api/watchlist — remove symbol
export async function DELETE(req: NextRequest) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { symbol } = await req.json()

    await nepsePool.query(
        `DELETE w FROM watchlist w
     JOIN company c ON w.company_id = c.company_id
     WHERE w.user_id = ? AND c.symbol = ?`,
        [session.user.id, symbol.toUpperCase()]
    )
    return NextResponse.json({ message: `${symbol} removed from watchlist` })
}
