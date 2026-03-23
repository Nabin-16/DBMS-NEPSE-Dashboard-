import { NextRequest, NextResponse } from 'next/server'
import { RowDataPacket } from 'mysql2'
import { auth } from '@/lib/auth'
import nepsePool from '@/lib/db-nepse'

export const runtime = 'nodejs'

async function ensurePortfolioTable() {
    await nepsePool.query(`
        CREATE TABLE IF NOT EXISTS portfolio_holding (
            holding_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            company_id INT NOT NULL,
            quantity INT NOT NULL,
            buy_price DECIMAL(10,2) NOT NULL,
            bought_at DATE NOT NULL,
            notes TEXT DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_user (user_id),
            INDEX idx_company (company_id),
            FOREIGN KEY (company_id) REFERENCES company(company_id) ON DELETE CASCADE
        )
    `)
}

async function resolveCompanyId(symbol: string) {
    const normalized = symbol.trim().toUpperCase()
    const [[existing]] = await nepsePool.query<RowDataPacket[]>(
        'SELECT company_id FROM company WHERE symbol = ? LIMIT 1',
        [normalized]
    )

    if (existing?.company_id) {
        return Number(existing.company_id)
    }

    const [insertResult] = await nepsePool.query<any>(
        'INSERT INTO company (symbol, name, sector_id, is_active) VALUES (?, ?, 14, 1)',
        [normalized, normalized]
    )

    return Number(insertResult.insertId)
}

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        await ensurePortfolioTable()

        const [rows] = await nepsePool.query<RowDataPacket[]>(
            `SELECT
                ph.holding_id,
                c.symbol,
                c.name,
                s.name AS sector,
                ph.quantity,
                ph.buy_price,
                DATE_FORMAT(ph.bought_at, '%Y-%m-%d') AS bought_at,
                ph.notes,
                p.close_price AS current_price,
                p.percent_change,
                DATE_FORMAT(t.trading_date, '%Y-%m-%d') AS price_date
            FROM portfolio_holding ph
            JOIN company c ON ph.company_id = c.company_id
            LEFT JOIN sector s ON c.sector_id = s.sector_id
            LEFT JOIN (
                SELECT p1.company_id, p1.close_price, p1.percent_change, p1.session_id
                FROM price_data p1
                INNER JOIN (
                    SELECT company_id, MAX(session_id) AS max_sid
                    FROM price_data
                    GROUP BY company_id
                ) latest ON latest.company_id = p1.company_id AND latest.max_sid = p1.session_id
            ) p ON p.company_id = c.company_id
            LEFT JOIN trading_session t ON t.session_id = p.session_id
            WHERE ph.user_id = ?
            ORDER BY ph.created_at DESC`,
            [Number(session.user.id)]
        )

        return NextResponse.json({ rows })
    } catch (error) {
        console.error('Portfolio GET error:', error)
        return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const symbol = String(body.symbol ?? '').trim().toUpperCase()
        const quantity = Number(body.quantity)
        const buyPrice = Number(body.buy_price)
        const boughtAt = String(body.bought_at ?? '').trim()
        const notes = body.notes == null ? null : String(body.notes)

        if (!symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(buyPrice) || buyPrice <= 0 || !boughtAt) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
        }

        await ensurePortfolioTable()

        const companyId = await resolveCompanyId(symbol)

        await nepsePool.query(
            `INSERT INTO portfolio_holding
                (user_id, company_id, quantity, buy_price, bought_at, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [Number(session.user.id), companyId, quantity, buyPrice, boughtAt, notes]
        )

        return NextResponse.json({ message: 'Holding added' }, { status: 201 })
    } catch (error) {
        console.error('Portfolio POST error:', error)
        return NextResponse.json({ error: 'Failed to add holding' }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const holdingId = Number(body.holding_id)
        if (!Number.isFinite(holdingId) || holdingId <= 0) {
            return NextResponse.json({ error: 'Invalid holding_id' }, { status: 400 })
        }

        await ensurePortfolioTable()

        await nepsePool.query(
            'DELETE FROM portfolio_holding WHERE holding_id = ? AND user_id = ?',
            [holdingId, Number(session.user.id)]
        )

        return NextResponse.json({ message: 'Holding removed' })
    } catch (error) {
        console.error('Portfolio DELETE error:', error)
        return NextResponse.json({ error: 'Failed to delete holding' }, { status: 500 })
    }
}
