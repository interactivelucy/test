import {
  browserServiceUrl,
  getDashboardRuntimeConfig,
  resolveCrossOriginUrl,
} from "@/lib/dashboardRuntimeConfig"

type RayRecord = Record<string, unknown>
const RAY_CLUSTER_CACHE_KEY = "fedpilot-ray-cluster-last-snapshot"

export type RayNode = {
  cpuUsagePercent: number | null
  diskUsagePercent: number | null
  gpuCount: number
  gpus: RayGpu[]
  hostname: string
  id: string
  ip: string
  memoryTotalBytes: number
  memoryUsedBytes: number
  memoryUsagePercent: number | null
  state: string
  totalCpu: number
}

export type RayGpu = {
  index: number
  memoryTotalMegabytes: number
  memoryUsedMegabytes: number
  name: string
  temperatureCelsius: number | null
  utilizationPercent: number
}

export type RayActor = {
  actorClass: string
  id: string
  nodeId: string
  pid: string
  restarts: number
  state: string
}

export type RayJob = {
  driverPid: string
  duration: string
  entrypoint: string
  id: string
  status: string
}

export type RayResource = {
  available: number
  name: string
  total: number
  used: number
  usagePercent: number
}

export type RayClusterData = {
  activeNodes: number
  actors: RayActor[]
  clusterStatus: "Active" | "Inactive"
  dashboardUrl: string
  failedNodes: number
  fetchedAt: string
  isStale: boolean
  jobs: RayJob[]
  nodes: RayNode[]
  pendingNodes: number
  resources: RayResource[]
  totals: {
    actors: number
    cpuUsagePercent: number
    gpus: number
    gpuSummary: string
    gpuUsagePercent: number
    gpuVramTotalMegabytes: number
    gpuVramUsagePercent: number
    gpuVramUsedMegabytes: number
    jobs: number
    memoryTotalBytes: number
    memoryUsagePercent: number
    memoryUsedBytes: number
    nodes: number
  }
}

export function getRayRefreshInterval() {
  const seconds = getDashboardRuntimeConfig().refreshIntervalSeconds
  return Math.max(5, seconds) * 1000
}

export async function fetchRayClusterData(
  dashboardUrlInput: string,
): Promise<RayClusterData> {
  const dashboardUrl = resolveRayDashboardFetchUrl(dashboardUrlInput)

  const [status, nodes, actors, jobs] = await Promise.all([
    getJson(dashboardUrl, "/api/cluster_status"),
    getJsonWithFallback(dashboardUrl, ["/nodes?view=summary", "/api/nodes"]),
    getJsonWithFallback(dashboardUrl, ["/logical/actors", "/api/actors"]),
    getJson(dashboardUrl, "/api/jobs/"),
  ])

  if (
    status.status === "rejected" &&
    nodes.status === "rejected" &&
    actors.status === "rejected" &&
    jobs.status === "rejected"
  ) {
    const cachedData = loadCachedRayClusterData(dashboardUrl)

    if (cachedData) {
      return cachedData
    }

    throw new Error(
      "Unable to reach the Ray Dashboard. Check the URL, Ray process, and CORS settings.",
    )
  }

  const normalizedNodes = normalizeNodes(valueOrNull(nodes))
  const normalizedActors = normalizeActors(valueOrNull(actors))
  const normalizedJobs = normalizeJobs(valueOrNull(jobs))
  const resources = normalizeResources(normalizedNodes)
  const statusCounts = getStatusCounts(valueOrNull(status), normalizedNodes)
  const totals = getTotals(normalizedNodes, normalizedActors, normalizedJobs)

  const clusterData: RayClusterData = {
    ...statusCounts,
    actors: normalizedActors,
    clusterStatus: statusCounts.activeNodes > 0 ? "Active" : "Inactive",
    dashboardUrl,
    fetchedAt: new Date().toISOString(),
    isStale: false,
    jobs: normalizedJobs,
    nodes: normalizedNodes,
    resources,
    totals,
  }

  saveCachedRayClusterData(clusterData)

  return clusterData
}

function loadCachedRayClusterData(dashboardUrl: string): RayClusterData | null {
  if (typeof window === "undefined") {
    return null
  }

  const cachedValue = window.localStorage.getItem(cacheKey(dashboardUrl))
  if (!cachedValue) {
    return null
  }

  try {
    const cachedData = JSON.parse(cachedValue) as RayClusterData
    if (cachedData.dashboardUrl !== dashboardUrl) {
      return null
    }

    return {
      ...cachedData,
      clusterStatus: "Inactive",
      dashboardUrl,
      isStale: true,
    }
  } catch {
    return null
  }
}

function saveCachedRayClusterData(data: RayClusterData) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(cacheKey(data.dashboardUrl), JSON.stringify(data))
}

function normalizeDashboardUrl(url: string) {
  return url.replace(/\/+$/, "")
}

function cacheKey(dashboardUrl: string) {
  return `${RAY_CLUSTER_CACHE_KEY}:${dashboardUrl}`
}

export function resolveRayDashboardFetchUrl(value: string) {
  const url = browserServiceUrl("rayDashboard", value) ?? value
  return normalizeDashboardUrl(url)
}

async function getJson(
  baseUrl: string,
  path: string,
): Promise<PromiseSettledResult<unknown>> {
  return toSettled(fetchJson(joinUrl(baseUrl, path)))
}

async function getJsonWithFallback(
  baseUrl: string,
  paths: string[],
): Promise<PromiseSettledResult<unknown>> {
  let lastError: unknown

  for (const path of paths) {
    try {
      return {
        status: "fulfilled",
        value: await fetchJson(joinUrl(baseUrl, path)),
      }
    } catch (error) {
      lastError = error
    }
  }

  return { status: "rejected", reason: lastError }
}

async function fetchJson(url: string): Promise<unknown> {
  const targetUrl = resolveCrossOriginUrl(url)
  const headers: Record<string, string> = { Accept: "application/json" }

  if (targetUrl.includes("/monitoring/proxy")) {
    const token = localStorage.getItem("access_token") || ""
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  const response = await fetch(targetUrl, { headers })

  if (!response.ok) {
    throw new Error(`Ray request failed with ${response.status}`)
  }

  return response.json()
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path}`
}

async function toSettled(
  promise: Promise<unknown>,
): Promise<PromiseSettledResult<unknown>> {
  try {
    return { status: "fulfilled", value: await promise }
  } catch (reason) {
    return { status: "rejected", reason }
  }
}

function valueOrNull(result: PromiseSettledResult<unknown>) {
  return result.status === "fulfilled" ? result.value : null
}

function asRecord(value: unknown): RayRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RayRecord)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown, fallback = "Unknown") {
  if (typeof value === "string" && value.trim()) {
    return value
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString()
  }

  return fallback
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function normalizeNodes(payload: unknown): RayNode[] {
  const root = asRecord(payload)
  const data = asRecord(root.data)
  const nodesPayload = asArray(data.summary).length
    ? data.summary
    : (data.nodes ?? root.summary ?? root.nodes ?? payload)
  const nodes = asArray(nodesPayload)

  return nodes.map((node, index) => {
    const item = asRecord(node)
    const raylet = asRecord(item.raylet)
    const resources = asRecord(item.resources)
    const memory = asArray(item.mem)
    const disk = asRecord(item.disk)
    const gpus = asArray(item.gpus)
    const memoryTotal = asNumber(memory[0])
    const memoryAvailable = asNumber(memory[1])
    const memoryUsed = Math.max(memoryTotal - memoryAvailable, 0)
    const memoryPct =
      typeof memory[2] === "number"
        ? memory[2]
        : getPercent(memoryUsed, memoryTotal)

    return {
      cpuUsagePercent:
        typeof item.cpu === "number" ? Math.min(item.cpu, 100) : null,
      diskUsagePercent:
        typeof item.disk === "number"
          ? item.disk
          : typeof disk.percent === "number"
            ? disk.percent
            : null,
      gpuCount: gpus.length,
      gpus: normalizeGpus(gpus),
      hostname: asString(item.hostname),
      id: asString(item.nodeId ?? raylet.nodeId, `node-${index + 1}`),
      ip: asString(item.ip ?? item.nodeManagerAddress),
      memoryTotalBytes: memoryTotal,
      memoryUsedBytes: memoryUsed,
      memoryUsagePercent: memoryPct,
      state: normalizeNodeState(item),
      totalCpu: asNumber(resources.CPU),
    }
  })
}

function normalizeGpus(gpus: unknown[]): RayGpu[] {
  return gpus.map((gpu, index) => {
    const item = asRecord(gpu)

    return {
      index,
      memoryTotalMegabytes: asNumber(item.memoryTotal),
      memoryUsedMegabytes: asNumber(item.memoryUsed),
      name: asString(item.name, `GPU ${index}`),
      temperatureCelsius:
        typeof item.temperatureGpu === "number" ? item.temperatureGpu : null,
      utilizationPercent: asNumber(item.utilizationGpu),
    }
  })
}

function normalizeNodeState(node: RayRecord) {
  const explicitState = asString(
    node.state ?? node.status ?? node.nodeState,
    "",
  ).toUpperCase()

  if (explicitState) {
    return explicitState
  }

  const isAlive = node.isAlive ?? node.alive
  if (isAlive === false) {
    return "DEAD"
  }

  return "ALIVE"
}

function normalizeActors(payload: unknown): RayActor[] {
  const root = asRecord(payload)
  const data = asRecord(root.data)
  const actorsPayload = data.actors ?? root.actors ?? payload
  const actorList = Array.isArray(actorsPayload)
    ? actorsPayload
    : Object.values(asRecord(actorsPayload))

  return actorList.map((actor, index) => {
    const item = asRecord(actor)
    const address = asRecord(item.address)

    return {
      actorClass: asString(item.actorClass ?? item.className),
      id: shorten(asString(item.actorId, `actor-${index + 1}`), 16),
      nodeId: shorten(asString(item.nodeId ?? address.rayletId), 8),
      pid: asString(item.pid, "N/A"),
      restarts: asNumber(item.numRestarts),
      state: asString(item.state, "UNKNOWN"),
    }
  })
}

function normalizeJobs(payload: unknown): RayJob[] {
  const root = asRecord(payload)
  const data = asRecord(root.data)
  const jobsPayload = Array.isArray(payload)
    ? payload
    : Array.isArray(data.jobs)
      ? data.jobs
      : Array.isArray(data.result)
        ? data.result
        : Array.isArray(root.jobs)
          ? root.jobs
          : []

  return jobsPayload.map((job, index) => {
    const item = asRecord(job)
    const startTime = asNumber(item.start_time ?? item.startTime)
    const endTime = asNumber(item.end_time ?? item.endTime)

    return {
      driverPid: asString(item.driver_pid ?? item.driverPid, "N/A"),
      duration: formatDuration(startTime, endTime),
      entrypoint: shorten(asString(item.entrypoint, "N/A"), 56),
      id: shorten(asString(item.job_id ?? item.jobId, `job-${index + 1}`), 22),
      status: asString(item.status, "UNKNOWN"),
    }
  })
}

function normalizeResources(nodes: RayNode[]): RayResource[] {
  const totals = new Map<string, number>()
  const available = new Map<string, number>()

  for (const node of nodes) {
    if (!isAliveNode(node)) {
      continue
    }

    if (node.totalCpu) {
      totals.set("CPU", (totals.get("CPU") ?? 0) + node.totalCpu)
    }
    if (node.memoryTotalBytes) {
      totals.set("memory", (totals.get("memory") ?? 0) + node.memoryTotalBytes)
      available.set(
        "memory",
        (available.get("memory") ?? 0) +
          Math.max(node.memoryTotalBytes - node.memoryUsedBytes, 0),
      )
    }
    if (node.gpuCount) {
      totals.set("GPU", (totals.get("GPU") ?? 0) + node.gpuCount)
    }
  }

  return Array.from(totals.entries()).map(([name, total]) => {
    const resourceAvailable = available.get(name) ?? total
    const used = Math.max(total - resourceAvailable, 0)

    return {
      available: resourceAvailable,
      name,
      total,
      used,
      usagePercent: getPercent(used, total),
    }
  })
}

function getStatusCounts(payload: unknown, nodes: RayNode[]) {
  const root = asRecord(payload)
  const data = asRecord(root.data)
  const report = asRecord(data.autoscalerReport)
  const activeNodes = asRecord(report.activeNodes)
  const pendingNodes = asArray(report.pendingNodes)
  const failedNodes = asArray(report.failedNodes)
  const activeCount = Object.keys(activeNodes).length

  return {
    activeNodes:
      activeCount || nodes.filter((node) => isAliveNode(node)).length,
    failedNodes: failedNodes.length,
    pendingNodes: pendingNodes.length,
  }
}

function getTotals(nodes: RayNode[], actors: RayActor[], jobs: RayJob[]) {
  const aliveNodes = nodes.filter((node) => isAliveNode(node))
  const usedCpu = aliveNodes.reduce(
    (total, node) => total + (node.cpuUsagePercent ?? 0),
    0,
  )
  const totalCpu = aliveNodes.reduce((total, node) => total + node.totalCpu, 0)
  const memoryTotalBytes = aliveNodes.reduce(
    (total, node) => total + node.memoryTotalBytes,
    0,
  )
  const memoryUsedBytes = aliveNodes.reduce(
    (total, node) => total + node.memoryUsedBytes,
    0,
  )
  const gpus = aliveNodes.reduce((total, node) => total + node.gpuCount, 0)
  const gpuList = aliveNodes.flatMap((node) => node.gpus)
  const gpuVramUsedMegabytes = gpuList.reduce(
    (total, gpu) => total + gpu.memoryUsedMegabytes,
    0,
  )
  const gpuVramTotalMegabytes = gpuList.reduce(
    (total, gpu) => total + gpu.memoryTotalMegabytes,
    0,
  )
  const gpuUtilizationTotal = gpuList.reduce(
    (total, gpu) => total + gpu.utilizationPercent,
    0,
  )
  const gpuNames = Array.from(new Set(gpuList.map((gpu) => gpu.name)))

  return {
    actors: actors.length,
    cpuUsagePercent: totalCpu ? getPercent(usedCpu, totalCpu) : usedCpu,
    gpus,
    gpuSummary: formatGpuSummary(gpuNames, gpus),
    gpuUsagePercent: gpuList.length ? gpuUtilizationTotal / gpuList.length : 0,
    gpuVramTotalMegabytes,
    gpuVramUsagePercent: getPercent(
      gpuVramUsedMegabytes,
      gpuVramTotalMegabytes,
    ),
    gpuVramUsedMegabytes,
    jobs: jobs.length,
    memoryTotalBytes,
    memoryUsagePercent: getPercent(memoryUsedBytes, memoryTotalBytes),
    memoryUsedBytes,
    nodes: nodes.length,
  }
}

function formatGpuSummary(names: string[], count: number) {
  if (!count) {
    return "No GPUs"
  }

  if (names.length === 1) {
    return count > 1 ? `${names[0]} x${count}` : names[0]
  }

  return `${count} GPUs`
}

function isAliveNode(node: RayNode) {
  const state = node.state.toUpperCase()
  return state !== "DEAD" && state !== "FAILED" && state !== "FAILURE"
}

export function formatBytes(bytes: number) {
  if (!bytes) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function formatDuration(startTime: number, endTime: number) {
  if (!startTime || !endTime) {
    return "N/A"
  }

  const seconds =
    startTime > 1_000_000_000_000
      ? Math.max((endTime - startTime) / 1000, 0)
      : Math.max(endTime - startTime, 0)

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

function getPercent(used: number, total: number) {
  return total > 0 ? Math.min((used / total) * 100, 100) : 0
}

function shorten(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}
