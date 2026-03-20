import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

import { verifyUserPassword } from '@/lib/db-auth'

function parseCredentials(rawCredentials: unknown) {
    const email =
        typeof rawCredentials === 'object' && rawCredentials !== null
            ? (rawCredentials as { email?: unknown }).email
            : undefined
    const password =
        typeof rawCredentials === 'object' && rawCredentials !== null
            ? (rawCredentials as { password?: unknown }).password
            : undefined

    if (typeof email !== 'string' || !email.includes('@')) return null
    if (typeof password !== 'string' || password.length < 6) return null

    return { email, password }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
    },
    providers: [
        Credentials({
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            authorize: async (rawCredentials) => {
                const parsed = parseCredentials(rawCredentials)
                if (!parsed) {
                    return null
                }

                const user = await verifyUserPassword(parsed.email, parsed.password)
                return user
            },
        }),
    ],
    callbacks: {
        jwt: async ({ token, user }) => {
            if (user?.id) {
                token.id = String(user.id)
            }
            return token
        },
        session: async ({ session, token }) => {
            if (session.user && token.id) {
                session.user.id = String(token.id)
            }
            return session
        },
    },
})
