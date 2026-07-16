import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Clock3,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  Network,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  Wand2,
} from "lucide-react"
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { clearAuthAndRedirect, isAuthErrorStatus } from "@/lib/auth"
import {
  browserServiceOpenUrl,
  getDashboardRuntimeConfig,
  serviceUrl,
} from "@/lib/dashboardRuntimeConfig"
import {
  type ExperimentRouteSearch,
  type ExperimentTrackingTab,
  type ExperimentWorkspaceTab,
  isExperimentTrackingTab,
  isExperimentWorkspaceTab,
  readStoredExperimentSearch,
  writeStoredExperimentSearch,
} from "@/lib/experimentNavigation"
import { cn } from "@/lib/utils"

type ExperimentStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stopped"

type Experiment = {
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

type ExperimentList = {
  experiments: Experiment[]
  total: number
  page: number
  size: number
}

type ExperimentActionResponse = {
  experiment_id: string
  status: ExperimentStatus
  message: string
  ray_job_id?: string | null
}

type ExperimentLogsResponse = {
  experiment_id: string
  logs: string
  last_updated_at: string
}

type ExperimentInitResponse = {
  experiment_id: string
  status: ExperimentStatus
  config_uri: string
}

type ExperimentCreate = {
  name: string
  description?: string
  cluster_id: string
  config_yaml: string
}

type ConfigValidationIssue = {
  field: string
  message: string
  code: string
}

type ConfigValidationResponse = {
  valid: boolean
  errors: ConfigValidationIssue[]
  warnings: ConfigValidationIssue[]
  normalized_config: Record<string, unknown>
}

type MetricPoint = {
  timestamp: string
  value: number | null
}

type MetricSeries = {
  labels: Record<string, string>
  values: MetricPoint[]
}

type ExperimentMetric = {
  name: string
  series: MetricSeries[]
}

type ExperimentMetricsResponse = {
  experiment_id: string
  query: Record<string, unknown>
  metrics: ExperimentMetric[]
  series: ExperimentMetric[]
  live: boolean
  last_updated_at: string
  fetched_at: string
}

type TrackingMetricsProps = {
  metrics: ExperimentMetricsResponse | null
  metricsError: string | null
  metricsLoading: boolean
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

type PrometheusMetricDefinition = {
  prometheusName: string
  prometheusQuery?: string
  displayName: string
  normalizeValue?: (value: number) => number
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

type ExperimentForm = {
  name: string
  description: string
  cluster_id: string
  config_yaml: string
}

type ConfigBuilder = {
  aggregation_strategy: string
  client_k_neighbors: string
  client_sampling_rate: string
  chunking: boolean
  data_distribution_kind: string
  dataset_type: string
  device: string
  do_cluster: boolean
  dp_enabled: boolean
  distance_metric: string
  federated_learning_rounds: string
  federated_learning_schema: string
  federated_learning_topology: string
  federation_id: string
  gpu_index: string
  learning_rate: string
  loss_function: string
  model_type: string
  mlflow_enabled: boolean
  mlflow_tracking_uri: string
  mlflow_experiment_prefix: string
  number_of_clients: string
  number_of_epochs: string
  optimizer: string
  otel_enabled: boolean
  otel_endpoint: string
  random_seed: string
  ray_dashboard: boolean
  stop_avg_accuracy: string
  test_batch_size: string
  train_batch_size: string
  transform_input_size: string
}

const defaultConfigBuilder: ConfigBuilder = {
  aggregation_strategy: "FedAvg",
  client_k_neighbors: "2",
  client_sampling_rate: "1.0",
  chunking: false,
  data_distribution_kind: "30",
  dataset_type: "fmnist",
  device: "cpu",
  do_cluster: true,
  dp_enabled: false,
  distance_metric: "cosine",
  federated_learning_rounds: "10",
  federated_learning_schema: "DecentralizedFederatedLearning",
  federated_learning_topology: "k_connect",
  federation_id: "0.0.1",
  gpu_index: "0",
  learning_rate: "0.001",
  loss_function: "CrossEntropy",
  model_type: "cnn",
  mlflow_enabled: true,
  mlflow_tracking_uri: "http://localhost:5000",
  mlflow_experiment_prefix: "FedPilot",
  number_of_clients: "5",
  number_of_epochs: "1",
  optimizer: "sgd",
  otel_enabled: true,
  otel_endpoint: getDashboardRuntimeConfig().otelEndpoint,
  random_seed: "42",
  ray_dashboard: true,
  stop_avg_accuracy: "0.99",
  test_batch_size: "128",
  train_batch_size: "64",
  transform_input_size: "28",
}

const defaultConfigYaml = buildConfigYaml(defaultConfigBuilder)

const defaultExperimentForm: ExperimentForm = {
  name: "local-federated-test",
  description: "Created from the dashboard",
  cluster_id: "",
  config_yaml: defaultConfigYaml,
}

const LOCAL_STORAGE_FORM_KEY = "fedpilot_experiment_form"
const LOCAL_STORAGE_BUILDER_KEY = "fedpilot_config_builder"

function readStoredForm(): ExperimentForm | null {
  try {
    const val = localStorage.getItem(LOCAL_STORAGE_FORM_KEY)
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

function readStoredBuilder(): ConfigBuilder | null {
  try {
    const val = localStorage.getItem(LOCAL_STORAGE_BUILDER_KEY)
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

const PROMETHEUS_METRICS: PrometheusMetricDefinition[] = [
  // Round metrics
  {
    prometheusName: "round_test_accuracy_pre_aggregation_ratio",
    displayName: "round_test_accuracy_pre_aggregation_ratio",
    normalizeValue: normalizeRatioPercent,
  },
  {
    prometheusName: "round_test_accuracy_post_aggregation_ratio",
    displayName: "round_test_accuracy_post_aggregation_ratio",
    normalizeValue: normalizeRatioPercent,
  },
  {
    prometheusName: "round_train_accuracy_pre_aggregation_ratio",
    displayName: "round_train_accuracy_pre_aggregation_ratio",
    normalizeValue: normalizeRatioPercent,
  },
  {
    prometheusName: "round_train_accuracy_post_aggregation_ratio",
    displayName: "round_train_accuracy_post_aggregation_ratio",
    normalizeValue: normalizeRatioPercent,
  },
  {
    prometheusName: "round_local_training_time_seconds",
    displayName: "round_local_training_time_seconds",
  },
  {
    prometheusName: "round_model_sending_time_seconds",
    displayName: "round_model_sending_time_seconds",
  },
  {
    prometheusName: "round_aggregation_time_seconds",
    displayName: "round_aggregation_time_seconds",
  },
  {
    prometheusName: "round_model_receiving_time_seconds",
    displayName: "round_model_receiving_time_seconds",
  },
  {
    prometheusName: "round_elapsed_since_start_seconds",
    displayName: "round_elapsed_since_start_seconds",
  },
  {
    prometheusName: "round_sent_models_size_bytes",
    displayName: "round_sent_models_size_bytes",
  },
  {
    prometheusName: "round_received_models_size_bytes",
    displayName: "round_received_models_size_bytes",
  },
  {
    prometheusName: "federated_rounds_completed_total",
    prometheusQuery:
      'sum(federated_rounds_completed_total{client_id=~"$client_id", session_id=~"$session_id"})',
    displayName: "federated_rounds_completed_total",
  },

  // System metrics
  {
    prometheusName: "system_cpu_percent",
    prometheusQuery:
      'system_cpu_percent_sum{client_id=~"$client_id", session_id=~"$session_id"} / system_cpu_percent_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "system_cpu_percent",
  },
  {
    prometheusName: "system_disk_percent",
    prometheusQuery:
      'system_disk_percent_sum{client_id=~"$client_id", session_id=~"$session_id"} / system_disk_percent_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "system_disk_percent",
  },
  {
    prometheusName: "system_cpu_freq_mhz",
    prometheusQuery:
      'system_cpu_freq_mhz_MHz_sum{client_id=~"$client_id", session_id=~"$session_id"} / system_cpu_freq_mhz_MHz_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "system_cpu_freq_mhz",
  },
  {
    prometheusName: "system_disk_used_bytes",
    prometheusQuery:
      'system_disk_used_bytes_sum{client_id=~"$client_id", session_id=~"$session_id"} / system_disk_used_bytes_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "system_disk_used_bytes",
  },
  {
    prometheusName: "system_disk_total_bytes",
    prometheusQuery:
      'system_disk_total_bytes_sum{client_id=~"$client_id", session_id=~"$session_id"} / system_disk_total_bytes_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "system_disk_total_bytes",
  },
  {
    prometheusName: "system_network_bytes_sent_rate",
    prometheusQuery:
      'rate(system_network_bytes_sent_sum{client_id=~"$client_id", session_id=~"$session_id"}[1m])',
    displayName: "system_network_bytes_sent_rate",
  },
  {
    prometheusName: "system_network_bytes_recv_rate",
    prometheusQuery:
      'rate(system_network_bytes_recv_sum{client_id=~"$client_id", session_id=~"$session_id"}[1m])',
    displayName: "system_network_bytes_recv_rate",
  },

  // Performance metrics
  {
    prometheusName: "function_execution_time_seconds_avg",
    prometheusQuery:
      'function_execution_time_seconds_sum{client_id=~"$client_id", session_id=~"$session_id"} / function_execution_time_seconds_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "function_execution_time_seconds_avg",
  },
  {
    prometheusName: "function_execution_time_seconds_total",
    displayName: "function_execution_time_seconds_total",
  },
  {
    prometheusName: "function_calls_rate",
    prometheusQuery:
      'rate(function_calls_total{client_id=~"$client_id", session_id=~"$session_id"}[1m])',
    displayName: "function_calls_rate",
  },
  {
    prometheusName: "function_errors_rate",
    prometheusQuery:
      'rate(function_errors_total{client_id=~"$client_id", session_id=~"$session_id"}[1m])',
    displayName: "function_errors_rate",
  },

  // Memory metrics
  {
    prometheusName: "memory_percent",
    prometheusQuery:
      'memory_percent_sum{client_id=~"$client_id", session_id=~"$session_id"} / memory_percent_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "memory_percent",
  },
  {
    prometheusName: "memory_used_bytes",
    displayName: "memory_used_bytes",
  },
  {
    prometheusName: "memory_available_bytes",
    displayName: "memory_available_bytes",
  },
  {
    prometheusName: "process_memory_bytes",
    prometheusQuery:
      'process_memory_bytes_sum{client_id=~"$client_id", session_id=~"$session_id"} / process_memory_bytes_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "process_memory_bytes",
  },
  {
    prometheusName: "process_memory_peak_bytes",
    prometheusQuery:
      'process_memory_peak_bytes_sum{client_id=~"$client_id", session_id=~"$session_id"} / process_memory_peak_bytes_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "process_memory_peak_bytes",
  },

  // Convergence metrics
  {
    prometheusName: "convergence_events_total",
    prometheusQuery:
      'sum(convergence_events_total{client_id=~"$client_id", session_id=~"$session_id"})',
    displayName: "convergence_events_total",
  },
  {
    prometheusName: "convergence_rounds_to_convergence",
    prometheusQuery:
      'convergence_rounds_to_convergence_sum{client_id=~"$client_id", session_id=~"$session_id"} / convergence_rounds_to_convergence_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "convergence_rounds_to_convergence",
  },
  {
    prometheusName: "convergence_time_to_convergence_seconds",
    prometheusQuery:
      'convergence_time_to_convergence_seconds_sum{client_id=~"$client_id", session_id=~"$session_id"} / convergence_time_to_convergence_seconds_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "convergence_time_to_convergence_seconds",
  },
  {
    prometheusName: "convergence_target_accuracy",
    prometheusQuery:
      'convergence_target_accuracy_sum{client_id=~"$client_id", session_id=~"$session_id"} / convergence_target_accuracy_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "convergence_target_accuracy",
    normalizeValue: normalizeRatioPercent,
  },
  {
    prometheusName: "convergence_achieved_accuracy",
    prometheusQuery:
      'convergence_achieved_accuracy_sum{client_id=~"$client_id", session_id=~"$session_id"} / convergence_achieved_accuracy_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "convergence_achieved_accuracy",
    normalizeValue: normalizeRatioPercent,
  },
  {
    prometheusName: "convergence_final_loss",
    prometheusQuery:
      'convergence_final_loss_sum{client_id=~"$client_id", session_id=~"$session_id"} / convergence_final_loss_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "convergence_final_loss",
  },

  // Throughput metrics
  {
    prometheusName: "throughput_samples_per_second",
    prometheusQuery:
      'throughput_samples_per_second_sum{client_id=~"$client_id", session_id=~"$session_id"} / throughput_samples_per_second_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "throughput_samples_per_second",
  },
  {
    prometheusName: "throughput_mbps",
    prometheusQuery:
      'throughput_mbps_sum{client_id=~"$client_id", session_id=~"$session_id"} / throughput_mbps_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "throughput_mbps",
  },
  {
    prometheusName: "throughput_samples_processed_total",
    prometheusQuery:
      'sum(throughput_samples_processed_total{client_id=~"$client_id", session_id=~"$session_id"})',
    displayName: "throughput_samples_processed_total",
  },
  {
    prometheusName: "throughput_training_time_seconds",
    prometheusQuery:
      'throughput_training_time_seconds_sum{client_id=~"$client_id", session_id=~"$session_id"} / throughput_training_time_seconds_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "throughput_training_time_seconds",
  },

  // Communication metrics
  {
    prometheusName: "communication_messages_rate",
    prometheusQuery:
      'rate(communication_messages_total{client_id=~"$client_id", session_id=~"$session_id"}[1m])',
    displayName: "communication_messages_rate",
  },
  {
    prometheusName: "communication_errors_rate",
    prometheusQuery:
      'rate(communication_errors_total{client_id=~"$client_id", session_id=~"$session_id"}[1m])',
    displayName: "communication_errors_rate",
  },
  {
    prometheusName: "communication_bytes_sent_rate",
    prometheusQuery:
      'rate(communication_bytes_sent_total{client_id=~"$client_id", session_id=~"$session_id"}[1m])',
    displayName: "communication_bytes_sent_rate",
  },
  {
    prometheusName: "communication_bytes_received_rate",
    prometheusQuery:
      'rate(communication_bytes_received_total{client_id=~"$client_id", session_id=~"$session_id"}[1m])',
    displayName: "communication_bytes_received_rate",
  },
  {
    prometheusName: "communication_latency_ms",
    prometheusQuery:
      'communication_latency_ms_sum{client_id=~"$client_id", session_id=~"$session_id"} / communication_latency_ms_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "communication_latency_ms",
  },
  {
    prometheusName: "communication_bandwidth_mbps",
    prometheusQuery:
      'communication_bandwidth_mbps_sum{client_id=~"$client_id", session_id=~"$session_id"} / communication_bandwidth_mbps_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "communication_bandwidth_mbps",
  },

  // Availability metrics
  {
    prometheusName: "availability_events_total",
    prometheusQuery:
      'sum(availability_events_total{client_id=~"$client_id", session_id=~"$session_id"})',
    displayName: "availability_events_total",
  },
  {
    prometheusName: "availability_connection_attempts_total",
    prometheusQuery:
      'sum(availability_connection_attempts_total{client_id=~"$client_id", session_id=~"$session_id"})',
    displayName: "availability_connection_attempts_total",
  },
  {
    prometheusName: "availability_successful_reconnections_total",
    prometheusQuery:
      'sum(availability_successful_reconnections_total{client_id=~"$client_id", session_id=~"$session_id"})',
    displayName: "availability_successful_reconnections_total",
  },
  {
    prometheusName: "availability_uptime_seconds",
    prometheusQuery:
      'availability_uptime_seconds_sum{client_id=~"$client_id", session_id=~"$session_id"} / availability_uptime_seconds_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "availability_uptime_seconds",
  },
  {
    prometheusName: "availability_downtime_seconds",
    prometheusQuery:
      'availability_downtime_seconds_sum{client_id=~"$client_id", session_id=~"$session_id"} / availability_downtime_seconds_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "availability_downtime_seconds",
  },
  {
    prometheusName: "availability_total_downtime_seconds",
    prometheusQuery:
      'availability_total_downtime_seconds_sum{client_id=~"$client_id", session_id=~"$session_id"} / availability_total_downtime_seconds_count{client_id=~"$client_id", session_id=~"$session_id"}',
    displayName: "availability_total_downtime_seconds",
  },

  // Topology metrics
  {
    prometheusName: "topology_edges_observed_total",
    displayName: "topology_edges_observed_total",
  },
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
    const message =
      body?.error?.message ||
      (typeof detail === "string"
        ? detail
        : detail?.message || response.statusText || "Request failed")
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

async function prometheusRequest<T>(path: string): Promise<T> {
  const response = await fetch(
    serviceUrl(getDashboardRuntimeConfig().prometheusBaseUrl, path),
  )

  if (!response.ok) {
    throw new Error(response.statusText || "Prometheus request failed")
  }

  return response.json() as Promise<T>
}

async function fetchPrometheusExperimentMetrics(
  experiment: Experiment,
): Promise<ExperimentMetricsResponse> {
  const now = new Date()
  const start = new Date(experiment.started_at || experiment.created_at)
  const end = experiment.completed_at ? new Date(experiment.completed_at) : now
  const safeEnd = end > start ? end : now
  const step = prometheusStep(start, safeEnd)

  const metrics = await Promise.all(
    PROMETHEUS_METRICS.map(async (definition) => {
      let query = definition.prometheusQuery
      if (!query) {
        query = `${definition.prometheusName}{client_id=~"$client_id"}`
      } else {
        // Remove session_id filter as it does not exist in the OTel export schema
        query = query.replace(/session_id=~"[^"]*"/g, "")
        query = query.replace(/,\s*,/g, ",")
        query = query.replace(/\{\s*,/g, "{")
        query = query.replace(/,\s*\}/g, "}")
        query = query.replace(/\{\s*\}/g, "")
      }
      query = query.replace(/\$client_id/g, ".*")

      const params = new URLSearchParams({
        query,
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
    query: {
      source: "prometheus-direct",
      metric_names: PROMETHEUS_METRICS.map((metric) => metric.prometheusName),
      start: start.toISOString(),
      end: safeEnd.toISOString(),
      step,
      note: "Scoped by time-range to active experiment duration.",
    },
    metrics,
    series: metrics,
    live: experiment.status === "running",
    last_updated_at: now.toISOString(),
    fetched_at: now.toISOString(),
  }
}

function normalizeRatioPercent(value: number) {
  return Math.abs(value) <= 1 ? value * 100 : value
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

export function FedPilotDashboard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const search = useSearch({ strict: false })
  const [error, setError] = useState<string | null>(null)
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false)
  const [configBuilder, setConfigBuilder] = useState<ConfigBuilder>(
    () => readStoredBuilder() || defaultConfigBuilder,
  )
  const [form, setForm] = useState<ExperimentForm>(
    () => readStoredForm() || defaultExperimentForm,
  )
  const [validation, setValidation] = useState<ConfigValidationResponse | null>(
    null,
  )

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_FORM_KEY, JSON.stringify(form))
  }, [form])

  useEffect(() => {
    localStorage.setItem(
      LOCAL_STORAGE_BUILDER_KEY,
      JSON.stringify(configBuilder),
    )
  }, [configBuilder])
  const selectedId =
    typeof search.experiment_id === "string" ? search.experiment_id : null
  const workspaceTab = isExperimentWorkspaceTab(search.workspace)
    ? search.workspace
    : "create"
  const trackingTab = isExperimentTrackingTab(search.tracking)
    ? search.tracking
    : "overview"
  const hasExperimentSearchParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return (
      params.has("experiment_id") ||
      params.has("workspace") ||
      params.has("tracking")
    )
  }, [])
  const storedExperimentSearch = useMemo(
    () => (hasExperimentSearchParams ? null : readStoredExperimentSearch()),
    [hasExperimentSearchParams],
  )

  const updateExperimentSearch = (
    next: Partial<ExperimentRouteSearch>,
    replace = false,
  ) => {
    const nextSearch = {
      experiment_id: selectedId ?? undefined,
      tracking: trackingTab,
      workspace: workspaceTab,
      ...next,
    }

    writeStoredExperimentSearch(nextSearch)
    navigate({
      replace,
      search: nextSearch,
      to: "/",
    })
  }

  const experimentsQuery = useQuery({
    queryKey: ["experiments"],
    queryFn: () => apiRequest<ExperimentList>("/api/v1/experiments/list"),
  })

  const clustersQuery = useQuery({
    queryKey: ["clusters"],
    queryFn: () => apiRequest<ClusterList>("/api/v1/clusters"),
  })

  const experiments = experimentsQuery.data?.experiments ?? []
  const clusters = clustersQuery.data?.clusters ?? []

  useEffect(() => {
    if (!hasExperimentSearchParams && storedExperimentSearch) {
      navigate({
        replace: true,
        search: storedExperimentSearch,
        to: "/",
      })
      return
    }

    if (hasExperimentSearchParams) {
      writeStoredExperimentSearch({
        experiment_id: selectedId ?? undefined,
        tracking: trackingTab,
        workspace: workspaceTab,
      })
    }
  }, [
    hasExperimentSearchParams,
    navigate,
    selectedId,
    storedExperimentSearch,
    trackingTab,
    workspaceTab,
  ])

  useEffect(() => {
    if (experimentsQuery.isLoading) return
    if (!hasExperimentSearchParams && storedExperimentSearch) return

    if (experiments.length === 0) {
      if (selectedId || workspaceTab !== "create") {
        updateExperimentSearch(
          { experiment_id: undefined, workspace: "create" },
          true,
        )
      }
      return
    }

    if (!selectedId || !experiments.some((item) => item.id === selectedId)) {
      updateExperimentSearch({ experiment_id: experiments[0].id }, true)
    }
  }, [
    experiments,
    experimentsQuery.isLoading,
    hasExperimentSearchParams,
    selectedId,
    storedExperimentSearch,
    workspaceTab,
    updateExperimentSearch,
  ])

  useEffect(() => {
    if (!form.cluster_id && clusters.length > 0) {
      setForm((current) => ({ ...current, cluster_id: clusters[0].id }))
    }
  }, [clusters, form.cluster_id])

  const selectedExperiment = useMemo(
    () =>
      experiments.find((experiment) => experiment.id === selectedId) ?? null,
    [experiments, selectedId],
  )

  const detailQuery = useQuery({
    enabled: Boolean(selectedId),
    queryKey: ["experiment", selectedId],
    queryFn: () =>
      apiRequest<Experiment>(`/api/v1/experiments/${selectedId as string}`),
  })

  const experiment = detailQuery.data ?? selectedExperiment

  const metricsQuery = useQuery({
    enabled: Boolean(experiment),
    queryKey: [
      "experiment-metrics-prometheus",
      experiment?.id,
      experiment?.started_at,
      experiment?.completed_at,
    ],
    queryFn: () => fetchPrometheusExperimentMetrics(experiment as Experiment),
    refetchInterval: experiment?.status === "running" ? 10000 : false,
  })

  const validateConfig = useMutation({
    mutationFn: (configYaml: string) =>
      apiRequest<ConfigValidationResponse>(
        "/api/v1/experiments/validate-config",
        {
          body: JSON.stringify({ config_yaml: configYaml }),
          method: "POST",
        },
      ),
    onError: (err) => setError(err.message),
    onSuccess: (response) => {
      setError(null)
      setValidation(response)
    },
  })

  const initExperiment = useMutation({
    mutationFn: (payload: ExperimentCreate) =>
      apiRequest<ExperimentInitResponse>("/api/v1/experiments/init", {
        body: JSON.stringify(payload),
        method: "POST",
      }),
    onError: (err) => setError(err.message),
    onSuccess: async (response) => {
      setError(null)
      updateExperimentSearch({ experiment_id: response.experiment_id })
      await queryClient.invalidateQueries({ queryKey: ["experiments"] })
      await queryClient.invalidateQueries({
        queryKey: ["experiment", response.experiment_id],
      })
    },
  })

  const startExperiment = useMutation({
    mutationFn: (experimentId: string) =>
      apiRequest<ExperimentActionResponse>(
        `/api/v1/experiments/${experimentId}/start`,
        { method: "POST" },
      ),
    onError: (err) => setError(err.message),
    onSuccess: async (response) => {
      setError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["experiments"] }),
        queryClient.invalidateQueries({
          queryKey: ["experiment", response.experiment_id],
        }),
      ])
    },
  })

  const stopExperiment = useMutation({
    mutationFn: (experimentId: string) =>
      apiRequest<ExperimentActionResponse>(
        `/api/v1/experiments/${experimentId}/stop`,
        { method: "POST" },
      ),
    onError: (err) => setError(err.message),
    onSuccess: async (response) => {
      setError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["experiments"] }),
        queryClient.invalidateQueries({
          queryKey: ["experiment", response.experiment_id],
        }),
      ])
    },
  })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const deleteExperiment = useMutation({
    mutationFn: (experimentId: string) =>
      apiRequest<ExperimentActionResponse>(
        `/api/v1/experiments/${experimentId}`,
        {
          method: "DELETE",
        },
      ),
    onError: (err) => setError(err.message),
    onSuccess: async () => {
      setError(null)
      setIsDeleteOpen(false)
      updateExperimentSearch({ experiment_id: undefined })
      await queryClient.invalidateQueries({ queryKey: ["experiments"] })
    },
  })

  const submitExperiment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = compactExperimentForm(form)

    if (!payload.name || !payload.cluster_id || !payload.config_yaml) {
      setError("Name, cluster, and config YAML are required.")
      return
    }

    initExperiment.mutate(payload)
  }

  const updateConfigBuilder = (next: Partial<ConfigBuilder>) => {
    const updated = { ...configBuilder, ...next }
    setValidation(null)
    setConfigBuilder(updated)
    setForm((formState) => ({
      ...formState,
      config_yaml: buildConfigYaml(updated),
    }))
  }

  const updateConfigYaml = (configYaml: string) => {
    setValidation(null)
    setConfigBuilder((current) =>
      parseConfigBuilderFromYaml(configYaml, current),
    )
    setForm((current) => ({
      ...current,
      config_yaml: configYaml,
    }))
  }

  return (
    <div className="space-y-5">
      <ExperimentCommandHeader
        experiment={experiment}
        isRefreshing={experimentsQuery.isFetching || detailQuery.isFetching}
        isStarting={startExperiment.isPending}
        isStopping={stopExperiment.isPending}
        onRefresh={() => {
          experimentsQuery.refetch()
          if (selectedId) detailQuery.refetch()
        }}
        onStart={(experimentId) => startExperiment.mutate(experimentId)}
        onStop={(experimentId) => stopExperiment.mutate(experimentId)}
      />

      <ExperimentKpiStrip
        experiment={experiment}
        metrics={metricsQuery.data ?? null}
        metricsLoading={metricsQuery.isLoading || metricsQuery.isFetching}
        total={experimentsQuery.data?.total ?? experiments.length}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Experiment request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          "grid min-w-0 items-start gap-5 transition-[grid-template-columns] duration-75 ease-out",
          isSummaryCollapsed
            ? "xl:grid-cols-[72px_minmax(0,1fr)]"
            : "xl:grid-cols-[300px_minmax(0,1fr)]",
        )}
      >
        <ExperimentWorkspacePanel
          experiment={experiment}
          experiments={experiments}
          isCollapsed={isSummaryCollapsed}
          isLoading={experimentsQuery.isLoading}
          onCollapsedChange={setIsSummaryCollapsed}
          onSelect={(experimentId) =>
            updateExperimentSearch({ experiment_id: experimentId })
          }
          selectedId={selectedId}
          onCreateClick={() => setIsCreateOpen(true)}
          onDeleteClick={() => setIsDeleteOpen(true)}
        />

        <div className="min-w-0">
          <ExperimentMainWorkspace
            builder={configBuilder}
            clusters={clusters}
            detailLoading={detailQuery.isLoading}
            experiment={experiment}
            form={form}
            isInitializing={initExperiment.isPending}
            isLoadingClusters={clustersQuery.isLoading}
            metrics={metricsQuery.data ?? null}
            metricsError={metricsQuery.error?.message ?? null}
            metricsLoading={metricsQuery.isLoading || metricsQuery.isFetching}
            isValidating={validateConfig.isPending}
            onBuilderChange={updateConfigBuilder}
            onChange={(next) => {
              setValidation(null)
              setForm((current) => ({ ...current, ...next }))
            }}
            onYamlChange={updateConfigYaml}
            onSubmit={(e) => {
              submitExperiment(e)
              if (!error) setIsCreateOpen(false)
            }}
            onTrackingTabChange={(tracking) =>
              updateExperimentSearch({ tracking })
            }
            onValidate={() => validateConfig.mutate(form.config_yaml)}
            onWorkspaceTabChange={(workspace) =>
              updateExperimentSearch({ workspace })
            }
            trackingTab={trackingTab}
            validation={validation}
            workspaceTab={workspaceTab}
          />
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto p-0">
          <ExperimentCreatePanel
            builder={configBuilder}
            clusters={clusters}
            form={form}
            isInitializing={initExperiment.isPending}
            isLoadingClusters={clustersQuery.isLoading}
            isValidating={validateConfig.isPending}
            onBuilderChange={updateConfigBuilder}
            onChange={(next) => {
              setValidation(null)
              setForm((current) => ({ ...current, ...next }))
            }}
            onYamlChange={updateConfigYaml}
            onSubmit={(e) => {
              submitExperiment(e)
              if (!error) setIsCreateOpen(false)
            }}
            onValidate={() => validateConfig.mutate(form.config_yaml)}
            validation={validation}
          />
        </DialogContent>
      </Dialog>

      <DeleteExperimentDialog
        isOpen={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        isPending={deleteExperiment.isPending}
        onDelete={() => selectedId && deleteExperiment.mutate(selectedId)}
      />
    </div>
  )
}

function compactExperimentForm(form: ExperimentForm): ExperimentCreate {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    cluster_id: form.cluster_id,
    config_yaml: form.config_yaml.trim(),
  }
}

function buildConfigYaml(builder: ConfigBuilder) {
  const otelMetric = yamlBool(builder.otel_enabled)

  return `federation_id: ${yamlString(builder.federation_id, "0.0.1")}
device: ${yamlValue(builder.device, "cpu")}
random_seed: ${yamlNumber(builder.random_seed, "42")}
production_mode: false
runtime_engine: torch
placement_group_strategy: SPREAD
federated_learning_schema: ${yamlValue(builder.federated_learning_schema, "DecentralizedFederatedLearning")}
federated_learning_topology: ${yamlValue(builder.federated_learning_topology, "k_connect")}
client_k_neighbors: ${yamlNumber(builder.client_k_neighbors, "2")}
client_role: train
draw_topology: false
model_type: ${yamlValue(builder.model_type, "cnn")}
pretrained_models: false
transformer_model_size: base
dataset_type: ${yamlValue(builder.dataset_type, "fmnist")}
transform_input_size: ${yamlNumber(builder.transform_input_size, "28")}
data_distribution_kind: ${yamlString(builder.data_distribution_kind, "30")}
desired_distribution: null
learning_rate: ${yamlNumber(builder.learning_rate, "0.001")}
optimizer: ${yamlValue(builder.optimizer, "sgd")}
train_batch_size: ${yamlNumber(builder.train_batch_size, "64")}
test_batch_size: ${yamlNumber(builder.test_batch_size, "128")}
number_of_epochs: ${yamlNumber(builder.number_of_epochs, "1")}
loss_function: ${yamlValue(builder.loss_function, "CrossEntropy")}
weight_decay: null
number_of_clients: ${yamlNumber(builder.number_of_clients, "5")}
federated_learning_rounds: ${yamlNumber(builder.federated_learning_rounds, "10")}
client_sampling_rate: ${yamlNumber(builder.client_sampling_rate, "1.0")}
stop_avg_accuracy: ${yamlNumber(builder.stop_avg_accuracy, "0.99")}
aggregation_strategy: ${yamlValue(builder.aggregation_strategy, "FedAvg")}
distance_metric: ${yamlValue(builder.distance_metric, "cosine")}
fed_avg: ${yamlBool(builder.aggregation_strategy === "FedAvg")}
distance_metric_on_parameters: true
remove_common_ids: false
sensitivity_percentage: 100
dynamic_sensitivity_percentage: false
do_cluster: ${yamlBool(builder.do_cluster)}
pre_computed_data_driven_clustering: false
clustering_period: 6
save_before_aggregation_models: false
save_global_models: false
mean_accuracy_to_csv: true
dp_enabled: ${yamlBool(builder.dp_enabled)}
chunking: ${yamlBool(builder.chunking)}
ray_dashboard: ${yamlBool(builder.ray_dashboard)}
ray_dashboard_port: 8265
otel_enabled: ${yamlBool(builder.otel_enabled)}
otel_service_name: federated-training
otel_endpoint: ${yamlString(builder.otel_endpoint, "http://localhost:4318/v1/metrics")}
metrics:
  round: true
  round_otel: ${otelMetric}
  memory: true
  memory_otel: ${otelMetric}
  performance: true
  performance_otel: ${otelMetric}
  communication: true
  communication_otel: ${otelMetric}
  system: true
  system_otel: ${otelMetric}
  convergence: true
  convergence_otel: ${otelMetric}
  throughput: true
  throughput_otel: ${otelMetric}
  availability: true
  availability_otel: ${otelMetric}
  topology: true
  topology_otel: ${otelMetric}
gpu_index: ${yamlString(builder.gpu_index, "0")}
mlflow_enabled: ${yamlBool(builder.mlflow_enabled)}
mlflow_tracking_uri: ${yamlString(builder.mlflow_tracking_uri, "http://localhost:5000")}
mlflow_experiment_prefix: ${yamlString(builder.mlflow_experiment_prefix, "FedPilot")}
`
}

function yamlBool(value: boolean) {
  return value ? "true" : "false"
}

function yamlNumber(value: string, fallback: string) {
  return value.trim() || fallback
}

function yamlString(value: string, fallback: string) {
  return `'${escapeYamlString(value.trim() || fallback)}'`
}

function yamlValue(value: string, fallback: string) {
  return escapeYamlString(value.trim() || fallback)
}

function escapeYamlString(value: string) {
  return value.replace(/'/g, "''")
}

function parseConfigBuilderFromYaml(
  configYaml: string,
  current: ConfigBuilder,
): ConfigBuilder {
  return {
    ...current,
    aggregation_strategy: configString(
      configYaml,
      "aggregation_strategy",
      current.aggregation_strategy,
    ),
    client_k_neighbors: configString(
      configYaml,
      "client_k_neighbors",
      current.client_k_neighbors,
    ),
    client_sampling_rate: configString(
      configYaml,
      "client_sampling_rate",
      current.client_sampling_rate,
    ),
    chunking: configBool(configYaml, "chunking", current.chunking),
    data_distribution_kind: configString(
      configYaml,
      "data_distribution_kind",
      current.data_distribution_kind,
    ),
    dataset_type: configString(
      configYaml,
      "dataset_type",
      current.dataset_type,
    ),
    device: configString(configYaml, "device", current.device),
    do_cluster: configBool(configYaml, "do_cluster", current.do_cluster),
    dp_enabled: configBool(configYaml, "dp_enabled", current.dp_enabled),
    distance_metric: configString(
      configYaml,
      "distance_metric",
      current.distance_metric,
    ),
    federated_learning_rounds: configString(
      configYaml,
      "federated_learning_rounds",
      current.federated_learning_rounds,
    ),
    federated_learning_schema: configString(
      configYaml,
      "federated_learning_schema",
      current.federated_learning_schema,
    ),
    federated_learning_topology: configString(
      configYaml,
      "federated_learning_topology",
      current.federated_learning_topology,
    ),
    federation_id: configString(
      configYaml,
      "federation_id",
      current.federation_id,
    ),
    gpu_index: configString(configYaml, "gpu_index", current.gpu_index),
    learning_rate: configString(
      configYaml,
      "learning_rate",
      current.learning_rate,
    ),
    loss_function: configString(
      configYaml,
      "loss_function",
      current.loss_function,
    ),
    model_type: configString(configYaml, "model_type", current.model_type),
    mlflow_enabled: configBool(
      configYaml,
      "mlflow_enabled",
      current.mlflow_enabled,
    ),
    mlflow_tracking_uri: configString(
      configYaml,
      "mlflow_tracking_uri",
      current.mlflow_tracking_uri,
    ),
    mlflow_experiment_prefix: configString(
      configYaml,
      "mlflow_experiment_prefix",
      current.mlflow_experiment_prefix,
    ),
    number_of_clients: configString(
      configYaml,
      "number_of_clients",
      current.number_of_clients,
    ),
    number_of_epochs: configString(
      configYaml,
      "number_of_epochs",
      current.number_of_epochs,
    ),
    optimizer: configString(configYaml, "optimizer", current.optimizer),
    otel_enabled: configBool(configYaml, "otel_enabled", current.otel_enabled),
    otel_endpoint: configString(
      configYaml,
      "otel_endpoint",
      current.otel_endpoint,
    ),
    random_seed: configString(configYaml, "random_seed", current.random_seed),
    ray_dashboard: configBool(
      configYaml,
      "ray_dashboard",
      current.ray_dashboard,
    ),
    stop_avg_accuracy: configString(
      configYaml,
      "stop_avg_accuracy",
      current.stop_avg_accuracy,
    ),
    test_batch_size: configString(
      configYaml,
      "test_batch_size",
      current.test_batch_size,
    ),
    train_batch_size: configString(
      configYaml,
      "train_batch_size",
      current.train_batch_size,
    ),
    transform_input_size: configString(
      configYaml,
      "transform_input_size",
      current.transform_input_size,
    ),
  }
}

function configString(configYaml: string, key: string, fallback: string) {
  return readConfigValue(configYaml, key) ?? fallback
}

function configBool(configYaml: string, key: string, fallback: boolean) {
  const value = readConfigValue(configYaml, key)
  if (value === null) return fallback
  return value.toLowerCase() === "true"
}

function ExperimentCommandHeader({
  experiment,
  isRefreshing,
  isStarting,
  isStopping,
  onRefresh,
  onStart,
  onStop,
}: {
  experiment: Experiment | null
  isRefreshing: boolean
  isStarting: boolean
  isStopping: boolean
  onRefresh: () => void
  onStart: (experimentId: string) => void
  onStop: (experimentId: string) => void
}) {
  const canStart =
    experiment && ["pending", "failed", "stopped"].includes(experiment.status)
  const canStop = experiment?.status === "running"
  const title = experiment?.name || "FedPilot Experiment"

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-normal">
            {title}
          </h1>
          {experiment ? (
            <StatusBadge status={experiment.status} />
          ) : (
            <Badge
              className="border-border text-muted-foreground"
              variant="outline"
            >
              No active run
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {experiment?.description ||
            "Create configs, submit Ray jobs, and inspect experiment state."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ExperimentLogsDialog experiment={experiment} />
        <Button
          disabled={isRefreshing}
          onClick={onRefresh}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
        <Button
          disabled={!canStop || isStopping}
          onClick={() => experiment && onStop(experiment.id)}
          size="sm"
          variant="outline"
        >
          {isStopping ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <PauseCircle className="size-4" />
          )}
          Stop
        </Button>
        <Button
          disabled={!canStart || isStarting}
          onClick={() => experiment && onStart(experiment.id)}
          size="sm"
        >
          {isStarting ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : experiment?.status === "pending" ? (
            <PlayCircle className="size-4" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {experiment?.status === "pending" ? "Start" : "Retry"}
        </Button>
      </div>
    </div>
  )
}

function ExperimentLogsDialog({
  experiment,
}: {
  experiment: Experiment | null
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [copiedText, copy] = useCopyToClipboard()
  const logsHref = browserServiceOpenUrl("rayDashboard", experiment?.logs_url)
  const rayHref = browserServiceOpenUrl(
    "rayDashboard",
    experiment?.ray_dashboard_url,
  )
  const mlflowHref = browserServiceOpenUrl("mlflow", experiment?.mlflow_run_url)
  const logsQuery = useQuery({
    enabled: isOpen && Boolean(experiment),
    queryKey: ["experiment-logs", experiment?.id],
    queryFn: () =>
      apiRequest<ExperimentLogsResponse>(
        `/api/v1/experiments/${experiment?.id as string}/logs`,
      ),
    refetchInterval: isOpen ? 3000 : false,
  })
  const logs = logsQuery.data?.logs ?? ""
  const hasLogs = logs.trim().length > 0

  const logsContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [])

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button disabled={!experiment} size="sm" variant="outline">
          <FileText className="size-4" />
          Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[min(64rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Experiment Logs</DialogTitle>
          <DialogDescription>
            Auto-refreshing Ray job output for the selected experiment.
          </DialogDescription>
        </DialogHeader>
        {experiment ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-background/60 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {experiment.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {logsQuery.isFetching
                    ? "Refreshing logs..."
                    : logsQuery.data?.last_updated_at
                      ? `Last updated ${formatTime(logsQuery.data.last_updated_at)}`
                      : experiment.status_message ||
                        "Waiting for runtime logs."}
                </p>
              </div>
              <StatusBadge status={experiment.status} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!hasLogs}
                onClick={() => copy(logs)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy className="size-4" />
                {copiedText === logs ? "Copied" : "Copy"}
              </Button>
              <Button
                disabled={!hasLogs}
                onClick={() =>
                  downloadTextFile(
                    `${safeFileName(experiment.name)}-${shortId(experiment.id)}.log`,
                    logs,
                  )
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Download className="size-4" />
                Download
              </Button>
              <Button
                disabled={logsQuery.isFetching}
                onClick={() => logsQuery.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw
                  className={cn(
                    "size-4",
                    logsQuery.isFetching && "animate-spin",
                  )}
                />
                Refresh
              </Button>
              <ExternalLinkButton href={logsHref} label="Ray logs" />
              <ExternalLinkButton href={rayHref} label="Ray dashboard" />
              <ExternalLinkButton href={mlflowHref} label="MLflow run" />
            </div>

            <div
              ref={logsContainerRef}
              className="max-h-[56vh] min-h-72 w-full max-w-full overflow-auto rounded-lg border bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-100"
            >
              {logsQuery.isError ? (
                <p className="text-sm text-red-600 dark:text-red-300">
                  {logsQuery.error.message ||
                    "Unable to fetch experiment logs."}
                </p>
              ) : hasLogs ? (
                <pre className="min-w-0 whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
                  {logs}
                </pre>
              ) : (
                <div className="flex min-h-56 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
                  {experiment.ray_job_id
                    ? "No log lines have been returned yet."
                    : "This experiment has not submitted a Ray job yet."}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select an experiment before opening logs.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ExperimentKpiStrip({
  experiment,
  metrics,
  metricsLoading,
  total,
}: {
  experiment: Experiment | null
  metrics: ExperimentMetricsResponse | null
  metricsLoading: boolean
  total: number
}) {
  const configuredRounds = readConfigValue(
    experiment?.config_yaml,
    "federated_learning_rounds",
  )
  const configuredClients = readConfigValue(
    experiment?.config_yaml,
    "number_of_clients",
  )
  const dataset = readConfigValue(experiment?.config_yaml, "dataset_type")
  const liveSummary = getLiveExperimentSummary(metrics)
  const hasLiveMetrics = liveSummary.hasPrometheusData
  const roundsValue =
    liveSummary.completedRounds !== null
      ? configuredRounds
        ? `${formatCompactNumber(liveSummary.completedRounds)} / ${configuredRounds}`
        : formatCompactNumber(liveSummary.completedRounds)
      : configuredRounds
        ? `${configuredRounds} configured`
        : metricsLoading
          ? "Loading"
          : "Pending"
  const clientsValue =
    liveSummary.activeClients !== null
      ? configuredClients
        ? `${liveSummary.activeClients} / ${configuredClients}`
        : liveSummary.activeClients.toString()
      : configuredClients
        ? configuredClients
        : metricsLoading
          ? "Loading"
          : "Pending"

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ExperimentKpiCard
        detail={
          hasLiveMetrics
            ? "Latest reported test score"
            : experiment?.status_message || "backend lifecycle state"
        }
        icon={BarChart3}
        label={hasLiveMetrics ? "Accuracy" : "Status"}
        tone="text-emerald-600 bg-emerald-500/10 dark:text-emerald-300"
        value={
          liveSummary.accuracy !== null
            ? formatMetricValue(liveSummary.accuracy, {
                suffix: "%",
                decimals: 2,
              })
            : experiment?.status || "No run"
        }
      />
      <ExperimentKpiCard
        detail={
          liveSummary.completedRounds !== null
            ? `${total} total experiments`
            : `${total} total experiments`
        }
        icon={RefreshCw}
        label="Rounds"
        tone="text-blue-600 bg-blue-500/10 dark:text-blue-300"
        value={roundsValue}
      />
      <ExperimentKpiCard
        detail={
          liveSummary.activeClients !== null
            ? dataset
              ? `${dataset} dataset`
              : "Reporting clients"
            : dataset
              ? `${dataset} dataset`
              : "dataset unavailable"
        }
        icon={Users}
        label="Clients"
        tone="text-amber-600 bg-amber-500/10 dark:text-amber-300"
        value={clientsValue}
      />
      <ExperimentKpiCard
        detail={
          liveSummary.averageRoundTime !== null
            ? "Latest training + aggregation average"
            : experiment?.ray_job_id || "No Ray job submitted"
        }
        icon={Clock3}
        label={
          liveSummary.averageRoundTime !== null ? "Avg Round Time" : "Ray Job"
        }
        tone="text-rose-600 bg-rose-500/10 dark:text-rose-300"
        value={
          liveSummary.averageRoundTime !== null
            ? formatMetricValue(liveSummary.averageRoundTime, {
                suffix: "s",
                decimals: 3,
              })
            : experiment?.ray_job_id
              ? "Submitted"
              : "Not submitted"
        }
      />
    </div>
  )
}

function ExperimentKpiCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string
  icon: LucideIcon
  label: string
  tone: string
  value: string
}) {
  return (
    <Card className="gap-4 rounded-lg py-4">
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-normal">
            {value}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {detail}
          </p>
        </div>
        <div className={cn("rounded-md p-2", tone)}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function ExperimentMainWorkspace({
  builder,
  clusters,
  detailLoading,
  experiment,
  form,
  isInitializing,
  isLoadingClusters,
  metrics,
  metricsError,
  metricsLoading,
  isValidating,
  onBuilderChange,
  onChange,
  onSubmit,
  onTrackingTabChange,
  onValidate,
  onWorkspaceTabChange,
  onYamlChange,
  trackingTab,
  validation,
  workspaceTab,
}: {
  builder: ConfigBuilder
  clusters: Cluster[]
  detailLoading: boolean
  experiment: Experiment | null
  form: ExperimentForm
  isInitializing: boolean
  isLoadingClusters: boolean
  metrics: ExperimentMetricsResponse | null
  metricsError: string | null
  metricsLoading: boolean
  isValidating: boolean
  onBuilderChange: (next: Partial<ConfigBuilder>) => void
  onChange: (next: Partial<ExperimentForm>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTrackingTabChange: (tracking: ExperimentTrackingTab) => void
  onValidate: () => void
  onWorkspaceTabChange: (workspace: ExperimentWorkspaceTab) => void
  onYamlChange: (configYaml: string) => void
  trackingTab: ExperimentTrackingTab
  validation: ConfigValidationResponse | null
  workspaceTab: ExperimentWorkspaceTab
}) {
  return (
    <Card className="overflow-hidden rounded-lg space-y-5">
      <CardHeader className="gap-4 border-b bg-card/60 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <CardTitle>Experiment Workspace</CardTitle>
          <CardDescription>
            Inspect the selected run and track its metrics.
          </CardDescription>
        </div>
      </CardHeader>
      <div className="p-0">
        <ExperimentDetailPanel
          experiment={experiment}
          isLoading={detailLoading}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          onTrackingTabChange={onTrackingTabChange}
          trackingTab={trackingTab}
        />
      </div>
    </Card>
  )
}

function ExperimentCreatePanel({
  builder,
  clusters,
  form,
  isInitializing,
  isLoadingClusters,
  isValidating,
  onBuilderChange,
  onChange,
  onSubmit,
  onValidate,
  onYamlChange,
  validation,
}: {
  builder: ConfigBuilder
  clusters: Cluster[]
  form: ExperimentForm
  isInitializing: boolean
  isLoadingClusters: boolean
  isValidating: boolean
  onBuilderChange: (next: Partial<ConfigBuilder>) => void
  onChange: (next: Partial<ExperimentForm>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onValidate: () => void
  onYamlChange: (configYaml: string) => void
  validation: ConfigValidationResponse | null
}) {
  return (
    <div>
      <div className="border-b bg-card/40 py-4 pl-5 pr-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Create Config</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Build YAML, validate it, then create a pending experiment.
            </p>
          </div>
          <ValidationPill validation={validation} />
        </div>
      </div>
      <div className="px-5">
        <form
          className="grid gap-5 py-5 lg:grid-cols-[340px_minmax(0,1fr)]"
          onSubmit={onSubmit}
        >
          <div className="space-y-5">
            <div className="space-y-4">
              <Field label="Name">
                <Input
                  onChange={(event) => onChange({ name: event.target.value })}
                  value={form.name}
                />
              </Field>
              <Field label="Cluster">
                <Select
                  disabled={isLoadingClusters || clusters.length === 0}
                  onValueChange={(value) => onChange({ cluster_id: value })}
                  value={form.cluster_id}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select cluster" />
                  </SelectTrigger>
                  <SelectContent>
                    {clusters.map((cluster) => (
                      <SelectItem key={cluster.id} value={cluster.id}>
                        {cluster.name} ({cluster.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Description">
                <Input
                  onChange={(event) =>
                    onChange({ description: event.target.value })
                  }
                  value={form.description}
                />
              </Field>
            </div>

            <ValidationSummary validation={validation} />

            <div className="grid gap-2">
              <Button
                disabled={isValidating || !form.config_yaml.trim()}
                onClick={onValidate}
                type="button"
                variant="outline"
              >
                {isValidating ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                Validate config
              </Button>
              <Button
                disabled={
                  isInitializing ||
                  clusters.length === 0 ||
                  validation?.valid === false ||
                  !form.name.trim() ||
                  !form.cluster_id ||
                  !form.config_yaml.trim()
                }
                type="submit"
              >
                {isInitializing ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <PlayCircle className="size-4" />
                )}
                Create experiment
              </Button>
            </div>
          </div>

          <Tabs className="min-w-0" defaultValue="builder">
            <TabsList>
              <TabsTrigger value="builder">
                <Wand2 className="size-4" />
                Builder
              </TabsTrigger>
              <TabsTrigger value="yaml">
                <FileText className="size-4" />
                YAML
              </TabsTrigger>
            </TabsList>
            <TabsContent value="builder">
              <ConfigBuilderPanel
                builder={builder}
                onChange={onBuilderChange}
              />
            </TabsContent>
            <TabsContent value="yaml">
              <textarea
                className="min-h-[390px] w-full resize-y rounded-lg border bg-background/70 p-4 font-mono text-xs leading-relaxed text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                onChange={(event) => onYamlChange(event.target.value)}
                spellCheck={false}
                value={form.config_yaml}
              />
            </TabsContent>
          </Tabs>
        </form>
      </div>
    </div>
  )
}

function ConfigBuilderPanel({
  builder,
  onChange,
}: {
  builder: ConfigBuilder
  onChange: (next: Partial<ConfigBuilder>) => void
}) {
  return (
    <div className="rounded-lg border bg-background/50 p-4">
      <Tabs defaultValue="General">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start bg-muted/50 p-1">
          <TabsTrigger value="General">General</TabsTrigger>
          <TabsTrigger value="ModelAndData">Model & Data</TabsTrigger>
          <TabsTrigger value="Training">Training</TabsTrigger>
          <TabsTrigger value="Federation">Federation</TabsTrigger>
          <TabsTrigger value="Aggregation">Aggregation</TabsTrigger>
          <TabsTrigger value="Runtime">Runtime</TabsTrigger>
          <TabsTrigger value="MLflow">MLflow</TabsTrigger>
        </TabsList>

        <TabsContent value="General" className="m-0">
          <BuilderSection title="General">
            <BuilderTextField
              label="Federation ID"
              onChange={(value) => onChange({ federation_id: value })}
              value={builder.federation_id}
            />
            <BuilderSelectField
              label="Device"
              onChange={(value) => onChange({ device: value })}
              options={["cpu", "cuda"]}
              value={builder.device}
            />
            <BuilderTextField
              label="GPU Index"
              onChange={(value) => onChange({ gpu_index: value })}
              value={builder.gpu_index}
            />
            <BuilderTextField
              label="Random Seed"
              onChange={(value) => onChange({ random_seed: value })}
              type="number"
              value={builder.random_seed}
            />
          </BuilderSection>
        </TabsContent>

        <TabsContent value="ModelAndData" className="m-0">
          <BuilderSection title="Model And Data">
            <BuilderSelectField
              label="Model"
              onChange={(value) => onChange({ model_type: value })}
              options={[
                "cnn",
                "lenet",
                "resnet18",
                "resnet50",
                "vgg16",
                "vit",
                "bert",
              ]}
              value={builder.model_type}
            />
            <BuilderSelectField
              label="Dataset"
              onChange={(value) => onChange({ dataset_type: value })}
              options={[
                "mnist",
                "fmnist",
                "cifar10",
                "cifar100",
                "svhn",
                "femnist",
              ]}
              value={builder.dataset_type}
            />
            <BuilderSelectField
              label="Distribution"
              onChange={(value) => onChange({ data_distribution_kind: value })}
              options={["iid", "30", "40", "50", "60", "70", "80", "90", "dir"]}
              value={builder.data_distribution_kind}
            />
            <BuilderTextField
              label="Input Size"
              onChange={(value) => onChange({ transform_input_size: value })}
              type="number"
              value={builder.transform_input_size}
            />
          </BuilderSection>
        </TabsContent>

        <TabsContent value="Training" className="m-0">
          <BuilderSection title="Training">
            <BuilderTextField
              label="Learning Rate"
              onChange={(value) => onChange({ learning_rate: value })}
              type="number"
              value={builder.learning_rate}
            />
            <BuilderSelectField
              label="Optimizer"
              onChange={(value) => onChange({ optimizer: value })}
              options={["sgd", "adam", "adamw", "rmsprop"]}
              value={builder.optimizer}
            />
            <BuilderSelectField
              label="Loss"
              onChange={(value) => onChange({ loss_function: value })}
              options={[
                "CrossEntropy",
                "cross_entropy",
                "nll_loss",
                "mse_loss",
              ]}
              value={builder.loss_function}
            />
            <BuilderTextField
              label="Epochs"
              onChange={(value) => onChange({ number_of_epochs: value })}
              type="number"
              value={builder.number_of_epochs}
            />
            <BuilderTextField
              label="Train Batch"
              onChange={(value) => onChange({ train_batch_size: value })}
              type="number"
              value={builder.train_batch_size}
            />
            <BuilderTextField
              label="Test Batch"
              onChange={(value) => onChange({ test_batch_size: value })}
              type="number"
              value={builder.test_batch_size}
            />
          </BuilderSection>
        </TabsContent>

        <TabsContent value="Federation" className="m-0">
          <BuilderSection title="Federation">
            <BuilderSelectField
              label="Schema"
              onChange={(value) =>
                onChange({ federated_learning_schema: value })
              }
              options={[
                "TraditionalFederatedLearning",
                "DecentralizedFederatedLearning",
                "ClusterFederatedLearningSchema",
              ]}
              value={builder.federated_learning_schema}
            />
            <BuilderSelectField
              label="Topology"
              onChange={(value) =>
                onChange({ federated_learning_topology: value })
              }
              options={["star", "k_connect", "ring", "custom"]}
              value={builder.federated_learning_topology}
            />
            <BuilderTextField
              label="Neighbors"
              onChange={(value) => onChange({ client_k_neighbors: value })}
              type="number"
              value={builder.client_k_neighbors}
            />
            <BuilderTextField
              label="Clients"
              onChange={(value) => onChange({ number_of_clients: value })}
              type="number"
              value={builder.number_of_clients}
            />
            <BuilderTextField
              label="Rounds"
              onChange={(value) =>
                onChange({ federated_learning_rounds: value })
              }
              type="number"
              value={builder.federated_learning_rounds}
            />
            <BuilderTextField
              label="Sampling Rate"
              onChange={(value) => onChange({ client_sampling_rate: value })}
              type="number"
              value={builder.client_sampling_rate}
            />
          </BuilderSection>
        </TabsContent>

        <TabsContent value="Aggregation" className="m-0">
          <BuilderSection title="Aggregation">
            <BuilderSelectField
              label="Strategy"
              onChange={(value) => onChange({ aggregation_strategy: value })}
              options={["FedAvg", "FedProx"]}
              value={builder.aggregation_strategy}
            />
            <BuilderSelectField
              label="Distance"
              onChange={(value) => onChange({ distance_metric: value })}
              options={["cosine", "euclidean", "coordinate"]}
              value={builder.distance_metric}
            />
            <BuilderTextField
              label="Stop Accuracy"
              onChange={(value) => onChange({ stop_avg_accuracy: value })}
              type="number"
              value={builder.stop_avg_accuracy}
            />
            <BuilderCheckboxField
              checked={builder.do_cluster}
              label="Do Cluster"
              onChange={(value) => onChange({ do_cluster: value })}
            />
          </BuilderSection>
        </TabsContent>

        <TabsContent value="Runtime" className="m-0">
          <BuilderSection title="Runtime">
            <BuilderCheckboxField
              checked={builder.ray_dashboard}
              label="Ray Dashboard"
              onChange={(value) => onChange({ ray_dashboard: value })}
            />
            <BuilderCheckboxField
              checked={builder.otel_enabled}
              label="OTEL Metrics"
              onChange={(value) => onChange({ otel_enabled: value })}
            />
            <BuilderTextField
              label="OTEL Endpoint"
              onChange={(value) => onChange({ otel_endpoint: value })}
              value={builder.otel_endpoint}
            />
            <BuilderCheckboxField
              checked={builder.dp_enabled}
              label="Differential Privacy"
              onChange={(value) => onChange({ dp_enabled: value })}
            />
            <BuilderCheckboxField
              checked={builder.chunking}
              label="Chunking"
              onChange={(value) => onChange({ chunking: value })}
            />
          </BuilderSection>
        </TabsContent>

        <TabsContent value="MLflow" className="m-0">
          <BuilderSection title="MLflow Tracking">
            <BuilderCheckboxField
              checked={builder.mlflow_enabled}
              label="Enable MLflow"
              onChange={(value) => onChange({ mlflow_enabled: value })}
            />
            <BuilderTextField
              label="Tracking URI"
              onChange={(value) => onChange({ mlflow_tracking_uri: value })}
              value={builder.mlflow_tracking_uri}
            />
            <BuilderTextField
              label="Experiment Prefix"
              onChange={(value) =>
                onChange({ mlflow_experiment_prefix: value })
              }
              value={builder.mlflow_experiment_prefix}
            />
          </BuilderSection>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BuilderSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function BuilderTextField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string
  onChange: (value: string) => void
  type?: "number" | "text"
  value: string
}) {
  return (
    <Field label={label}>
      <Input
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </Field>
  )
}

function BuilderSelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: string[]
  value: string
}) {
  return (
    <Field label={label}>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function BuilderCheckboxField({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (value: boolean) => void
}) {
  const id = `config-${label.toLowerCase().replace(/\s+/g, "-")}`

  return (
    <div className="flex min-h-10 items-center gap-2 pt-6">
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}

function ExperimentWorkspacePanel({
  experiment,
  experiments,
  isCollapsed,
  isLoading,
  onCollapsedChange,
  onSelect,
  selectedId,
  onCreateClick,
  onDeleteClick,
}: {
  experiment: Experiment | null
  experiments: Experiment[]
  isCollapsed: boolean
  isLoading: boolean
  onCollapsedChange: (isCollapsed: boolean) => void
  onSelect: (experimentId: string) => void
  selectedId: string | null
  onCreateClick: () => void
  onDeleteClick: () => void
}) {
  const [showExpandedContent, setShowExpandedContent] = useState(!isCollapsed)
  const model = readConfigValue(experiment?.config_yaml, "model_type")
  const dataset = readConfigValue(experiment?.config_yaml, "dataset_type")
  const optimizer = readConfigValue(experiment?.config_yaml, "optimizer")
  const topology = readConfigValue(
    experiment?.config_yaml,
    "federated_learning_topology",
  )

  useEffect(() => {
    if (isCollapsed) {
      setShowExpandedContent(false)
      return
    }

    const timer = window.setTimeout(() => {
      setShowExpandedContent(true)
    }, 75)

    return () => window.clearTimeout(timer)
  }, [isCollapsed])

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-lg xl:h-[52rem]",
        isCollapsed ? "py-5 xl:py-4" : "py-5",
      )}
    >
      <div
        className={cn(
          "flex h-full flex-col",
          isCollapsed ? "items-stretch px-4 xl:items-center xl:px-3" : "px-4",
        )}
      >
        <div
          className={cn(
            "flex w-full gap-3",
            isCollapsed
              ? "items-start justify-between xl:flex-col xl:items-center"
              : "items-start justify-between",
          )}
        >
          <div
            className={cn(
              "min-w-0",
              isCollapsed && "xl:hidden",
              !isCollapsed && "xl:w-[268px]",
            )}
          >
            <CardTitle>Experiment Summary</CardTitle>
            <CardDescription className="mt-2">
              Current run, config, and history
            </CardDescription>
          </div>
          <Button
            aria-label={
              isCollapsed
                ? "Expand experiment summary"
                : "Collapse experiment summary"
            }
            onClick={() => onCollapsedChange(!isCollapsed)}
            size="icon-sm"
            type="button"
            variant="ghost"
            className="hidden xl:inline-flex"
          >
            {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>

        {isCollapsed ? (
          <>
            <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-muted-foreground xl:flex">
              <div className="flex size-10 items-center justify-center rounded-md border bg-muted/40">
                <FileText className="size-5" />
              </div>
              <p className="origin-center rotate-180 text-sm font-medium [writing-mode:vertical-rl]">
                Experiment Summary
              </p>
            </div>
            <ExperimentSidebarContent
              dataset={dataset}
              experiment={experiment}
              experiments={experiments}
              isLoading={isLoading}
              onCreateClick={onCreateClick}
              onDeleteClick={onDeleteClick}
              model={model}
              onSelect={onSelect}
              optimizer={optimizer}
              selectedId={selectedId}
              showDetails={false}
              topology={topology}
              className="xl:hidden"
            />
          </>
        ) : showExpandedContent ? (
          <ExperimentSidebarContent
            dataset={dataset}
            experiment={experiment}
            experiments={experiments}
            isLoading={isLoading}
            onCreateClick={onCreateClick}
            onDeleteClick={onDeleteClick}
            model={model}
            onSelect={onSelect}
            optimizer={optimizer}
            selectedId={selectedId}
            showDetails
            topology={topology}
            className="xl:w-[268px]"
          />
        ) : (
          <div className="mt-5 hidden flex-1 xl:block" />
        )}
      </div>
    </Card>
  )
}

function ExperimentSidebarContent({
  className,
  dataset,
  experiment,
  experiments,
  isLoading,
  model,
  onSelect,
  optimizer,
  selectedId,
  showDetails,
  topology,
  onCreateClick,
  onDeleteClick,
}: {
  className?: string
  dataset: string | null
  experiment: Experiment | null
  experiments: Experiment[]
  isLoading: boolean
  model: string | null
  onSelect: (experimentId: string) => void
  optimizer: string | null
  selectedId: string | null
  showDetails: boolean
  topology: string | null
  onCreateClick?: () => void
  onDeleteClick?: () => void
}) {
  return (
    <div
      className={cn(
        "mt-5 min-w-0 flex-1 space-y-4 overflow-y-auto pr-1",
        className,
      )}
    >
      <div className="rounded-md border bg-background/40 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Experiments</h3>
          <Badge variant="outline">{experiments.length}</Badge>
        </div>
        {isLoading ? (
          <Skeleton className="h-10" />
        ) : experiments.length === 0 ? (
          <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">
            No experiments yet.
          </div>
        ) : (
          <Select onValueChange={onSelect} value={selectedId ?? undefined}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select experiment" />
            </SelectTrigger>
            <SelectContent>
              {experiments.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={onCreateClick}
        >
          <Wand2 className="mr-2 size-4" />
          Setup new experiment
        </Button>
        {experiment ? (
          <div className="mt-3 rounded-lg border bg-background/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{experiment.name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {shortId(experiment.id)}
                </p>
              </div>
              <StatusBadge status={experiment.status} />
            </div>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 text-xs text-muted-foreground">
              <span className="min-w-0">
                {formatDate(experiment.created_at)}
              </span>
              <span className="truncate text-right">
                {experiment.ray_job_id || "No Ray job"}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {showDetails ? (
        <>
          <SummaryBox title="Run Details">
            <SummaryValue
              label="Cluster"
              value={shortId(experiment?.cluster_id)}
            />
            <SummaryValue
              label="Ray Job"
              value={shortId(experiment?.ray_job_id)}
            />
            <SummaryValue
              label="Completed"
              value={formatDate(experiment?.completed_at ?? null)}
            />
          </SummaryBox>

          <SummaryBox title="Schema And Model">
            <SummaryValue label="Topology" value={topology || "Unknown"} />
            <SummaryValue label="Dataset" value={dataset || "Unknown"} />
            <SummaryValue label="Model" value={model || "Unknown"} />
            <SummaryValue label="Optimizer" value={optimizer || "Unknown"} />
          </SummaryBox>

          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Config source
            </p>
            <p className="mt-2 max-h-20 overflow-auto break-all text-sm">
              {experiment?.config_uri || "Create a config to attach a run"}
            </p>
            <div className="mt-3">
              <Badge className="border-emerald-500/40" variant="outline">
                <CheckCircle2 className="size-3 text-emerald-500" />
                Backend connected
              </Badge>
            </div>
            {experiment ? (
              <Button
                variant="destructive"
                className="mt-4 w-full"
                onClick={onDeleteClick}
              >
                Delete experiment
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function SummaryBox({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <div className="rounded-md border bg-background/40 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  )
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right font-semibold">{value}</span>
    </div>
  )
}

function getMetric(
  metrics: ExperimentMetricsResponse | null,
  metricName: string,
) {
  return metrics?.metrics.find((metric) => metric.name === metricName) ?? null
}

function latestMetricValue(
  metrics: ExperimentMetricsResponse | null,
  metricName: string,
) {
  const metric = getMetric(metrics, metricName)
  let latest: MetricPoint | null = null

  for (const series of metric?.series ?? []) {
    for (const point of series.values) {
      if (point.value === null) continue
      if (
        !latest ||
        Date.parse(point.timestamp) > Date.parse(latest.timestamp)
      ) {
        latest = point
      }
    }
  }

  return latest?.value ?? null
}

function latestMetricAverage(
  metrics: ExperimentMetricsResponse | null,
  metricName: string,
) {
  const metric = getMetric(metrics, metricName)
  const values = (metric?.series ?? [])
    .map((series) => latestSeriesPoint(series)?.value ?? null)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )

  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function latestMetricSum(
  metrics: ExperimentMetricsResponse | null,
  metricName: string,
) {
  const metric = getMetric(metrics, metricName)
  const values = (metric?.series ?? [])
    .map((series) => latestSeriesPoint(series)?.value ?? null)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )

  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0)
}

function latestMetricMax(
  metrics: ExperimentMetricsResponse | null,
  metricName: string,
) {
  const metric = getMetric(metrics, metricName)
  const values = (metric?.series ?? [])
    .flatMap((series) => series.values)
    .map((point) => point.value)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )

  if (values.length === 0) return null
  return Math.max(...values)
}

function latestSeriesPoint(series: MetricSeries) {
  let latest: MetricPoint | null = null

  for (const point of series.values) {
    if (point.value === null || !Number.isFinite(point.value)) continue
    if (!latest || Date.parse(point.timestamp) > Date.parse(latest.timestamp)) {
      latest = point
    }
  }

  return latest
}

function getActiveClientCount(metrics: ExperimentMetricsResponse | null) {
  const clients = new Set<string>()

  for (const metric of metrics?.metrics ?? []) {
    for (const series of metric.series) {
      const clientId = series.labels.client_id || series.labels.client
      if (clientId) clients.add(clientId)
    }
  }

  return clients.size > 0 ? clients.size : null
}

function getLiveExperimentSummary(metrics: ExperimentMetricsResponse | null) {
  const accuracy = latestMetricAverage(
    metrics,
    "round_test_accuracy_post_aggregation_ratio",
  )
  const completedRounds = latestMetricMax(
    metrics,
    "federated_rounds_completed_total",
  )
  const activeClients = getActiveClientCount(metrics)
  const trainTime = latestMetricAverage(
    metrics,
    "round_local_training_time_seconds",
  )
  const aggregationTime = latestMetricAverage(
    metrics,
    "round_aggregation_time_seconds",
  )
  const averageRoundTime =
    trainTime !== null || aggregationTime !== null
      ? (trainTime ?? 0) + (aggregationTime ?? 0)
      : null

  return {
    accuracy,
    activeClients,
    averageRoundTime,
    completedRounds,
    hasPrometheusData: [
      accuracy,
      completedRounds,
      activeClients,
      averageRoundTime,
    ].some((value) => value !== null),
  }
}

function buildRoundFeedRows(
  metrics: ExperimentMetricsResponse | null,
): RoundFeedRow[] {
  const roundMetric = getMetric(metrics, "federated_rounds_completed_total")
  const roundPoints = (roundMetric?.series ?? [])
    .flatMap((series) => series.values)
    .filter((point): point is { timestamp: string; value: number } => {
      return point.value !== null && Number.isFinite(point.value)
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))

  const roundRows = new Map<string, RoundFeedRow>()

  for (const point of roundPoints) {
    const round = point.value
    const key = formatCompactNumber(round)
    if (roundRows.has(key)) continue

    roundRows.set(key, buildRoundFeedRow(metrics, point.timestamp, round))
  }

  if (roundRows.size > 0) {
    return Array.from(roundRows.values())
  }

  const fallbackMetric =
    getMetric(metrics, "round_test_accuracy_post_aggregation_ratio") ??
    getMetric(metrics, "round_train_accuracy_post_aggregation_ratio") ??
    getMetric(metrics, "round_local_training_time_seconds") ??
    getMetric(metrics, "round_aggregation_time_seconds")

  const timestamps = Array.from(
    new Set(
      (fallbackMetric?.series ?? [])
        .flatMap((series) => series.values)
        .filter((point) => point.value !== null)
        .map((point) => point.timestamp),
    ),
  ).sort((a, b) => Date.parse(b) - Date.parse(a))

  return timestamps.map((timestamp) =>
    buildRoundFeedRow(metrics, timestamp, null),
  )
}

function buildRoundFeedRow(
  metrics: ExperimentMetricsResponse | null,
  timestamp: string,
  round: number | null,
): RoundFeedRow {
  return {
    aggregationTime: metricAverageAtOrBefore(
      metrics,
      "round_aggregation_time_seconds",
      timestamp,
    ),
    round,
    testAccuracy: metricAverageAtOrBefore(
      metrics,
      "round_test_accuracy_post_aggregation_ratio",
      timestamp,
    ),
    timestamp,
    trainAccuracy: metricAverageAtOrBefore(
      metrics,
      "round_train_accuracy_post_aggregation_ratio",
      timestamp,
    ),
    trainTime: metricAverageAtOrBefore(
      metrics,
      "round_local_training_time_seconds",
      timestamp,
    ),
  }
}

function metricAverageAtOrBefore(
  metrics: ExperimentMetricsResponse | null,
  metricName: string,
  timestamp: string,
) {
  const metric = getMetric(metrics, metricName)
  const targetTime = Date.parse(timestamp)
  const values = (metric?.series ?? [])
    .map(
      (series) =>
        latestSeriesPointAtOrBefore(series, targetTime)?.value ?? null,
    )
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )

  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function latestSeriesPointAtOrBefore(series: MetricSeries, targetTime: number) {
  let latest: MetricPoint | null = null

  for (const point of series.values) {
    if (point.value === null || !Number.isFinite(point.value)) continue
    const pointTime = Date.parse(point.timestamp)
    if (!Number.isFinite(pointTime) || pointTime > targetTime) continue
    if (!latest || pointTime > Date.parse(latest.timestamp)) {
      latest = point
    }
  }

  return latest
}

function metricSeriesCount(metrics: ExperimentMetricsResponse | null) {
  return (metrics?.metrics ?? []).reduce(
    (total, metric) => total + metric.series.length,
    0,
  )
}

function formatMetricValue(
  value: number | null,
  options: { suffix?: string; decimals?: number } = {},
) {
  if (value === null) return "No data"
  const decimals = options.decimals ?? 2
  return `${value.toFixed(decimals)}${options.suffix ?? ""}`
}

function formatCompactNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function formatBytes(value: number | null) {
  if (value === null) return "No data"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = Math.abs(value)
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const signedSize = value < 0 ? -size : size
  return `${signedSize.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`
}

function unavailableMetricValue(isLoading: boolean) {
  return isLoading ? "Loading" : "No data"
}

function ExperimentDetailPanel({
  experiment,
  isLoading,
  metrics,
  metricsError,
  metricsLoading,
  onTrackingTabChange,
  trackingTab,
}: {
  experiment: Experiment | null
  isLoading: boolean
  metrics: ExperimentMetricsResponse | null
  metricsError: string | null
  metricsLoading: boolean
  onTrackingTabChange: (tracking: ExperimentTrackingTab) => void
  trackingTab: ExperimentTrackingTab
}) {
  if (isLoading) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32" />
        <Skeleton className="h-56" />
      </div>
    )
  }

  if (!experiment) {
    return (
      <div className="p-5 text-sm text-muted-foreground">
        Select an experiment to see details.
      </div>
    )
  }

  return (
    <div>
      <div className="border-b bg-card/40 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{experiment.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {experiment.description || "No description provided."}
            </p>
          </div>
          <StatusBadge status={experiment.status} />
        </div>
      </div>

      <div className="p-5">
        <ExperimentTrackingTabs
          experiment={experiment}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          onTrackingTabChange={onTrackingTabChange}
          trackingTab={trackingTab}
        />
      </div>
    </div>
  )
}

function ExperimentTrackingTabs({
  experiment,
  metrics,
  metricsError,
  metricsLoading,
  onTrackingTabChange,
  trackingTab,
}: {
  experiment: Experiment
  metrics: ExperimentMetricsResponse | null
  metricsError: string | null
  metricsLoading: boolean
  onTrackingTabChange: (tracking: ExperimentTrackingTab) => void
  trackingTab: ExperimentTrackingTab
}) {
  return (
    <Tabs
      onValueChange={(value) =>
        onTrackingTabChange(value as ExperimentTrackingTab)
      }
      value={trackingTab}
    >
      <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
        <TabsTrigger className="shrink-0" value="overview">
          Overview
        </TabsTrigger>
        <TabsTrigger className="shrink-0" value="accuracy">
          Accuracy
        </TabsTrigger>
        <TabsTrigger className="shrink-0" value="rounds">
          Rounds
        </TabsTrigger>
        <TabsTrigger className="shrink-0" value="performance">
          Performance
        </TabsTrigger>
        <TabsTrigger className="shrink-0" value="communication">
          Communication
        </TabsTrigger>
        <TabsTrigger className="shrink-0" value="convergence">
          Convergence
        </TabsTrigger>
        <TabsTrigger className="shrink-0" value="availability">
          Availability
        </TabsTrigger>
        <TabsTrigger className="shrink-0" value="topology">
          Topology
        </TabsTrigger>
        <TabsTrigger className="shrink-0" value="config">
          Config
        </TabsTrigger>
      </TabsList>

      <TabsContent className="space-y-5" value="overview">
        <TrackingOverview experiment={experiment} />
      </TabsContent>
      <TabsContent className="space-y-5" value="accuracy">
        <TrackingAccuracy
          experiment={experiment}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
        />
      </TabsContent>
      <TabsContent className="space-y-5" value="rounds">
        <TrackingRounds
          experiment={experiment}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
        />
      </TabsContent>
      <TabsContent className="space-y-5" value="performance">
        <TrackingPerformance
          experiment={experiment}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
        />
      </TabsContent>
      <TabsContent className="space-y-5" value="communication">
        <TrackingCommunication
          experiment={experiment}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
        />
      </TabsContent>
      <TabsContent className="space-y-5" value="convergence">
        <TrackingConvergence
          experiment={experiment}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
        />
      </TabsContent>
      <TabsContent className="space-y-5" value="availability">
        <TrackingAvailability
          experiment={experiment}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
        />
      </TabsContent>
      <TabsContent className="space-y-5" value="topology">
        <TrackingTopology
          experiment={experiment}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
        />
      </TabsContent>
      <TabsContent className="space-y-5" value="config">
        <ExperimentConfigPanel experiment={experiment} />
      </TabsContent>
      {shouldShowRoundFeed(trackingTab) ? (
        <div className="mt-5">
          <LiveRoundResultsFeed
            experiment={experiment}
            metrics={metrics}
            metricsError={metricsError}
            metricsLoading={metricsLoading}
          />
        </div>
      ) : null}
    </Tabs>
  )
}

function TrackingOverview({ experiment }: { experiment: Experiment }) {
  return (
    <>
      {experiment.status_message ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>Status message</AlertTitle>
          <AlertDescription>{experiment.status_message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile icon={Server} label="Cluster" value={experiment.cluster_id} />
        <InfoTile
          icon={PlayCircle}
          label="Ray Job"
          value={experiment.ray_job_id || "Not submitted"}
        />
        <InfoTile
          icon={Clock}
          label="Created"
          value={formatDate(experiment.created_at)}
        />
        <InfoTile
          icon={CheckCircle2}
          label="Completed"
          value={formatDate(experiment.completed_at)}
        />
      </div>

      <TrackingSourcePanel experiment={experiment} />
    </>
  )
}
function TrackingAccuracy({
  experiment,
  metrics,
  metricsError,
  metricsLoading,
}: { experiment: Experiment } & TrackingMetricsProps) {
  const rounds =
    readConfigValue(experiment.config_yaml, "federated_learning_rounds") ||
    "Unknown"
  const clients =
    readConfigValue(experiment.config_yaml, "number_of_clients") || "Unknown"
  const testAccuracy = latestMetricValue(
    metrics,
    "round_test_accuracy_post_aggregation_ratio",
  )
  const trainAccuracy = latestMetricValue(
    metrics,
    "round_train_accuracy_post_aggregation_ratio",
  )

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrackingMetricCard
          icon={BarChart3}
          label="Latest Test Accuracy"
          value={formatMetricValue(testAccuracy, { suffix: "%", decimals: 2 })}
          detail="Latest reported test score"
        />
        <TrackingMetricCard
          icon={BarChart3}
          label="Latest Train Accuracy"
          value={formatMetricValue(trainAccuracy, { suffix: "%", decimals: 2 })}
          detail="Latest reported train score"
        />
        <TrackingMetricCard
          icon={RefreshCw}
          label="Configured Rounds"
          value={rounds}
          detail="From experiment config"
        />
        <TrackingMetricCard
          icon={Users}
          label="Clients"
          value={clients}
          detail="From experiment config"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <MultiMetricChartFrame
          description="Pre vs Post Aggregation test accuracy reported across rounds."
          metricNames={[
            "round_test_accuracy_pre_aggregation_ratio",
            "round_test_accuracy_post_aggregation_ratio",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Test Accuracy (Pre vs Post Aggregation)"
          unit="%"
        />
        <MultiMetricChartFrame
          description="Pre vs Post Aggregation training accuracy reported across rounds."
          metricNames={[
            "round_train_accuracy_pre_aggregation_ratio",
            "round_train_accuracy_post_aggregation_ratio",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Train Accuracy (Pre vs Post Aggregation)"
          unit="%"
        />
      </div>
    </>
  )
}

function TrackingRounds({
  experiment,
  metrics,
  metricsError,
  metricsLoading,
}: { experiment: Experiment } & TrackingMetricsProps) {
  const configuredRounds =
    readConfigValue(experiment.config_yaml, "federated_learning_rounds") ||
    "Unknown"
  const completedRounds = latestMetricSum(
    metrics,
    "federated_rounds_completed_total",
  )
  const elapsedTime = latestMetricValue(
    metrics,
    "round_elapsed_since_start_seconds",
  )

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <TrackingMetricCard
          icon={RefreshCw}
          label="Configured Rounds"
          value={configuredRounds}
          detail="From experiment config"
        />
        <TrackingMetricCard
          icon={CheckCircle2}
          label="Rounds Completed"
          value={
            completedRounds !== null
              ? completedRounds.toString()
              : unavailableMetricValue(metricsLoading)
          }
          detail="Cumulative total rounds"
        />
        <TrackingMetricCard
          icon={Clock}
          label="Elapsed Time"
          value={formatMetricValue(elapsedTime, { suffix: "s", decimals: 1 })}
          detail="Time since training started"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MultiMetricChartFrame
          description="Stacked timing details showing local training, model sending, aggregation, and receiving."
          metricNames={[
            "round_local_training_time_seconds",
            "round_model_sending_time_seconds",
            "round_aggregation_time_seconds",
            "round_model_receiving_time_seconds",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Round Timing Breakdown"
          unit="s"
        />
        <MultiMetricChartFrame
          description="Model payload transfer sizes sent and received by clients."
          metricNames={[
            "round_sent_models_size_bytes",
            "round_received_models_size_bytes",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Model Transfer Size per Round"
          unit=" B"
        />
        <div className="xl:col-span-2">
          <TrackingChartFrame
            description="Total elapsed time recorded from training start across rounds."
            metricName="round_elapsed_since_start_seconds"
            metrics={metrics}
            metricsError={metricsError}
            metricsLoading={metricsLoading}
            title="Elapsed Time Since Training Start"
            unit="s"
          />
        </div>
      </div>

      <div className="mt-5">
        <LiveRoundResultsFeed
          experiment={experiment}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
        />
      </div>
    </>
  )
}
type RoundFeedRow = {
  aggregationTime: number | null
  round: number | null
  testAccuracy: number | null
  timestamp: string
  trainAccuracy: number | null
  trainTime: number | null
}

function shouldShowRoundFeed(tab: ExperimentTrackingTab) {
  return [
    "accuracy",
    "performance",
    "communication",
    "convergence",
    "availability",
  ].includes(tab)
}

function LiveRoundResultsFeed({
  experiment,
  metrics,
  metricsError,
  metricsLoading,
}: { experiment: Experiment } & TrackingMetricsProps) {
  const rows = buildRoundFeedRows(metrics)

  return (
    <>
      <TrackingPanelIntro
        description="Recent metric samples grouped for quick comparison."
        title="Live Round Results"
      />
      <div className="max-h-[24rem] overflow-auto rounded-lg border bg-background/60">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 font-medium shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Round
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 font-medium shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Time
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-right font-medium shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Test Acc
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-right font-medium shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Train Acc
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-right font-medium shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Train Time
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-right font-medium shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Aggregation
              </th>
              <th className="sticky top-0 z-20 bg-card/95 px-4 py-3 text-center font-medium shadow-[inset_0_-1px_0_var(--border)] backdrop-blur">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr
                  className="transition-colors hover:bg-muted/40 [&>td]:border-t"
                  key={`${row.timestamp}-${row.round}`}
                >
                  <td className="px-4 py-3 font-medium">
                    {row.round !== null
                      ? formatCompactNumber(row.round)
                      : "Sample"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatTime(row.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMetricValue(row.testAccuracy, {
                      suffix: "%",
                      decimals: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMetricValue(row.trainAccuracy, {
                      suffix: "%",
                      decimals: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMetricValue(row.trainTime, {
                      suffix: "s",
                      decimals: 3,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMetricValue(row.aggregationTime, {
                      suffix: "s",
                      decimals: 3,
                    })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={experiment.status} />
                  </td>
                </tr>
              ))
            ) : (
              <tr className="border-t">
                <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                  {metricsStatusMessage(
                    experiment,
                    metrics,
                    metricsError,
                    metricsLoading,
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function TrackingPerformance({
  metrics,
  metricsError,
  metricsLoading,
}: { experiment: Experiment } & TrackingMetricsProps) {
  const trainTime = latestMetricValue(
    metrics,
    "round_local_training_time_seconds",
  )
  const aggregationTime = latestMetricValue(
    metrics,
    "round_aggregation_time_seconds",
  )
  const samplesProcessed = latestMetricSum(
    metrics,
    "throughput_samples_processed_total",
  )
  const avgThroughput = latestMetricAverage(metrics, "throughput_mbps")

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrackingMetricCard
          icon={Clock3}
          label="Avg Training Time"
          value={formatMetricValue(trainTime, { suffix: "s", decimals: 3 })}
          detail="Latest local training step"
        />
        <TrackingMetricCard
          icon={RefreshCw}
          label="Avg Aggregation"
          value={formatMetricValue(aggregationTime, {
            suffix: "s",
            decimals: 3,
          })}
          detail="Latest aggregation step"
        />
        <TrackingMetricCard
          icon={BarChart3}
          label="Samples Processed"
          value={
            samplesProcessed !== null
              ? formatCompactNumber(samplesProcessed)
              : unavailableMetricValue(metricsLoading)
          }
          detail="Total training samples"
        />
        <TrackingMetricCard
          icon={Activity}
          label="Throughput"
          value={formatMetricValue(avgThroughput, {
            suffix: " MB/s",
            decimals: 2,
          })}
          detail="Latest throughput average"
        />
      </div>

      <div className="mt-5">
        <h3 className="font-semibold text-lg text-primary">
          Throughput & Events
        </h3>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TrackingChartFrame
          description="Rate of training samples processed per second."
          metricName="throughput_samples_per_second"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Samples per Second"
          unit=" samples/s"
        />
        <TrackingChartFrame
          description="Data throughput capacity rate during training steps."
          metricName="throughput_mbps"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Throughput (MB/s)"
          unit=" MB/s"
        />
        <TrackingChartFrame
          description="Training time spent per execution event."
          metricName="throughput_training_time_seconds"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Training Time per Event"
          unit="s"
        />
        <TrackingChartFrame
          description="Local training time reported across recent rounds."
          metricName="round_local_training_time_seconds"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Training Time by Client"
          unit="s"
        />
      </div>

      <div className="mt-8">
        <h3 className="font-semibold text-lg text-primary">
          Runtime Functions (OTel Performance)
        </h3>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TrackingChartFrame
          description="Average wall-clock execution time for internal FL functions."
          metricName="function_execution_time_seconds_avg"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Function Execution Time (Avg)"
          unit="s"
        />
        <TrackingChartFrame
          description="Cumulative runtime metrics for registered telemetry functions."
          metricName="function_execution_time_seconds_total"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Cumulative Execution Time"
          unit="s"
        />
        <TrackingChartFrame
          description="Call rate frequency metrics of instrumented functions."
          metricName="function_calls_rate"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Function Call Rate"
          unit=" calls/s"
        />
        <TrackingChartFrame
          description="Rate of runtime exception errors encountered during execution."
          metricName="function_errors_rate"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Function Errors"
          unit=" errors/s"
        />
      </div>
    </>
  )
}

function TrackingCommunication({
  metrics,
  metricsError,
  metricsLoading,
}: { experiment: Experiment } & TrackingMetricsProps) {
  const totalSent = latestMetricSum(metrics, "round_sent_models_size_bytes")
  const totalReceived = latestMetricSum(
    metrics,
    "round_received_models_size_bytes",
  )
  const latency = latestMetricAverage(metrics, "communication_latency_ms")
  const bandwidth = latestMetricAverage(metrics, "communication_bandwidth_mbps")

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrackingMetricCard
          icon={Network}
          label="Total Model Sent"
          value={
            totalSent !== null
              ? formatBytes(totalSent)
              : unavailableMetricValue(metricsLoading)
          }
          detail="Cumulative model payload sent"
        />
        <TrackingMetricCard
          icon={Network}
          label="Total Model Received"
          value={
            totalReceived !== null
              ? formatBytes(totalReceived)
              : unavailableMetricValue(metricsLoading)
          }
          detail="Cumulative model payload received"
        />
        <TrackingMetricCard
          icon={Clock3}
          label="Avg Latency"
          value={formatMetricValue(latency, { suffix: " ms", decimals: 2 })}
          detail="Average client latency"
        />
        <TrackingMetricCard
          icon={Activity}
          label="Avg Bandwidth"
          value={formatMetricValue(bandwidth, { suffix: " Mbps", decimals: 2 })}
          detail="Average communication rate"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2 mt-5">
        <MultiMetricChartFrame
          description="Rate of messages sent successfully vs communication error events."
          metricNames={[
            "communication_messages_rate",
            "communication_errors_rate",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Messages & Errors Rate"
          unit=" msg/s"
        />
        <MultiMetricChartFrame
          description="Rate of payload bytes sent and received over the network."
          metricNames={[
            "communication_bytes_sent_rate",
            "communication_bytes_received_rate",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Network Bytes Sent/Received Rate"
          unit=" B/s"
        />
        <TrackingChartFrame
          description="Average communication latency of model transfers."
          metricName="communication_latency_ms"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Communication Latency"
          unit="ms"
        />
        <TrackingChartFrame
          description="Average bandwidth rate achieved during model serialization/deserialization transfer steps."
          metricName="communication_bandwidth_mbps"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Communication Bandwidth"
          unit=" Mbps"
        />
      </div>
    </>
  )
}

function TrackingConvergence({
  experiment,
  metrics,
  metricsError,
  metricsLoading,
}: { experiment: Experiment } & TrackingMetricsProps) {
  const configTarget = readConfigValue(
    experiment.config_yaml,
    "stop_avg_accuracy",
  )
  const targetVal = latestMetricAverage(metrics, "convergence_target_accuracy")
  const target =
    targetVal !== null
      ? `${(targetVal * 100).toFixed(2)}%`
      : configTarget
        ? `${configTarget}%`
        : "Unknown"

  const achieved =
    latestMetricValue(metrics, "convergence_achieved_accuracy") ??
    latestMetricValue(metrics, "round_test_accuracy_post_aggregation_ratio")
  const roundsToConverge = latestMetricAverage(
    metrics,
    "convergence_rounds_to_convergence",
  )
  const timeToConverge = latestMetricAverage(
    metrics,
    "convergence_time_to_convergence_seconds",
  )
  const convergenceEvents = latestMetricSum(metrics, "convergence_events_total")

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrackingMetricCard
          icon={GitBranch}
          label="Target Accuracy"
          value={target}
          detail="From convergence/config"
        />
        <TrackingMetricCard
          icon={BarChart3}
          label="Achieved Accuracy"
          value={formatMetricValue(achieved, { suffix: "%", decimals: 2 })}
          detail="Latest reported test score"
        />
        <TrackingMetricCard
          icon={RefreshCw}
          label="Rounds To Converge"
          value={
            roundsToConverge !== null
              ? formatCompactNumber(roundsToConverge)
              : unavailableMetricValue(metricsLoading)
          }
          detail="From convergence metrics"
        />
        <TrackingMetricCard
          icon={Clock}
          label="Time To Converge"
          value={formatMetricValue(timeToConverge, {
            suffix: "s",
            decimals: 2,
          })}
          detail="From convergence metrics"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2 mt-5">
        <MultiMetricChartFrame
          description="Target accuracy vs currently achieved federated accuracy."
          metricNames={[
            "convergence_target_accuracy",
            "convergence_achieved_accuracy",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Accuracy: Target vs Achieved"
          unit="%"
        />
        <TrackingChartFrame
          description="Loss value at the time of convergence event."
          metricName="convergence_final_loss"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Final Loss at Convergence"
        />
      </div>

      {convergenceEvents !== null && convergenceEvents > 0 && (
        <div className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-5 w-5" />
            Convergence Achieved!
          </div>
          <p className="mt-1 text-sm opacity-90">
            The training session successfully converged in{" "}
            {roundsToConverge !== null
              ? Math.round(roundsToConverge)
              : "unknown"}{" "}
            rounds (elapsed:{" "}
            {timeToConverge !== null ? timeToConverge.toFixed(1) : "unknown"}s).
          </p>
        </div>
      )}
    </>
  )
}

function TrackingAvailability({
  experiment,
  metrics,
  metricsError,
  metricsLoading,
}: { experiment: Experiment } & TrackingMetricsProps) {
  const cpuUsage = latestMetricValue(metrics, "system_cpu_percent")
  const memUsage = latestMetricValue(metrics, "memory_percent")
  const uptime = latestMetricValue(metrics, "availability_uptime_seconds")
  const availabilityEvents = latestMetricSum(
    metrics,
    "availability_events_total",
  )
  const connectionAttempts = latestMetricSum(
    metrics,
    "availability_connection_attempts_total",
  )
  const successfulReconnections = latestMetricSum(
    metrics,
    "availability_successful_reconnections_total",
  )

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrackingMetricCard
          icon={Cpu}
          label="Avg CPU %"
          value={formatMetricValue(cpuUsage, { suffix: "%", decimals: 1 })}
          detail="Latest system CPU utilization"
        />
        <TrackingMetricCard
          icon={Activity}
          label="Avg Memory %"
          value={formatMetricValue(memUsage, { suffix: "%", decimals: 1 })}
          detail="Latest system memory usage"
        />
        <TrackingMetricCard
          icon={Clock}
          label="Uptime"
          value={formatMetricValue(uptime, { suffix: "s", decimals: 1 })}
          detail="Client process uptime duration"
        />
        <TrackingMetricCard
          icon={ShieldCheck}
          label="Client Status"
          value={experiment.status}
          detail={`Events: ${availabilityEvents ?? 0} | Reconnects: ${successfulReconnections ?? 0}/${connectionAttempts ?? 0}`}
        />
      </div>

      <div className="mt-5">
        <h3 className="font-semibold text-lg text-primary">System Resources</h3>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TrackingChartFrame
          description="Total CPU utilization percentage across all cores."
          metricName="system_cpu_percent"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="CPU Usage Over Time"
          unit="%"
        />
        <TrackingChartFrame
          description="System memory consumption percentage of total physical memory."
          metricName="memory_percent"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Memory Usage Over Time"
          unit="%"
        />
        <MultiMetricChartFrame
          description="Process RAM memory allocation vs peak resident set size (RSS)."
          metricNames={["process_memory_bytes", "process_memory_peak_bytes"]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Process Memory Allocation"
          unit=" B"
        />
        <MultiMetricChartFrame
          description="System CPU Frequency tracking clock speed variations."
          metricNames={["system_cpu_freq_mhz"]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="CPU Clock Frequency"
          unit=" MHz"
        />
        <MultiMetricChartFrame
          description="Disk space allocation, showing utilized vs total storage capacity."
          metricNames={[
            "system_disk_percent",
            "system_disk_used_bytes",
            "system_disk_total_bytes",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Storage Allocation & Usage"
        />
        <MultiMetricChartFrame
          description="Disk network interface I/O rates (bytes sent/received)."
          metricNames={[
            "system_network_bytes_sent_rate",
            "system_network_bytes_recv_rate",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Network Interface I/O Rates"
          unit=" B/s"
        />
      </div>

      <div className="mt-8">
        <h3 className="font-semibold text-lg text-primary">
          Client Node Availability
        </h3>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <MultiMetricChartFrame
          description="Uptime vs active downtime intervals reported per client node."
          metricNames={[
            "availability_uptime_seconds",
            "availability_downtime_seconds",
          ]}
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Active Node Uptime vs Downtime"
          unit="s"
        />
        <TrackingChartFrame
          description="Total accumulative downtime seconds logged for availability tracking."
          metricName="availability_total_downtime_seconds"
          metrics={metrics}
          metricsError={metricsError}
          metricsLoading={metricsLoading}
          title="Cumulative Downtime Seconds"
          unit="s"
        />
      </div>
    </>
  )
}

function TrackingTopology({
  experiment,
  metrics,
  metricsError,
  metricsLoading,
}: { experiment: Experiment } & TrackingMetricsProps) {
  const topology =
    readConfigValue(experiment.config_yaml, "federated_learning_topology") ||
    "Unknown"
  const clients =
    readConfigValue(experiment.config_yaml, "number_of_clients") || "Unknown"
  const neighbors =
    readConfigValue(experiment.config_yaml, "client_k_neighbors") || "Unknown"
  const aggregation =
    readConfigValue(experiment.config_yaml, "aggregation_strategy") || "Unknown"

  const edgeMetric = getMetric(metrics ?? null, "topology_edges_observed_total")
  const edges: {
    client: string
    fromNode: string
    toNode: string
    round: string
    observations: number
  }[] = []

  if (edgeMetric) {
    edgeMetric.series.forEach((s) => {
      const labels = s.labels
      const client = labels.client_id || labels.client || "Unknown"
      const fromNode = labels.from_node || "Unknown"
      const toNode = labels.to_node || "Unknown"
      const round = labels.round || "Unknown"

      const lastPoint = s.values[s.values.length - 1]
      const observations = lastPoint ? Number(lastPoint.value) : 0

      if (observations > 0 || fromNode !== "Unknown" || toNode !== "Unknown") {
        edges.push({
          client,
          fromNode,
          toNode,
          round,
          observations,
        })
      }
    })
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrackingMetricCard
          icon={Network}
          label="Topology"
          value={topology}
          detail="From experiment config"
        />
        <TrackingMetricCard
          icon={Users}
          label="Clients"
          value={clients}
          detail="From experiment config"
        />
        <TrackingMetricCard
          icon={CircleDot}
          label="K Neighbors"
          value={neighbors}
          detail="From experiment config"
        />
        <TrackingMetricCard
          icon={RefreshCw}
          label="Aggregation"
          value={aggregation}
          detail="From experiment config"
        />
      </div>

      <div className="rounded-lg border bg-background/60 p-5 mt-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Network className="size-5" />
          </div>
          <div>
            <h3 className="font-medium">Observed Network Edges</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Peer-to-peer connection observations reported by client nodes in
              the federation.
            </p>
          </div>
        </div>

        {metricsLoading ? (
          <div className="text-center py-6 text-sm text-muted-foreground animate-pulse">
            Loading topology edge telemetry...
          </div>
        ) : metricsError ? (
          <div className="text-center py-6 text-sm text-red-500 font-medium">
            Error loading topology edge telemetry.
          </div>
        ) : edges.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No topology edge observations reported yet for this experiment.
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Reporting Client</th>
                  <th className="px-4 py-2">From Node</th>
                  <th className="px-4 py-2">To Node</th>
                  <th className="px-4 py-2">Round</th>
                  <th className="px-4 py-2 text-right">Observations</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {edges.map((edge, idx) => (
                  <tr key={idx} className="hover:bg-muted/10">
                    <td className="px-4 py-2 font-medium">{edge.client}</td>
                    <td className="px-4 py-2">{edge.fromNode}</td>
                    <td className="px-4 py-2">{edge.toNode}</td>
                    <td className="px-4 py-2">{edge.round}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-primary">
                      {edge.observations}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function TrackingSourcePanel({ experiment }: { experiment: Experiment }) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="mb-4">
        <h3 className="font-medium">Sources</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Backend links and external drilldowns for the selected experiment.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ExternalLinkButton
          href={browserServiceOpenUrl("rayDashboard", experiment.logs_url)}
          label="Ray logs"
        />
        <ExternalLinkButton
          href={browserServiceOpenUrl("mlflow", experiment.mlflow_run_url)}
          label="MLflow run"
        />
        <ExternalLinkButton
          href={browserServiceOpenUrl(
            "rayDashboard",
            experiment.ray_dashboard_url,
          )}
          label="Ray dashboard"
        />
        {!experiment.logs_url &&
        !experiment.mlflow_run_url &&
        !experiment.ray_dashboard_url ? (
          <p className="text-sm text-muted-foreground">
            No external sources are registered for this experiment yet.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function TrackingMetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 truncate text-xl font-semibold">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {detail}
          </p>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  )
}

function TrackingPanelIntro({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function TrackingChartFrame({
  description,
  metricName,
  metrics,
  metricsError,
  metricsLoading,
  title,
  unit = "",
}: {
  description: string
  metricName?: string
  metrics?: ExperimentMetricsResponse | null
  metricsError?: string | null
  metricsLoading?: boolean
  title: string
  unit?: string
}) {
  const metric = metricName ? getMetric(metrics ?? null, metricName) : null
  const chartSeries =
    metric?.series
      .map((series, index) => toChartSeries(series, index))
      .filter((series) => series.points.length > 0) ?? []
  const hasData = chartSeries.length > 0

  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <TrackingPanelIntro description={description} title={title} />
      <div className="relative mt-5 min-h-[18rem] overflow-hidden rounded-md border bg-background/70">
        {hasData ? (
          <LineChart series={chartSeries} unit={unit} />
        ) : (
          <ChartEmptyState
            isLoading={Boolean(metricsLoading)}
            message={
              metricsError
                ? "Unable to load metric data."
                : "No data available for this view yet."
            }
          />
        )}
      </div>
    </div>
  )
}

function MultiMetricChartFrame({
  description,
  metricNames,
  metrics,
  metricsError,
  metricsLoading,
  title,
  unit = "",
}: {
  description: string
  metricNames: string[]
  metrics?: ExperimentMetricsResponse | null
  metricsError?: string | null
  metricsLoading?: boolean
  title: string
  unit?: string
}) {
  const chartSeries: ChartSeries[] = []

  metricNames.forEach((metricName, mIdx) => {
    const metric = getMetric(metrics ?? null, metricName)
    if (metric) {
      metric.series.forEach((series, sIdx) => {
        const index = mIdx * 10 + sIdx
        const s = toChartSeries(series, index)
        const metricLabel = definitionDisplayName(metricName)
        s.label = `${metricLabel} — ${s.label}`
        if (s.points.length > 0) {
          chartSeries.push(s)
        }
      })
    }
  })

  const hasData = chartSeries.length > 0

  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <TrackingPanelIntro description={description} title={title} />
      <div className="relative mt-5 min-h-[18rem] overflow-hidden rounded-md border bg-background/70">
        {hasData ? (
          <LineChart series={chartSeries} unit={unit} />
        ) : (
          <ChartEmptyState
            isLoading={Boolean(metricsLoading)}
            message={
              metricsError
                ? "Unable to load metric data."
                : "No data available for this view yet."
            }
          />
        )}
      </div>
    </div>
  )
}

function definitionDisplayName(metricName: string): string {
  if (metricName.includes("pre_aggregation")) return "Pre-Agg"
  if (metricName.includes("post_aggregation")) return "Post-Agg"
  if (metricName.includes("local_training")) return "Training"
  if (metricName.includes("sending") || metricName.includes("sent"))
    return "Sending"
  if (metricName.includes("receiving") || metricName.includes("received"))
    return "Receiving"
  if (metricName.includes("aggregation")) return "Aggregation"
  if (metricName.includes("bytes_sent")) return "Sent"
  if (metricName.includes("bytes_received")) return "Received"
  if (metricName.includes("uptime")) return "Uptime"
  if (metricName.includes("downtime")) return "Downtime"
  if (metricName.includes("target")) return "Target"
  if (metricName.includes("achieved")) return "Achieved"
  return metricName
}

type ChartPoint = {
  timestamp: number
  value: number
}

type ChartSeries = {
  color: string
  label: string
  points: ChartPoint[]
}

const CHART_COLORS = [
  "#60a5fa",
  "#fb7185",
  "#14b8a6",
  "#fb923c",
  "#a78bfa",
  "#facc15",
]

function toChartSeries(series: MetricSeries, index: number): ChartSeries {
  const label =
    series.labels.client_id ||
    series.labels.client ||
    series.labels.instance ||
    `Series ${index + 1}`

  return {
    color: CHART_COLORS[index % CHART_COLORS.length],
    label,
    points: series.values
      .filter((point): point is { timestamp: string; value: number } => {
        return point.value !== null && Number.isFinite(point.value)
      })
      .map((point) => ({
        timestamp: Date.parse(point.timestamp),
        value: point.value,
      }))
      .filter((point) => Number.isFinite(point.timestamp)),
  }
}

function LineChart({ series, unit }: { series: ChartSeries[]; unit: string }) {
  const points = series.flatMap((item) => item.points)
  const minX = Math.min(...points.map((point) => point.timestamp))
  const maxX = Math.max(...points.map((point) => point.timestamp))
  const values = points.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = maxValue === minValue ? Math.max(1, maxValue * 0.1) : 0
  const minY = minValue - padding
  const maxY = maxValue + padding
  const width = 640
  const height = 280
  const left = 52
  const right = 20
  const top = 26
  const bottom = 42
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom

  const xFor = (timestamp: number) => {
    if (maxX === minX) return left + plotWidth / 2
    return left + ((timestamp - minX) / (maxX - minX)) * plotWidth
  }
  const yFor = (value: number) => {
    if (maxY === minY) return top + plotHeight / 2
    return top + plotHeight - ((value - minY) / (maxY - minY)) * plotHeight
  }
  const ticks = [maxY, minY + (maxY - minY) / 2, minY]

  return (
    <div className="p-4">
      <svg
        aria-label="Metric chart"
        className="h-[18rem] w-full"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect fill="transparent" height={height} width={width} />
        {ticks.map((tick) => {
          const y = yFor(tick)
          return (
            <g key={tick}>
              <line
                className="text-border"
                stroke="currentColor"
                strokeOpacity="0.7"
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
              />
              <text
                className="fill-muted-foreground text-[12px]"
                textAnchor="end"
                x={left - 10}
                y={y + 4}
              >
                {formatAxisValue(tick, unit)}
              </text>
            </g>
          )
        })}
        {series.map((item) => {
          const pointsText = item.points
            .map((point) => `${xFor(point.timestamp)},${yFor(point.value)}`)
            .join(" ")

          return (
            <g key={item.label}>
              {item.points.length > 1 ? (
                <polyline
                  fill="none"
                  points={pointsText}
                  stroke={item.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                />
              ) : null}
              {item.points.map((point) => (
                <circle
                  cx={xFor(point.timestamp)}
                  cy={yFor(point.value)}
                  fill={item.color}
                  key={`${item.label}-${point.timestamp}`}
                  r="4"
                />
              ))}
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {series.slice(0, 8).map((item) => (
          <div className="flex items-center gap-2" key={item.label}>
            <span
              className="h-2 w-5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="max-w-36 truncate">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartEmptyState({
  isLoading,
  message,
}: {
  isLoading: boolean
  message: string
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <CircleDot className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">
          {isLoading ? "Loading data" : "No data yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

function formatAxisValue(value: number, unit: string) {
  const formatted = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2)
  return `${formatted}${unit}`
}

function metricsStatusMessage(
  experiment: Experiment,
  metrics: ExperimentMetricsResponse | null,
  metricsError: string | null,
  metricsLoading: boolean,
) {
  if (metricsLoading) {
    return "Loading metrics."
  }
  if (metricsError) {
    return "Unable to load metric data."
  }
  if (metricSeriesCount(metrics) === 0) {
    return "No metric samples are available for this run yet."
  }
  if (experiment.status === "pending") {
    return "Start the experiment before metric samples are expected."
  }

  return "No samples are available for this table yet."
}

function ExperimentConfigPanel({
  experiment,
}: {
  experiment: Experiment | null
}) {
  if (!experiment) {
    return (
      <div className="p-5 text-sm text-muted-foreground">
        Select an experiment to inspect its stored config.
      </div>
    )
  }

  return (
    <div>
      <div className="border-b bg-card/40 px-5 py-4">
        <h2 className="font-semibold">Stored Config</h2>
        <p className="mt-1 break-all text-sm text-muted-foreground">
          {experiment.config_uri}
        </p>
      </div>
      <div className="p-5">
        <pre className="max-h-[620px] overflow-auto rounded-lg border bg-background/70 p-4 text-xs leading-relaxed text-muted-foreground">
          {experiment.config_yaml}
        </pre>
      </div>
    </div>
  )
}

function ValidationSummary({
  validation,
}: {
  validation: ConfigValidationResponse | null
}) {
  if (!validation) {
    return (
      <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">
        Validation has not run yet.
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        validation.valid
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-red-500/30 bg-red-500/10",
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {validation.valid ? (
          <CheckCircle2 className="size-4 text-emerald-400" />
        ) : (
          <AlertCircle className="size-4 text-red-400" />
        )}
        {validation.valid ? "Config is valid" : "Config needs changes"}
      </div>
      <div className="mt-3 space-y-2 text-sm">
        {validation.errors.map((issue) => (
          <IssueRow issue={issue} key={`${issue.field}-${issue.code}`} />
        ))}
        {validation.warnings.map((issue) => (
          <IssueRow issue={issue} key={`${issue.field}-${issue.code}`} />
        ))}
        {validation.valid && validation.warnings.length === 0 ? (
          <p className="text-muted-foreground">
            Ready to create a pending experiment.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function ValidationPill({
  validation,
}: {
  validation: ConfigValidationResponse | null
}) {
  if (!validation) {
    return (
      <Badge
        className="shrink-0 border-border text-muted-foreground"
        variant="outline"
      >
        Not validated
      </Badge>
    )
  }

  return (
    <Badge
      className={cn(
        "shrink-0",
        validation.valid
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/40 bg-red-500/10 text-red-300",
      )}
      variant="outline"
    >
      {validation.valid ? "Valid config" : "Needs changes"}
    </Badge>
  )
}

function IssueRow({ issue }: { issue: ConfigValidationIssue }) {
  return (
    <div className="rounded-md border bg-background/50 px-3 py-2">
      <p className="font-medium">{issue.field}</p>
      <p className="mt-1 text-muted-foreground">{issue.message}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: ExperimentStatus }) {
  const statusClass = {
    completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    failed: "border-red-500/40 bg-red-500/10 text-red-400",
    pending: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    running: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    stopped: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  }[status]

  return (
    <Badge className={statusClass} variant="outline">
      {status === "running" ? <RefreshCw className="animate-spin" /> : null}
      {status}
    </Badge>
  )
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/60 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="mt-3 truncate text-sm font-semibold">{value}</p>
    </div>
  )
}

function ExternalLinkButton({
  href,
  label,
}: {
  href: string | null
  label: string
}) {
  if (!href) return null

  return (
    <Button asChild size="sm" variant="outline">
      <a href={href} rel="noreferrer" target="_blank">
        <ExternalLink className="size-4" />
        {label}
      </a>
    </Button>
  )
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function readConfigValue(configYaml: string | null | undefined, key: string) {
  if (!configYaml) return null
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = configYaml.match(new RegExp(`^${escapedKey}:\\s*(.+)$`, "m"))
  return match?.[1]?.replace(/^['"]|['"]$/g, "").trim() || null
}

function shortId(value: string | null | undefined) {
  if (!value) return "None"
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value
}

function safeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "experiment"
  )
}

function downloadTextFile(fileName: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function formatDate(value: string | null) {
  if (!value) return "Not yet"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))
}

function DeleteExperimentDialog({
  isOpen,
  onOpenChange,
  isPending,
  onDelete,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isPending: boolean
  onDelete: () => void
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Experiment</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this experiment? This action cannot
            be undone and will remove all associated data and configs.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
