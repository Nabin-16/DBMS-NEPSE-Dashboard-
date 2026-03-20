import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise'

export interface StockRow extends RowDataPacket {
    symbol: string
    company_name: string | null
    last_price: number | null
    change_percent: number | null
    updated_at: string | null
}

let nepsePool: Pool | null = null

function ensureNepsePool() {
    if (nepsePool) return nepsePool

    nepsePool = createPool({
        host: process.env.NEPSE_DB_HOST ?? process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.NEPSE_DB_PORT ?? process.env.DB_PORT ?? 3306),
        user: process.env.NEPSE_DB_USER ?? process.env.DB_USER ?? 'root',
        password: process.env.NEPSE_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
        database: process.env.NEPSE_DB_NAME ?? process.env.DB_NEPSE_NAME ?? 'nepse_data',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    })

    return nepsePool
}

export async function searchStocks(query: string) {
    const pool = ensureNepsePool()
    const keyword = `%${query}%`

    const [rows] = await pool.query<StockRow[]>(
        `
      SELECT
        symbol,
        company_name,
        last_price,
        change_percent,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM stocks
      WHERE symbol LIKE ? OR company_name LIKE ?
      ORDER BY symbol ASC
      LIMIT 50
    `,
        [keyword, keyword]
    )

    return rows
}

export async function getStockBySymbol(symbol: string) {
    const pool = ensureNepsePool()

    const [rows] = await pool.query<StockRow[]>(
        `
      SELECT
        symbol,
        company_name,
        last_price,
        change_percent,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM stocks
      WHERE symbol = ?
      LIMIT 1
    `,
        [symbol.toUpperCase()]
    )

    return rows[0] ?? null
}

export async function getDashboardStats() {
    const pool = ensureNepsePool()

    const [totalRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM stocks')
    const [gainersRows] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM stocks WHERE change_percent > 0'
    )
    const [losersRows] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM stocks WHERE change_percent < 0'
    )

    return {
        total: Number(totalRows[0]?.total ?? 0),
        gainers: Number(gainersRows[0]?.total ?? 0),
        losers: Number(losersRows[0]?.total ?? 0),
    }
}

export default ensureNepsePool()
