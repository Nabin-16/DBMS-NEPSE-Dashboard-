import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

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

function mostRecentTradingDate() {
    const d = new Date()
    const weekday = d.getDay()
    if (weekday === 0) d.setDate(d.getDate() - 2)
    if (weekday === 6) d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
}

function run(cmd, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], ...options })
        let out = ''
        let err = ''

        child.stdout.on('data', (d) => {
            const s = d.toString()
            out += s
            process.stdout.write(s)
        })

        child.stderr.on('data', (d) => {
            const s = d.toString()
            err += s
            process.stderr.write(s)
        })

        child.on('close', (code) => {
            if (code === 0) resolve({ out, err })
            else reject(new Error(`Command failed (${code}): ${cmd}`))
        })

        if (options.stdin) {
            child.stdin.write(options.stdin)
            child.stdin.end()
        }
    })
}

async function main() {
    const repoRoot = process.cwd()
    const env = {
        ...readEnvFile(path.join(repoRoot, '.env.local')),
        ...process.env,
    }

    const pipelinePath = env.PIPELINE_PATH
    const pythonPath = env.PYTHON_PATH || 'python'

    if (!pipelinePath || !fs.existsSync(pipelinePath)) {
        throw new Error('PIPELINE_PATH is missing or invalid in .env.local. Use npm run pipeline:load -- --file=<csvPath> to load existing CSV.')
    }

    const date = mostRecentTradingDate()
    const stdin = `f\n1\n1\n${date}\n`

    console.log(`Running pipeline fetch for date: ${date}`)
    await run(pythonPath, [pipelinePath], {
        cwd: path.dirname(pipelinePath),
        stdin,
    })

    console.log('\nLoading latest CSV into MySQL...')
    await run('node', ['scripts/load-nepse-csv.mjs'], { cwd: repoRoot })

    console.log('\nPipeline sync complete.')
}

main().catch((e) => {
    console.error(e.message || e)
    process.exit(1)
})
