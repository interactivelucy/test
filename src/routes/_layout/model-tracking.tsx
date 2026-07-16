import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  ArrowUpDown,
  Box,
  ChevronRight,
  Clock,
  GitBranch,
  Layers,
  Loader2,
  RefreshCw,
  Rocket,
  Search,
  SlidersHorizontal,
  Tag,
} from "lucide-react"
import { useState } from "react"

import { OpenAPI } from "@/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { clearAuthAndRedirect, isAuthErrorStatus } from "@/lib/auth"

export const Route = createFileRoute("/_layout/model-tracking")({
  component: ModelTrackingPage,
  head: () => ({
    meta: [{ title: "Models - FedPilot Dashboard" }],
  }),
})

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const apiUrl = (path: string) => `${OpenAPI.BASE}${path}`

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("access_token") || ""
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  })

  if (!response.ok) {
    if (isAuthErrorStatus(response.status)) {
      clearAuthAndRedirect()
    }
    const body = await response.json().catch(() => null)
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : body?.detail?.message || response.statusText || "Request failed"
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModelVersionSummary = {
  version: string
  current_stage: string
  status: string
  created_at: string | null
}

type RegisteredModel = {
  name: string
  description: string | null
  created_at: string | null
  last_updated_at: string | null
  tags: Record<string, string>
  latest_versions: ModelVersionSummary[]
}

type RegisteredModelList = {
  models: RegisteredModel[]
  total: number
}

type Cluster = {
  id: string
  name: string
  status: "unknown" | "healthy" | "unhealthy" | "inactive"
}

type ClusterList = {
  clusters: Cluster[]
  total: number
}

type ModelVersionMetrics = {
  accuracy: number | null
  loss: number | null
  train_accuracy: number | null
  test_accuracy: number | null
  train_loss: number | null
  test_loss: number | null
  training_time: number | null
  extra: Record<string, number>
}

type ModelVersionDetail = {
  name: string
  version: string
  current_stage: string
  source: string | null
  run_id: string | null
  status: string
  description: string | null
  created_at: string | null
  last_updated_at: string | null
  tags: Record<string, string>
  metrics: ModelVersionMetrics
  run_link: string | null
}

type RegisteredModelDetail = {
  name: string
  description: string | null
  created_at: string | null
  last_updated_at: string | null
  tags: Record<string, string>
  versions: ModelVersionDetail[]
}

type DeployResponse = {
  engine_name: string
  model_name: string
  version: string
  engine: string
  port: number
  status: string
  message: string
}

// ---------------------------------------------------------------------------
// Stage badge
// ---------------------------------------------------------------------------

function stageColor(stage: string): string {
  switch (stage) {
    case "Production":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    case "Staging":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30"
    case "Archived":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
    default:
      return "bg-blue-500/15 text-blue-400 border-blue-500/30"
  }
}

// ---------------------------------------------------------------------------
// Metric display
// ---------------------------------------------------------------------------

function MetricPill({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number | null | undefined
  icon?: LucideIcon
}) {
  if (value == null) return null
  const display = typeof value === "number" ? value.toFixed(4) : value
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1 text-xs font-medium">
      {Icon && <Icon className="size-3 text-muted-foreground" />}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{display}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deploy dialog
// ---------------------------------------------------------------------------

function DeployDialog({
  modelName,
  version,
  open,
  onOpenChange,
}: {
  modelName: string
  version: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [engine, setEngine] = useState("auto")
  const [numGpus, setNumGpus] = useState("0")
  const [clusterId, setClusterId] = useState<string>("local")
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const clustersQuery = useQuery<ClusterList>({
    queryKey: ["clusters"],
    queryFn: () => apiRequest<ClusterList>("/api/v1/clusters/"),
    enabled: open,
  })

  const deployMutation = useMutation<DeployResponse, Error>({
    mutationFn: () =>
      apiRequest<DeployResponse>("/api/v1/serving/deploy", {
        method: "POST",
        body: JSON.stringify({
          model_name: modelName,
          version,
          engine,
          num_gpus: parseFloat(numGpus) || 0,
          cluster_id: clusterId === "local" ? undefined : clusterId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serving-deployments"] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-5 text-primary" />
            Deploy Model
          </DialogTitle>
          <DialogDescription>
            Deploy <span className="font-semibold">{modelName}</span> version{" "}
            <span className="font-semibold">{version}</span> for serving.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Target Client / Cluster
            </label>
            <Select value={clusterId} onValueChange={setClusterId}>
              <SelectTrigger>
                <SelectValue placeholder="Select target client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local (Default)</SelectItem>
                {clustersQuery.data?.clusters.map((cluster) => (
                  <SelectItem key={cluster.id} value={cluster.id}>
                    {cluster.name} ({cluster.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select the specific client endpoint to deploy this model to.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Serving Engine</label>
            <Select value={engine} onValueChange={setEngine}>
              <SelectTrigger>
                <SelectValue placeholder="Select engine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto Detect</SelectItem>
                <SelectItem value="ray_serve">Ray Serve</SelectItem>
                <SelectItem value="vllm">vLLM</SelectItem>
                <SelectItem value="vllm_ray">vLLM + Ray</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">GPU Allocation</label>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={numGpus}
              onChange={(e) => setNumGpus(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              Number of GPUs to allocate. Use 0 for CPU-only inference.
            </p>
          </div>

          {deployMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Deployment failed</AlertTitle>
              <AlertDescription>
                {deployMutation.error?.message}
              </AlertDescription>
            </Alert>
          )}

          {deployMutation.isSuccess && (
            <Alert>
              <AlertTitle>Deployed successfully</AlertTitle>
              <AlertDescription>
                {deployMutation.data?.message}{" "}
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => navigate({ to: "/serving" })}
                >
                  Go to Serving →
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending}
            >
              {deployMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Deploy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Model card
// ---------------------------------------------------------------------------

function ModelCard({
  model,
  onClick,
}: {
  model: RegisteredModel
  onClick: () => void
}) {
  const latestVersion = model.latest_versions?.[0]
  const latestStage = latestVersion?.current_stage || "None"

  return (
    <Card
      className="group cursor-pointer rounded-lg border transition-all duration-200 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20">
              <Box className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold leading-tight">
                {model.name}
              </CardTitle>
              {model.description && (
                <CardDescription className="mt-0.5 line-clamp-1 text-xs">
                  {model.description}
                </CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-[10px] ${stageColor(latestStage)}`}
            >
              {latestStage}
            </Badge>
            <ChevronRight className="size-4 text-muted-foreground transition-transform" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {latestVersion && (
            <span className="flex items-center gap-1">
              <Layers className="size-3" />v{latestVersion.version}
            </span>
          )}
          <span>·</span>
          <span className="flex items-center gap-1">
            <Tag className="size-3" />
            {model.latest_versions.length} version
            {model.latest_versions.length !== 1 ? "s" : ""}
          </span>
          {model.created_at && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {new Date(model.created_at).toLocaleDateString()}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function VersionCard({
  v,
  onDeploy,
}: {
  v: ModelVersionDetail
  onDeploy: () => void
}) {
  return (
    <Card className="rounded-lg border bg-card/60 p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10">
            <GitBranch className="size-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{v.name}</span>
              <span className="text-xs text-muted-foreground">
                v{v.version}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[9px] h-4 px-1.5 ${stageColor(v.current_stage)}`}
              >
                {v.current_stage}
              </Badge>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                {v.status}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1 text-xs px-2.5"
          onClick={onDeploy}
        >
          <Rocket className="size-3" />
          Deploy
        </Button>
      </div>

      {v.description && (
        <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
          {v.description}
        </p>
      )}

      {/* Metrics row */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <MetricPill label="Accuracy" value={v.metrics.accuracy} />
        <MetricPill label="Loss" value={v.metrics.loss} />
        {v.metrics.training_time !== null && (
          <MetricPill
            label="Training Time"
            value={`${v.metrics.training_time.toFixed(1)}s`}
          />
        )}
        <MetricPill label="Train Acc" value={v.metrics.train_accuracy} />
        <MetricPill label="Test Acc" value={v.metrics.test_accuracy} />
        <MetricPill label="Train Loss" value={v.metrics.train_loss} />
        <MetricPill label="Test Loss" value={v.metrics.test_loss} />
      </div>

      {/* Meta row */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2 border-border/40">
        {v.run_id ? (
          <span className="font-mono">run: {v.run_id.slice(0, 8)}</span>
        ) : (
          <span />
        )}
        {v.created_at && (
          <span className="flex items-center gap-1">
            <Clock className="size-2.5" />
            {new Date(v.created_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </Card>
  )
}

function ModelDetailsDialog({
  modelName,
  open,
  onOpenChange,
}: {
  modelName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [deployTarget, setDeployTarget] = useState<{
    name: string
    version: string
  } | null>(null)

  const [minAccuracy, setMinAccuracy] = useState<string>("")
  const [maxTrainTime, setMaxTrainTime] = useState<string>("")

  const detailQuery = useQuery<RegisteredModelDetail>({
    queryKey: ["model-detail", modelName],
    queryFn: () =>
      apiRequest<RegisteredModelDetail>(
        `/api/v1/models/${encodeURIComponent(modelName)}`,
      ),
    enabled: open,
    staleTime: 30_000,
  })

  const versions = detailQuery.data?.versions || []

  const filteredVersions = versions.filter((v) => {
    if (minAccuracy) {
      const acc = v.metrics.accuracy ?? v.metrics.test_accuracy
      if (acc === null || acc < parseFloat(minAccuracy)) {
        return false
      }
    }
    if (maxTrainTime) {
      const time = v.metrics.training_time
      if (time === null || time > parseFloat(maxTrainTime)) {
        return false
      }
    }
    return true
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto min-w-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Box className="size-5 text-primary" />
              {modelName} Versions
            </DialogTitle>
            <DialogDescription>
              Explore, filter, and deploy versions of the registered model{" "}
              {modelName}.
            </DialogDescription>
          </DialogHeader>

          {/* Filters Inside the Popup */}
          <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/40 p-4 mt-2">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <SlidersHorizontal className="size-3" /> Min Accuracy (e.g.
                0.95)
              </label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={minAccuracy}
                onChange={(e) => setMinAccuracy(e.target.value)}
                placeholder="No limit"
                className="h-8 text-xs bg-background"
              />
            </div>
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Clock className="size-3" /> Max Train Time (seconds)
              </label>
              <Input
                type="number"
                min="0"
                value={maxTrainTime}
                onChange={(e) => setMaxTrainTime(e.target.value)}
                placeholder="No limit"
                className="h-8 text-xs bg-background"
              />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {detailQuery.isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {detailQuery.isError && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {detailQuery.error?.message}
                </AlertDescription>
              </Alert>
            )}

            {detailQuery.data && filteredVersions.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No versions match the active metrics filters.
              </p>
            )}

            {filteredVersions.map((v) => (
              <div
                key={v.version}
                className="rounded-lg border bg-muted/10 p-4 hover:bg-muted/20 transition-all duration-150"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <GitBranch className="size-3.5 text-primary" />
                      Version {v.version}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${stageColor(v.current_stage)}`}
                    >
                      {v.current_stage}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {v.status}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() =>
                      setDeployTarget({ name: v.name, version: v.version })
                    }
                  >
                    <Rocket className="size-3" />
                    Deploy
                  </Button>
                </div>

                {v.description && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {v.description}
                  </p>
                )}

                {/* Metrics row */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <MetricPill label="Accuracy" value={v.metrics.accuracy} />
                  <MetricPill label="Loss" value={v.metrics.loss} />
                  {v.metrics.training_time !== null && (
                    <MetricPill
                      label="Training Time"
                      value={`${v.metrics.training_time.toFixed(1)}s`}
                    />
                  )}
                  <MetricPill
                    label="Train Acc"
                    value={v.metrics.train_accuracy}
                  />
                  <MetricPill
                    label="Test Acc"
                    value={v.metrics.test_accuracy}
                  />
                  <MetricPill label="Train Loss" value={v.metrics.train_loss} />
                  <MetricPill label="Test Loss" value={v.metrics.test_loss} />
                  {Object.entries(v.metrics.extra || {}).map(([k, val]) => (
                    <MetricPill key={k} label={k} value={val} />
                  ))}
                </div>

                {/* Meta row */}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  {v.run_id && (
                    <span className="font-mono">
                      run: {v.run_id.slice(0, 8)}
                    </span>
                  )}
                  {v.created_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-2.5" />
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {deployTarget && (
        <DeployDialog
          modelName={deployTarget.name}
          version={deployTarget.version}
          open={!!deployTarget}
          onOpenChange={(open) => {
            if (!open) setDeployTarget(null)
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function ModelTrackingPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [stageFilter, setStageFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"models" | "versions">("models")

  // Versions view mode sorting and filtering states
  const [sortBy, setSortBy] = useState<
    "accuracy" | "training_time" | "version" | "created_at"
  >("accuracy")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [minAccuracy, setMinAccuracy] = useState("")
  const [maxTrainTime, setMaxTrainTime] = useState("")

  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [deployTarget, setDeployTarget] = useState<{
    name: string
    version: string
  } | null>(null)

  const modelsQuery = useQuery<RegisteredModelList>({
    queryKey: ["registered-models"],
    queryFn: () => apiRequest<RegisteredModelList>("/api/v1/models/"),
    refetchInterval: 30_000,
  })

  const models = modelsQuery.data?.models || []

  // Load details (versions list + metrics) for all models in parallel
  const detailsQueries = useQueries({
    queries: models.map((m) => ({
      queryKey: ["model-detail", m.name],
      queryFn: () =>
        apiRequest<RegisteredModelDetail>(
          `/api/v1/models/${encodeURIComponent(m.name)}`,
        ),
      staleTime: 30_000,
      enabled: models.length > 0,
    })),
  })

  // Grouped Models filtering (Models View)
  const filteredModels = models.filter((m) => {
    const matchesSearch =
      !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStage =
      stageFilter === "all" ||
      m.latest_versions?.some(
        (v) => v.current_stage.toLowerCase() === stageFilter.toLowerCase(),
      )

    return matchesSearch && matchesStage
  })

  // Flattened Model Versions filtering and sorting (Versions View)
  const allVersions: ModelVersionDetail[] = []
  detailsQueries.forEach((q) => {
    if (q.data?.versions) {
      allVersions.push(...q.data.versions)
    }
  })

  const filteredVersions = allVersions.filter((v) => {
    // Stage Filter
    if (
      stageFilter !== "all" &&
      v.current_stage.toLowerCase() !== stageFilter.toLowerCase()
    ) {
      return false
    }
    // Search Query (filters by model name, description, or version)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matches =
        v.name.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q) ||
        `v${v.version}`.includes(q)
      if (!matches) return false
    }
    // Min Accuracy Filter
    if (minAccuracy) {
      const acc = v.metrics.accuracy ?? v.metrics.test_accuracy
      if (acc === null || acc < parseFloat(minAccuracy)) {
        return false
      }
    }
    // Max Train Time Filter
    if (maxTrainTime) {
      const time = v.metrics.training_time
      if (time === null || time > parseFloat(maxTrainTime)) {
        return false
      }
    }
    return true
  })

  const sortedVersions = [...filteredVersions].sort((a, b) => {
    let valA: any = null
    let valB: any = null

    if (sortBy === "accuracy") {
      valA = a.metrics.accuracy ?? a.metrics.test_accuracy
      valB = b.metrics.accuracy ?? b.metrics.test_accuracy
    } else if (sortBy === "training_time") {
      valA = a.metrics.training_time
      valB = b.metrics.training_time
    } else if (sortBy === "version") {
      valA = parseFloat(a.version) || 0
      valB = parseFloat(b.version) || 0
    } else if (sortBy === "created_at") {
      valA = a.created_at ? new Date(a.created_at).getTime() : 0
      valB = b.created_at ? new Date(b.created_at).getTime() : 0
    }

    if (valA === null || valA === undefined)
      return sortOrder === "desc" ? 1 : -1
    if (valB === null || valB === undefined)
      return sortOrder === "desc" ? -1 : 1

    if (valA < valB) return sortOrder === "desc" ? 1 : -1
    if (valA > valB) return sortOrder === "desc" ? -1 : 1
    return 0
  })

  const toggleSortOrder = () => {
    setSortOrder((o) => (o === "asc" ? "desc" : "asc"))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Models</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registered models from the MLflow Model Registry. Filter, inspect,
            and deploy model versions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center rounded-lg border bg-muted/20 p-1">
            <Button
              variant={viewMode === "models" ? "secondary" : "ghost"}
              size="xs"
              className="h-7 text-xs px-2.5"
              onClick={() => setViewMode("models")}
            >
              Models
            </Button>
            <Button
              variant={viewMode === "versions" ? "secondary" : "ghost"}
              size="xs"
              className="h-7 text-xs px-2.5"
              onClick={() => setViewMode("versions")}
            >
              Versions
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => modelsQuery.refetch()}
            disabled={modelsQuery.isFetching}
          >
            <RefreshCw
              className={`size-3.5 ${modelsQuery.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              viewMode === "models" ? "Search models..." : "Search versions..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="production">Production</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="archive">Archived</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>

        {/* Flat Version View Extra Filters & Sorts */}
        {viewMode === "versions" && (
          <>
            <div className="flex items-center gap-1.5 rounded-md border border-input px-3 h-10 bg-background/50">
              <span className="text-xs font-semibold text-muted-foreground">
                Min Acc:
              </span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                placeholder="No limit"
                value={minAccuracy}
                onChange={(e) => setMinAccuracy(e.target.value)}
                className="w-16 h-full bg-transparent text-xs outline-none border-none tabular-nums"
              />
            </div>

            <div className="flex items-center gap-1.5 rounded-md border border-input px-3 h-10 bg-background/50">
              <span className="text-xs font-semibold text-muted-foreground">
                Max Time:
              </span>
              <input
                type="number"
                min="0"
                placeholder="seconds"
                value={maxTrainTime}
                onChange={(e) => setMaxTrainTime(e.target.value)}
                className="w-20 h-full bg-transparent text-xs outline-none border-none tabular-nums"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={sortBy}
                onValueChange={(val: any) => setSortBy(val)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accuracy">Accuracy</SelectItem>
                  <SelectItem value="training_time">Training Time</SelectItem>
                  <SelectItem value="version">Version</SelectItem>
                  <SelectItem value="created_at">Date Created</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleSortOrder}
                title={`Sort ${sortOrder === "asc" ? "ascending" : "descending"}`}
                className="h-10 w-10 shrink-0"
              >
                <ArrowUpDown className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Loading */}
      {modelsQuery.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="rounded-lg">
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-2 h-3 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {modelsQuery.isError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Failed to load models</AlertTitle>
          <AlertDescription>
            {modelsQuery.error?.message}
            <Button
              variant="link"
              className="ml-2 h-auto p-0 text-xs"
              onClick={() => modelsQuery.refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {modelsQuery.isSuccess && models.length === 0 && (
        <Card className="rounded-lg">
          <CardContent className="flex min-h-72 items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex size-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Box className="size-7" />
              </div>
              <div>
                <p className="font-medium">No registered models</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Models will appear here once they are registered in the MLflow
                  Model Registry through federated learning experiments.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Models View Grid */}
      {viewMode === "models" && filteredModels.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredModels.map((model) => (
            <ModelCard
              key={model.name}
              model={model}
              onClick={() => setSelectedModel(model.name)}
            />
          ))}
        </div>
      )}

      {/* Flat Versions View Grid */}
      {viewMode === "versions" && sortedVersions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedVersions.map((v) => (
            <VersionCard
              key={`${v.name}-v${v.version}`}
              v={v}
              onDeploy={() =>
                setDeployTarget({ name: v.name, version: v.version })
              }
            />
          ))}
        </div>
      )}

      {/* No results (Models) */}
      {viewMode === "models" &&
        searchQuery &&
        filteredModels.length === 0 &&
        models.length > 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No models matching "{searchQuery}"
          </p>
        )}

      {/* No results (Versions) */}
      {viewMode === "versions" &&
        sortedVersions.length === 0 &&
        allVersions.length > 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No versions match the active metrics, search or stage filters.
          </p>
        )}

      {/* Summary */}
      {modelsQuery.isSuccess && models.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {viewMode === "models"
            ? `${filteredModels.length} of ${models.length} model${models.length !== 1 ? "s" : ""} shown`
            : `${sortedVersions.length} of ${allVersions.length} version${allVersions.length !== 1 ? "s" : ""} shown`}
        </p>
      )}

      {/* Model details popup Dialog */}
      {selectedModel && (
        <ModelDetailsDialog
          modelName={selectedModel}
          open={!!selectedModel}
          onOpenChange={(open) => !open && setSelectedModel(null)}
        />
      )}

      {/* Deploy Popup Dialog */}
      {deployTarget && (
        <DeployDialog
          modelName={deployTarget.name}
          version={deployTarget.version}
          open={!!deployTarget}
          onOpenChange={(open) => {
            if (!open) setDeployTarget(null)
          }}
        />
      )}
    </div>
  )
}
