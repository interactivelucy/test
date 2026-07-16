import { createFileRoute } from "@tanstack/react-router"

import { ClusterDashboard } from "@/components/Dashboard/ClusterDashboard"

export const Route = createFileRoute("/_layout/cluster")({
  component: ClusterPage,
  head: () => ({
    meta: [{ title: "Cluster - FedPilot Dashboard" }],
  }),
})

function ClusterPage() {
  return <ClusterDashboard />
}
