import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { FedPilotDashboard } from "@/components/Dashboard/FedPilotDashboard"

const searchSchema = z.object({
  experiment_id: z.string().optional().catch(undefined),
  workspace: z.enum(["create", "track"]).catch("create"),
  tracking: z
    .enum([
      "overview",
      "accuracy",
      "rounds",
      "performance",
      "communication",
      "convergence",
      "availability",
      "topology",
      "config",
    ])
    .catch("overview"),
})

export const Route = createFileRoute("/_layout/")({
  component: FedPilotDashboard,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      {
        title: "Experiment - FedPilot Dashboard",
      },
    ],
  }),
})
