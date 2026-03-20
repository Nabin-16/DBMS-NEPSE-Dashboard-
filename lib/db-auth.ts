import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise'
import bcrypt from 'bcryptjs'

export interface AuthUser extends RowDataPacket {
    id: number
    name: string | null
    email: string
    password_hash: string
}

export interface WatchlistItem extends RowDataPacket {
    symbol: string
    added_at: string
}

let authPool: Pool | null = null

function ensureAuthPool() {
    if (authPool) return authPool

    authPool = createPool({
        host: process.env.AUTH_DB_HOST ?? process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.AUTH_DB_PORT ?? process.env.DB_PORT ?? 3306),
        user: process.env.AUTH_DB_USER ?? process.env.DB_USER ?? 'root',
        password: process.env.AUTH_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
        database: process.env.AUTH_DB_NAME ?? process.env.DB_AUTH_NAME ?? 'nepse_auth',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    })

    return authPool
}

export async function initAuthTables() {
    const pool = ensureAuthPool()

    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

    await pool.query(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_symbol (user_id, symbol),
      CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
}

export async function findUserByEmail(email: string) {
    const pool = ensureAuthPool()
    await initAuthTables()

    const [rows] = await pool.query<AuthUser[]>(
        'SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1',
        [email]
    )

    return rows[0] ?? null
}

export async function createUser(input: { name?: string; email: string; password: string }) {
    const pool = ensureAuthPool()
    await initAuthTables()

    const existing = await findUserByEmail(input.email)
    if (existing) {
        throw new Error('EMAIL_EXISTS')
    }

    const hash = await bcrypt.hash(input.password, 10)

    const [result] = await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [input.name ?? null, input.email, hash]
    )

    const insertedId = (result as { insertId?: number }).insertId
    if (!insertedId) {
        throw new Error('USER_CREATE_FAILED')
    }

    const created = await findUserByEmail(input.email)
    if (!created) {
        throw new Error('USER_LOOKUP_FAILED')
    }

    return { id: String(created.id), name: created.name, email: created.email }
}

export async function verifyUserPassword(email: string, password: string) {
    const user = await findUserByEmail(email)
    if (!user) return null

    const isValid = await bcrypt.compare(password, user.password_hash)
    if (!isValid) return null

    return {
        id: String(user.id),
        name: user.name,
        email: user.email,
    }
}

export async function getWatchlist(userId: string) {
    const pool = ensureAuthPool()
    await initAuthTables()

    const [rows] = await pool.query<WatchlistItem[]>(
        'SELECT symbol, DATE_FORMAT(added_at, "%Y-%m-%d %H:%i:%s") as added_at FROM watchlist WHERE user_id = ? ORDER BY added_at DESC',
        [userId]
    )

    return rows
}

export async function addToWatchlist(userId: string, symbol: string) {
    const pool = ensureAuthPool()
    await initAuthTables()

    await pool.query('INSERT IGNORE INTO watchlist (user_id, symbol) VALUES (?, ?)', [
        userId,
        symbol.toUpperCase(),
    ])
}

export async function removeFromWatchlist(userId: string, symbol: string) {
    const pool = ensureAuthPool()
    await initAuthTables()

    await pool.query('DELETE FROM watchlist WHERE user_id = ? AND symbol = ?', [
        userId,
        symbol.toUpperCase(),
    ])
}

export default ensureAuthPool()
