import { auth } from '@/lib/auth'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

type AuthRequest = NextRequest & {
    auth?: unknown
}

export default auth((req: AuthRequest) => {
    const { pathname } = req.nextUrl
    const isLoggedIn = !!req.auth

    // Redirect root to dashboard or login
    if (pathname === '/') {
        return NextResponse.redirect(
            new URL(isLoggedIn ? '/dashboard' : '/login', req.url)
        )
    }

    // Protect dashboard routes
    if (pathname.startsWith('/dashboard') && !isLoggedIn) {
        return NextResponse.redirect(new URL('/login', req.url))
    }

    // Redirect logged-in users away from login page
    if (pathname === '/login' && isLoggedIn) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
    }
})

export const config = {
    matcher: ['/', '/dashboard/:path*', '/login'],
}