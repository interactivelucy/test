export type DashboardPreset =
  | "local-dev"
  | "local-docker"
  | "same-origin"
  | "custom"

export type DashboardRuntimeConfig = {
  autoRefreshEnabled: boolean
  apiBaseUrl: string
  grafanaBaseUrl: string
  mlflowBaseUrl: string
  otelEndpoint: string
  preferredTimeRange: string
  preset: DashboardPreset
  prometheusBaseUrl: string
  rayAddress: string
  rayDashboardBaseUrl: string
  refreshIntervalSeconds: number
}

export type ServiceTestTarget =
  | "api"
  | "prometheus"
  | "rayDashboard"
  | "grafana"
  | "mlflow"
  | "otel"

export type ServiceTestResult = {
  detail: string
  status: "reachable" | "protected" | "failed" | "not-testable"
}

export type DashboardServiceLinkTarget =
  | "grafana"
  | "mlflow"
  | "prometheus"
  | "rayDashboard"

const STORAGE_KEY = "fedpilot-dashboard-runtime-config"

const envDefaults = {
  apiBaseUrl: import.meta.env.VITE_API_URL || "/api",
  grafanaBaseUrl: import.meta.env.VITE_GRAFANA_URL || "/grafana",
  mlflowBaseUrl: import.meta.env.VITE_MLFLOW_URL || "/mlflow",
  otelEndpoint: import.meta.env.VITE_OTEL_ENDPOINT || "/otel/v1/metrics",
  prometheusBaseUrl: import.meta.env.VITE_PROMETHEUS_URL || "/prometheus",
  rayAddress:
    import.meta.env.VITE_RAY_ADDRESS || "http://host.docker.internal:8265",
  rayDashboardBaseUrl:
    import.meta.env.VITE_RAY_DASHBOARD_URL || "/ray-dashboard",
}

export const dashboardPresets: Record<
  Exclude<DashboardPreset, "custom">,
  DashboardRuntimeConfig
> = {
  "local-dev": {
    apiBaseUrl: envDefaults.apiBaseUrl,
    autoRefreshEnabled: true,
    grafanaBaseUrl: envDefaults.grafanaBaseUrl,
    mlflowBaseUrl: envDefaults.mlflowBaseUrl,
    otelEndpoint: envDefaults.otelEndpoint,
    preferredTimeRange: "last-15-minutes",
    preset: "local-dev",
    prometheusBaseUrl: envDefaults.prometheusBaseUrl,
    rayAddress: envDefaults.rayAddress,
    rayDashboardBaseUrl: envDefaults.rayDashboardBaseUrl,
    refreshIntervalSeconds: 60,
  },
  "local-docker": {
    apiBaseUrl: envDefaults.apiBaseUrl,
    autoRefreshEnabled: true,
    grafanaBaseUrl: envDefaults.grafanaBaseUrl,
    mlflowBaseUrl: envDefaults.mlflowBaseUrl,
    otelEndpoint: envDefaults.otelEndpoint,
    preferredTimeRange: "last-15-minutes",
    preset: "local-docker",
    prometheusBaseUrl: envDefaults.prometheusBaseUrl,
    rayAddress: envDefaults.rayAddress,
    rayDashboardBaseUrl: envDefaults.rayDashboardBaseUrl,
    refreshIntervalSeconds: 60,
  },
  "same-origin": {
    apiBaseUrl: "/api",
    autoRefreshEnabled: true,
    grafanaBaseUrl: "/grafana",
    mlflowBaseUrl: "/mlflow",
    otelEndpoint: "/otel/v1/metrics",
    preferredTimeRange: "last-15-minutes",
    preset: "same-origin",
    prometheusBaseUrl: "/prometheus",
    rayAddress: "http://ray-head:8265",
    rayDashboardBaseUrl: "/ray-dashboard",
    refreshIntervalSeconds: 60,
  },
}

export const rayAddressPresets = [
  {
    description:
      "Use when the backend runs in Docker and Ray runs on the host.",
    id: "host-docker-internal",
    label: "Backend Docker -> host Ray",
    value: "http://host.docker.internal:8265",
  },
  {
    description:
      "Use when the backend and Ray both run directly on this machine.",
    id: "local-host",
    label: "Local backend -> local Ray",
    value: "http://localhost:8265",
  },
  {
    description:
      "Use when backend and Ray share a Docker network service name.",
    id: "docker-service",
    label: "Docker service ray-head",
    value: "http://ray-head:8265",
  },
  {
    description: "Use from another machine after replacing the placeholder.",
    id: "lan-host",
    label: "LAN Ray host",
    value: "http://BACKEND_LAN_IP:8265",
  },
] as const

export const defaultDashboardRuntimeConfig = dashboardPresets["local-dev"]

export function getDashboardRuntimeConfig(): DashboardRuntimeConfig {
  if (typeof window === "undefined") {
    return defaultDashboardRuntimeConfig
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)
    if (!rawValue) return defaultDashboardRuntimeConfig
    return normalizeRuntimeConfig(JSON.parse(rawValue))
  } catch {
    return defaultDashboardRuntimeConfig
  }
}

export function saveDashboardRuntimeConfig(config: DashboardRuntimeConfig) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalizeRuntimeConfig(config)),
  )
}

export function resetDashboardRuntimeConfig(
  preset: Exclude<DashboardPreset, "custom"> = "local-dev",
) {
  const config = dashboardPresets[preset]
  saveDashboardRuntimeConfig(config)
  return config
}

export function applyPreset(
  preset: DashboardPreset,
  current: DashboardRuntimeConfig,
) {
  if (preset === "custom") {
    return { ...current, preset }
  }

  return dashboardPresets[preset]
}

export function deriveConfigFromBaseUrl(
  baseUrl: string,
  current: DashboardRuntimeConfig,
): DashboardRuntimeConfig {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "")
  if (!normalizedBase) return current

  return {
    ...current,
    apiBaseUrl: `${normalizedBase}/api`,
    grafanaBaseUrl: `${normalizedBase}/grafana`,
    mlflowBaseUrl: `${normalizedBase}/mlflow`,
    preset: "custom",
    prometheusBaseUrl: `${normalizedBase}/prometheus`,
    rayDashboardBaseUrl: `${normalizedBase}/ray-dashboard`,
  }
}

export function serviceUrl(baseUrl: string, path = "") {
  const base = baseUrl.trim().replace(/\/+$/, "")
  const suffix = path ? `/${path.replace(/^\/+/, "")}` : ""
  return `${base}${suffix}`
}

export function getRayAddressRisk(
  value: string,
  preset: DashboardPreset,
): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.includes("BACKEND_LAN_IP")) {
    return "Replace BACKEND_LAN_IP with the machine address the backend can reach before creating the cluster."
  }

  const host = runtimeUrlHost(trimmed)
  if (!host) return null

  if (host === "ray-head" && preset !== "same-origin") {
    return "ray-head only resolves when the backend can see the Docker service name. Use a Docker/same-origin setup, or pick the host/local Ray address."
  }

  if (
    ["localhost", "127.0.0.1"].includes(host) &&
    (preset === "local-docker" || preset === "same-origin")
  ) {
    return "localhost will be interpreted from the backend runtime. If the backend is in Docker, use host.docker.internal or a Docker service name instead."
  }

  if (host === "host.docker.internal" && preset === "local-dev") {
    return "host.docker.internal is usually for containers reaching the host. If the backend runs directly on this machine, localhost is usually the safer Ray address."
  }

  return null
}

export function absoluteBrowserUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return new URL(trimmed, window.location.origin).toString().replace(/\/$/, "")
}

export function apiRequestBaseUrl(config = getDashboardRuntimeConfig()) {
  return config.apiBaseUrl.trim().replace(/\/api\/?$/, "")
}

export function browserServiceUrl(
  target: DashboardServiceLinkTarget,
  value: string | null | undefined,
  config = getDashboardRuntimeConfig(),
) {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed, window.location.origin)
    if (!shouldUseConfiguredServiceUrl(target, parsed)) {
      return trimmed
    }

    return mergeServiceUrl(configuredServiceBaseUrl(target, config), parsed)
  } catch {
    return trimmed
  }
}

export function browserServiceOpenUrl(
  target: DashboardServiceLinkTarget,
  value: string | null | undefined,
  config = getDashboardRuntimeConfig(),
) {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const configuredBase = configuredServiceBaseUrl(target, config)
  const proxiedUrl = proxyTargetOpenUrl(target, trimmed, configuredBase, config)
  if (proxiedUrl) return proxiedUrl

  try {
    const parsed = new URL(trimmed, window.location.origin)
    const proxiedAbsoluteUrl = absoluteProxyTargetOpenUrl(
      target,
      parsed,
      configuredBase,
      config,
    )
    if (proxiedAbsoluteUrl) return proxiedAbsoluteUrl

    if (!shouldUseConfiguredServiceUrl(target, parsed)) {
      return trimmed
    }

    return mergeServiceUrl(configuredServiceOpenBaseUrl(target, config), parsed)
  } catch {
    return trimmed
  }
}

export async function testDashboardService(
  target: ServiceTestTarget,
  config: DashboardRuntimeConfig,
): Promise<ServiceTestResult> {
  if (target === "otel") {
    return {
      detail: isValidRuntimeUrl(config.otelEndpoint)
        ? "Endpoint URL is valid. Browser reachability is not tested for OTEL write endpoints."
        : "Endpoint URL is not valid.",
      status: isValidRuntimeUrl(config.otelEndpoint)
        ? "not-testable"
        : "failed",
    }
  }

  const candidates = serviceTestCandidates(target, config)
  let lastError = "No endpoint configured."

  for (const url of candidates) {
    try {
      const targetUrl = resolveCrossOriginUrl(url, config)
      const headers: Record<string, string> = { Accept: "application/json" }

      if (targetUrl.includes("/monitoring/proxy")) {
        const token = localStorage.getItem("access_token") || ""
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
      }

      const response = await fetch(targetUrl, { headers })

      if (response.ok) {
        const body = await response
          .clone()
          .text()
          .catch(() => "")
        if (looksLikeHtml(body)) {
          lastError =
            "Received the frontend HTML page instead of a service response."
          continue
        }

        return {
          detail: `${response.status} ${response.statusText || "OK"}`,
          status: "reachable",
        }
      }

      if ([401, 403].includes(response.status)) {
        return {
          detail: `${response.status} ${response.statusText || "protected"}`,
          status: "protected",
        }
      }

      lastError = `${response.status} ${response.statusText || "request failed"}`
    } catch (error) {
      const opaqueResult = await testBrowserOpenFallback(target, config)
      if (opaqueResult) return opaqueResult
      lastError = error instanceof Error ? error.message : "Network error"
    }
  }

  return {
    detail: lastError,
    status: "failed",
  }
}

function normalizeRuntimeConfig(value: unknown): DashboardRuntimeConfig {
  const record = isRecord(value) ? value : {}
  const preset = isDashboardPreset(record.preset) ? record.preset : "custom"
  const base =
    preset === "custom"
      ? defaultDashboardRuntimeConfig
      : dashboardPresets[preset]

  return {
    apiBaseUrl: stringValue(record.apiBaseUrl, base.apiBaseUrl),
    autoRefreshEnabled: booleanValue(
      record.autoRefreshEnabled,
      base.autoRefreshEnabled,
    ),
    grafanaBaseUrl: stringValue(record.grafanaBaseUrl, base.grafanaBaseUrl),
    mlflowBaseUrl: stringValue(record.mlflowBaseUrl, base.mlflowBaseUrl),
    otelEndpoint: stringValue(record.otelEndpoint, base.otelEndpoint),
    preferredTimeRange: stringValue(
      record.preferredTimeRange,
      base.preferredTimeRange,
    ),
    preset,
    prometheusBaseUrl: stringValue(
      record.prometheusBaseUrl,
      base.prometheusBaseUrl,
    ),
    rayAddress: stringValue(record.rayAddress, base.rayAddress),
    rayDashboardBaseUrl: stringValue(
      record.rayDashboardBaseUrl,
      base.rayDashboardBaseUrl,
    ),
    refreshIntervalSeconds: numberValue(
      record.refreshIntervalSeconds,
      base.refreshIntervalSeconds,
    ),
  }
}

function serviceTestCandidates(
  target: Exclude<ServiceTestTarget, "otel">,
  config: DashboardRuntimeConfig,
) {
  if (target === "api") {
    return [serviceUrl(apiRequestBaseUrl(config), "/api/v1/auth/me")]
  }

  if (target === "prometheus") {
    return [
      serviceUrl(config.prometheusBaseUrl, "/api/v1/status/buildinfo"),
      serviceUrl(config.prometheusBaseUrl, "/api/v1/query?query=up"),
    ]
  }

  if (target === "rayDashboard") {
    return [
      serviceUrl(config.rayDashboardBaseUrl, "/api/version"),
      serviceUrl(config.rayDashboardBaseUrl, "/api/cluster_status"),
      serviceUrl(config.rayDashboardBaseUrl, "/api/jobs/"),
    ]
  }

  if (target === "grafana") {
    return [serviceUrl(config.grafanaBaseUrl, "/api/health")]
  }

  return [
    serviceUrl(config.mlflowBaseUrl, "/health"),
    serviceUrl(config.mlflowBaseUrl, "/api/2.0/mlflow/experiments/search"),
  ]
}

function configuredServiceBaseUrl(
  target: DashboardServiceLinkTarget,
  config: DashboardRuntimeConfig,
) {
  if (target === "grafana") return config.grafanaBaseUrl
  if (target === "mlflow") return config.mlflowBaseUrl
  if (target === "prometheus") return config.prometheusBaseUrl
  return config.rayDashboardBaseUrl
}

function configuredServiceOpenBaseUrl(
  target: DashboardServiceLinkTarget,
  config: DashboardRuntimeConfig,
) {
  if (target === "rayDashboard" && isRelativeUrl(config.rayDashboardBaseUrl)) {
    return (
      import.meta.env.VITE_RAY_DASHBOARD_TARGET ||
      localServiceOpenFallback(target)
    )
  }

  if (target === "prometheus" && isRelativeUrl(config.prometheusBaseUrl)) {
    return (
      import.meta.env.VITE_PROMETHEUS_TARGET || localServiceOpenFallback(target)
    )
  }

  if (target === "grafana" && isRelativeUrl(config.grafanaBaseUrl)) {
    return (
      import.meta.env.VITE_GRAFANA_TARGET || localServiceOpenFallback(target)
    )
  }

  if (target === "mlflow" && isRelativeUrl(config.mlflowBaseUrl)) {
    return (
      import.meta.env.VITE_MLFLOW_TARGET || localServiceOpenFallback(target)
    )
  }

  return configuredServiceBaseUrl(target, config)
}

function localServiceOpenFallback(target: DashboardServiceLinkTarget) {
  const servicePorts: Record<DashboardServiceLinkTarget, string> = {
    grafana: "3000",
    mlflow: "5000",
    prometheus: "9090",
    rayDashboard: "8265",
  }

  const port = servicePorts[target]
  const protocol = window.location.protocol || "http:"
  const host = window.location.hostname || "localhost"
  return `${protocol}//${host}:${port}`
}

function proxyTargetOpenUrl(
  target: DashboardServiceLinkTarget,
  value: string,
  configuredBase: string,
  config: DashboardRuntimeConfig,
) {
  const proxyBase = serviceProxyBases(target, configuredBase).find(
    (base) => value === base || value.startsWith(`${base}/`),
  )

  if (!proxyBase) return null

  const targetBase = configuredServiceOpenBaseUrl(target, config)
  if (isRelativeUrl(targetBase)) return value

  return `${targetBase.replace(/\/+$/, "")}${value.slice(proxyBase.length)}`
}

function absoluteProxyTargetOpenUrl(
  target: DashboardServiceLinkTarget,
  parsedUrl: URL,
  configuredBase: string,
  config: DashboardRuntimeConfig,
) {
  if (parsedUrl.origin !== window.location.origin) return null

  const proxyBase = serviceProxyBases(target, configuredBase).find(
    (base) =>
      parsedUrl.pathname === base || parsedUrl.pathname.startsWith(`${base}/`),
  )

  if (!proxyBase) return null

  const targetBase = configuredServiceOpenBaseUrl(target, config)
  if (isRelativeUrl(targetBase)) return parsedUrl.toString()

  const suffix = `${parsedUrl.pathname.slice(proxyBase.length)}${parsedUrl.search}${parsedUrl.hash}`
  return `${targetBase.replace(/\/+$/, "")}${suffix}`
}

function serviceProxyBases(
  target: DashboardServiceLinkTarget,
  configuredBase: string,
) {
  const bases = [configuredBase]

  if (target === "rayDashboard") {
    bases.push(import.meta.env.VITE_RAY_DASHBOARD_URL || "/ray-dashboard")
  }

  if (target === "prometheus") {
    bases.push(import.meta.env.VITE_PROMETHEUS_URL || "/prometheus")
  }

  if (target === "grafana") {
    bases.push(import.meta.env.VITE_GRAFANA_URL || "/grafana")
  }

  if (target === "mlflow") {
    bases.push(import.meta.env.VITE_MLFLOW_URL || "/mlflow")
  }

  return Array.from(
    new Set(
      bases
        .filter(isRelativeUrl)
        .map((base) => base.replace(/\/+$/, ""))
        .filter(Boolean),
    ),
  )
}

function mergeServiceUrl(baseUrl: string, originalUrl: URL) {
  const base = baseUrl.trim().replace(/\/+$/, "")
  const path = originalUrl.pathname === "/" ? "" : originalUrl.pathname
  return `${base}${path}${originalUrl.search}${originalUrl.hash}`
}

function isRelativeUrl(value: string) {
  return value.startsWith("/")
}

function shouldUseConfiguredServiceUrl(
  target: DashboardServiceLinkTarget,
  parsedUrl: URL,
) {
  const host = parsedUrl.hostname.toLowerCase()
  const localishHost = [
    "127.0.0.1",
    "docker.local",
    "host.docker.internal",
    "localhost",
  ].includes(host)

  if (!localishHost) return false

  const servicePorts: Record<DashboardServiceLinkTarget, string> = {
    grafana: "3000",
    mlflow: "5000",
    prometheus: "9090",
    rayDashboard: "8265",
  }

  return parsedUrl.port === servicePorts[target]
}

async function testBrowserOpenFallback(
  target: Exclude<ServiceTestTarget, "otel">,
  config: DashboardRuntimeConfig,
): Promise<ServiceTestResult | null> {
  if (target !== "grafana" && target !== "mlflow") {
    return null
  }

  const baseUrl =
    target === "grafana" ? config.grafanaBaseUrl : config.mlflowBaseUrl

  try {
    await fetch(absoluteBrowserUrl(baseUrl), { mode: "no-cors" })
    return {
      detail:
        "Browser can open this URL. API health check is likely blocked by CORS.",
      status: "reachable",
    }
  } catch {
    return null
  }
}

function isValidRuntimeUrl(value: string) {
  try {
    new URL(value, window.location.origin)
    return true
  } catch {
    return false
  }
}

function runtimeUrlHost(value: string) {
  try {
    return new URL(value, window.location.origin).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isDashboardPreset(value: unknown): value is DashboardPreset {
  return (
    value === "local-dev" ||
    value === "local-docker" ||
    value === "same-origin" ||
    value === "custom"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function looksLikeHtml(value: string) {
  const trimmed = value.trim().toLowerCase()
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")
}

export function resolveCrossOriginUrl(
  url: string,
  config = getDashboardRuntimeConfig(),
): string {
  if (!url) return url
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  try {
    const parsed = new URL(trimmed, window.location.origin)
    if (parsed.origin !== window.location.origin) {
      return `${apiRequestBaseUrl(config)}/api/v1/monitoring/proxy?url=${encodeURIComponent(trimmed)}`
    }
  } catch {
    // If it's a relative URL or cannot be parsed, keep it as is
  }
  return trimmed
}
