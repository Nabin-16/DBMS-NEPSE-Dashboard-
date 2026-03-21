import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export const runtime = 'nodejs'

type AutoFetchMode = 'today' | 'symbol_history' | 'range' | 'range_all'

type AutoFetchBody = {
    mode?: AutoFetchMode
    symbol?: string
    from?: string
    to?: string
    days?: number
    date?: string
}

const PYTHON = process.env.PYTHON_PATH ?? 'python'

function resolveLoaderPath() {
    const candidates = [
        process.env.HIST_LOADER_PATH,
        process.env.HISTORY_LOADER_PATH,
        process.env.BATCH_FETCH_PATH,
        path.join(process.cwd(), 'load_history.py'),
        path.join(process.cwd(), 'scripts', 'load_history.py'),
        path.join(process.cwd(), 'batch_fetch.py'),
        path.join(process.cwd(), 'scripts', 'batch_fetch.py'),
    ].filter(Boolean) as string[]

    for (const p of candidates) {
        if (fs.existsSync(p)) return p
    }
    return null
}

function toIso(d: Date) {
    return d.toISOString().split('T')[0]
}

function lastTradingDay(ref?: string): string {
    const base = ref ? new Date(`${ref}T00:00:00`) : new Date()
    base.setMinutes(base.getMinutes() + 345)
    base.setHours(0, 0, 0, 0)
    while (base.getDay() === 5 || base.getDay() === 6) {
        base.setDate(base.getDate() - 1)
    }
    return toIso(base)
}

function runLoader(loaderPath: string, args: string[]): Promise<{ ok: boolean; output: string }> {
    return new Promise((resolve) => {
        const child = spawn(PYTHON, [loaderPath, ...args], {
            cwd: path.dirname(loaderPath),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1',
            },
        })

        let out = ''
        let err = ''
        let settled = false

        const finish = (ok: boolean, output: string) => {
            if (settled) return
            settled = true
            resolve({ ok, output })
        }

        child.stdout.on('data', (d) => {
            out += d.toString()
        })

        child.stderr.on('data', (d) => {
            err += d.toString()
        })

        child.on('close', (code) => {
            finish(code === 0, code === 0 ? out : err || out)
        })

        child.on('error', (e) => {
            finish(false, `Python error: ${e.message}`)
        })

        setTimeout(() => {
            if (!settled) {
                child.kill()
                finish(false, 'Timed out after 15 minutes')
            }
        }, 15 * 60 * 1000)
    })
}

function tradingDatesBetween(from: string, to: string): string[] {
    const dates: string[] = []
    const cur = new Date(`${from}T00:00:00`)
    const end = new Date(`${to}T00:00:00`)

    while (cur <= end) {
        const day = cur.getDay()
        if (day !== 5 && day !== 6) {
            dates.push(cur.toISOString().split('T')[0])
        }
        cur.setDate(cur.getDate() + 1)
    }

    return dates
}

async function getMissingDates(from: string, to: string, symbol?: string): Promise<string[]> {
    const allDates = tradingDatesBetween(from, to)
    if (!allDates.length) return []

    let existing: string[] = []
    if (symbol) {
        const [rows] = await nepsePool.query<RowDataPacket[]>(
            `SELECT DISTINCT DATE_FORMAT(t.trading_date, '%Y-%m-%d') AS d
             FROM price_data p
             JOIN company c ON p.company_id = c.company_id
             JOIN trading_session t ON p.session_id = t.session_id
             WHERE c.symbol = ? AND t.trading_date BETWEEN ? AND ?`,
            [symbol.toUpperCase(), from, to]
        )
        existing = rows.map((r) => String(r.d))
    } else {
        const [rows] = await nepsePool.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(trading_date, '%Y-%m-%d') AS d
             FROM trading_session
             WHERE trading_date BETWEEN ? AND ?`,
            [from, to]
        )
        existing = rows.map((r) => String(r.d))
    }

    const existingSet = new Set(existing)
    return allDates.filter((d) => !existingSet.has(d))
}

function parseLoaded(output: string): number {
    return parseInt(output.match(/Total loaded\s*:\s*(\d+)/)?.[1] ?? '0', 10)
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const loaderPath = resolveLoaderPath()
    if (!loaderPath) {
        return NextResponse.json(
            { error: 'Loader script not found', details: 'Set HIST_LOADER_PATH/HISTORY_LOADER_PATH' },
            { status: 500 }
        )
    }

    const today = toIso(new Date())

    try {
        const body = (await req.json()) as AutoFetchBody
        const { mode, symbol, from, to, days, date } = body

        if (mode === 'symbol_history' && symbol) {
            const n = Number(days) || 30
            const fromD = toIso(new Date(Date.now() - n * 86400000))
            const missing = await getMissingDates(fromD, today, symbol)

            if (!missing.length) {
                return NextResponse.json({ message: `${symbol}: all ${n} days already in DB`, loaded: 0 })
            }

            const { ok, output } = await runLoader(loaderPath, [
                '--from', missing[0],
                '--to', missing[missing.length - 1],
                '--symbol', symbol.toUpperCase(),
            ])

            return NextResponse.json({
                message: `${symbol}: loaded ${parseLoaded(output)} rows`,
                loaded: parseLoaded(output),
                ok,
                output: output.slice(-1200),
            })
        }

        if (mode === 'range' && from && to) {
            const missing = await getMissingDates(from, to, symbol)
            if (!missing.length) {
                return NextResponse.json({ message: `${symbol ?? 'all'}: data complete for ${from} -> ${to}`, loaded: 0 })
            }

            const args = ['--from', missing[0], '--to', missing[missing.length - 1]]
            if (symbol) args.push('--symbol', symbol.toUpperCase())
            const { ok, output } = await runLoader(loaderPath, args)

            return NextResponse.json({
                message: `${symbol ?? 'all'}: loaded ${parseLoaded(output)} rows`,
                loaded: parseLoaded(output),
                ok,
                output: output.slice(-1200),
            })
        }

        if (mode === 'today') {
            const targetDay = lastTradingDay(date)
            const missing = await getMissingDates(targetDay, targetDay)
            if (!missing.length) {
                return NextResponse.json({ message: `Data already in DB for ${targetDay}`, loaded: 0, date: targetDay })
            }

            const { ok, output } = await runLoader(loaderPath, ['--from', targetDay, '--to', targetDay])
            return NextResponse.json({
                message: `Synced ${parseLoaded(output)} companies for ${targetDay}`,
                loaded: parseLoaded(output),
                ok,
                date: targetDay,
                output: output.slice(-1200),
            })
        }

        if (mode === 'range_all' && from && to) {
            const missing = await getMissingDates(from, to)
            if (!missing.length) {
                return NextResponse.json({ message: `All data complete for ${from} -> ${to}`, loaded: 0 })
            }
            const { ok, output } = await runLoader(loaderPath, ['--from', missing[0], '--to', missing[missing.length - 1]])
            return NextResponse.json({
                message: `Loaded ${parseLoaded(output)} rows`,
                loaded: parseLoaded(output),
                ok,
                output: output.slice(-1200),
            })
        }

        return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Auto fetch failed' }, { status: 500 })
    }
}
