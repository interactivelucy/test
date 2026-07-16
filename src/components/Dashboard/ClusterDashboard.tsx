import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { LucideIcon } from "lucide-react"
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Circle,
  Cpu,
  ExternalLink,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
  Play,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Users,
} from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useState } from "react"

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
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { clearAuthAndRedirect, isAuthErrorStatus } from "@/lib/auth"
import {
  absoluteBrowserUrl,
  browserServiceOpenUrl,
  browserServiceUrl,
  type DashboardServiceLinkTarget,
  getDashboardRuntimeConfig,
  getRayAddressRisk,
  type ServiceTestTarget,
  testDashboardService,
} from "@/lib/dashboardRuntimeConfig"
import { cn } from "@/lib/utils"
import {
  fetchRayClusterData,
  formatBytes,
  getRayRefreshInterval,
  type RayActor,
  type RayClusterData,
  type RayJob,
  type RayNode,
  type RayResource,
  resolveRayDashboardFetchUrl,
} from "./rayClusterData"

type ClusterStatus = "unknown" | "healthy" | "unhealthy" | "inactive"
type ClusterTab = "overview" | "nodes" | "actors" | "jobs" | "resources"

type Cluster = {
  id: string
  name: string
  ray_address: string
  dashboard_url: string | null
  grafana_url: string | null
  prometheus_url: string | null
  mlflow_url: string | null
  status: ClusterStatus
  created_at: string
  last_health_check_at: string | null
}

type ClusterList = {
  clusters: Cluster[]
  total: number
}

type ClusterCreate = {
  name: string
  ray_address: string
  dashboard_url?: string
  grafana_url?: string
  prometheus_url?: string
  mlflow_url?: string
}

type ClusterHealth = {
  cluster_id: string
  status: ClusterStatus
  ray_reachable: boolean
  dashboard_reachable: boolean
  checked_at: string
}

type ClusterForm = ClusterCreate

type ClusterPreflightIssue = {
  detail: string
  label: string
}

function defaultClusterForm(): ClusterForm {
  return {
    dashboard_url: "",
    grafana_url: "",
    mlflow_url: "",
    name: "",
    prometheus_url: "",
    ray_address: "",
  }
}

const clusterTabs: Array<{
  id: ClusterTab
  label: string
  icon: LucideIcon
}> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "nodes", label: "Nodes", icon: Server },
  { id: "actors", label: "Actors", icon: Users },
  { id: "jobs", label: "Jobs", icon: Boxes },
  { id: "resources", label: "Resources", icon: Gauge },
]

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
    const detail = body?.detail
    const validationDetails = formatValidationDetails(body?.error?.details)
    const message =
      validationDetails ||
      body?.error?.message ||
      (typeof detail === "string"
        ? detail
        : detail?.message || response.statusText || "Request failed")
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

function formatValidationDetails(details: unknown) {
  if (!Array.isArray(details) || details.length === 0) {
    return null
  }

  return details
    .map((detail) => {
      if (!detail || typeof detail !== "object") {
        return null
      }

      const record = detail as Record<string, unknown>
      const field = Array.isArray(record.loc)
        ? record.loc.filter((part) => part !== "body").join(".")
        : "field"
      const message =
        typeof record.msg === "string" ? record.msg : "Invalid value"

      return field ? `${field}: ${message}` : message
    })
    .filter(Boolean)
    .join("; ")
}

function compactPayload(form: ClusterForm): ClusterCreate {
  return {
    name: form.name.trim(),
    ray_address: form.ray_address.trim(),
    dashboard_url: optionalAbsoluteUrl(form.dashboard_url),
    grafana_url: optionalAbsoluteUrl(form.grafana_url),
    prometheus_url: optionalAbsoluteUrl(form.prometheus_url),
    mlflow_url: optionalAbsoluteUrl(form.mlflow_url),
  }
}

function optionalAbsoluteUrl(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? absoluteBrowserUrl(trimmed) : undefined
}

async function checkClusterReachability(
  form: ClusterForm,
): Promise<ClusterPreflightIssue[]> {
  const runtimeConfig = getDashboardRuntimeConfig()
  const testConfig = {
    ...runtimeConfig,
    grafanaBaseUrl: form.grafana_url?.trim() || runtimeConfig.grafanaBaseUrl,
    mlflowBaseUrl: form.mlflow_url?.trim() || runtimeConfig.mlflowBaseUrl,
    prometheusBaseUrl:
      form.prometheus_url?.trim() || runtimeConfig.prometheusBaseUrl,
    rayDashboardBaseUrl:
      form.dashboard_url?.trim() || runtimeConfig.rayDashboardBaseUrl,
  }

  const targets: Array<{
    field?: string
    label: string
    target: ServiceTestTarget
  }> = [
    {
      field: form.dashboard_url,
      label: "Ray Dashboard",
      target: "rayDashboard",
    },
    {
      field: form.prometheus_url,
      label: "Prometheus",
      target: "prometheus",
    },
    {
      field: form.grafana_url,
      label: "Grafana",
      target: "grafana",
    },
    {
      field: form.mlflow_url,
      label: "MLflow",
      target: "mlflow",
    },
  ]

  const issues: ClusterPreflightIssue[] = []
  const rayAddressRisk = getRayAddressRisk(
    form.ray_address,
    runtimeConfig.preset,
  )

  if (rayAddressRisk) {
    issues.push({
      detail: rayAddressRisk,
      label: "Ray address",
    })
  }

  for (const item of targets) {
    if (!item.field?.trim()) continue

    const result = await testDashboardService(item.target, testConfig)
    if (result.status === "failed") {
      issues.push({
        detail: result.detail,
        label: item.label,
      })
    }
  }

  return issues
}

export function ClusterDashboard() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ClusterForm>(() => defaultClusterForm())
  const [error, setError] = useState<string | null>(null)
  const [isCheckingReachability, setIsCheckingReachability] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<ClusterCreate | null>(
    null,
  )
  const [preflightIssues, setPreflightIssues] = useState<
    ClusterPreflightIssue[]
  >([])
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
    null,
  )
  const [activeTab, setActiveTab] = useState<ClusterTab>("overview")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const clustersQuery = useQuery({
    queryKey: ["clusters"],
    queryFn: () => apiRequest<ClusterList>("/api/v1/clusters"),
  })

  const createCluster = useMutation({
    mutationFn: (payload: ClusterCreate) =>
      apiRequest<Cluster>("/api/v1/clusters", {
        body: JSON.stringify(payload),
        method: "POST",
      }),
    onError: (err) => setError(err.message),
    onSuccess: async (cluster) => {
      setError(null)
      setPendingPayload(null)
      setPreflightIssues([])
      setForm(defaultClusterForm())
      setSelectedClusterId(cluster.id)
      setIsCreateOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["clusters"] })
    },
  })

  const startLocalCluster = useMutation({
    mutationFn: (payload: { name: string }) =>
      apiRequest<Cluster>("/api/v1/clusters/local/start", {
        body: JSON.stringify(payload),
        method: "POST",
      }),
    onError: (err) => setError(err.message),
    onSuccess: async (cluster) => {
      setError(null)
      setPendingPayload(null)
      setPreflightIssues([])
      setForm(defaultClusterForm())
      setSelectedClusterId(cluster.id)
      setIsCreateOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["clusters"] })
    },
  })

  const healthCheck = useMutation({
    mutationFn: (clusterId: string) =>
      apiRequest<ClusterHealth>(`/api/v1/clusters/${clusterId}/health`),
    onError: (err) => setError(err.message),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["clusters"] })
    },
  })

  const deleteCluster = useMutation({
    mutationFn: (clusterId: string) =>
      apiRequest<void>(`/api/v1/clusters/${clusterId}`, { method: "DELETE" }),
    onError: (err) => setError(err.message),
    onSuccess: async () => {
      setError(null)
      setIsDeleteOpen(false)
      setSelectedClusterId(null)
      await queryClient.invalidateQueries({ queryKey: ["clusters"] })
    },
  })

  const clusters = clustersQuery.data?.clusters ?? []
  const selectedCluster =
    clusters.find((cluster) => cluster.id === selectedClusterId) ??
    clusters[0] ??
    null

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = compactPayload(form)
    if (!payload.name || !payload.ray_address) {
      setError("Cluster name and Ray address are required.")
      return
    }

    setError(null)
    setPendingPayload(null)
    setPreflightIssues([])
    setIsCheckingReachability(true)
    const issues = await checkClusterReachability(form)
    setIsCheckingReachability(false)

    if (issues.length > 0) {
      setPendingPayload(payload)
      setPreflightIssues(issues)
      return
    }

    createCluster.mutate(payload)
  }

  const handleCreateAnyway = () => {
    if (!pendingPayload) return
    setError(null)
    setPreflightIssues([])
    createCluster.mutate(pendingPayload)
  }

  return (
    <div className="space-y-5">
      <ClusterPageHeader
        isRefreshing={clustersQuery.isFetching}
        onAddCluster={() => setIsCreateOpen(true)}
        onRefresh={() => clustersQuery.refetch()}
        total={clustersQuery.data?.total ?? clusters.length}
      />

      <ClusterCreateDialog
        form={form}
        isCheckingReachability={isCheckingReachability}
        isOpen={isCreateOpen}
        isPending={createCluster.isPending}
        onCreateAnyway={handleCreateAnyway}
        onChange={(next) => {
          setPendingPayload(null)
          setPreflightIssues([])
          setForm((current) => ({ ...current, ...next }))
        }}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) {
            setPendingPayload(null)
            setPreflightIssues([])
          }
        }}
        onSubmit={handleSubmit}
        preflightIssues={preflightIssues}
        onStartLocal={() => {
          setIsNameDialogOpen(true)
        }}
        isStartingLocal={startLocalCluster.isPending}
      />

      <LocalClusterNameDialog
        isOpen={isNameDialogOpen}
        onOpenChange={setIsNameDialogOpen}
        defaultName={form.name || "Local Ray Cluster"}
        isPending={startLocalCluster.isPending}
        onConfirm={(name) => {
          setIsNameDialogOpen(false)
          startLocalCluster.mutate({ name })
        }}
      />

      <DeleteConfirmDialog
        isOpen={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        clusterName={selectedCluster?.name || ""}
        isPending={deleteCluster.isPending}
        onConfirm={() => {
          if (selectedCluster) {
            deleteCluster.mutate(selectedCluster.id)
          }
        }}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Cluster request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <ClusterSummaryPanel
          clusters={clusters}
          healthPendingId={
            healthCheck.isPending ? healthCheck.variables : undefined
          }
          isLoading={clustersQuery.isLoading}
          onAddCluster={() => setIsCreateOpen(true)}
          onHealthCheck={(clusterId) => healthCheck.mutate(clusterId)}
          onSelect={setSelectedClusterId}
          selectedCluster={selectedCluster}
          selectedId={selectedCluster?.id ?? null}
          onDeleteClick={() => setIsDeleteOpen(true)}
        />

        <RayRuntimePanel
          activeTab={activeTab}
          cluster={selectedCluster}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  )
}

function ClusterPageHeader({
  isRefreshing,
  onAddCluster,
  onRefresh,
  total,
}: {
  isRefreshing: boolean
  onAddCluster: () => void
  onRefresh: () => void
  total: number
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Server className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">Clusters</h1>
          <p className="text-sm text-muted-foreground">
            Register Ray endpoints and keep their monitoring links together.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{total} registered</Badge>
        <Button onClick={onAddCluster} size="sm">
          <Plus className="size-4" />
          Add Cluster
        </Button>
        <Button
          disabled={isRefreshing}
          onClick={onRefresh}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>
    </div>
  )
}

function ClusterCreateDialog({
  form,
  isCheckingReachability,
  isOpen,
  isPending,
  onCreateAnyway,
  onChange,
  onOpenChange,
  onSubmit,
  preflightIssues,
  onStartLocal,
  isStartingLocal,
}: {
  form: ClusterForm
  isCheckingReachability: boolean
  isOpen: boolean
  isPending: boolean
  onCreateAnyway: () => void
  onChange: (next: Partial<ClusterForm>) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  preflightIssues: ClusterPreflightIssue[]
  onStartLocal: () => void
  isStartingLocal: boolean
}) {
  const isBusy = isPending || isCheckingReachability || isStartingLocal

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Cluster</DialogTitle>
          <DialogDescription>
            Save the backend Ray address and browser-facing dashboard links.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-primary/20 p-4 bg-primary/5">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Server className="size-4 text-primary" />
              Local Ray Cluster Helper
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Automatically spin up a new local Ray head cluster on a free port,
              sync config files, and register it here.
            </p>
            <Button
              className="w-full mt-1.5"
              disabled={isBusy}
              onClick={onStartLocal}
              type="button"
              variant="secondary"
            >
              {isStartingLocal ? (
                <RefreshCw className="mr-2 size-4 animate-spin text-primary" />
              ) : (
                <Play className="mr-2 size-4 text-primary fill-primary" />
              )}
              {isStartingLocal
                ? "Launching cluster..."
                : "Launch & Register Local Cluster"}
            </Button>
          </div>
          <Field label="Name">
            <Input
              onChange={(event) => onChange({ name: event.target.value })}
              placeholder="Local Ray"
              value={form.name}
            />
          </Field>

          <Field label="Ray address">
            <Input
              onChange={(event) =>
                onChange({ ray_address: event.target.value })
              }
              placeholder="http://host.docker.internal:8265"
              value={form.ray_address}
            />
          </Field>

          {preflightIssues.length > 0 ? (
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-100">
              <AlertTriangle />
              <AlertTitle>Review cluster endpoints</AlertTitle>
              <AlertDescription className="space-y-3">
                <div className="space-y-1">
                  {preflightIssues.map((issue) => (
                    <p key={issue.label}>
                      <span className="font-medium">{issue.label}:</span>{" "}
                      {issue.detail}
                    </p>
                  ))}
                </div>
                <Button
                  className="w-full"
                  disabled={isBusy}
                  onClick={onCreateAnyway}
                  type="button"
                  variant="outline"
                >
                  Create anyway
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <Button className="w-full" disabled={isBusy} type="submit">
            {isBusy ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {isCheckingReachability ? "Checking services" : "Add cluster"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface LocalClusterNameDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string) => void
  isPending: boolean
  defaultName: string
}

function LocalClusterNameDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  isPending,
  defaultName,
}: LocalClusterNameDialogProps) {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (isOpen) {
      setName(defaultName)
    }
  }, [isOpen, defaultName])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onConfirm(name.trim())
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Launch Local Cluster</DialogTitle>
          <DialogDescription>
            Enter a unique name for the local Ray head node cluster.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="local-cluster-name">Cluster Name</Label>
            <Input
              id="local-cluster-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Local Ray Cluster"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Launching..." : "Launch"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface DeleteConfirmDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
  clusterName: string
}

function DeleteConfirmDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  isPending,
  clusterName,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            Delete Cluster
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the cluster{" "}
            <strong>{clusterName}</strong>? This action is permanent and will
            delete all related experiments and usage records.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ClusterSummaryPanel({
  clusters,
  healthPendingId,
  isLoading,
  onAddCluster,
  onHealthCheck,
  onSelect,
  selectedCluster,
  selectedId,
  onDeleteClick,
}: {
  clusters: Cluster[]
  healthPendingId?: string
  isLoading: boolean
  onAddCluster: () => void
  onHealthCheck: (clusterId: string) => void
  onSelect: (clusterId: string) => void
  selectedCluster: Cluster | null
  selectedId: string | null
  onDeleteClick: () => void
}) {
  return (
    <Card className="rounded-lg xl:sticky xl:top-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Cluster Summary</CardTitle>
            <CardDescription>
              Active Ray runtime context for this tab.
            </CardDescription>
          </div>
          <Button
            aria-label="Add cluster"
            onClick={onAddCluster}
            size="sm"
            title="Add cluster"
            variant="outline"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="rounded-lg border bg-background/60 p-6 text-sm text-muted-foreground">
            Loading clusters...
          </div>
        ) : clusters.length === 0 ? (
          <div className="space-y-4 rounded-lg border bg-background/60 p-6 text-sm text-muted-foreground">
            <p>No clusters registered yet.</p>
            <Button className="w-full" onClick={onAddCluster} size="sm">
              <Plus className="size-4" />
              Add Cluster
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <Field label="Active cluster">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => onSelect(event.target.value)}
                value={selectedId ?? ""}
              >
                {clusters.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.name}
                  </option>
                ))}
              </select>
            </Field>

            {selectedCluster ? (
              <div className="space-y-5">
                <div className="rounded-lg border bg-primary/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {selectedCluster.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {selectedCluster.id}
                      </p>
                    </div>
                    <ClusterStatusBadge status={selectedCluster.status} />
                  </div>
                </div>

                <div className="space-y-3">
                  <SummaryDetail
                    label="Ray address"
                    value={selectedCluster.ray_address}
                  />
                  <SummaryDetail
                    label="Dashboard URL"
                    value={selectedCluster.dashboard_url || "Settings fallback"}
                  />
                  <SummaryDetail
                    label="Created"
                    value={formatTimestamp(selectedCluster.created_at)}
                  />
                  <SummaryDetail
                    label="Last health check"
                    value={
                      selectedCluster.last_health_check_at
                        ? formatTimestamp(selectedCluster.last_health_check_at)
                        : "Not checked"
                    }
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Service Links</p>
                  <ToolLinks cluster={selectedCluster} />
                </div>

                <div className="space-y-2">
                  <Button
                    className="w-full"
                    disabled={healthPendingId === selectedCluster.id}
                    onClick={() => onHealthCheck(selectedCluster.id)}
                    size="sm"
                    variant="outline"
                  >
                    <RefreshCw
                      className={cn(
                        "size-4",
                        healthPendingId === selectedCluster.id &&
                          "animate-spin",
                      )}
                    />
                    Check Health
                  </Button>

                  <Button
                    className="w-full border-destructive/30 hover:border-destructive hover:bg-destructive/10 text-destructive"
                    onClick={onDeleteClick}
                    size="sm"
                    variant="outline"
                  >
                    <Trash2 className="size-4" />
                    Delete Cluster
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ClusterStatusBadge({ status }: { status: ClusterStatus }) {
  const isHealthy = status === "healthy"
  const isUnhealthy = status === "unhealthy"

  return (
    <Badge
      className={cn(
        isHealthy && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
        isUnhealthy && "border-red-500/40 bg-red-500/10 text-red-400",
        status === "unknown" &&
          "border-slate-500/40 bg-slate-500/10 text-slate-300",
      )}
      variant="outline"
    >
      {isHealthy ? <CheckCircle2 /> : <Activity />}
      {status}
    </Badge>
  )
}

function SummaryDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-all text-sm">{value}</p>
    </div>
  )
}

function ToolLinks({ cluster }: { cluster: Cluster }) {
  const runtimeConfig = getDashboardRuntimeConfig()
  const links = [
    [
      "Ray",
      "rayDashboard",
      cluster.dashboard_url ||
        (cluster.ray_address?.startsWith("http")
          ? cluster.ray_address
          : null) ||
        runtimeConfig.rayDashboardBaseUrl,
    ],
    ["Grafana", "grafana", cluster.grafana_url || runtimeConfig.grafanaBaseUrl],
    [
      "Prometheus",
      "prometheus",
      cluster.prometheus_url || runtimeConfig.prometheusBaseUrl,
    ],
    ["MLflow", "mlflow", cluster.mlflow_url || runtimeConfig.mlflowBaseUrl],
  ].filter((link): link is [string, DashboardServiceLinkTarget, string] =>
    Boolean(link[2]),
  )

  if (links.length === 0) {
    return <span className="text-sm text-muted-foreground">No links</span>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {links.map(([label, target, href]) => (
        <a
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          href={browserServiceOpenUrl(target, href) ?? href}
          key={label}
          rel="noreferrer"
          target="_blank"
        >
          {label}
          <ExternalLink className="size-3" />
        </a>
      ))}
    </div>
  )
}

function getRayRuntimeSource(
  cluster: Cluster | null,
  settingsFallbackUrl: string,
) {
  if (cluster?.dashboard_url) {
    return {
      label: "Cluster URL",
      url: cluster.dashboard_url,
    }
  }

  if (cluster?.ray_address) {
    return {
      label: "Cluster Ray address",
      url: cluster.ray_address,
    }
  }

  return {
    label: "Settings fallback",
    url: settingsFallbackUrl,
  }
}

function RayRuntimePanel({
  activeTab,
  cluster,
  onTabChange,
}: {
  activeTab: ClusterTab
  cluster: Cluster | null
  onTabChange: (tab: ClusterTab) => void
}) {
  const runtimeConfig = getDashboardRuntimeConfig()
  const runtimeSource = getRayRuntimeSource(
    cluster,
    runtimeConfig.rayDashboardBaseUrl,
  )
  const dashboardUrl = runtimeSource.url
  const effectiveDashboardUrl = dashboardUrl
    ? resolveRayDashboardFetchUrl(dashboardUrl)
    : ""
  const rayQuery = useQuery({
    enabled: Boolean(cluster && dashboardUrl),
    queryFn: () => fetchRayClusterData(dashboardUrl),
    queryKey: ["ray-cluster", cluster?.id, dashboardUrl],
    refetchInterval: getRayRefreshInterval(),
    retry: false,
  })

  if (!cluster) {
    return (
      <Card className="rounded-lg">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Register a cluster to inspect Ray runtime details.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Ray Runtime</CardTitle>
            <Badge variant="outline">{runtimeSource.label}</Badge>
          </div>
          <CardDescription>
            {cluster.name} - {effectiveDashboardUrl || "No Ray URL configured"}
          </CardDescription>
          {dashboardUrl && dashboardUrl !== effectiveDashboardUrl ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Source: {browserServiceUrl("rayDashboard", dashboardUrl)}
            </p>
          ) : null}
        </div>
        <Button
          disabled={rayQuery.isFetching}
          onClick={() => rayQuery.refetch()}
          size="sm"
          variant="outline"
        >
          <RefreshCw
            className={cn("size-4", rayQuery.isFetching && "animate-spin")}
          />
          Refresh Ray
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <RaySummary data={rayQuery.data} error={rayQuery.error} />

        <div className="flex flex-wrap gap-2">
          {clusterTabs.map((tab) => (
            <Button
              className="h-8 gap-1.5 rounded-md px-3"
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              size="sm"
              variant={activeTab === tab.id ? "default" : "outline"}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </Button>
          ))}
        </div>

        {rayQuery.error ? <ClusterUnavailable error={rayQuery.error} /> : null}
        {!rayQuery.error && rayQuery.data?.isStale ? (
          <StaleSnapshotNotice data={rayQuery.data} />
        ) : null}
        {!rayQuery.error && rayQuery.isLoading ? <ClusterLoading /> : null}
        {!rayQuery.error && !rayQuery.isLoading && rayQuery.data ? (
          <ClusterTabContent data={rayQuery.data} tab={activeTab} />
        ) : null}
      </CardContent>
    </Card>
  )
}

function RaySummary({
  data,
  error,
}: {
  data?: RayClusterData
  error: Error | null
}) {
  const status =
    error || data?.isStale
      ? "Disconnected"
      : (data?.clusterStatus ?? "Checking")

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <RuntimeTile label="Status" value={status} />
      <RuntimeTile label="Nodes" value={data?.totals.nodes ?? 0} />
      <RuntimeTile label="Actors" value={data?.totals.actors ?? 0} />
      <RuntimeTile label="Jobs" value={data?.totals.jobs ?? 0} />
      <RuntimeTile
        label="CPU"
        value={`${Math.round(data?.totals.cpuUsagePercent ?? 0)}%`}
      />
      <RuntimeTile label="Memory" value={formatMemorySummary(data)} />
      {data?.isStale ? (
        <div className="md:col-span-2 xl:col-span-6">
          <RuntimeTile
            label="Last Seen"
            value={formatTimestamp(data.fetchedAt)}
          />
        </div>
      ) : null}
    </div>
  )
}

function ClusterTabContent({
  data,
  tab,
}: {
  data: RayClusterData
  tab: ClusterTab
}) {
  if (tab === "nodes") return <NodesView nodes={data.nodes} />
  if (tab === "actors") return <ActorsView actors={data.actors} />
  if (tab === "jobs") return <JobsView jobs={data.jobs} />
  if (tab === "resources") return <ResourcesView resources={data.resources} />
  return <OverviewView data={data} />
}

function OverviewView({ data }: { data: RayClusterData }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active Nodes" value={data.activeNodes} />
        <MetricCard label="Pending Nodes" value={data.pendingNodes} />
        <MetricCard label="Failed Nodes" value={data.failedNodes} />
        <div className="rounded-lg border bg-background/60 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Cluster Status
          </p>
          <div className="mt-3 flex items-center gap-3 text-2xl font-semibold">
            <Circle
              className={
                data.clusterStatus === "Active"
                  ? "size-6 fill-emerald-500 text-emerald-500"
                  : "size-6 fill-rose-500 text-rose-500"
              }
            />
            {data.clusterStatus}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <GaugeCard
          detail="Average across alive nodes"
          icon={Cpu}
          label="CPU Usage"
          value={data.totals.cpuUsagePercent}
        />
        <GaugeCard
          detail={`${formatBytes(data.totals.memoryUsedBytes)} / ${formatBytes(
            data.totals.memoryTotalBytes,
          )}`}
          icon={MemoryStick}
          label="Memory Usage"
          value={data.totals.memoryUsagePercent}
        />
        <GaugeCard
          detail={formatVramSummary(data)}
          icon={Gauge}
          label={data.totals.gpuSummary}
          value={data.totals.gpuUsagePercent}
        />
      </div>
    </div>
  )
}

function NodesView({ nodes }: { nodes: RayNode[] }) {
  if (!nodes.length) {
    return <EmptyState message="No nodes found from the Ray Dashboard." />
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Host</TableHead>
              <TableHead>State</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>Memory</TableHead>
              <TableHead>Disk</TableHead>
              <TableHead>GPUs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((node) => (
              <TableRow key={node.id}>
                <TableCell className="font-medium">{node.hostname}</TableCell>
                <TableCell>
                  <RayStatusBadge status={node.state} />
                </TableCell>
                <TableCell>{node.ip}</TableCell>
                <TableCell>{formatPercent(node.cpuUsagePercent)}</TableCell>
                <TableCell>
                  {node.memoryTotalBytes
                    ? `${formatBytes(node.memoryUsedBytes)} / ${formatBytes(
                        node.memoryTotalBytes,
                      )}`
                    : "N/A"}
                </TableCell>
                <TableCell>{formatPercent(node.diskUsagePercent)}</TableCell>
                <TableCell>{node.gpuCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3">
        {nodes.map((node) => (
          <details
            className="rounded-lg border bg-background/60"
            key={node.id}
            open
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 border-b px-4 py-3">
              <Circle
                className={
                  node.state.toUpperCase() === "ALIVE"
                    ? "size-4 fill-emerald-400 text-emerald-400"
                    : "size-4 fill-amber-400 text-amber-400"
                }
              />
              <span className="font-semibold">
                {node.hostname} ({node.ip})
              </span>
            </summary>
            <div className="space-y-6 p-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <NodeMetric
                  label="CPU Usage"
                  value={formatPercent(node.cpuUsagePercent)}
                />
                <NodeMetric
                  label="Memory"
                  value={formatPercent(node.memoryUsagePercent)}
                />
                <NodeMetric
                  label="Disk"
                  value={formatPercent(node.diskUsagePercent)}
                />
                <NodeMetric label="GPUs" value={node.gpuCount} />
              </div>

              {node.gpus.length ? (
                <div className="space-y-3">
                  <h2 className="font-semibold tracking-normal">GPU Details</h2>
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>GPU</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Utilization</TableHead>
                          <TableHead>Memory Used</TableHead>
                          <TableHead>Memory Total</TableHead>
                          <TableHead>Temperature</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {node.gpus.map((gpu) => (
                          <TableRow key={`${node.id}-gpu-${gpu.index}`}>
                            <TableCell>{gpu.index}</TableCell>
                            <TableCell className="font-medium">
                              {gpu.name}
                            </TableCell>
                            <TableCell>
                              {gpu.utilizationPercent.toFixed(1)}%
                            </TableCell>
                            <TableCell>
                              {gpu.memoryUsedMegabytes.toFixed(0)} MB
                            </TableCell>
                            <TableCell>
                              {gpu.memoryTotalMegabytes.toFixed(0)} MB
                            </TableCell>
                            <TableCell>
                              {gpu.temperatureCelsius === null
                                ? "N/A"
                                : `${gpu.temperatureCelsius} C`}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <DetailValue label="Node ID" value={node.id} />
                <DetailValue label="CPU Cores" value={node.totalCpu || "N/A"} />
                <DetailValue label="IP Address" value={node.ip} />
                <DetailValue
                  label="Memory"
                  value={
                    node.memoryTotalBytes
                      ? formatBytes(node.memoryTotalBytes)
                      : "N/A"
                  }
                />
                <DetailValue label="State" value={node.state} />
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

function ActorsView({ actors }: { actors: RayActor[] }) {
  if (!actors.length) {
    return <EmptyState message="No actors are currently reported by Ray." />
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Alive"
          value={actors.filter((actor) => actor.state === "ALIVE").length}
        />
        <MetricCard
          label="Pending"
          value={actors.filter((actor) => actor.state === "PENDING").length}
        />
        <MetricCard
          label="Dead"
          value={actors.filter((actor) => actor.state === "DEAD").length}
        />
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-lg border bg-background/60">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-xs font-semibold uppercase tracking-wider shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Actor ID
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-xs font-semibold uppercase tracking-wider shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Class
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-xs font-semibold uppercase tracking-wider shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                State
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-xs font-semibold uppercase tracking-wider shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                PID
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-xs font-semibold uppercase tracking-wider shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Node
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-xs font-semibold uppercase tracking-wider shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Restarts
              </th>
            </tr>
          </thead>
          <tbody>
            {actors.map((actor) => (
              <tr
                className="transition-colors hover:bg-muted/40 [&>td]:border-t"
                key={actor.id}
              >
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  {actor.id}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {actor.actorClass}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <RayStatusBadge status={actor.state} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{actor.pid}</td>
                <td className="px-4 py-3 whitespace-nowrap">{actor.nodeId}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {actor.restarts}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function JobsView({ jobs }: { jobs: RayJob[] }) {
  if (!jobs.length) {
    return (
      <EmptyState message="No Ray jobs found, or the Jobs API is unavailable." />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Running"
          value={jobs.filter((job) => job.status === "RUNNING").length}
        />
        <MetricCard
          label="Succeeded"
          value={jobs.filter((job) => job.status === "SUCCEEDED").length}
        />
        <MetricCard
          label="Failed"
          value={jobs.filter((job) => job.status === "FAILED").length}
        />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entrypoint</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Driver PID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">{job.id}</TableCell>
                <TableCell>
                  <RayStatusBadge status={job.status} />
                </TableCell>
                <TableCell>{job.entrypoint}</TableCell>
                <TableCell>{job.duration}</TableCell>
                <TableCell>{job.driverPid}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function ResourcesView({ resources }: { resources: RayResource[] }) {
  if (!resources.length) {
    return (
      <EmptyState message="No resource allocation details are available." />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {resources.map((resource) => (
        <div
          className="rounded-lg border bg-background/60 p-4"
          key={resource.name}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="font-semibold">{resource.name}</p>
            <HardDrive className="size-4 text-primary" />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${resource.usagePercent}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <ResourceValue label="Total" value={resource.total} />
            <ResourceValue label="Used" value={resource.used} />
            <ResourceValue label="Available" value={resource.available} />
          </div>
        </div>
      ))}
    </div>
  )
}

function GaugeCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string
  icon: LucideIcon
  label: string
  value: number
}) {
  const boundedValue = Math.max(0, Math.min(value, 100))

  return (
    <div className="rounded-lg border bg-background/70 p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
      </div>
      <div className="flex min-h-36 items-center justify-center">
        <div className="relative size-32 overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 h-16 overflow-hidden">
            <div
              className="size-32 rounded-full"
              style={{
                background: `conic-gradient(from 270deg, #16a34a 0deg, #16a34a ${
                  (boundedValue / 100) * 180
                }deg, var(--muted) ${
                  (boundedValue / 100) * 180
                }deg, var(--muted) 180deg, transparent 180deg)`,
              }}
            />
          </div>
          <div className="absolute inset-x-4 bottom-0 h-12 rounded-t-full bg-background" />
          <div className="absolute inset-x-0 bottom-3 text-center text-2xl font-semibold">
            {Math.round(boundedValue)}%
          </div>
        </div>
      </div>
    </div>
  )
}

function ClusterUnavailable({ error }: { error: Error }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 text-amber-300" />
        <div>
          <h2 className="font-semibold tracking-normal">
            Ray Dashboard Unavailable
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    </div>
  )
}

function StaleSnapshotNotice({ data }: { data: RayClusterData }) {
  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 text-sky-300" />
        <div>
          <h2 className="font-semibold tracking-normal">
            Showing Last Known Cluster State
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ray is currently unreachable, so this is the last successful
            snapshot from {formatTimestamp(data.fetchedAt)}.
          </p>
        </div>
      </div>
    </div>
  )
}

function ClusterLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {["Active Nodes", "Pending Nodes", "Failed Nodes", "Status"].map(
        (label) => (
          <div
            className="min-h-28 rounded-lg border bg-background/60 p-4"
            key={label}
          >
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <div className="mt-4 h-8 w-24 animate-pulse rounded bg-muted" />
          </div>
        ),
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-lg border bg-muted/30 p-6 text-center">
      <div>
        <Network className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-3 font-medium">Nothing to show yet</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function RuntimeTile({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/60 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold">{value}</p>
    </div>
  )
}

function RayStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase()
  const isGood = ["ACTIVE", "ALIVE", "RUNNING", "SUCCEEDED"].includes(
    normalized,
  )
  const isBad = ["DEAD", "FAILED", "ERROR"].includes(normalized)

  return (
    <Badge
      className={
        isGood
          ? "border-emerald-500/30 text-emerald-300"
          : isBad
            ? "border-rose-500/30 text-rose-300"
            : "border-border text-muted-foreground"
      }
      variant="outline"
    >
      {status}
    </Badge>
  )
}

function ResourceValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{formatResource(value)}</p>
    </div>
  )
}

function NodeMetric({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function DetailValue({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="shrink-0 font-semibold">{label}:</span>
      <span className="truncate text-muted-foreground">{value}</span>
    </div>
  )
}

function formatPercent(value: number | null) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "N/A"
}

function formatResource(value: number) {
  return value > 1024 ? formatBytes(value) : Number(value.toFixed(2)).toString()
}

function formatMemorySummary(data?: RayClusterData) {
  if (!data || !data.totals.memoryTotalBytes) return "N/A"

  return `${formatBytes(data.totals.memoryUsedBytes)} / ${formatBytes(
    data.totals.memoryTotalBytes,
  )}`
}

function formatVramSummary(data?: RayClusterData) {
  if (!data || !data.totals.gpuVramTotalMegabytes) return "N/A"

  return `${formatMegabytes(data.totals.gpuVramUsedMegabytes)} / ${formatMegabytes(
    data.totals.gpuVramTotalMegabytes,
  )} (${Math.round(data.totals.gpuVramUsagePercent)}%)`
}

function formatMegabytes(value: number) {
  return formatBytes(value * 1024 * 1024)
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"
  return date.toLocaleString()
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
