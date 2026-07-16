import { OpenAPI } from "@/client"
import { clearAuthAndRedirect, isAuthErrorStatus } from "@/lib/auth"
import {
  fetchDirectPrometheusMetrics,
  type PrometheusMetricDefinition,
} from "./prometheusMetrics"

export type SystemTab =
  | "clients"
  | "averages"
  | "communication"
  | "resources"
  | "raw"

export type ExperimentStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stopped"

export type ExperimentDetail = {
  id: string
  name: string
  description: string | null
  config_yaml: string
  config_uri: string
  owner_id: string
  cluster_id: string
  ray_job_id: string | null
  ray_dashboard_url: string | null
  mlflow_run_id: string | null
  mlflow_run_url: string | null
  status: ExperimentStatus
  status_message: string | null
  logs_url: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export type ExperimentList = {
  experiments: ExperimentDetail[]
  total: number
  page: number
  size: number
}

export type MetricPoint = {
  timestamp: string
  value: number | null
}

export type MetricSeries = {
  labels: Record<string, string>
  values: MetricPoint[]
}

export type ExperimentMetric = {
  name: string
  series: MetricSeries[]
}

export type ExperimentMetricsResponse = {
  experiment_id: string
  query: Record<string, unknown>
  metrics: ExperimentMetric[]
  series: ExperimentMetric[]
  live: boolean
  last_updated_at: string
  fetched_at: string
}

export type ExperimentLogsResponse = {
  experiment_id: string
  logs: string
  last_updated_at: string
}

export type ExperimentArtifact = {
  name: string
  type: string
  url: string
  source: "mlflow" | "minio" | "ray" | "other"
  created_at: string | null
  metadata: Record<string, unknown>
}

export type ExperimentArtifactsResponse = {
  experiment_id: string
  mlflow_run_id: string | null
  artifacts: ExperimentArtifact[]
  fetched_at: string
}

export type ClientResult = {
  aggregationTimeSeconds: number | null
  clientId: string
  finalRound: number | null
  latestAccuracy: number | null
  testAccuracy: number | null
  totalTimeSeconds: number | null
  trainAccuracy: number | null
  trainTimeSeconds: number | null
}

export type ClientResultNumberKey = {
  [Key in keyof ClientResult]: ClientResult[Key] extends number | null
    ? Key
    : never
}[keyof ClientResult]

export type CommunicationSummary = {
  reason: string
  rawRows: Array<{
    bytesReceived: number | null
    bytesSent: number | null
    clientId: string
  }>
  totalReceivedBytes: number | null
  totalSentBytes: number | null
}

export type SystemResourcesSummary = {
  averageCpuPercent: number | null
  averageCpuFreqMhz: number | null
  averageMemoryPercent: number | null
  latestDiskTotalBytes: number | null
  latestDiskPercent: number | null
  latestDiskUsedBytes: number | null
  peakCpuPercent: number | null
  peakMemoryPercent: number | null
  rawRows: Array<{
    clientId: string
    cpuFreqMhz: number | null
    cpuPercent: number | null
    diskPercent: number | null
    diskTotalBytes: number | null
    diskUsedBytes: number | null
    memoryPercent: number | null
    networkBytesReceived: number | null
    networkBytesSent: number | null
  }>
  reason: string
}

export type SystemRun = {
  id: string
  artifactCount: number
  artifacts: ExperimentArtifact[]
  bestAccuracy: number | null
  clientResults: ClientResult[]
  communication: CommunicationSummary | null
  config: Array<{ label: string; value: string }>
  configUri: string
  createdAt: string
  description: string | null
  isLatest: boolean
  latestAccuracy: number | null
  logs: string | null
  logsLastUpdatedAt: string | null
  logsUnavailableReason: string | null
  logsUrl: string | null
  metricCount: number
  metrics: ExperimentMetricsResponse | null
  metricsUnavailableReason: string | null
  mlflowRunId: string | null
  mlflowRunUrl: string | null
  name: string
  rayJobId: string | null
  roundCount: number | null
  runtimeStatus: ExperimentStatus
  startedAt: string | null
  completedAt: string | null
  systemResources: SystemResourcesSummary | null
  totalTransferBytes: number | null
}

type BuildSystemRunInput = {
  artifacts?: ExperimentArtifactsResponse | null
  artifactsError?: string | null
  experiment: ExperimentDetail
  isLatest: boolean
  logs?: ExperimentLogsResponse | null
  logsError?: string | null
  metrics?: ExperimentMetricsResponse | null
  metricsError?: string | null
}

const apiUrl = (path: string) => `${OpenAPI.BASE}${path}`

const SYSTEM_PROMETHEUS_METRICS: PrometheusMetricDefinition[] = [
  {
    displayName: "round_test_accuracy_post_aggregation_ratio",
    prometheusName: "round_test_accuracy_post_aggregation_ratio",
  },
  {
    displayName: "round_train_accuracy_post_aggregation_ratio",
    prometheusName: "round_train_accuracy_post_aggregation_ratio",
  },
  {
    displayName: "round_local_training_time_seconds",
    prometheusName: "round_local_training_time_seconds",
  },
  {
    displayName: "round_aggregation_time_seconds",
    prometheusName: "round_aggregation_time_seconds",
  },
  {
    displayName: "federated_rounds_completed_total",
    prometheusName: "federated_rounds_completed_total",
  },
  {
    displayName: "communication_bytes_sent_total",
    prometheusName: "communication_bytes_sent_total",
  },
  {
    displayName: "communication_bytes_received_total",
    prometheusName: "communication_bytes_received_total",
  },
  {
    displayName: "communication_messages_total",
    prometheusName: "communication_messages_total",
  },
  {
    displayName: "system_cpu_percent_sum",
    prometheusName: "system_cpu_percent_sum",
  },
  {
    displayName: "system_cpu_percent_count",
    prometheusName: "system_cpu_percent_count",
  },
  {
    displayName: "system_cpu_freq_mhz_MHz_sum",
    prometheusName: "system_cpu_freq_mhz_MHz_sum",
  },
  {
    displayName: "system_cpu_freq_mhz_MHz_count",
    prometheusName: "system_cpu_freq_mhz_MHz_count",
  },
  {
    displayName: "system_disk_percent_sum",
    prometheusName: "system_disk_percent_sum",
  },
  {
    displayName: "system_disk_percent_count",
    prometheusName: "system_disk_percent_count",
  },
  {
    displayName: "system_disk_used_bytes_sum",
    prometheusName: "system_disk_used_bytes_sum",
  },
  {
    displayName: "system_disk_used_bytes_count",
    prometheusName: "system_disk_used_bytes_count",
  },
  {
    displayName: "system_disk_total_bytes_sum",
    prometheusName: "system_disk_total_bytes_sum",
  },
  {
    displayName: "system_disk_total_bytes_count",
    prometheusName: "system_disk_total_bytes_count",
  },
  {
    displayName: "system_network_bytes_sent_sum",
    prometheusName: "system_network_bytes_sent_sum",
  },
  {
    displayName: "system_network_bytes_sent_count",
    prometheusName: "system_network_bytes_sent_count",
  },
  {
    displayName: "system_network_bytes_recv_sum",
    prometheusName: "system_network_bytes_recv_sum",
  },
  {
    displayName: "system_network_bytes_recv_count",
    prometheusName: "system_network_bytes_recv_count",
  },
  { displayName: "memory_percent_sum", prometheusName: "memory_percent_sum" },
  {
    displayName: "memory_percent_count",
    prometheusName: "memory_percent_count",
  },
]

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
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
    const message =
      body?.error?.message ||
      (typeof detail === "string"
        ? detail
        : detail?.message || response.statusText || "Request failed")
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

export function fetchExperiments() {
  return apiRequest<ExperimentList>("/api/v1/experiments/list?size=50")
}

export function fetchExperimentDetail(experimentId: string) {
  return apiRequest<ExperimentDetail>(`/api/v1/experiments/${experimentId}`)
}

export function fetchExperimentMetrics(experimentId: string) {
  return apiRequest<ExperimentMetricsResponse>(
    `/api/v1/experiments/${experimentId}/metrics`,
  )
}

export function fetchSystemPrometheusMetrics(experiment: ExperimentDetail) {
  return fetchDirectPrometheusMetrics(
    experiment,
    SYSTEM_PROMETHEUS_METRICS,
    "Direct Prometheus query for the System tab; no experiment_id filter is applied.",
  )
}

export function fetchExperimentLogs(experimentId: string) {
  return apiRequest<ExperimentLogsResponse>(
    `/api/v1/experiments/${experimentId}/logs`,
  )
}

export function fetchExperimentArtifacts(experimentId: string) {
  return apiRequest<ExperimentArtifactsResponse>(
    `/api/v1/experiments/${experimentId}/artifacts`,
  )
}

export function buildSystemRun({
  artifacts,
  artifactsError,
  experiment,
  isLatest,
  logs,
  logsError,
  metrics,
  metricsError,
}: BuildSystemRunInput): SystemRun {
  const normalizedMetrics = metrics ? normalizeMetrics(metrics) : null
  const artifactsList = artifacts?.artifacts ?? []

  return {
    artifactCount: artifactsList.length,
    artifacts: artifactsList,
    bestAccuracy: normalizedMetrics?.bestAccuracy ?? null,
    clientResults: normalizedMetrics?.clientResults ?? [],
    communication: normalizedMetrics?.communication ?? null,
    completedAt: experiment.completed_at,
    config: parseConfigSummary(experiment.config_yaml),
    configUri: experiment.config_uri,
    createdAt: experiment.created_at,
    description: experiment.description,
    id: experiment.id,
    isLatest,
    latestAccuracy: normalizedMetrics?.latestAccuracy ?? null,
    logs: logs?.logs ?? null,
    logsLastUpdatedAt: logs?.last_updated_at ?? null,
    logsUnavailableReason:
      logsError ??
      (!experiment.ray_job_id
        ? "This experiment does not have a Ray job id yet."
        : null),
    logsUrl: experiment.logs_url,
    metricCount: countMetricSeries(metrics),
    metrics: metrics ?? null,
    metricsUnavailableReason:
      metricsError ??
      (metrics && countMetricSeries(metrics) === 0
        ? "Prometheus returned no samples for this experiment."
        : null),
    mlflowRunId: experiment.mlflow_run_id ?? artifacts?.mlflow_run_id ?? null,
    mlflowRunUrl: experiment.mlflow_run_url,
    name: experiment.name,
    rayJobId: experiment.ray_job_id,
    roundCount:
      normalizedMetrics?.roundCount ??
      configNumber(experiment.config_yaml, [
        "federated_learning_rounds",
        "rounds",
      ]),
    runtimeStatus: experiment.status,
    startedAt: experiment.started_at,
    systemResources:
      normalizedMetrics?.systemResources ??
      unavailableSystemResources(
        artifactsError
          ? `Artifacts unavailable: ${artifactsError}`
          : "System resource CSVs are not exposed by the current experiment API.",
      ),
    totalTransferBytes: normalizedMetrics?.totalTransferBytes ?? null,
  }
}

function normalizeMetrics(metrics: ExperimentMetricsResponse) {
  const testAccuracyMetric = firstMetric(metrics, [
    "federated_round_accuracy",
    "round_test_accuracy_post_aggregation_ratio",
  ])
  const trainAccuracyMetric = firstMetric(metrics, [
    "round_train_accuracy_post_aggregation_ratio",
  ])
  const trainTimeMetric = firstMetric(metrics, [
    "client_training_time",
    "round_local_training_time_seconds",
  ])
  const aggregationTimeMetric = firstMetric(metrics, [
    "aggregation_time",
    "round_aggregation_time_seconds",
  ])
  const totalTimeMetric = firstMetric(metrics, [
    "round_elapsed_since_start_seconds",
  ])
  const roundMetric = firstMetric(metrics, ["federated_rounds_completed_total"])
  const modelSentMetric = firstMetric(metrics, ["round_sent_models_size_bytes"])
  const modelReceivedMetric = firstMetric(metrics, [
    "round_received_models_size_bytes",
  ])

  const clientIds = new Set<string>()
  for (const metric of [
    testAccuracyMetric,
    trainAccuracyMetric,
    trainTimeMetric,
    aggregationTimeMetric,
  ]) {
    for (const series of metric?.series ?? []) {
      clientIds.add(seriesClientId(series))
    }
  }

  const clientResults = Array.from(clientIds)
    .sort(naturalSort)
    .map((clientId) => {
      const testAccuracy = latestSeriesValue(
        testAccuracyMetric,
        clientId,
        normalizeAccuracy,
      )
      const trainAccuracy = latestSeriesValue(
        trainAccuracyMetric,
        clientId,
        normalizeAccuracy,
      )
      const trainTime = latestSeriesValue(trainTimeMetric, clientId)
      const aggregationTime = latestSeriesValue(aggregationTimeMetric, clientId)
      const totalTime = latestSeriesValue(totalTimeMetric, clientId)
      const round = latestSeriesValue(roundMetric, clientId)

      return {
        aggregationTimeSeconds: aggregationTime,
        clientId,
        finalRound: round,
        latestAccuracy: testAccuracy ?? trainAccuracy,
        testAccuracy,
        totalTimeSeconds:
          totalTime ??
          (trainTime !== null || aggregationTime !== null
            ? (trainTime ?? 0) + (aggregationTime ?? 0)
            : null),
        trainAccuracy,
        trainTimeSeconds: trainTime,
      }
    })

  const accuracyValues =
    allMetricValues(testAccuracyMetric).map(normalizeAccuracy)
  const latestAccuracy = latestMetricAverage(
    testAccuracyMetric,
    normalizeAccuracy,
  )
  const bestAccuracy =
    accuracyValues.length > 0 ? Math.max(...accuracyValues) : latestAccuracy
  const roundCount =
    latestMetricMax(roundMetric) ??
    inferRoundCount(testAccuracyMetric ?? trainAccuracyMetric)

  return {
    bestAccuracy,
    clientResults,
    communication: normalizeCommunication(
      metrics,
      modelSentMetric,
      modelReceivedMetric,
    ),
    latestAccuracy,
    roundCount,
    systemResources: normalizeSystemResources(metrics),
    totalTransferBytes: totalTransferBytes(
      metrics,
      modelSentMetric,
      modelReceivedMetric,
    ),
  }
}

function normalizeCommunication(
  metrics: ExperimentMetricsResponse,
  modelSentMetric: ExperimentMetric | null,
  modelReceivedMetric: ExperimentMetric | null,
): CommunicationSummary {
  const bytesSentMetric = firstMetric(metrics, [
    "communication_bytes_sent_total",
    "round_sent_models_size_bytes",
  ])
  const bytesReceivedMetric = firstMetric(metrics, [
    "communication_bytes_received_total",
    "round_received_models_size_bytes",
  ])
  const clientIds = new Set<string>()

  for (const metric of [
    bytesSentMetric,
    bytesReceivedMetric,
    modelSentMetric,
    modelReceivedMetric,
  ]) {
    for (const series of metric?.series ?? []) {
      clientIds.add(seriesClientId(series))
    }
  }

  const rawRows = Array.from(clientIds)
    .sort(naturalSort)
    .map((clientId) => ({
      bytesReceived:
        latestSeriesValue(bytesReceivedMetric, clientId) ??
        latestSeriesValue(modelReceivedMetric, clientId),
      bytesSent:
        latestSeriesValue(bytesSentMetric, clientId) ??
        latestSeriesValue(modelSentMetric, clientId),
      clientId,
    }))

  const totalSentBytes = sumNullable(rawRows.map((row) => row.bytesSent))
  const totalReceivedBytes = sumNullable(
    rawRows.map((row) => row.bytesReceived),
  )

  return {
    rawRows,
    reason:
      rawRows.length === 0
        ? "No communication or model transfer counters were returned for this experiment."
        : "",
    totalReceivedBytes,
    totalSentBytes,
  }
}

function normalizeSystemResources(
  metrics: ExperimentMetricsResponse,
): SystemResourcesSummary {
  const cpu = histogramSummary(metrics, ["system_cpu_percent"])
  const cpuFreq = histogramSummary(metrics, [
    "system_cpu_freq_mhz_MHz",
    "system_cpu_freq_mhz",
  ])
  const disk = histogramSummary(metrics, ["system_disk_percent"])
  const diskUsed = histogramSummary(metrics, ["system_disk_used_bytes"])
  const diskTotal = histogramSummary(metrics, ["system_disk_total_bytes"])
  const memory = histogramSummary(metrics, ["memory_percent"])
  const networkSent = histogramSummary(metrics, ["system_network_bytes_sent"])
  const networkReceived = histogramSummary(metrics, [
    "system_network_bytes_recv",
    "system_network_bytes_received",
  ])
  const clientIds = new Set<string>()

  for (const summary of [
    cpu,
    cpuFreq,
    disk,
    diskUsed,
    diskTotal,
    memory,
    networkSent,
    networkReceived,
  ]) {
    for (const series of summary.latestByClient.keys()) {
      clientIds.add(series)
    }
  }

  const rawRows = Array.from(clientIds)
    .sort(naturalSort)
    .map((clientId) => ({
      clientId,
      cpuFreqMhz: cpuFreq.latestByClient.get(clientId) ?? null,
      cpuPercent: cpu.latestByClient.get(clientId) ?? null,
      diskPercent: disk.latestByClient.get(clientId) ?? null,
      diskTotalBytes: diskTotal.latestByClient.get(clientId) ?? null,
      diskUsedBytes: diskUsed.latestByClient.get(clientId) ?? null,
      memoryPercent: memory.latestByClient.get(clientId) ?? null,
      networkBytesReceived:
        networkReceived.latestByClient.get(clientId) ?? null,
      networkBytesSent: networkSent.latestByClient.get(clientId) ?? null,
    }))

  return {
    averageCpuPercent: cpu.average,
    averageCpuFreqMhz: cpuFreq.average,
    averageMemoryPercent: memory.average,
    latestDiskTotalBytes: diskTotal.latest,
    latestDiskPercent: disk.latest,
    latestDiskUsedBytes: diskUsed.latest,
    peakCpuPercent: cpu.peak,
    peakMemoryPercent: memory.peak,
    rawRows,
    reason:
      rawRows.length === 0
        ? "No system resource metrics were returned for this experiment."
        : "",
  }
}

function firstMetric(
  metrics: ExperimentMetricsResponse,
  names: string[],
): ExperimentMetric | null {
  return (
    metrics.metrics.find(
      (metric) => names.includes(metric.name) && metric.series.length > 0,
    ) ??
    metrics.metrics.find((metric) => names.includes(metric.name)) ??
    null
  )
}

function totalTransferBytes(
  metrics: ExperimentMetricsResponse,
  modelSentMetric: ExperimentMetric | null,
  modelReceivedMetric: ExperimentMetric | null,
) {
  const communication = normalizeCommunication(
    metrics,
    modelSentMetric,
    modelReceivedMetric,
  )
  return sumNullable([
    communication.totalSentBytes,
    communication.totalReceivedBytes,
  ])
}

function histogramSummary(
  metrics: ExperimentMetricsResponse,
  baseNames: string[],
) {
  const directMetric = firstMetric(metrics, baseNames)
  const sumMetric = firstMetric(
    metrics,
    baseNames.map((name) => `${name}_sum`),
  )
  const countMetric = firstMetric(
    metrics,
    baseNames.map((name) => `${name}_count`),
  )
  const latestByClient = new Map<string, number>()
  const allValues: number[] = []

  if (directMetric) {
    for (const series of directMetric.series) {
      const clientId = seriesClientId(series)
      const latest = latestPoint(series)?.value
      if (latest !== null && latest !== undefined && Number.isFinite(latest)) {
        latestByClient.set(clientId, latest)
      }
      allValues.push(
        ...series.values
          .map((point) => point.value)
          .filter(
            (value): value is number =>
              value !== null && Number.isFinite(value),
          ),
      )
    }
  }

  if (sumMetric && countMetric) {
    for (const sumSeries of sumMetric.series) {
      const clientId = seriesClientId(sumSeries)
      const countSeries = countMetric.series.find(
        (series) => seriesClientId(series) === clientId,
      )
      const ratios = pairedRatios(sumSeries, countSeries)
      if (!ratios.length) continue
      latestByClient.set(clientId, ratios[ratios.length - 1])
      allValues.push(...ratios)
    }
  }

  const latestValues = Array.from(latestByClient.values())
  return {
    average: average(allValues),
    latest: average(latestValues),
    latestByClient,
    peak: allValues.length ? Math.max(...allValues) : null,
  }
}

function pairedRatios(
  sumSeries: MetricSeries,
  countSeries: MetricSeries | undefined,
) {
  const countByTimestamp = new Map(
    (countSeries?.values ?? [])
      .filter(
        (point) =>
          point.value !== null &&
          Number.isFinite(point.value) &&
          point.value > 0,
      )
      .map((point) => [point.timestamp, point.value as number]),
  )

  return sumSeries.values
    .map((point) => {
      const count = countByTimestamp.get(point.timestamp)
      if (
        point.value === null ||
        count === undefined ||
        !Number.isFinite(point.value)
      ) {
        return null
      }
      return point.value / count
    })
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )
}

function average(values: number[]) {
  if (!values.length) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function sumNullable(values: Array<number | null>) {
  const validValues = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  )
  if (!validValues.length) return null
  return validValues.reduce((total, value) => total + value, 0)
}

function latestSeriesValue(
  metric: ExperimentMetric | null,
  clientId: string,
  normalize: (value: number) => number = (value) => value,
) {
  const series = (metric?.series ?? []).find(
    (item) => seriesClientId(item) === clientId,
  )
  const point = latestPoint(series)
  return point?.value === null || point?.value === undefined
    ? null
    : normalize(point.value)
}

function latestMetricAverage(
  metric: ExperimentMetric | null,
  normalize: (value: number) => number = (value) => value,
) {
  const values = (metric?.series ?? [])
    .map((series) => latestPoint(series)?.value ?? null)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )
    .map(normalize)

  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function latestMetricMax(metric: ExperimentMetric | null) {
  const values = (metric?.series ?? [])
    .map((series) => latestPoint(series)?.value ?? null)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )

  if (values.length === 0) return null
  return Math.max(...values)
}

function latestPoint(series?: MetricSeries) {
  let latest: MetricPoint | null = null

  for (const point of series?.values ?? []) {
    if (point.value === null || !Number.isFinite(point.value)) continue
    if (!latest || Date.parse(point.timestamp) > Date.parse(latest.timestamp)) {
      latest = point
    }
  }

  return latest
}

function allMetricValues(metric: ExperimentMetric | null) {
  return (metric?.series ?? [])
    .flatMap((series) => series.values)
    .map((point) => point.value)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )
}

function inferRoundCount(metric: ExperimentMetric | null) {
  const sampleCounts = (metric?.series ?? []).map(
    (series) => series.values.length,
  )
  if (sampleCounts.length === 0) return null
  return Math.max(...sampleCounts)
}

function normalizeAccuracy(value: number) {
  return Math.abs(value) <= 1 ? value * 100 : value
}

function seriesClientId(series: MetricSeries) {
  return (
    series.labels.client_id ||
    series.labels.client ||
    series.labels.worker_id ||
    series.labels.instance ||
    "global"
  )
}

function countMetricSeries(metrics?: ExperimentMetricsResponse | null) {
  return (metrics?.metrics ?? []).reduce(
    (total, metric) => total + metric.series.length,
    0,
  )
}

function parseConfigSummary(configYaml: string) {
  const config = parseTopLevelYaml(configYaml)
  const fields = [
    ["Model", "model_type"],
    ["Dataset", "dataset_type"],
    ["Optimizer", "optimizer"],
    ["Learning Rate", "learning_rate"],
    ["Schema", "federated_learning_schema"],
    ["Topology", "federated_learning_topology"],
    ["Aggregation", "aggregation_strategy"],
    ["Clients", "number_of_clients"],
    ["Rounds", "federated_learning_rounds"],
    ["Local Epochs", "number_of_epochs"],
    ["Batch Size", "train_batch_size"],
    ["Device", "device"],
  ] as const

  return fields.flatMap(([label, key]) => {
    const value = config[key]
    return value !== undefined && value !== "" ? [{ label, value }] : []
  })
}

function parseTopLevelYaml(configYaml: string) {
  const result: Record<string, string> = {}

  for (const line of configYaml.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue
    if (/^\s/.test(line)) continue

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*(?:#.*)?$/)
    if (!match) continue

    const value = match[2].replace(/^['"]|['"]$/g, "")
    result[match[1]] = value
  }

  return result
}

function configNumber(configYaml: string, keys: string[]) {
  const config = parseTopLevelYaml(configYaml)
  for (const key of keys) {
    const value = Number(config[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

function unavailableSystemResources(reason: string): SystemResourcesSummary {
  return {
    averageCpuFreqMhz: null,
    averageCpuPercent: null,
    averageMemoryPercent: null,
    latestDiskTotalBytes: null,
    latestDiskPercent: null,
    latestDiskUsedBytes: null,
    peakCpuPercent: null,
    peakMemoryPercent: null,
    rawRows: [],
    reason,
  }
}

function naturalSort(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}
