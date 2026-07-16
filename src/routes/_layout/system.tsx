import { createFileRoute } from "@tanstack/react-router"

import { SystemDashboard } from "@/components/Dashboard/SystemDashboard"

export const Route = createFileRoute("/_layout/system")({
  component: SystemPage,
  head: () => ({
    meta: [{ title: "System - FedPilot Dashboard" }],
  }),
})

function SystemPage() {
  return <SystemDashboard />
}
