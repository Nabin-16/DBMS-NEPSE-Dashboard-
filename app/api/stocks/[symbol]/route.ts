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
    // Company info
    const [[company]] = await nepsePool.query<RowDataPacket[]>(
        `SELECT c.*, s.name AS sector_name
     FROM company c JOIN sector s ON c.sector_id = s.sector_id
     WHERE c.symbol = ?`,
        [symbol]
    )
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    // Latest price
    const [[latest]] = await nepsePool.query<RowDataPacket[]>(
        `SELECT p.*, t.trading_date
     FROM price_data p
     JOIN trading_session t ON p.session_id = t.session_id
     WHERE p.company_id = ?
     ORDER BY t.trading_date DESC
     LIMIT 1`,
        [company.company_id]
    )

    // Price history (last 90 days for chart)
    const [history] = await nepsePool.query<RowDataPacket[]>(
        `SELECT t.trading_date, p.open_price, p.high_price,
            p.low_price, p.close_price, p.volume
     FROM price_data p
     JOIN trading_session t ON p.session_id = t.session_id
     WHERE p.company_id = ?
     ORDER BY t.trading_date ASC
     LIMIT 90`,
        [company.company_id]
    )

    // 52-week range
    const [[range]] = await nepsePool.query<RowDataPacket[]>(
        `SELECT MAX(p.high_price) AS week52_high, MIN(p.low_price) AS week52_low
     FROM price_data p
     JOIN trading_session t ON p.session_id = t.session_id
     WHERE p.company_id = ?
       AND t.trading_date >= DATE_SUB(CURDATE(), INTERVAL 52 WEEK)`,
        [company.company_id]
    )

    return NextResponse.json({ company, latest, history, range })
}
