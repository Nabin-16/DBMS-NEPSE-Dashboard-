import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import authPool from '@/lib/db-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
    try {
        const { name, email, password } = await req.json()

        if (!name || !email || !password)
            return NextResponse.json({ error: 'All fields required' }, { status: 400 })

        if (password.length < 8)
            return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

        const hash = await bcrypt.hash(password, 12)

        await authPool.query(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            [name.trim(), email.toLowerCase().trim(), hash]
        )

        return NextResponse.json({ message: 'Account created successfully' }, { status: 201 })
    } catch (err: unknown) {
        if ((err as { code?: string })?.code === 'ER_DUP_ENTRY')
            return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
        console.error('Register error:', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
