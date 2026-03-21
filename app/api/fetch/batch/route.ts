import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export const runtime = 'nodejs'

type BatchPayload = {
    mode?: 'all' | 'specific'
    symbol?: string
    range?: 'today' | 'specific' | 'range'
    fromDate?: string
    toDate?: string
    days?: number
}

function resolveBatchFetcherPath() {
    const candidates = [
        process.env.HIST_LOADER_PATH,
        process.env.HISTORY_LOADER_PATH,
        path.join(process.cwd(), 'load_history.py'),
        path.join(process.cwd(), 'scripts', 'load_history.py'),
        process.env.BATCH_FETCH_PATH,
        path.join(process.cwd(), 'scripts', 'batch_fetch.py'),
    ].filter(Boolean) as string[]

    for (const p of candidates) {
        if (fs.existsSync(p)) return p
    }

    return null
}

function runProcess(command: string, args: string[], options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }) {
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

        const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000
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

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const payload = (await req.json().catch(() => ({}))) as BatchPayload
        const pythonPath = process.env.PYTHON_PATH ?? 'python'
        const batchPath = resolveBatchFetcherPath()

        if (!batchPath) {
            return NextResponse.json(
                { error: 'History loader not found', details: 'Expected load_history.py or batch_fetch.py via HISTORY_LOADER_PATH/BATCH_FETCH_PATH' },
                { status: 500 }
            )
        }

        const args: string[] = [batchPath]
        if (payload.mode === 'specific' && payload.symbol) {
            args.push('--symbol', payload.symbol.toUpperCase())
        }

        if (payload.range === 'today') {
            args.push('--days', '1')
        } else if (payload.range === 'specific') {
            const d = payload.fromDate || payload.toDate
            if (!d) return NextResponse.json({ error: 'specific date required' }, { status: 400 })
            args.push('--from', d, '--to', d)
        } else if (payload.range === 'range') {
            if (!payload.fromDate || !payload.toDate) {
                return NextResponse.json({ error: 'fromDate and toDate required for range' }, { status: 400 })
            }
            args.push('--from', payload.fromDate, '--to', payload.toDate)
        } else if (payload.days && Number.isFinite(payload.days)) {
            args.push('--days', String(Math.max(1, Math.min(3650, payload.days))))
        } else {
            // default behavior when called without payload
            args.push('--days', '30')
        }

        const run = await runProcess(pythonPath, args, {
            cwd: process.cwd(),
            timeoutMs: 12 * 60 * 1000,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1',
            },
        })

        if (run.code !== 0) {
            return NextResponse.json(
                {
                    error: 'Batch fetch failed',
                    details: run.stderr.slice(-1000) || run.stdout.slice(-1000),
                },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Batch fetch completed',
            output: run.stdout.slice(-1000),
        })
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
