import { Link } from "@tanstack/react-router"

import { getExperimentRouteSearch } from "@/lib/experimentNavigation"
import { cn } from "@/lib/utils"
import logo from "/assets/images/fedpilot_logo.jpeg"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const content =
    variant === "responsive" ? (
      <>
        <img
          src={logo}
          alt="FedPilot"
          className={cn(
            "h-6 w-auto group-data-[collapsible=icon]:hidden rounded-md",
            className,
          )}
        />
        <img
          src={logo}
          alt="FedPilot"
          className={cn(
            "size-5 hidden group-data-[collapsible=icon]:block rounded-md",
            className,
          )}
        />
      </>
    ) : (
      <img
        src={logo}
        alt="FedPilot"
        className={cn(
          variant === "full" ? "h-6 w-auto rounded-md" : "size-5 rounded-md",
          className,
        )}
      />
    )

  if (!asLink) {
    return content
  }

  return (
    <Link search={getExperimentRouteSearch()} to="/">
      {content}
    </Link>
  )
}
