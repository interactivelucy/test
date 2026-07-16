import { createFileRoute } from "@tanstack/react-router"

import { DashboardSettingsPage } from "@/components/Dashboard/DashboardSettingsPage"

export const Route = createFileRoute("/_layout/dashboard-settings")({
  component: DashboardSettings,
  head: () => ({
    meta: [{ title: "Dashboard Settings - FedPilot Dashboard" }],
  }),
})

function DashboardSettings() {
  return <DashboardSettingsPage />
}
