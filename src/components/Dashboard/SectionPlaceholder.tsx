import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type SectionPlaceholderProps = {
  title: string
  description: string
  icon: LucideIcon
}

export function SectionPlaceholder({
  title,
  description,
  icon: Icon,
}: SectionPlaceholderProps) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            This section is reserved for the next dashboard view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-72 items-center justify-center rounded-lg border bg-muted/30">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex size-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-7" />
              </div>
              <div>
                <p className="font-medium">{title}</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  The base route is ready. Metrics and controls can be added
                  here after the Experiment dashboard data API is finalized.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
