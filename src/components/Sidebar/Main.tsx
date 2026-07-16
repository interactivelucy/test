import {
  Link as RouterLink,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import type { MouseEvent } from "react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { getExperimentRouteSearch } from "@/lib/experimentNavigation"

export type Item = {
  icon: LucideIcon
  title: string
  path: string
}

interface MainProps {
  items: Item[]
}

export function Main({ items }: MainProps) {
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const router = useRouterState()
  const currentPath = router.location.pathname

  const handleMenuClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const handleExperimentClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    handleMenuClick()
    navigate({
      search: getExperimentRouteSearch(),
      to: "/",
    })
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = currentPath === item.path

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  asChild
                >
                  {item.path === "/" ? (
                    <RouterLink
                      search={getExperimentRouteSearch()}
                      to="/"
                      onClick={handleExperimentClick}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </RouterLink>
                  ) : (
                    <RouterLink to={item.path} onClick={handleMenuClick}>
                      <item.icon />
                      <span>{item.title}</span>
                    </RouterLink>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
