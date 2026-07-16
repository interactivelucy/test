import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  Database,
  PlayCircle,
  RotateCcw,
  Save,
  Settings2,
} from "lucide-react"
import { useState } from "react"

import { OpenAPI } from "@/client"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  apiRequestBaseUrl,
  applyPreset,
  type DashboardPreset,
  type DashboardRuntimeConfig,
  deriveConfigFromBaseUrl,
  getDashboardRuntimeConfig,
  getRayAddressRisk,
  rayAddressPresets,
  resetDashboardRuntimeConfig,
  type ServiceTestResult,
  type ServiceTestTarget,
  saveDashboardRuntimeConfig,
  testDashboardService,
} from "@/lib/dashboardRuntimeConfig"
import { cn } from "@/lib/utils"

type TestState = Partial<
  Record<ServiceTestTarget, ServiceTestResult & { testedAt: string }>
>

const serviceRows: Array<{
  description: string
  field: keyof Pick<
    DashboardRuntimeConfig,
    | "apiBaseUrl"
    | "grafanaBaseUrl"
    | "mlflowBaseUrl"
    | "otelEndpoint"
    | "prometheusBaseUrl"
    | "rayDashboardBaseUrl"
  >
  label: string
  target: ServiceTestTarget
}> = [
  {
    description:
      "Backend API base URL used by auth, clusters, and experiments.",
    field: "apiBaseUrl",
    label: "Backend API URL",
    target: "api",
  },
  {
    description: "Browser-facing Ray Dashboard URL or proxy path.",
    field: "rayDashboardBaseUrl",
    label: "Ray Dashboard",
    target: "rayDashboard",
  },
  {
    description: "Prometheus source for experiment metrics.",
    field: "prometheusBaseUrl",
    label: "Prometheus",
    target: "prometheus",
  },
  {
    description: "Grafana link or reverse-proxy path.",
    field: "grafanaBaseUrl",
    label: "Grafana",
    target: "grafana",
  },
  {
    description: "MLflow source for model and run tracking.",
    field: "mlflowBaseUrl",
    label: "MLflow",
    target: "mlflow",
  },
  {
    description: "Default OTEL metrics endpoint for generated configs.",
    field: "otelEndpoint",
    label: "OTEL Endpoint",
    target: "otel",
  },
]

export function DashboardSettingsPage() {
  const [config, setConfig] = useState<DashboardRuntimeConfig>(() =>
    getDashboardRuntimeConfig(),
  )
  const [baseUrl, setBaseUrl] = useState("")
  const [tests, setTests] = useState<TestState>({})
  const [testing, setTesting] = useState<ServiceTestTarget | "all" | null>(null)
  const [saved, setSaved] = useState(false)
  const rayAddressRisk = getRayAddressRisk(config.rayAddress, config.preset)

  const updateConfig = (next: Partial<DashboardRuntimeConfig>) => {
    setSaved(false)
    setConfig((current) => ({
      ...current,
      ...next,
      preset: next.preset ?? "custom",
    }))
  }

  const handlePresetChange = (preset: DashboardPreset) => {
    setSaved(false)
    setTests({})
    setConfig((current) => applyPreset(preset, current))
  }

  const handleDerive = () => {
    setSaved(false)
    setTests({})
    setConfig((current) => deriveConfigFromBaseUrl(baseUrl, current))
  }

  const handleSave = () => {
    saveDashboardRuntimeConfig(config)
    OpenAPI.BASE = apiRequestBaseUrl(config)
    setSaved(true)
  }

  const handleReset = () => {
    const nextConfig = resetDashboardRuntimeConfig("local-dev")
    OpenAPI.BASE = apiRequestBaseUrl(nextConfig)
    setBaseUrl("")
    setConfig(nextConfig)
    setTests({})
    setSaved(false)
  }

  const runTest = async (target: ServiceTestTarget) => {
    setTesting(target)
    const result = await testDashboardService(target, config)
    setTests((current) => ({
      ...current,
      [target]: {
        ...result,
        testedAt: new Date().toLocaleTimeString(),
      },
    }))
    setTesting(null)
  }

  const runAllTests = async () => {
    setTesting("all")
    for (const row of serviceRows) {
      const result = await testDashboardService(row.target, config)
      setTests((current) => ({
        ...current,
        [row.target]: {
          ...result,
          testedAt: new Date().toLocaleTimeString(),
        },
      }))
    }
    setTesting(null)
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-lg">
        <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
          <div className="flex items-start gap-4">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings2 className="size-5" />
            </div>
            <div>
              <CardTitle>Dashboard Settings</CardTitle>
              <CardDescription>
                Runtime routes, service presets, and refresh preferences.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2" data-slot="card-action">
            {saved ? (
              <Badge
                className="border-emerald-500/40 text-emerald-400"
                variant="outline"
              >
                Saved
              </Badge>
            ) : null}
            <Button size="sm" variant="outline" onClick={handleReset}>
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="size-4" />
              Save
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-5 text-primary" />
              Data Sources
            </CardTitle>
            <CardDescription>
              Browser-facing URLs used by the dashboard at runtime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-2">
                <Label>Preset</Label>
                <Select
                  value={config.preset}
                  onValueChange={(value) =>
                    handlePresetChange(value as DashboardPreset)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local-dev">Local dev</SelectItem>
                    <SelectItem value="local-docker">Local Docker</SelectItem>
                    <SelectItem value="same-origin">Same origin</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="runtimeBaseUrl">Simple base URL</Label>
                <Input
                  id="runtimeBaseUrl"
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://fedpilot.example.com"
                  value={baseUrl}
                />
              </div>

              <Button
                disabled={!baseUrl.trim()}
                onClick={handleDerive}
                type="button"
                variant="outline"
              >
                Apply base
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {serviceRows.map((row) => (
                <ServiceField
                  description={row.description}
                  isTesting={testing === row.target || testing === "all"}
                  key={row.target}
                  label={row.label}
                  onChange={(value) =>
                    updateConfig({
                      [row.field]: value,
                    } as Partial<DashboardRuntimeConfig>)
                  }
                  onTest={() => runTest(row.target)}
                  result={tests[row.target]}
                  value={String(config[row.field])}
                />
              ))}
            </div>

            <div className="space-y-3">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
                <div className="space-y-2">
                  <Label htmlFor="rayAddress">
                    Ray address for new cluster records
                  </Label>
                  <Input
                    id="rayAddress"
                    onChange={(event) =>
                      updateConfig({ rayAddress: event.target.value })
                    }
                    value={config.rayAddress}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ray address preset</Label>
                  <Select
                    value={rayAddressPresetValue(config.rayAddress)}
                    onValueChange={(value) => {
                      if (value === "custom") return
                      const preset = rayAddressPresets.find(
                        (item) => item.id === value,
                      )
                      if (preset) updateConfig({ rayAddress: preset.value })
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom</SelectItem>
                      {rayAddressPresets.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                This can be backend/container-facing. Ray Dashboard above should
                stay browser-facing.
              </p>

              {rayAddressRisk ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <p>{rayAddressRisk}</p>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button
                disabled={testing !== null}
                onClick={runAllTests}
                type="button"
                variant="outline"
              >
                <PlayCircle
                  className={cn("size-4", testing === "all" && "animate-spin")}
                />
                Test all
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-5 text-primary" />
              Refresh
            </CardTitle>
            <CardDescription>
              Local UI defaults for live dashboard sections.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="refreshIntervalSeconds">
                Refresh Interval Seconds
              </Label>
              <Input
                id="refreshIntervalSeconds"
                min={5}
                onChange={(event) =>
                  updateConfig({
                    refreshIntervalSeconds: Number(event.target.value) || 60,
                  })
                }
                type="number"
                value={config.refreshIntervalSeconds}
              />
            </div>

            <div className="space-y-2">
              <Label>Preferred Time Range</Label>
              <Select
                value={config.preferredTimeRange}
                onValueChange={(value) =>
                  updateConfig({ preferredTimeRange: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last-5-minutes">Last 5 minutes</SelectItem>
                  <SelectItem value="last-15-minutes">
                    Last 15 minutes
                  </SelectItem>
                  <SelectItem value="last-30-minutes">
                    Last 30 minutes
                  </SelectItem>
                  <SelectItem value="saved-run-window">
                    Saved run window
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-3 rounded-lg border bg-background/60 p-4">
              <Checkbox
                checked={config.autoRefreshEnabled}
                id="autoRefreshEnabled"
                onCheckedChange={(checked) =>
                  updateConfig({ autoRefreshEnabled: checked === true })
                }
              />
              <div className="space-y-1">
                <Label htmlFor="autoRefreshEnabled">Enable auto-refresh</Label>
                <p className="text-sm text-muted-foreground">
                  Sections can use this when live data is wired.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border bg-background/60 p-4">
              <Bell className="mt-0.5 size-4 text-primary" />
              <p className="text-sm text-muted-foreground">
                Defaults come from the Local dev preset until saved settings
                exist.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function rayAddressPresetValue(value: string) {
  return (
    rayAddressPresets.find((preset) => preset.value === value.trim())?.id ??
    "custom"
  )
}

function ServiceField({
  description,
  isTesting,
  label,
  onChange,
  onTest,
  result,
  value,
}: {
  description: string
  isTesting: boolean
  label: string
  onChange: (value: string) => void
  onTest: () => void
  result?: ServiceTestResult & { testedAt: string }
  value: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <TestBadge result={result} />
      </div>
      <div className="flex gap-2">
        <Input
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
        <Button
          disabled={isTesting}
          onClick={onTest}
          size="icon"
          type="button"
          variant="outline"
          aria-label={`Test ${label}`}
        >
          <PlayCircle className={cn("size-4", isTesting && "animate-spin")} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      {result ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {result.testedAt} - {result.detail}
        </p>
      ) : null}
    </div>
  )
}

function TestBadge({
  result,
}: {
  result?: ServiceTestResult & { testedAt: string }
}) {
  if (!result) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Untested
      </Badge>
    )
  }

  if (result.status === "reachable") {
    return (
      <Badge
        className="border-emerald-500/40 text-emerald-400"
        variant="outline"
      >
        <CheckCircle2 className="size-3" />
        Reachable
      </Badge>
    )
  }

  if (result.status === "protected" || result.status === "not-testable") {
    return (
      <Badge className="border-amber-500/40 text-amber-400" variant="outline">
        <AlertCircle className="size-3" />
        {result.status === "protected" ? "Protected" : "Valid URL"}
      </Badge>
    )
  }

  return (
    <Badge className="border-destructive/40 text-destructive" variant="outline">
      <AlertCircle className="size-3" />
      Failed
    </Badge>
  )
}
