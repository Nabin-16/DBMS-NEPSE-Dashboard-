import { NextRequest, NextResponse } from 'next/server'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const [activeRows] = await nepsePool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_active FROM company WHERE is_active = 1`
    )

    const [sessionRows] = await nepsePool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_sessions FROM trading_session`
    )

    const [recordRows] = await nepsePool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_records FROM price_data`
    )

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
        AND (
          t.trading_date IS NULL OR t.trading_date = (
          SELECT MAX(ts2.trading_date)
          FROM price_data p2
          JOIN trading_session ts2 ON p2.session_id = ts2.session_id
          WHERE p2.company_id = c.company_id
          )
        )
      ORDER BY c.symbol ASC`
    )

    return NextResponse.json({
      rows,
      summary: {
        total_companies: Number(activeRows?.[0]?.total_active ?? rows.length),
        total_sessions: Number(sessionRows?.[0]?.total_sessions ?? 0),
        total_records: Number(recordRows?.[0]?.total_records ?? 0),
        latest_trading_date: rows.find((r) => r.updated_at)?.updated_at ?? null,
      },
    })
  } catch (error) {
    console.error('Error fetching companies:', error)
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 })
  }
}
