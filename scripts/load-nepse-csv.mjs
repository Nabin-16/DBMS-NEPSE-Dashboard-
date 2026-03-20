import fs from 'fs'
import path from 'path'
import mysql from 'mysql2/promise'

function readEnvFile(envPath) {
    const env = {}
    if (!fs.existsSync(envPath)) return env

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx <= 0) continue
        const key = trimmed.slice(0, eqIdx).trim()
        const value = trimmed.slice(eqIdx + 1).trim()
        env[key] = value
    }
    return env
}

function parseCsvLine(line) {
    const out = []
    let cur = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (ch === ',' && !inQuotes) {
            out.push(cur)
            cur = ''
        } else {
            cur += ch
        }
    }
    out.push(cur)
    return out.map((v) => v.trim())
}

function normalizeHeaderKey(raw) {
    const k = String(raw || '').trim().toLowerCase()
    if (k === 'date') return 'date'
    if (k === 'symbol') return 'symbol'
    if (k === 'name' || k === 'company_name') return 'name'
    if (k === 'sector' || k === 'sector_name') return 'sector'
    if (k === 'open' || k === 'open_price') return 'open_price'
    if (k === 'high' || k === 'high_price') return 'high_price'
    if (k === 'low' || k === 'low_price') return 'low_price'
    if (k === 'close' || k === 'close_price' || k === 'ltp' || k === 'last_price') return 'close_price'
    if (k === 'vol' || k === 'volume') return 'volume'
    if (k === 'turnover') return 'turnover'
    if (k === 'prev. close' || k === 'prev_close' || k === 'previous_close') return 'prev_close'
    if (k === 'percent_change' || k === 'change_percent' || k === 'change %') return 'percent_change'
    if (k === 'trans.' || k === 'transactions') return 'transactions'
    return k
}

function parseCsv(content) {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) return []

    const header = parseCsvLine(lines[0]).map(normalizeHeaderKey)
    const rows = []

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i])
        const row = {}
        for (let c = 0; c < header.length; c++) {
            row[header[c]] = cols[c] ?? ''
        }
        rows.push(row)
    }

    return rows
}

function loadCompaniesLookup(possiblePaths) {
    for (const p of possiblePaths) {
        if (!p || !fs.existsSync(p)) continue
        const data = parseCsv(fs.readFileSync(p, 'utf8'))
        const map = new Map()
        for (const r of data) {
            const symbol = String(r.symbol || '').toUpperCase().trim()
            if (!symbol) continue
            map.set(symbol, {
                name: String(r.name || '').trim(),
                sector: normalizeSector(r.sector),
            })
        }
        return map
    }
    return new Map()
}

function toNum(v) {
    if (v == null) return null
    const s = String(v).replaceAll(',', '').trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
}

function normalizeSector(v) {
    const s = String(v ?? '').trim()
    return s || 'Others'
}

function getLatestCsv(outputDir) {
    if (!fs.existsSync(outputDir)) return null

    const files = fs
        .readdirSync(outputDir)
        .filter((f) => f.toLowerCase().endsWith('.csv'))
        .filter((f) => f.toLowerCase() !== 'companies.csv')
        .map((f) => ({
            file: f,
            full: path.join(outputDir, f),
            mtime: fs.statSync(path.join(outputDir, f)).mtimeMs,
        }))
        .sort((a, b) => {
            const aAll = a.file.toLowerCase().includes('all_companies') ? 1 : 0
            const bAll = b.file.toLowerCase().includes('all_companies') ? 1 : 0
            if (aAll !== bAll) return bAll - aAll
            return b.mtime - a.mtime
        })

    return files[0]?.full ?? null
}

async function main() {
    const repoRoot = process.cwd()
    const env = {
        ...readEnvFile(path.join(repoRoot, '.env.local')),
        ...process.env,
    }

    const pipelinePath = env.PIPELINE_PATH
    const outputDir = env.PIPELINE_OUTPUT_DIR
        ? env.PIPELINE_OUTPUT_DIR
        : pipelinePath
            ? path.join(path.dirname(pipelinePath), 'nepse_data')
            : null

    if (!outputDir) {
        throw new Error('Set PIPELINE_PATH or PIPELINE_OUTPUT_DIR in .env.local')
    }
    const cliFile = process.argv.find((a) => a.startsWith('--file='))
    const csvPath = cliFile ? cliFile.slice('--file='.length) : getLatestCsv(outputDir)

    if (!csvPath || !fs.existsSync(csvPath)) {
        throw new Error('No fetched CSV found in nepse_data. Run pipeline fetch first.')
    }

    const companiesLookup = loadCompaniesLookup([
        env.PIPELINE_COMPANIES_CSV,
        path.join(path.dirname(csvPath), 'companies.csv'),
        path.join(outputDir, 'companies.csv'),
    ])

    const raw = fs.readFileSync(csvPath, 'utf8')
    const rows = parseCsv(raw)
    if (rows.length === 0) {
        throw new Error(`CSV has no rows: ${csvPath}`)
    }

    const db = await mysql.createPool({
        host: env.NEPSE_DB_HOST || 'localhost',
        port: Number(env.NEPSE_DB_PORT || 3306),
        user: env.NEPSE_DB_USER || 'root',
        password: env.NEPSE_DB_PASSWORD || '',
        database: env.NEPSE_DB_NAME || 'nepse_db',
        waitForConnections: true,
        connectionLimit: 10,
    })

    try {
        const sectors = new Set(rows.map((r) => normalizeSector(r.sector)))
        for (const sector of sectors) {
            await db.query('INSERT IGNORE INTO sector (name) VALUES (?)', [sector])
        }

        const [sectorRows] = await db.query('SELECT sector_id, name FROM sector')
        const sectorMap = new Map(sectorRows.map((r) => [String(r.name), Number(r.sector_id)]))

        const dates = new Set(rows.map((r) => String(r.date || '').trim()).filter(Boolean))
        for (const d of dates) {
            await db.query(
                'INSERT INTO trading_session (trading_date, is_holiday) VALUES (?, 0) ON DUPLICATE KEY UPDATE trading_date = VALUES(trading_date)',
                [d]
            )
        }

        const [sessionRows] = await db.query(
            "SELECT session_id, DATE_FORMAT(trading_date, '%Y-%m-%d') AS trading_date_s FROM trading_session WHERE trading_date IN (?)",
            [[...dates]]
        )
        const sessionMap = new Map(sessionRows.map((r) => [String(r.trading_date_s), Number(r.session_id)]))

        for (const r of rows) {
            const symbol = String(r.symbol || '').toUpperCase().trim()
            const lookup = companiesLookup.get(symbol)
            const name = String(r.name || lookup?.name || symbol).trim() || symbol
            const sectorName = normalizeSector(r.sector || lookup?.sector)
            const sectorId = sectorMap.get(sectorName) || sectorMap.get('Others')
            const tradingDate = String(r.date || '').trim()
            const sessionId = sessionMap.get(tradingDate)

            if (!symbol || !sessionId || !sectorId) continue

            await db.query(
                `INSERT INTO company (symbol, name, sector_id, is_active)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           sector_id = VALUES(sector_id),
           is_active = 1`,
                [symbol, name, sectorId]
            )

            const [companyRows] = await db.query('SELECT company_id FROM company WHERE symbol = ? LIMIT 1', [symbol])
            const companyId = companyRows?.[0]?.company_id
            if (!companyId) continue

            const openPrice = toNum(r.open_price)
            const highPrice = toNum(r.high_price)
            const lowPrice = toNum(r.low_price)
            const closePrice = toNum(r.close_price)
            const volume = toNum(r.volume)
            const turnover = toNum(r.turnover)
            const prevClose = toNum(r.prev_close)
            let percentChange = toNum(r.percent_change)

            if (percentChange == null && closePrice != null && prevClose != null && prevClose !== 0) {
                percentChange = Number((((closePrice - prevClose) / prevClose) * 100).toFixed(2))
            }

            if (openPrice == null || highPrice == null || lowPrice == null || closePrice == null || volume == null) {
                continue
            }

            await db.query(
                `INSERT INTO price_data
           (company_id, session_id, open_price, high_price, low_price, close_price, volume, turnover, prev_close, percent_change)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           open_price = VALUES(open_price),
           high_price = VALUES(high_price),
           low_price = VALUES(low_price),
           close_price = VALUES(close_price),
           volume = VALUES(volume),
           turnover = VALUES(turnover),
           prev_close = VALUES(prev_close),
           percent_change = VALUES(percent_change)`,
                [
                    companyId,
                    sessionId,
                    openPrice,
                    highPrice,
                    lowPrice,
                    closePrice,
                    Math.trunc(volume),
                    turnover,
                    prevClose,
                    percentChange,
                ]
            )
        }

        console.log(`Loaded CSV into DB: ${csvPath}`)
        console.log(`Rows scanned: ${rows.length}`)
    } finally {
        await db.end()
    }
}

main().catch((e) => {
    console.error(e.message || e)
    process.exit(1)
})
