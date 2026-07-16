import { useQuery } from "@tanstack/react-query"
import {
  AlertCircle,
  BarChart3,
  Bolt,
  CalendarClock,
  Database,
  ExternalLink,
  FileCog,
  FolderOpen,
  History,
  Network,
  RefreshCw,
  TableProperties,
} from "lucide-react"
import { type ReactNode, useEffect, useMemo, useState } from "react"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { browserServiceOpenUrl } from "@/lib/dashboardRuntimeConfig"
import { cn } from "@/lib/utils"
import {
  buildSystemRun,
  type ClientResult,
  type ClientResultNumberKey,
  type ExperimentArtifact,
  type ExperimentDetail,
  fetchExperimentArtifacts,
  fetchExperimentDetail,
  fetchExperimentLogs,
  fetchExperiments,
  fetchSystemPrometheusMetrics,
  type SystemRun,
  type SystemTab,
} from "./systemRunData"

const systemTabs: Array<{
  id: SystemTab
  label: string
  icon: typeof BarChart3
}> = [
  { id: "clients", label: "Per-Client Results", icon: BarChart3 },
  { id: "averages", label: "Global Averages", icon: Database },
  { id: "communication", label: "Communication", icon: Network },
  { id: "resources", label: "System Resources", icon: TableProperties },
  { id: "raw", label: "Raw Data", icon: FileCog },
]

export function SystemDashboard() {
  const [selectedRunId, setSelectedRunId] = useState("")
  const [activeTab, setActiveTab] = useState<SystemTab>("clients")

  const experimentsQuery = useQuery({
    queryFn: fetchExperiments,
    queryKey: ["system-experiments"],
  })

  const experiments = experimentsQuery.data?.experiments ?? []
  const selectedListRun = useMemo(
    () =>
      experiments.find((experiment) => experiment.id === selectedRunId) ??
      experiments[0] ??
      null,
    [experiments, selectedRunId],
  )

  useEffect(() => {
    if (!selectedRunId && experiments[0]) {
      setSelectedRunId(experiments[0].id)
    }
  }, [experiments, selectedRunId])

  const selectedId = selectedListRun?.id ?? ""

  const detailQuery = useQuery({
    enabled: Boolean(selectedId),
    queryFn: () => fetchExperimentDetail(selectedId),
    queryKey: ["system-experiment-detail", selectedId],
  })

  const metricsQuery = useQuery({
    enabled: Boolean(selectedListRun),
    queryFn: () => {
      if (!selectedListRun) throw new Error("No experiment selected")
      return fetchSystemPrometheusMetrics(selectedListRun)
    },
    queryKey: ["system-prometheus-metrics", selectedId],
    retry: false,
  })

  const logsQuery = useQuery({
    enabled: Boolean(selectedId),
    queryFn: () => fetchExperimentLogs(selectedId),
    queryKey: ["system-experiment-logs", selectedId],
    retry: false,
  })

  const artifactsQuery = useQuery({
    enabled: Boolean(selectedId),
    queryFn: () => fetchExperimentArtifacts(selectedId),
    queryKey: ["system-experiment-artifacts", selectedId],
    retry: false,
  })

  const selectedExperiment = detailQuery.data ?? selectedListRun
  const selectedRun = selectedExperiment
    ? buildSystemRun({
        artifacts: artifactsQuery.data ?? null,
        artifactsError: artifactsQuery.error?.message ?? null,
        experiment: selectedExperiment,
        isLatest: experiments[0]?.id === selectedExperiment.id,
        logs: logsQuery.data ?? null,
        logsError: logsQuery.error?.message ?? null,
        metrics: metricsQuery.data ?? null,
        metricsError: metricsQuery.error?.message ?? null,
      })
    : null

  const isRefreshing =
    experimentsQuery.isFetching ||
    detailQuery.isFetching ||
    metricsQuery.isFetching ||
    logsQuery.isFetching ||
    artifactsQuery.isFetching

  const refreshSelectedRun = () => {
    experimentsQuery.refetch()
    detailQuery.refetch()
    metricsQuery.refetch()
    logsQuery.refetch()
    artifactsQuery.refetch()
  }

  if (experimentsQuery.error) {
    return (
      <UnavailableState
        message={experimentsQuery.error.message}
        title="Experiment history unavailable"
      />
    )
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <RunHistorySidebar
        experiments={experiments}
        isLoading={experimentsQuery.isLoading}
        onRefresh={refreshSelectedRun}
        onRunChange={setSelectedRunId}
        selectedRun={selectedRun}
        selectedRunId={selectedId}
      />

      <div className="min-w-0 space-y-4">
        <div className="grid h-10 grid-cols-2 overflow-hidden rounded-lg border bg-card text-sm">
          <div className="flex items-center justify-center bg-emerald-500/20 font-medium text-emerald-300">
            Run Results
          </div>
          <div className="flex items-center justify-center text-muted-foreground">
            Other
          </div>
        </div>

        <Card className="rounded-lg py-5">
          <CardContent className="space-y-6 px-5">
            {!selectedRun && experimentsQuery.isLoading ? (
              <LoadingState />
            ) : !selectedRun ? (
              <EmptyState message="No experiment runs were found for this user." />
            ) : (
              <>
                <RunHeader
                  isRefreshing={isRefreshing}
                  onRefresh={refreshSelectedRun}
                  run={selectedRun}
                />
                {detailQuery.error ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>Run detail unavailable</AlertTitle>
                    <AlertDescription>
                      {detailQuery.error.message}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <RunKpis run={selectedRun} />
                <ConfigurationSummary run={selectedRun} />
                <DataAvailability run={selectedRun} />

                <div className="flex flex-wrap gap-2">
                  {systemTabs.map((tab) => (
                    <Button
                      className="h-8 gap-1.5 rounded-md px-3"
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      size="sm"
                      variant={activeTab === tab.id ? "default" : "outline"}
                    >
                      <tab.icon className="size-3.5" />
                      {tab.label}
                    </Button>
                  ))}
                </div>

                <SystemTabContent run={selectedRun} tab={activeTab} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RunHistorySidebar({
  experiments,
  isLoading,
  onRefresh,
  onRunChange,
  selectedRun,
  selectedRunId,
}: {
  experiments: ExperimentDetail[]
  isLoading: boolean
  onRefresh: () => void
  onRunChange: (id: string) => void
  selectedRun: SystemRun | null
  selectedRunId: string
}) {
  return (
    <Card className="rounded-lg py-5 xl:sticky xl:top-4">
      <CardHeader className="px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="size-5 text-primary" />
              Run History
            </CardTitle>
            <CardDescription>
              Backend experiments and available artifacts.
            </CardDescription>
          </div>
          <Button
            aria-label="Refresh runs"
            disabled={isLoading}
            onClick={onRefresh}
            size="sm"
            title="Refresh runs"
            variant="outline"
          >
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        {isLoading ? (
          <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">
            Loading run history...
          </div>
        ) : experiments.length === 0 ? (
          <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">
            No runs found. Start an experiment to populate System results.
          </div>
        ) : (
          <Select onValueChange={onRunChange} value={selectedRunId}>
            <SelectTrigger className="h-10 w-full bg-background/70">
              <SelectValue placeholder="Select run" />
            </SelectTrigger>
            <SelectContent>
              {experiments.map((run, index) => (
                <SelectItem key={run.id} value={run.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    {index === 0 ? (
                      <Bolt className="size-4 text-amber-400" />
                    ) : (
                      <FolderOpen className="size-4 text-muted-foreground" />
                    )}
                    {run.name} ({formatDateTime(run.created_at)})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <History className="size-4" />
            Run Details
          </div>
          <div className="p-4">
            {selectedRun ? (
              <div className="rounded-lg border bg-background/70 px-4 py-3">
                <DetailLine
                  label="Clients"
                  value={formatMaybeNumber(selectedRun.clientResults.length)}
                />
                <DetailLine label="Status" value={selectedRun.runtimeStatus} />
                <DetailLine
                  label="Created"
                  value={formatDateTime(selectedRun.createdAt)}
                />
                <DetailLine label="Run" value={selectedRun.name} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a run to inspect details.
              </p>
            )}
          </div>
        </div>

        {selectedRun?.logsUrl ? (
          <a
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            href={
              browserServiceOpenUrl("rayDashboard", selectedRun.logsUrl) ??
              selectedRun.logsUrl
            }
            rel="noreferrer"
            target="_blank"
          >
            Ray Logs
            <ExternalLink className="size-4" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RunHeader({
  isRefreshing,
  onRefresh,
  run,
}: {
  isRefreshing: boolean
  onRefresh: () => void
  run: SystemRun
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-normal">
            Results: {run.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real experiment metadata, Prometheus metrics, logs, and artifacts.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className="gap-1 border-emerald-500/30 text-emerald-300"
          variant="outline"
        >
          <CalendarClock className="size-3.5" />
          {run.isLatest ? "Latest Run" : "Saved Run"}
        </Badge>
        <StatusBadge status={run.runtimeStatus} />
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

function RunKpis({ run }: { run: SystemRun }) {
  const stats = [
    { label: "Clients", value: formatMaybeNumber(run.clientResults.length) },
    { label: "Rounds", value: formatMaybeNumber(run.roundCount) },
    {
      label: "Best Accuracy",
      value:
        run.bestAccuracy === null
          ? "No data"
          : `${formatNumber(run.bestAccuracy)}%`,
    },
    {
      label: "Total Transfer",
      value:
        run.totalTransferBytes === null
          ? "No data"
          : formatBytes(run.totalTransferBytes),
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.map((item) => (
        <MetricCard key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  )
}

function ConfigurationSummary({ run }: { run: SystemRun }) {
  if (!run.config.length) {
    return (
      <div className="rounded-lg border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
        Configuration summary is unavailable. Stored config: {run.configUri}
      </div>
    )
  }

  return (
    <details className="rounded-lg border bg-background/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
        <FileCog className="size-4" />
        Configuration
      </summary>
      <div className="grid gap-3 border-t p-4 md:grid-cols-2 xl:grid-cols-3">
        {run.config.map((item) => (
          <DetailValue key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </details>
  )
}

function DataAvailability({ run }: { run: SystemRun }) {
  const notices = [
    run.metricsUnavailableReason
      ? `Metrics: ${run.metricsUnavailableReason}`
      : null,
    run.logsUnavailableReason ? `Logs: ${run.logsUnavailableReason}` : null,
    run.communication?.totalSentBytes === null
      ? run.communication.reason
      : null,
    run.systemResources?.averageCpuPercent === null
      ? run.systemResources.reason
      : null,
  ].filter(Boolean)

  if (notices.length === 0) return null

  return (
    <Alert className="border-amber-500/40 bg-amber-500/10">
      <AlertCircle />
      <AlertTitle>Some Streamlit-era artifacts are not available</AlertTitle>
      <AlertDescription className="space-y-1">
        {notices.map((notice) => (
          <p key={notice}>{notice}</p>
        ))}
      </AlertDescription>
    </Alert>
  )
}

function SystemTabContent({ run, tab }: { run: SystemRun; tab: SystemTab }) {
  if (tab === "averages") return <GlobalAveragesView run={run} />
  if (tab === "communication") return <CommunicationView run={run} />
  if (tab === "resources") return <SystemResourcesView run={run} />
  if (tab === "raw") return <RawDataView run={run} />
  return <ClientResultsView run={run} />
}

function ClientResultsView({ run }: { run: SystemRun }) {
  if (!run.clientResults.length) {
    return (
      <EmptyState message="No per-client metric series are available for this run yet." />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Final Round</TableHead>
            <TableHead>Latest Acc (%)</TableHead>
            <TableHead>Test Acc (%)</TableHead>
            <TableHead>Train Acc (%)</TableHead>
            <TableHead>Train Time (s)</TableHead>
            <TableHead>Agg Time (s)</TableHead>
            <TableHead>Total Time (s)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {run.clientResults.map((row) => (
            <TableRow key={row.clientId}>
              <TableCell className="font-medium">{row.clientId}</TableCell>
              <TableCell>{formatMaybeNumber(row.finalRound)}</TableCell>
              <TableCell>{formatNullableNumber(row.latestAccuracy)}</TableCell>
              <TableCell>{formatNullableNumber(row.testAccuracy)}</TableCell>
              <TableCell>{formatNullableNumber(row.trainAccuracy)}</TableCell>
              <TableCell>
                {formatNullableNumber(row.trainTimeSeconds)}
              </TableCell>
              <TableCell>
                {formatNullableNumber(row.aggregationTimeSeconds)}
              </TableCell>
              <TableCell>
                {formatNullableNumber(row.totalTimeSeconds)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function GlobalAveragesView({ run }: { run: SystemRun }) {
  if (!run.clientResults.length) {
    return <EmptyState message="No data is available for global averages." />
  }

  const averages = [
    {
      label: "Avg Test Acc",
      value: formatAverage(run.clientResults, "testAccuracy", "%"),
    },
    {
      label: "Avg Train Acc",
      value: formatAverage(run.clientResults, "trainAccuracy", "%"),
    },
    {
      label: "Avg Train Time",
      value: formatAverage(run.clientResults, "trainTimeSeconds", "s"),
    },
    {
      label: "Avg Total Time",
      value: formatAverage(run.clientResults, "totalTimeSeconds", "s"),
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {averages.map((item) => (
        <MetricCard key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  )
}

function CommunicationView({ run }: { run: SystemRun }) {
  if (!run.communication || run.communication.totalSentBytes === null) {
    return (
      <EmptyState
        message={
          run.communication?.reason ||
          "No communication metrics were found for this run."
        }
      />
    )
  }

  const rows = run.communication.rawRows

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Cumulative Sent"
          value={formatBytes(run.communication.totalSentBytes ?? 0)}
        />
        <MetricCard
          label="Cumulative Received"
          value={formatBytes(run.communication.totalReceivedBytes ?? 0)}
        />
        <MetricCard
          label="Cumulative Exchanged"
          value={formatBytes(run.totalTransferBytes ?? 0)}
        />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Latest Sent Counter</TableHead>
              <TableHead>Latest Received Counter</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.clientId}>
                <TableCell className="font-medium">{row.clientId}</TableCell>
                <TableCell>
                  {row.bytesSent === null
                    ? "No data"
                    : formatBytes(row.bytesSent)}
                </TableCell>
                <TableCell>
                  {row.bytesReceived === null
                    ? "No data"
                    : formatBytes(row.bytesReceived)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function SystemResourcesView({ run }: { run: SystemRun }) {
  if (!run.systemResources || run.systemResources.rawRows.length === 0) {
    return (
      <EmptyState
        message={
          run.systemResources?.reason ||
          "No system resource metrics were found for this run."
        }
      />
    )
  }

  const resources = run.systemResources
  const stats = [
    { label: "Avg CPU", value: formatPercent(resources.averageCpuPercent) },
    { label: "Peak CPU", value: formatPercent(resources.peakCpuPercent) },
    {
      label: "Avg CPU Freq",
      value:
        resources.averageCpuFreqMhz === null
          ? "No data"
          : `${formatNumber(resources.averageCpuFreqMhz)} MHz`,
    },
    {
      label: "Avg Memory",
      value: formatPercent(resources.averageMemoryPercent),
    },
    { label: "Peak Memory", value: formatPercent(resources.peakMemoryPercent) },
    { label: "Disk Usage", value: formatPercent(resources.latestDiskPercent) },
    {
      label: "Disk Used",
      value:
        resources.latestDiskUsedBytes === null
          ? "No data"
          : formatBytes(resources.latestDiskUsedBytes),
    },
    {
      label: "Disk Total",
      value:
        resources.latestDiskTotalBytes === null
          ? "No data"
          : formatBytes(resources.latestDiskTotalBytes),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((item) => (
          <MetricCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>CPU Freq</TableHead>
              <TableHead>Memory</TableHead>
              <TableHead>Disk</TableHead>
              <TableHead>Disk Used</TableHead>
              <TableHead>Disk Total</TableHead>
              <TableHead>Network Sent</TableHead>
              <TableHead>Network Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resources.rawRows.map((row) => (
              <TableRow key={row.clientId}>
                <TableCell className="font-medium">{row.clientId}</TableCell>
                <TableCell>{formatPercent(row.cpuPercent)}</TableCell>
                <TableCell>
                  {row.cpuFreqMhz === null
                    ? "No data"
                    : `${formatNumber(row.cpuFreqMhz)} MHz`}
                </TableCell>
                <TableCell>{formatPercent(row.memoryPercent)}</TableCell>
                <TableCell>{formatPercent(row.diskPercent)}</TableCell>
                <TableCell>
                  {row.diskUsedBytes === null
                    ? "No data"
                    : formatBytes(row.diskUsedBytes)}
                </TableCell>
                <TableCell>
                  {row.diskTotalBytes === null
                    ? "No data"
                    : formatBytes(row.diskTotalBytes)}
                </TableCell>
                <TableCell>
                  {row.networkBytesSent === null
                    ? "No data"
                    : formatBytes(row.networkBytesSent)}
                </TableCell>
                <TableCell>
                  {row.networkBytesReceived === null
                    ? "No data"
                    : formatBytes(row.networkBytesReceived)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function RawDataView({ run }: { run: SystemRun }) {
  return (
    <div className="space-y-5">
      <RawSection title="Prometheus Metrics">
        {run.metrics ? (
          <pre className="max-h-96 overflow-auto rounded-lg border bg-background/70 p-4 text-xs leading-relaxed text-muted-foreground">
            {JSON.stringify(run.metrics.metrics, null, 2)}
          </pre>
        ) : (
          <EmptyState
            message={
              run.metricsUnavailableReason || "No metric payload was returned."
            }
          />
        )}
      </RawSection>

      <RawSection title="Artifacts">
        {run.artifacts.length ? (
          <ArtifactsTable artifacts={run.artifacts} />
        ) : (
          <EmptyState message="No artifacts were returned by the artifact endpoint." />
        )}
      </RawSection>

      <RawSection title="Logs">
        {run.logs ? (
          <pre className="max-h-96 overflow-auto rounded-lg border bg-background/70 p-4 text-xs leading-relaxed text-muted-foreground">
            {run.logs}
          </pre>
        ) : (
          <EmptyState
            message={run.logsUnavailableReason || "No logs were returned."}
          />
        )}
      </RawSection>
    </div>
  )
}

function ArtifactsTable({ artifacts }: { artifacts: ExperimentArtifact[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>URL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {artifacts.map((artifact) => (
            <TableRow
              key={`${artifact.source}-${artifact.name}-${artifact.url}`}
            >
              <TableCell className="font-medium">{artifact.name}</TableCell>
              <TableCell>{artifact.type}</TableCell>
              <TableCell>{artifact.source}</TableCell>
              <TableCell>{formatDateTime(artifact.created_at)}</TableCell>
              <TableCell className="max-w-72 truncate">
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={artifact.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {artifact.url}
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RawSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold tracking-normal">{title}</h2>
      {children}
    </section>
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

function LoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {["Clients", "Rounds", "Best Accuracy", "Total Transfer"].map((label) => (
        <div
          className="min-h-28 rounded-lg border bg-background/60 p-4"
          key={label}
        >
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="mt-4 h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-lg border bg-muted/30 p-6 text-center">
      <div>
        <History className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-3 font-medium">Nothing to show yet</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

function UnavailableState({
  message,
  title,
}: {
  message: string
  title: string
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="truncate text-right text-sm font-semibold">{value}</span>
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

function StatusBadge({ status }: { status: SystemRun["runtimeStatus"] }) {
  const styles: Record<SystemRun["runtimeStatus"], string> = {
    completed: "border-emerald-500/30 text-emerald-300",
    failed: "border-red-500/30 text-red-300",
    pending: "border-slate-500/30 text-slate-300",
    running: "border-sky-500/30 text-sky-300",
    stopped: "border-amber-500/30 text-amber-300",
  }

  return (
    <Badge className={cn("capitalize", styles[status])} variant="outline">
      {status}
    </Badge>
  )
}

function avg(rows: ClientResult[], key: ClientResultNumberKey) {
  const values = rows
    .map((row) => row[key])
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )

  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function formatAverage(
  rows: ClientResult[],
  key: ClientResultNumberKey,
  suffix: string,
) {
  const value = avg(rows, key)
  return value === null ? "No data" : `${formatNumber(value)}${suffix}`
}

function formatNumber(value: number) {
  return value.toFixed(2).replace(/\.00$/, "")
}

function formatNullableNumber(value: number | null) {
  return value === null ? "No data" : formatNumber(value)
}

function formatMaybeNumber(value: number | null) {
  return value === null ? "No data" : formatNumber(value)
}

function formatPercent(value: number | null) {
  return value === null ? "No data" : `${formatNumber(value)}%`
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function formatDateTime(value: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
