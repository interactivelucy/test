import { createFileRoute } from "@tanstack/react-router"
import { ShieldCheck } from "lucide-react"

import { SectionPlaceholder } from "@/components/Dashboard/SectionPlaceholder"

export const Route = createFileRoute("/_layout/secops")({
  component: SecOpsPage,
  head: () => ({
    meta: [{ title: "SecOps - FedPilot Dashboard" }],
  }),
})

function SecOpsPage() {
  return (
    <SectionPlaceholder
      title="SecOps"
      description="Security, operations, alerts, and audit-oriented dashboard views."
      icon={ShieldCheck}
    />
  )
}
