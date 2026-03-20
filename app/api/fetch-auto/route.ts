import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import nepsePool from '@/lib/db-nepse'
import { RowDataPacket } from 'mysql2'

export const runtime = 'nodejs'

// In-memory cache for today's pipeline execution
const executionCache: Record<string, boolean> = {}

function getMostRecentTradingDate(): string {
    const today = new Date()
    const dayOfWeek = today.getDay()

    if (dayOfWeek === 0) {
        // Sunday - go back 2 days to Friday
        const friday = new Date(today)
        friday.setDate(today.getDate() - 2)
        return friday.toISOString().split('T')[0]
    } else if (dayOfWeek === 6) {
        // Saturday - go back 1 day to Friday
        const friday = new Date(today)
        friday.setDate(today.getDate() - 1)
        return friday.toISOString().split('T')[0]
    }

    // Weekday - return today
    return today.toISOString().split('T')[0]
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const tradingDate = getMostRecentTradingDate()
        const cacheKey = `pipeline-${tradingDate}`

        const [existingRows] = await nepsePool.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS total
             FROM price_data pd
             JOIN trading_session ts ON pd.session_id = ts.session_id
             WHERE ts.trading_date = ?`,
            [tradingDate]
        )
        const existingCount = Number(existingRows?.[0]?.total ?? 0)
        if (existingCount > 0) {
            executionCache[cacheKey] = true
            return NextResponse.json({
                success: true,
                message: `Data already exists for ${tradingDate}`,
                cached: true,
                date: tradingDate,
                records: existingCount,
            })
        }

        // Check if pipeline already ran for this date
        if (executionCache[cacheKey]) {
            return NextResponse.json({
                success: true,
                message: 'Data already fetched for today',
                cached: true
            })
        }

        const pipelinePath = process.env.PIPELINE_PATH
        const pythonPath = process.env.PYTHON_PATH ?? 'python'

        if (!pipelinePath || !fs.existsSync(pipelinePath)) {
            return NextResponse.json(
                { error: `Pipeline not found at: ${pipelinePath}` },
                { status: 500 }
            )
        }

        // Prepare stdin for non-interactive execution
        let stdinInput = 'f\n'   // mode: fetch
        stdinInput += '1\n'      // all companies
        stdinInput += '1\n'      // single date
        stdinInput += `${tradingDate}\n`

        return new Promise<Response>((resolve) => {
            const pythonProcess = spawn(pythonPath, [pipelinePath], {
                cwd: path.dirname(pipelinePath),
                timeout: 300000, // 5 minutes
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1',
                },
            })

            let output = ''
            let errorOutput = ''

            pythonProcess.stdin?.write(stdinInput)
            pythonProcess.stdin?.end()

            pythonProcess.stdout?.on('data', (data) => {
                output += data.toString()
            })

            pythonProcess.stderr?.on('data', (data) => {
                errorOutput += data.toString()
            })

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    executionCache[cacheKey] = true
                    resolve(
                        NextResponse.json({
                            success: true,
                            message: 'Pipeline executed successfully',
                            date: tradingDate,
                            cached: false
                        })
                    )
                } else {
                    resolve(
                        NextResponse.json({
                            success: false,
                            message: 'Pipeline execution failed',
                            date: tradingDate,
                            cached: false,
                            error: errorOutput || output || `Process exited with code ${code}`
                        }, { status: 500 })
                    )
                }
            })

            pythonProcess.on('error', (err) => {
                resolve(
                    NextResponse.json({
                        error: `Failed to run pipeline: ${err.message}`,
                        cached: false
                    },
                        { status: 500 }
                    )
                )
            })
        })
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
