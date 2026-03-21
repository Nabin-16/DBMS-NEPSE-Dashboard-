import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'

export const runtime = 'nodejs'

export async function GET() {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [rows] = await nepsePool.query<RowDataPacket[]>(
        `SELECT
       w.watchlist_id, w.added_at,
       c.symbol, c.name,
       s.name           AS sector,
       p.close_price, p.percent_change, p.volume,
       DATE_FORMAT(t.trading_date,'%Y-%m-%d') AS trading_date
     FROM watchlist w
     JOIN company c ON w.company_id = c.company_id
     JOIN sector  s ON c.sector_id  = s.sector_id
     LEFT JOIN (
       SELECT p2.company_id, p2.close_price, p2.percent_change,
              p2.volume, p2.session_id
       FROM price_data p2
       INNER JOIN (
         SELECT company_id, MAX(session_id) AS max_sid
         FROM price_data GROUP BY company_id
       ) latest ON p2.company_id=latest.company_id
                AND p2.session_id=latest.max_sid
     ) p ON c.company_id = p.company_id
     LEFT JOIN trading_session t ON p.session_id = t.session_id
     WHERE w.user_id = ?
     GROUP BY w.watchlist_id
     ORDER BY w.added_at DESC`,
        [session.user.id]
    )

    // Keep array response shape for existing UI compatibility.
    return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { symbol, notes } = await req.json()
    if (!symbol) return NextResponse.json({ error: 'Symbol required' }, { status: 400 })

    const uppercaseSymbol = String(symbol).toUpperCase().trim()

    let company: RowDataPacket | undefined
    const [[existing]] = await nepsePool.query<RowDataPacket[]>(
        'SELECT company_id, name FROM company WHERE symbol=? LIMIT 1',
        [uppercaseSymbol]
    )
    company = existing

    if (!company) {
        const [r] = await nepsePool.query<any>(
            'INSERT INTO company(symbol,name,sector_id,is_active) VALUES(?,?,14,1)',
            [uppercaseSymbol, uppercaseSymbol]
        )
        company = { company_id: r.insertId } as RowDataPacket
    }

    try {
        await nepsePool.query(
            'INSERT INTO watchlist (user_id, company_id, notes) VALUES (?,?,?)',
            [session.user.id, company.company_id, notes ?? null]
        )
    } catch (e: any) {
        if (e?.code === 'ER_DUP_ENTRY') {
            return NextResponse.json({ error: 'Already in watchlist' }, { status: 409 })
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    const origin = req.nextUrl.origin
    fetch(`${origin}/api/auto-fetch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: req.headers.get('cookie') ?? '',
        },
        body: JSON.stringify({
            mode: 'symbol_history',
            symbol: uppercaseSymbol,
            days: 30,
        }),
    })
        .then((r) => r.json())
        .then((d) => console.log(`[watchlist] auto-fetch ${uppercaseSymbol}:`, d.message))
        .catch((e) => console.warn(`[watchlist] auto-fetch failed for ${uppercaseSymbol}:`, e))

    return NextResponse.json({
        message: `${uppercaseSymbol} added. Fetching 30 days of history from archive...`,
        fetching: true,
    })
}

export async function DELETE(req: NextRequest) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { symbol } = await req.json()

    await nepsePool.query(
        `DELETE w FROM watchlist w
     JOIN company c ON w.company_id=c.company_id
     WHERE w.user_id=? AND c.symbol=?`,
        [session.user.id, String(symbol).toUpperCase()]
    )

    return NextResponse.json({ message: `${symbol} removed` })
}
