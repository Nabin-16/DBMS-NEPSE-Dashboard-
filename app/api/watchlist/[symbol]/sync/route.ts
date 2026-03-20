import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'

export const runtime = 'nodejs'

type SyncBody = {
    fromDate?: string
    toDate?: string
    days?: number
}

interface CountRow extends RowDataPacket {
    total: number
}

const executionCache: Record<string, boolean> = {}

function resolvePipelinePath(configuredPath?: string): { resolvedPath: string | null; hint?: string } {
    if (configuredPath && fs.existsSync(configuredPath)) {
        return { resolvedPath: configuredPath }
    }

    const candidateDirs = [
        configuredPath ? path.dirname(configuredPath) : '',
        process.env.PIPELINE_DIR ?? '',
        'C:/Codes/DBMS/Data fetched/final_data',
    ].filter(Boolean)

    const preferredNames = ['nepse_pipeline.py', 'pipeline.py', 'main.py', 'horaaa.py']

    for (const dir of candidateDirs) {
        if (!fs.existsSync(dir)) continue

        for (const name of preferredNames) {
            const full = path.join(dir, name)
            if (fs.existsSync(full)) {
                return {
                    resolvedPath: full,
                    hint: configuredPath && configuredPath !== full ? `Using fallback pipeline file: ${full}` : undefined,
                }
            }
        }

        const pyFiles = fs.readdirSync(dir)
            .filter((f) => f.toLowerCase().endsWith('.py'))
            .map((f) => path.join(dir, f))

        if (pyFiles.length === 1) {
            return {
                resolvedPath: pyFiles[0],
                hint: `Using only Python file found in pipeline directory: ${pyFiles[0]}`,
            }
        }
    }

    return {
        resolvedPath: null,
        hint: configuredPath
            ? `Configured PIPELINE_PATH not found: ${configuredPath}`
            : 'PIPELINE_PATH is not configured',
    }
}

function toIsoDate(d: Date): string {
    return d.toISOString().split('T')[0]
}

function subtractDays(base: Date, days: number): Date {
    const out = new Date(base)
    out.setDate(out.getDate() - days)
    return out
}

function mostRecentTradingDate(baseDate?: string): string {
    const d = baseDate ? new Date(`${baseDate}T00:00:00`) : new Date()
    const weekday = d.getDay()
    if (weekday === 0) d.setDate(d.getDate() - 2)
    if (weekday === 6) d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
}

function runProcess(command: string, args: string[], options: { cwd?: string; stdin?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }) {
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: options.env,
        })

        let stdout = ''
        let stderr = ''
        let didTimeout = false

        child.stdout.on('data', (d) => {
            stdout += d.toString()
        })

        child.stderr.on('data', (d) => {
            stderr += d.toString()
        })

        child.on('error', (err) => {
            reject(err)
        })

        child.on('close', (code) => {
            resolve({ code: code ?? 1, stdout, stderr })
        })

        if (options.stdin) {
            child.stdin.write(options.stdin)
            child.stdin.end()
        }

        const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000
        setTimeout(() => {
            if (!child.killed) {
                didTimeout = true
                child.kill()
            }
        }, timeoutMs)

        child.on('close', () => {
            if (didTimeout) {
                stderr += '\nProcess timed out'
            }
        })
    })
}

function parseSavedCsvPath(stdout: string, pipelineDir: string): string | null {
    const match = stdout.match(/Saved\s*(?:->|→)\s*(.+\.csv)/i)
    if (!match?.[1]) return null
    const rawPath = match[1].trim()
    return path.isAbsolute(rawPath) ? rawPath : path.join(pipelineDir, rawPath)
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    try {
        const session = await auth()
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { symbol } = await params
        if (!symbol) {
            return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
        }

        const body = (await req.json()) as SyncBody

        const pipelinePath = process.env.PIPELINE_PATH
        const pythonPath = process.env.PYTHON_PATH ?? 'python'
        const resolved = resolvePipelinePath(pipelinePath)

        if (!resolved.resolvedPath) {
            return NextResponse.json(
                {
                    error: `Pipeline not found at: ${pipelinePath}`,
                    details: resolved.hint,
                },
                { status: 500 }
            )
        }

        const today = new Date()
        const toDate = body.toDate || toIsoDate(today)
        const requestedDays = Number.isFinite(body.days) ? Number(body.days) : 30
        const normalizedDays = Math.max(1, Math.min(3650, requestedDays))
        const fromDate = body.fromDate || toIsoDate(subtractDays(today, normalizedDays))
        const targetTradingDate = mostRecentTradingDate(toDate)
        const cacheKey = `all-companies-${targetTradingDate}`

        const [existingRows] = await nepsePool.query<CountRow[]>(
            `SELECT COUNT(*) AS total
             FROM price_data pd
             JOIN trading_session ts ON pd.session_id = ts.session_id
             WHERE ts.trading_date = ?`,
            [targetTradingDate]
        )
        const existingCount = Number(existingRows?.[0]?.total ?? 0)

        if (existingCount > 0) {
            executionCache[cacheKey] = true
            return NextResponse.json({
                success: true,
                symbol: symbol.toUpperCase(),
                fromDate,
                toDate,
                targetTradingDate,
                records: existingCount,
                cached: true,
                message: `Data already exists in DB for ${targetTradingDate}`,
                hint: resolved.hint,
            })
        }

        if (executionCache[cacheKey]) {
            return NextResponse.json({
                success: true,
                symbol: symbol.toUpperCase(),
                fromDate,
                toDate,
                targetTradingDate,
                message: `All-company pipeline already synced for ${targetTradingDate}`,
                cached: true,
                hint: resolved.hint,
            })
        }

        // Use the original startup technique: fetch all companies for a date.
        const stdinInput = [
            'f',
            '1',
            '1',
            targetTradingDate,
        ].join('\n')

        const pipelineDir = path.dirname(resolved.resolvedPath)
        const pipelineRun = await runProcess(pythonPath, [resolved.resolvedPath], {
            cwd: pipelineDir,
            stdin: stdinInput,
            timeoutMs: 8 * 60 * 1000,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1',
            },
        })

        if (pipelineRun.code !== 0) {
            return NextResponse.json(
                {
                    error: 'Pipeline execution failed',
                    details: pipelineRun.stderr.slice(-400) || pipelineRun.stdout.slice(-400),
                },
                { status: 500 }
            )
        }
        const repoRoot = process.cwd()
        const loadArgs = ['scripts/load-nepse-csv.mjs']
        const csvPath = parseSavedCsvPath(pipelineRun.stdout, pipelineDir)
        if (csvPath) loadArgs.push(`--file=${csvPath}`)

        const loadRun = await runProcess('node', loadArgs, {
            cwd: repoRoot,
            timeoutMs: 3 * 60 * 1000,
        })

        if (loadRun.code !== 0) {
            return NextResponse.json(
                {
                    error: 'CSV import failed',
                    details: loadRun.stderr.slice(-400),
                },
                { status: 500 }
            )
        }

        executionCache[cacheKey] = true

        return NextResponse.json({
            success: true,
            symbol: symbol.toUpperCase(),
            fromDate,
            toDate,
            targetTradingDate,
            csvPath,
            message: `Synced all companies for ${targetTradingDate}, then refreshed DB for watchlist queries`,
            hint: resolved.hint,
        })
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
