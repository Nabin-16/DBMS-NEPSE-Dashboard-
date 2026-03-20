'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

type Mode = 'login' | 'register'

export default function LoginPage() {
    const router = useRouter()
    const [mode, setMode] = useState<Mode>('login')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showSuccess, setShowSuccess] = useState(false)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            if (mode === 'register') {
                const registerRes = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password }),
                })

                if (!registerRes.ok) {
                    const data = await registerRes.json().catch(() => ({}))
                    setError(data.error ?? data.message ?? 'Registration failed')
                    setLoading(false)
                    return
                }

                setShowSuccess(true)
                setName('')
                setEmail('')
                setPassword('')
                setTimeout(() => {
                    setShowSuccess(false)
                    setMode('login')
                }, 2000)
                return
            }

            const loginRes = await signIn('credentials', {
                email,
                password,
                redirect: false,
            })

            if (loginRes?.error) {
                setError('Invalid email or password')
                setLoading(false)
                return
            }

            router.push('/dashboard')
            router.refresh()
        } catch {
            setError('Something went wrong')
            setLoading(false)
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-950 to-black px-4">
            {/* Success Modal */}
            {showSuccess && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 px-4 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-emerald-900/50 rounded-xl p-8 shadow-2xl max-w-sm w-full text-center">
                        <div className="mx-auto w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 border border-emerald-500/50">
                            <svg className="w-6 h-6 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">Account Created!</h3>
                        <p className="text-sm text-gray-300 mb-1">Your account has been created successfully.</p>
                        <p className="text-xs text-gray-400">Redirecting to login...</p>
                    </div>
                </div>
            )}

            <div className="w-full max-w-sm">
                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent mb-2">NEPSE</h1>
                    <p className="text-sm text-gray-400">Stock Market Dashboard</p>
                </div>

                {/* Form Container */}
                <div className="border border-gray-800 rounded-xl p-7 mb-5 bg-gray-900/50 backdrop-blur-sm">
                    {/* Header Text */}
                    <div className="mb-6 text-center">
                        <h2 className="text-2xl font-bold text-white mb-1">
                            {mode === 'login' ? 'Sign In' : 'Sign Up'}
                        </h2>
                        <p className="text-sm text-gray-400">
                            {mode === 'login'
                                ? 'Welcome back to your portfolio'
                                : 'Create your account to get started'}
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'register' && (
                            <div>
                                <label htmlFor="name" className="block text-xs text-gray-400 mb-1.5">Name</label>
                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter your full name"
                                    required
                                    className="w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                                />
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-xs text-gray-400 mb-1.5">Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                required
                                className="w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-xs text-gray-400 mb-1.5">Password</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                required
                                minLength={6}
                                className="w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                            />
                        </div>

                        {error && (
                            <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 px-3 py-2 rounded-lg">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded-lg transition-all disabled:cursor-not-allowed mt-6"
                        >
                            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                        </button>
                    </form>

                    {/* Toggle Mode */}
                    <div className="mt-6 text-center text-sm text-gray-400">
                        {mode === 'login' ? (
                            <>
                                Don't have an account?{' '}
                                <button
                                    type="button"
                                    onClick={() => { setMode('register'); setError(''); }}
                                    className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                                >
                                    Sign up
                                </button>
                            </>
                        ) : (
                            <>
                                Already have an account?{' '}
                                <button
                                    type="button"
                                    onClick={() => { setMode('login'); setError(''); }}
                                    className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                                >
                                    Sign in
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-gray-500">
                    Real-time NEPSE stock market data • Secure & Fast
                </p>
            </div>
        </main>
    )
}
