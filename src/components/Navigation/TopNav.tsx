import {
  Link as RouterLink,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  Activity,
  FlaskConical,
  GitBranch,
  LogOut,
  RadioTower,
  Server,
  Settings,
  ShieldCheck,
} from "lucide-react"
import type { MouseEvent } from "react"

import { Appearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import useAuth from "@/hooks/useAuth"
import { getExperimentRouteSearch } from "@/lib/experimentNavigation"
import { cn } from "@/lib/utils"
import { getInitials } from "@/utils"

type NavItem = {
  icon: LucideIcon
  title: string
  path: string
}

const baseItems: NavItem[] = [
  { icon: FlaskConical, title: "Experiment", path: "/" },
  { icon: Server, title: "Cluster", path: "/cluster" },
  { icon: Activity, title: "System", path: "/system" },
  { icon: GitBranch, title: "Models", path: "/model-tracking" },
  { icon: RadioTower, title: "Serving", path: "/serving" },
  { icon: ShieldCheck, title: "SecOps", path: "/secops" },
]

function TopNavLink({ item }: { item: NavItem }) {
  const navigate = useNavigate()
  const router = useRouterState()
  const currentPath = router.location.pathname
  const isActive = currentPath === item.path
  const Icon = item.icon

  const className = cn(
    "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
    isActive && "bg-accent text-accent-foreground",
  )

  if (item.path === "/") {
    const handleExperimentClick = (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      navigate({
        search: getExperimentRouteSearch(),
        to: "/",
      })
    }

    return (
      <RouterLink
        search={getExperimentRouteSearch()}
        to="/"
        onClick={handleExperimentClick}
        className={className}
      >
        <Icon className="size-4" />
        <span>{item.title}</span>
      </RouterLink>
    )
  }

  return (
    <RouterLink to={item.path} className={className}>
      <Icon className="size-4" />
      <span>{item.title}</span>
    </RouterLink>
  )
}

function UserMenu() {
  const { logout, user } = useAuth()

  if (!user) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="User menu"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="user-menu"
      >
        <Avatar className="size-9">
          <AvatarFallback className="bg-zinc-600 text-white">
            {getInitials(user.full_name || "User")}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 rounded-lg">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="truncate text-sm font-medium">
              {user.full_name || "User"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <RouterLink to="/settings">
          <DropdownMenuItem>
            <Settings />
            User Settings
          </DropdownMenuItem>
        </RouterLink>
        <DropdownMenuItem onClick={() => logout()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 md:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <Logo variant="icon" />
          <span className="hidden text-sm font-semibold tracking-normal sm:inline">
            FedPilot
          </span>
        </div>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {baseItems.map((item) => (
            <TopNavLink item={item} key={item.title} />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Appearance />
          <Button variant="outline" size="icon" asChild>
            <RouterLink
              to="/dashboard-settings"
              aria-label="Dashboard settings"
            >
              <Settings className="h-[1.2rem] w-[1.2rem]" />
            </RouterLink>
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
