import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'

export const runtime = 'nodejs'

interface HistoryRow extends RowDataPacket {
    trading_date: string
    open_price: number
    high_price: number
    low_price: number
    close_price: number
    volume: number
    turnover: number
    percent_change: number
}

interface RangeRow extends RowDataPacket {
    available_from: string | null
    available_to: string | null
    total_rows: number
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    try {
        const session = await auth()
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { symbol } = await params
        const { searchParams } = new URL(req.url)

        const fromDate = searchParams.get('fromDate')
        const toDate = searchParams.get('toDate') || new Date().toISOString().split('T')[0]
        const days = Number(searchParams.get('days') || '30')

        if (!symbol) {
            return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
        }

        let query = `
            SELECT 
                ts.trading_date,
                pd.open_price,
                pd.high_price,
                pd.low_price,
                pd.close_price,
                pd.volume,
                pd.turnover,
                pd.percent_change
            FROM price_data pd
            JOIN trading_session ts ON pd.session_id = ts.session_id
            JOIN company c ON pd.company_id = c.company_id
            WHERE c.symbol = ?
        `

        const params_array: (string | number)[] = [symbol]

        if (fromDate && toDate) {
            query += ' AND ts.trading_date BETWEEN ? AND ?'
            params_array.push(fromDate, toDate)
        } else if (fromDate) {
            query += ' AND ts.trading_date >= ?'
            params_array.push(fromDate)
        } else if (toDate) {
            // Default to last N days from toDate
            query += ` AND ts.trading_date >= DATE_SUB(?, INTERVAL ? DAY)`
            params_array.push(toDate, Number.isFinite(days) ? days : 30)
        }

        query += ' ORDER BY ts.trading_date ASC LIMIT 200'

        const [rows] = await nepsePool.query<HistoryRow[]>(query, params_array)
        const [rangeRows] = await nepsePool.query<RangeRow[]>(
            `
            SELECT
                DATE_FORMAT(MIN(ts.trading_date), '%Y-%m-%d') AS available_from,
                DATE_FORMAT(MAX(ts.trading_date), '%Y-%m-%d') AS available_to,
                COUNT(*) AS total_rows
            FROM price_data pd
            JOIN trading_session ts ON pd.session_id = ts.session_id
            JOIN company c ON pd.company_id = c.company_id
            WHERE c.symbol = ?
            `,
            [symbol]
        )
        const normalized = rows.map((row) => ({
            trading_date: row.trading_date,
            open_price: Number(row.open_price ?? 0),
            high_price: Number(row.high_price ?? 0),
            low_price: Number(row.low_price ?? 0),
            close_price: Number(row.close_price ?? 0),
            volume: Number(row.volume ?? 0),
            turnover: Number(row.turnover ?? 0),
            percent_change: Number(row.percent_change ?? 0),
        }))

        const availability = rangeRows[0] ?? null

        return NextResponse.json({
            symbol,
            count: normalized.length,
            data: normalized,
            availableFrom: availability?.available_from ?? null,
            availableTo: availability?.available_to ?? null,
            totalRows: Number(availability?.total_rows ?? 0),
        })
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
