export type ExperimentWorkspaceTab = "create" | "track"

export type ExperimentTrackingTab =
  | "overview"
  | "accuracy"
  | "rounds"
  | "performance"
  | "communication"
  | "convergence"
  | "availability"
  | "topology"
  | "config"

export type ExperimentRouteSearch = {
  experiment_id?: string
  tracking: ExperimentTrackingTab
  workspace: ExperimentWorkspaceTab
}

const experimentWorkspaceTabs = ["create", "track"] as const

const experimentTrackingTabs = [
  "overview",
  "accuracy",
  "rounds",
  "performance",
  "communication",
  "convergence",
  "availability",
  "topology",
  "config",
] as const

const EXPERIMENT_SEARCH_STORAGE_KEY = "fedpilot:experiment-search"

export function isExperimentWorkspaceTab(
  value: unknown,
): value is ExperimentWorkspaceTab {
  return experimentWorkspaceTabs.includes(value as ExperimentWorkspaceTab)
}

export function isExperimentTrackingTab(
  value: unknown,
): value is ExperimentTrackingTab {
  return experimentTrackingTabs.includes(value as ExperimentTrackingTab)
}

export function readStoredExperimentSearch(): ExperimentRouteSearch | null {
  try {
    const rawValue = window.localStorage.getItem(EXPERIMENT_SEARCH_STORAGE_KEY)
    if (!rawValue) return null
    const value = JSON.parse(rawValue) as Record<string, unknown>
    const workspace = isExperimentWorkspaceTab(value.workspace)
      ? value.workspace
      : "create"
    const tracking = isExperimentTrackingTab(value.tracking)
      ? value.tracking
      : "overview"
    const experimentId =
      typeof value.experiment_id === "string" ? value.experiment_id : undefined

    return {
      experiment_id: experimentId,
      tracking,
      workspace,
    }
  } catch {
    return null
  }
}

export function writeStoredExperimentSearch(search: ExperimentRouteSearch) {
  try {
    window.localStorage.setItem(
      EXPERIMENT_SEARCH_STORAGE_KEY,
      JSON.stringify(search),
    )
  } catch {
    // URL params still own current page state if storage is unavailable.
  }
}

export function getExperimentRouteSearch(): ExperimentRouteSearch {
  return (
    readStoredExperimentSearch() ?? {
      tracking: "overview",
      workspace: "create",
    }
  )
}
