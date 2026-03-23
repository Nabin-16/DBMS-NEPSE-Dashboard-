"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
    {
        href: '/dashboard',
        label: 'Dashboard',
        icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 13h8V3H3v10zm10 8h8V3h-8v18zM3 21h8v-6H3v6z" />
            </svg>
        ),
    },
    {
        href: '/dashboard/portfolio',
        label: 'My Portfolio',
        icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 10.5h6" />
            </svg>
        ),
    },
    {
        href: '/dashboard/watchlist',
        label: 'Watchlist',
        icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="m12 3 2.7 5.47L21 9.36l-4.5 4.38 1.06 6.2L12 17.06 6.44 19.94 7.5 13.74 3 9.36l6.3-.89L12 3z" />
            </svg>
        ),
    },
]

export default function Sidebar() {
    const pathname = usePathname()

    return (
        <aside className="w-full border-b border-gray-800 bg-gradient-to-b from-gray-900 to-gray-950 p-4 lg:w-64 lg:border-b-0 lg:border-r lg:sticky lg:top-0 lg:h-screen">
            <h2 className="mb-6 text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                NEPSE Analyzer
            </h2>
            <nav className="flex flex-col gap-1.5">
                {links.map((link) => (
                    (() => {
                        const active = link.href === '/dashboard'
                            ? pathname === '/dashboard'
                            : pathname === link.href || pathname.startsWith(`${link.href}/`)
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`group flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all border ${active
                                    ? 'bg-emerald-600/15 text-emerald-300 border-emerald-500/40 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]'
                                    : 'text-gray-300 border-transparent hover:bg-gray-800/60 hover:text-white hover:border-gray-700'}`}
                            >
                                <span className={`transition-transform ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{link.icon}</span>
                                {link.label}
                            </Link>
                        )
                    })()
                ))}
            </nav>

            <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5 text-xs text-gray-500">
                Track market moves and manage your watchlist from one place.
            </div>
        </aside>
    )
}
