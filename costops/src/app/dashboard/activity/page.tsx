import Link from "next/link";

import { Button } from "@/components/ui/button";

const events = [
  {
    id: "pr-421",
    title: "Resize Standard_D8s_v5 VM to D4s_v5",
    description: "Automation opened a PR to resize the core API VM after sustained low CPU utilization.",
    status: "Awaiting review",
    timestamp: "2024-04-14T10:24:00Z",
    prUrl: "https://github.com/example/costops/pull/421",
  },
  {
    id: "pr-418",
    title: "Downgrade SQL tier to S2 in staging",
    description: "Data engineering requested review from platform for automated connection string updates.",
    status: "Review approved",
    timestamp: "2024-04-12T16:02:00Z",
    prUrl: "https://github.com/example/costops/pull/418",
  },
  {
    id: "pr-413",
    title: "Stop unused App Service plan",
    description: "Web platform acknowledged the automation PR and added post-deployment validation tasks.",
    status: "Merged",
    timestamp: "2024-04-09T08:40:00Z",
    prUrl: "https://github.com/example/costops/pull/413",
  },
  {
    id: "pr-404",
    title: "Release unattached public IPs",
    description: "Change advisory board approved the release and automation merged the change.",
    status: "Merged",
    timestamp: "2024-04-03T13:18:00Z",
    prUrl: "https://github.com/example/costops/pull/404",
  },
];

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function ActivityPage() {
  return (
    <div className="space-y-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Activity</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pull request delivery timeline</h1>
        <p className="max-w-3xl text-muted-foreground">
          Track automation-driven pull requests as they move from creation through review and merge.
          Events are grouped chronologically with quick access to the source PR.
        </p>
      </header>

      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 hidden w-px bg-border sm:block" aria-hidden="true" />
        <div className="space-y-6">
          {events.map((event, index) => (
            <article key={event.id} className="relative flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-6 shadow-sm sm:ml-10">
              <span
                className="absolute -left-10 hidden h-3 w-3 rounded-full border-2 border-background bg-primary sm:block"
                style={{ top: "1.75rem" }}
              />
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{event.title}</h2>
                  <p className="text-sm text-muted-foreground">{event.description}</p>
                </div>
                <div className="flex flex-col items-end text-sm text-muted-foreground">
                  <span className="rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                    {event.status}
                  </span>
                  <time dateTime={event.timestamp}>{formatDate(event.timestamp)}</time>
                </div>
              </header>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" asChild>
                  <Link href={event.prUrl} target="_blank">
                    View on GitHub
                  </Link>
                </Button>
              </div>
              {index !== events.length - 1 && (
                <div className="absolute -bottom-6 left-0 right-0 h-6 bg-gradient-to-b from-border/40 to-transparent sm:left-auto sm:right-auto sm:w-px sm:translate-x-[-2.5rem] sm:bg-none" />
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
