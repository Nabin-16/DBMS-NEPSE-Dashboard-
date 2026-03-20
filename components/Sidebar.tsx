import Link from 'next/link'

const links = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/dashboard/portfolio', label: 'My Portfolio', icon: '💼' },
    { href: '/dashboard/watchlist', label: 'Watchlist', icon: '⭐' },
]

export default function Sidebar() {
    return (
        <aside className="w-full border-b border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900 p-4 lg:w-64 lg:border-b-0 lg:border-r">
            <h2 className="mb-6 text-xl font-bold bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
                NEPSE Dashboard
            </h2>
            <nav className="flex flex-col gap-1">
                {links.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className="group flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-700/50 hover:text-white transition-all border border-transparent hover:border-emerald-500/30"
                    >
                        <span className="text-lg group-hover:scale-110 transition-transform">{link.icon}</span>
                        {link.label}
                    </Link>
                ))}
            </nav>
        </aside>
    )
}
