import { NextRequest, NextResponse } from 'next/server'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
    try {
        const [rows] = await nepsePool.query<RowDataPacket[]>(
            `SELECT 
        c.symbol, 
        c.name AS company_name, 
        s.name AS sector_name,
        p.close_price,
        COALESCE(
          p.percent_change,
          ROUND(((p.close_price - p.open_price) / NULLIF(p.open_price, 0)) * 100, 2),
          0
        ) AS change_percent,
        p.open_price,
        p.high_price,
        p.low_price,
        p.prev_close,
        p.turnover,
        p.volume,
        t.trading_date AS updated_at
      FROM company c
      LEFT JOIN sector s ON c.sector_id = s.sector_id
      LEFT JOIN price_data p ON c.company_id = p.company_id
      LEFT JOIN trading_session t ON p.session_id = t.session_id
      WHERE c.is_active = 1
        AND t.trading_date = (
          SELECT MAX(ts2.trading_date)
          FROM price_data p2
          JOIN trading_session ts2 ON p2.session_id = ts2.session_id
          WHERE p2.company_id = c.company_id
        )
      ORDER BY c.symbol ASC
      LIMIT 200`
        )

        return NextResponse.json({ rows })
    } catch (error) {
        console.error('Error fetching companies:', error)
        return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 })
    }
}
