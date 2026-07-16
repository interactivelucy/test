import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Box,
  Clock,
  Cpu,
  Gauge,
  ImageIcon,
  Loader2,
  MemoryStick,
  Play,
  RadioTower,
  RefreshCw,
  Server,
  Trash2,
  Upload,
  Zap,
} from "lucide-react"
import { useRef, useState } from "react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { clearAuthAndRedirect, isAuthErrorStatus } from "@/lib/auth"

export const Route = createFileRoute("/_layout/serving")({
  component: ServingPage,
  head: () => ({
    meta: [{ title: "Serving - FedPilot Dashboard" }],
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

type DeploymentInfo = {
  engine_name: string
  model_name: string
  version: string
  engine: string
  port: number
  status: string
  cluster_id?: string
  cluster_name?: string
}

type DeploymentList = {
  deployments: DeploymentInfo[]
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

type ServingMetricSeries = {
  name: string
  labels: Record<string, string>
  values: Array<{ timestamp: string; value: number | null }>
}

type ServingMetrics = {
  model_name: string
  version: string
  latency_p50_ms: number | null
  latency_p95_ms: number | null
  latency_p99_ms: number | null
  throughput_rps: number | null
  memory_mb: number | null
  request_count: number | null
  error_count: number | null
  uptime_s: number | null
  series: ServingMetricSeries[]
  fetched_at: string | null
}

type PredictResponse = {
  model_name: string
  version: string
  result: unknown
  latency_ms: number | null
}

// ---------------------------------------------------------------------------
// Metric gauge card
// ---------------------------------------------------------------------------

function MetricGauge({
  label,
  value,
  unit,
  icon: Icon,
  color,
}: {
  label: string
  value: number | null | undefined
  unit: string
  icon: typeof Activity
  color: string
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`size-3.5 ${color}`} />
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums">
          {value != null
            ? typeof value === "number"
              ? Number.isInteger(value)
                ? value
                : value.toFixed(2)
              : value
            : "—"}
        </span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metrics panel
// ---------------------------------------------------------------------------

function ServingMetricsPanel({
  modelName,
  version,
  clusterId,
}: {
  modelName: string
  version: string
  clusterId?: string
}) {
  const metricsQuery = useQuery<ServingMetrics>({
    queryKey: ["serving-metrics", modelName, version, clusterId],
    queryFn: () => {
      const params = clusterId
        ? `?cluster_id=${encodeURIComponent(clusterId)}`
        : ""
      return apiRequest<ServingMetrics>(
        `/api/v1/serving/deployments/${encodeURIComponent(modelName)}/${encodeURIComponent(version)}/metrics${params}`,
      )
    },
    refetchInterval: 15_000,
  })

  if (metricsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  const m = metricsQuery.data

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Metrics
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => metricsQuery.refetch()}
        >
          <RefreshCw
            className={`size-3 ${metricsQuery.isFetching ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      <MetricGauge
        label="Latency (p50)"
        value={m?.latency_p50_ms}
        unit="ms"
        icon={Gauge}
        color="text-blue-400"
      />
      <MetricGauge
        label="Latency (p95)"
        value={m?.latency_p95_ms}
        unit="ms"
        icon={Gauge}
        color="text-amber-400"
      />
      <MetricGauge
        label="Throughput"
        value={m?.throughput_rps}
        unit="req/s"
        icon={Zap}
        color="text-emerald-400"
      />
      <MetricGauge
        label="Memory"
        value={m?.memory_mb}
        unit="MB"
        icon={MemoryStick}
        color="text-purple-400"
      />
      <MetricGauge
        label="Requests"
        value={m?.request_count}
        unit="total"
        icon={Activity}
        color="text-cyan-400"
      />
      <MetricGauge
        label="Errors"
        value={m?.error_count}
        unit="total"
        icon={AlertCircle}
        color="text-red-400"
      />
      <MetricGauge
        label="Uptime"
        value={m?.uptime_s != null ? Math.round(m.uptime_s / 60) : null}
        unit="min"
        icon={Clock}
        color="text-teal-400"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inference playground
// ---------------------------------------------------------------------------

function InferencePlayground({
  modelName,
  version,
  engine,
  clusterId,
}: {
  modelName: string
  version: string
  engine: string
  clusterId?: string
}) {
  const isLLM = engine.toLowerCase().includes("llm")
  const [input, setInput] = useState(
    isLLM ? "" : JSON.stringify([[1.0, 2.0, 3.0]], null, 2),
  )
  const [chatHistory, setChatHistory] = useState<
    { role: string; content: string }[]
  >([])
  const [output, setOutput] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        // Draw to canvas and extract pixel data
        const canvas = document.createElement("canvas")
        const size = 28 // Standard for MNIST-like models
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")!
        ctx.drawImage(img, 0, 0, size, size)
        const imageData = ctx.getImageData(0, 0, size, size)
        const pixels = imageData.data

        // Convert to grayscale 2D array
        const grayscale: number[][] = []
        for (let y = 0; y < size; y++) {
          const row: number[] = []
          for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4
            // Average RGB channels
            const gray = Math.round(
              (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3,
            )
            row.push(gray)
          }
          grayscale.push(row)
        }

        setInput(JSON.stringify(grayscale, null, 0))
        setImagePreview(reader.result as string)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const predictMutation = useMutation<PredictResponse, Error>({
    mutationFn: async () => {
      let requestData
      if (isLLM) {
        const newMessage = { role: "user", content: input }
        const updatedHistory = [...chatHistory, newMessage]
        setChatHistory(updatedHistory)
        requestData = { messages: updatedHistory, max_tokens: 512 }
      } else {
        requestData = JSON.parse(input)
      }

      const res = await apiRequest<PredictResponse>("/api/v1/serving/predict", {
        method: "POST",
        body: JSON.stringify({
          model_name: modelName,
          version,
          data: requestData,
          cluster_id: clusterId,
        }),
      })

      if (isLLM && res.result && typeof res.result === "object") {
        // Simple heuristic to extract assistant message if vLLM returns standard format
        const outputText =
          (res.result as any)?.choices?.[0]?.message?.content ||
          JSON.stringify(res.result)
        setChatHistory((prev) => [
          ...prev,
          { role: "assistant", content: outputText },
        ])
        setInput("")
      }

      return res
    },
    onSuccess: (data) => {
      setOutput(JSON.stringify(data, null, 2))
    },
    onError: (err) => {
      setOutput(JSON.stringify({ error: err.message }, null, 2))
    },
  })

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Play className="size-4 text-primary" />
        Inference Playground
      </h3>

      {isLLM ? (
        <div className="flex flex-col gap-4 rounded-lg border bg-muted/10 p-4 h-96">
          <div className="flex-1 overflow-y-auto space-y-4">
            {chatHistory.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Start a conversation...
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {predictMutation.isPending && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-muted flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  input.trim() &&
                  !predictMutation.isPending
                ) {
                  predictMutation.mutate()
                }
              }}
            />
            <Button
              size="icon"
              onClick={() => predictMutation.mutate()}
              disabled={predictMutation.isPending || !input.trim()}
            >
              <Play className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Image upload area */}
          <div
            className="relative flex items-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/10 p-4 transition-colors hover:border-primary/40 hover:bg-muted/20 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const file = e.dataTransfer.files[0]
              if (file?.type.startsWith("image/")) handleImageUpload(file)
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageUpload(file)
              }}
            />
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Preview"
                className="size-16 rounded border object-contain bg-black/50"
              />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-lg border bg-muted/30">
                <ImageIcon className="size-6 text-muted-foreground/50" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">Upload Image</p>
              <p className="text-xs text-muted-foreground">
                Drag & drop or click to upload. Auto-resized to 28×28 grayscale.
              </p>
            </div>
            <Upload className="size-5 text-muted-foreground" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Request Body (JSON)
              </label>
              <textarea
                className="h-48 w-full resize-none rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
              />
            </div>

            {/* Output */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Response
              </label>
              <div className="relative h-48 overflow-auto rounded-lg border bg-muted/30 p-3">
                {output ? (
                  <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {output}
                  </pre>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Run inference to see the response
                  </div>
                )}
                {predictMutation.isPending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isLLM && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => predictMutation.mutate()}
            disabled={predictMutation.isPending}
            className="gap-1.5"
          >
            {predictMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Run Inference
          </Button>
          {predictMutation.data?.latency_ms != null && (
            <span className="text-xs text-muted-foreground">
              {predictMutation.data.latency_ms.toFixed(1)}ms
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deployment detail panel
// ---------------------------------------------------------------------------

function DeploymentDetail({ deployment }: { deployment: DeploymentInfo }) {
  const queryClient = useQueryClient()
  const [confirmUndeploy, setConfirmUndeploy] = useState(false)

  const undeployMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/v1/serving/undeploy", {
        method: "POST",
        body: JSON.stringify({
          model_name: deployment.model_name,
          version: deployment.version,
          cluster_id: deployment.cluster_id,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serving-deployments"] })
      setConfirmUndeploy(false)
    },
  })

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <Card className="rounded-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-primary/20">
                <Server className="size-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">
                  {deployment.model_name}
                </CardTitle>
                <CardDescription className="text-xs">
                  Version {deployment.version}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                {deployment.status}
              </Badge>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => setConfirmUndeploy(true)}
              >
                <Trash2 className="size-3" />
                Undeploy
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Cpu className="size-3" />
              Engine:{" "}
              <span className="font-medium text-foreground">
                {deployment.engine}
              </span>
            </span>
            {deployment.port > 0 && (
              <span className="flex items-center gap-1.5">
                <RadioTower className="size-3" />
                Port:{" "}
                <span className="font-mono font-medium text-foreground">
                  {deployment.port}
                </span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Box className="size-3" />
              Deployment:{" "}
              <span className="font-mono font-medium text-foreground">
                {deployment.engine_name}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Inference playground */}
      <Card className="rounded-lg">
        <CardContent className="pt-6">
          <InferencePlayground
            modelName={deployment.model_name}
            version={deployment.version}
            engine={deployment.engine}
            clusterId={deployment.cluster_id}
          />
        </CardContent>
      </Card>

      {/* Undeploy confirmation */}
      <Dialog open={confirmUndeploy} onOpenChange={setConfirmUndeploy}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" />
              Undeploy Model
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to undeploy{" "}
              <span className="font-semibold">
                {deployment.model_name} v{deployment.version}
              </span>
              ? This will terminate the serving engine.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmUndeploy(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => undeployMutation.mutate()}
              disabled={undeployMutation.isPending}
            >
              {undeployMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Undeploy
            </Button>
          </div>
          {undeployMutation.isError && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="size-4" />
              <AlertDescription>
                {(undeployMutation.error as Error)?.message}
              </AlertDescription>
            </Alert>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deployment sidebar item
// ---------------------------------------------------------------------------

function DeploymentCard({
  deployment,
  isSelected,
  onClick,
}: {
  deployment: DeploymentInfo
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-all duration-150 ${
        isSelected
          ? "border-primary/40 bg-primary/5 shadow-sm shadow-primary/10"
          : "border-transparent bg-muted/30 hover:border-border hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold leading-tight">
          {deployment.model_name}
        </span>
        <Badge
          variant="outline"
          className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px]"
        >
          {deployment.status}
        </Badge>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>v{deployment.version}</span>
        <span>·</span>
        <span className="truncate">{deployment.engine}</span>
        {deployment.cluster_name && (
          <>
            <span>·</span>
            <span className="truncate text-emerald-400 font-medium">
              {deployment.cluster_name}
            </span>
          </>
        )}
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function ServingPage() {
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(
    null,
  )
  const [selectedClusterFilter, setSelectedClusterFilter] =
    useState<string>("all")

  const clustersQuery = useQuery<ClusterList>({
    queryKey: ["clusters"],
    queryFn: () => apiRequest<ClusterList>("/api/v1/clusters/"),
  })
  const clusters = clustersQuery.data?.clusters || []

  const deploymentsQuery = useQuery<DeploymentList>({
    queryKey: ["serving-deployments", selectedClusterFilter],
    queryFn: () => {
      const url =
        selectedClusterFilter === "all"
          ? "/api/v1/serving/deployments"
          : `/api/v1/serving/deployments?cluster_id=${encodeURIComponent(selectedClusterFilter)}`
      return apiRequest<DeploymentList>(url)
    },
    refetchInterval: 15_000,
  })

  const deployments = deploymentsQuery.data?.deployments || []
  const selected = deployments.find((d) => d.engine_name === selectedDeployment)

  // Auto-select first deployment
  if (!selected && deployments.length > 0 && !selectedDeployment) {
    // Use timeout to avoid state update during render
    setTimeout(() => setSelectedDeployment(deployments[0].engine_name), 0)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-normal">Serving</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deployed models ready for inference. Interact and monitor serving
            metrics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedClusterFilter}
            onValueChange={setSelectedClusterFilter}
          >
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Select Ray cluster" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clusters</SelectItem>
              <SelectItem value="default">Default Cluster</SelectItem>
              {clusters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => deploymentsQuery.refetch()}
            disabled={deploymentsQuery.isFetching}
          >
            <RefreshCw
              className={`size-3.5 ${deploymentsQuery.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Loading */}
      {deploymentsQuery.isLoading && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      )}

      {/* Error */}
      {deploymentsQuery.isError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Failed to load deployments</AlertTitle>
          <AlertDescription>
            {deploymentsQuery.error?.message}
            <Button
              variant="link"
              className="ml-2 h-auto p-0 text-xs"
              onClick={() => deploymentsQuery.refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {deploymentsQuery.isSuccess && deployments.length === 0 && (
        <Card className="rounded-lg">
          <CardContent className="flex min-h-72 items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex size-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <RadioTower className="size-7" />
              </div>
              <div>
                <p className="font-medium">No active deployments</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Deploy a model from the Models tab to start serving
                  predictions.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                  asChild
                >
                  <RouterLink to="/model-tracking">
                    <ArrowRight className="size-3.5" />
                    Go to Models
                  </RouterLink>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Split layout */}
      {deployments.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Left sidebar: deployment list + metrics */}
          <div className="space-y-4 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
            {/* Deployment list */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Deployments ({deployments.length})
              </h2>
              {deployments.map((dep) => (
                <DeploymentCard
                  key={dep.engine_name}
                  deployment={dep}
                  isSelected={selectedDeployment === dep.engine_name}
                  onClick={() => setSelectedDeployment(dep.engine_name)}
                />
              ))}
            </div>

            {/* Metrics sidebar for selected deployment */}
            {selected && (
              <ServingMetricsPanel
                modelName={selected.model_name}
                version={selected.version}
                clusterId={selected.cluster_id}
              />
            )}
          </div>

          {/* Right main area */}
          <div>
            {selected ? (
              <DeploymentDetail deployment={selected} />
            ) : (
              <Card className="rounded-lg">
                <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                  Select a deployment to view details and interact
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
