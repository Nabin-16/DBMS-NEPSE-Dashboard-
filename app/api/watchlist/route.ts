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

    return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { symbol, notes } = await req.json()
    if (!symbol) return NextResponse.json({ error: 'Symbol required' }, { status: 400 })

    const uppercaseSymbol = String(symbol).toUpperCase().trim()

    const [[existing]] = await nepsePool.query<RowDataPacket[]>(
        'SELECT company_id, name FROM company WHERE symbol=? LIMIT 1',
        [uppercaseSymbol]
    )
    let company: RowDataPacket | undefined = existing

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

    // ── Background fetch — 180 days, completely silent ────────────────────────
    // We respond to the user IMMEDIATELY (below) and let this run in background.
    // The user is navigated to the watchlist page with no visible loading state.
    // By the time they click "History" on this symbol, data will already be in DB.
    const origin = req.nextUrl.origin
    fetch(`${origin}/api/auto-fetch`, {
        method:  'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: req.headers.get('cookie') ?? '',
        },
        body: JSON.stringify({
            mode:   'symbol_history',
            symbol: uppercaseSymbol,
            days:   180,           // ← 180 days in background — user never sees this
        }),
    })
        .then(r => r.json())
        .then(d => console.log(`[watchlist] bg-fetch ${uppercaseSymbol}: ${d.message ?? 'done'}`))
        .catch(e => console.warn(`[watchlist] bg-fetch failed for ${uppercaseSymbol}:`, e))

    // Respond immediately — user doesn't wait for the 180-day fetch
    return NextResponse.json({
        message:  `${uppercaseSymbol} added to watchlist`,
        fetching: false,   // ← no banner shown, fetch is truly background
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
