import { signOut } from '@/lib/auth'

export default function TopBar({ user }: { user?: any }) {
    async function logout() {
        'use server'
        await signOut({ redirectTo: '/login' })
    }

    return (
        <header className="flex items-center justify-between border-b border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-4">
            <div>
                <h1 className="text-2xl font-bold text-white">Market Overview</h1>
                <p className="text-xs text-gray-500 mt-0.5">Real-time NEPSE data</p>
            </div>
            <form action={logout}>
                <button
                    type="submit"
                    className="rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-lg hover:shadow-red-500/25"
                >
                    Sign Out
                </button>
            </form>
        </header>
    )
}
