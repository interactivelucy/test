import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { Footer } from "@/components/Common/Footer"
import { TopNav } from "@/components/Navigation/TopNav"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
})

function Layout() {
  return (
    <div className="dashboard-grid-bg flex min-h-screen flex-col">
      <TopNav />
      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-[1600px]">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default Layout
