import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
    // Auth check
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { mode, symbol, range, fromDate, toDate, years } = await req.json()

    const pipelinePath = process.env.PIPELINE_PATH!
    const pythonPath = process.env.PYTHON_PATH ?? 'python'

    if (!fs.existsSync(pipelinePath))
        return NextResponse.json(
            { error: `Pipeline not found at: ${pipelinePath}` },
            { status: 500 }
        )

    // Build the input string we'll pipe into the script's stdin
    // The pipeline.py reads interactively — we simulate those prompts
    let stdinInput = ''

    if (mode === 'all') {
        stdinInput += 'f\n'   // mode: fetch
        stdinInput += '1\n'   // all companies
        // date range
        if (range === 'today') {
            stdinInput += '1\n' // single date
            stdinInput += '\n'  // enter = today
        } else if (range === 'range') {
            stdinInput += '2\n'
            stdinInput += `${fromDate}\n`
            stdinInput += `${toDate}\n`
            stdinInput += 'y\n' // confirm if > 30 days
        } else {
            stdinInput += '4\n'  // won't exist in all-mode, fallback to range
            stdinInput += `${fromDate}\n`
            stdinInput += `${toDate}\n`
        }
    } else {
        stdinInput += 'f\n'           // mode: fetch
        stdinInput += '2\n'           // single company
        stdinInput += `${symbol}\n`   // symbol
        if (range === 'today') {
            stdinInput += '1\n'
        } else if (range === 'range') {
            stdinInput += '3\n'
            stdinInput += `${fromDate}\n`
            stdinInput += `${toDate}\n`
        } else {
            stdinInput += '4\n'
            stdinInput += `${years}\n`
        }
    }

    return new Promise<NextResponse>(resolve => {
        const workDir = path.dirname(pipelinePath)
        const child = spawn(pythonPath, [pipelinePath], {
            cwd: workDir,
            stdio: ['pipe', 'pipe', 'pipe'],
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', d => { stdout += d.toString() })
        child.stderr.on('data', d => { stderr += d.toString() })

        // Write all the answers upfront
        child.stdin.write(stdinInput)
        child.stdin.end()

        child.on('close', code => {
            if (code !== 0) {
                console.error('Pipeline stderr:', stderr)
                resolve(NextResponse.json(
                    { error: `Pipeline exited with code ${code}. ${stderr.slice(0, 200)}` },
                    { status: 500 }
                ))
                return
            }

            // Extract the saved file name from stdout
            const savedMatch = stdout.match(/Saved\s+→\s+(.+\.csv)/)
            const savedFile = savedMatch ? savedMatch[1] : 'CSV file'

            resolve(NextResponse.json({
                message: `Data fetched and saved to ${savedFile}`,
                output: stdout.slice(-500), // last 500 chars of output
            }))
        })

        child.on('error', err => {
            resolve(NextResponse.json(
                { error: `Failed to start pipeline: ${err.message}` },
                { status: 500 }
            ))
        })

        // Safety timeout — 5 minutes
        setTimeout(() => {
            child.kill()
            resolve(NextResponse.json(
                { error: 'Pipeline timed out after 5 minutes' },
                { status: 504 }
            ))
        }, 5 * 60 * 1000)
    })
}
