import {
  getDashboardRuntimeConfig,
  resolveCrossOriginUrl,
  serviceUrl,
} from "@/lib/dashboardRuntimeConfig"

export type PrometheusMetricDefinition = {
  displayName: string
  normalizeValue?: (value: number) => number
  prometheusName: string
  prometheusQuery?: string
}

export type PrometheusMetricPoint = {
  timestamp: string
  value: number | null
}

export type PrometheusMetricSeries = {
  labels: Record<string, string>
  values: PrometheusMetricPoint[]
}

export type PrometheusExperimentMetric = {
  name: string
  series: PrometheusMetricSeries[]
}

export type PrometheusExperimentMetricsResponse = {
  experiment_id: string
  fetched_at: string
  last_updated_at: string
  live: boolean
  metrics: PrometheusExperimentMetric[]
  query: Record<string, unknown>
  series: PrometheusExperimentMetric[]
}

type PrometheusQueryRangeResponse = {
  status: string
  data?: {
    resultType?: string
    result?: Array<{
      metric?: Record<string, string>
      values?: Array<[number, string]>
    }>
  }
  error?: string
  errorType?: string
}

export type PrometheusExperimentWindow = {
  completed_at: string | null
  created_at: string
  id: string
  started_at: string | null
  status: string
}

export async function fetchDirectPrometheusMetrics(
  experiment: PrometheusExperimentWindow,
  metricDefinitions: PrometheusMetricDefinition[],
  note = "Direct Prometheus query; no experiment_id filter is applied.",
): Promise<PrometheusExperimentMetricsResponse> {
  const now = new Date()
  const start = new Date(experiment.started_at || experiment.created_at)
  const end = experiment.completed_at ? new Date(experiment.completed_at) : now
  const safeEnd = end > start ? end : now
  const step = prometheusStep(start, safeEnd)

  const metrics = await Promise.all(
    metricDefinitions.map(async (definition) => {
      const params = new URLSearchParams({
        query: definition.prometheusQuery ?? definition.prometheusName,
        start: unixSeconds(start),
        end: unixSeconds(safeEnd),
        step,
      })
      const payload = await prometheusRequest<PrometheusQueryRangeResponse>(
        `/api/v1/query_range?${params.toString()}`,
      )

      if (payload.status !== "success") {
        throw new Error(
          payload.error || payload.errorType || "Prometheus query failed",
        )
      }

      const result = payload.data?.result ?? []

      return {
        name: definition.displayName,
        series: result.map((series) => ({
          labels: series.metric ?? {},
          values: (series.values ?? []).map(([timestamp, rawValue]) => {
            const parsed = Number.parseFloat(rawValue)
            const value = Number.isFinite(parsed)
              ? (definition.normalizeValue?.(parsed) ?? parsed)
              : null

            return {
              timestamp: new Date(timestamp * 1000).toISOString(),
              value,
            }
          }),
        })),
      }
    }),
  )

  return {
    experiment_id: experiment.id,
    fetched_at: now.toISOString(),
    last_updated_at: now.toISOString(),
    live: experiment.status === "running",
    metrics,
    query: {
      metric_names: metricDefinitions.map((metric) => metric.prometheusName),
      source: "prometheus-direct",
      start: start.toISOString(),
      end: safeEnd.toISOString(),
      step,
      note,
    },
    series: metrics,
  }
}

async function prometheusRequest<T>(path: string): Promise<T> {
  const targetUrl = resolveCrossOriginUrl(
    serviceUrl(getDashboardRuntimeConfig().prometheusBaseUrl, path),
  )
  const headers: Record<string, string> = {}

  if (targetUrl.includes("/monitoring/proxy")) {
    const token = localStorage.getItem("access_token") || ""
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  const response = await fetch(targetUrl, { headers })

  if (!response.ok) {
    throw new Error(response.statusText || "Prometheus request failed")
  }

  return response.json() as Promise<T>
}

function prometheusStep(start: Date, end: Date) {
  const durationSeconds = Math.max(60, (end.getTime() - start.getTime()) / 1000)
  if (durationSeconds <= 15 * 60) return "5s"
  if (durationSeconds <= 60 * 60) return "15s"
  if (durationSeconds <= 6 * 60 * 60) return "60s"
  return "300s"
}

function unixSeconds(value: Date) {
  return (value.getTime() / 1000).toString()
}
