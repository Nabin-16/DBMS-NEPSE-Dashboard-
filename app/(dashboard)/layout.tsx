import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()
    if (!session) redirect('/login')

    return (
        <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <TopBar user={session.user} />
                <main className="flex-1 overflow-y-auto">
                    <div className="min-h-full bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_35%),radial-gradient(circle_at_top_left,rgba(56,189,248,0.06),transparent_30%)]">
                        <div className="px-4 sm:px-6 py-6">
                            {children}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
