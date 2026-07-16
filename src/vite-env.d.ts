/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_TARGET: string
  readonly VITE_API_URL: string
  readonly VITE_GRAFANA_TARGET: string
  readonly VITE_GRAFANA_URL: string
  readonly VITE_MLFLOW_TARGET: string
  readonly VITE_MLFLOW_URL: string
  readonly VITE_OTEL_ENDPOINT: string
  readonly VITE_OTEL_TARGET: string
  readonly VITE_PROMETHEUS_TARGET: string
  readonly VITE_PROMETHEUS_URL: string
  readonly VITE_RAY_ADDRESS: string
  readonly VITE_RAY_DASHBOARD_TARGET: string
  readonly VITE_RAY_DASHBOARD_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
