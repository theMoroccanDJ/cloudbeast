import { Button } from "@/components/ui/button";

const kpis = [
  {
    label: "Total monthly cost",
    value: "$142,380",
    delta: "+3.2% vs last month",
  },
  {
    label: "Estimated avoidable waste",
    value: "$27,940",
    delta: "12 recommendations pending",
  },
  {
    label: "Savings captured",
    value: "$58,210",
    delta: "18% of total spend",
  },
];

const topActions = [
  {
    id: "vm-rightsize-1",
    title: "Right-size 4 underutilized VMs",
    impact: "$8,450/month",
    owner: "Platform team",
    prUrl: "/dashboard/opportunities?focus=vm-rightsize-1",
  },
  {
    id: "sql-tier-1",
    title: "Downgrade SQL tier for staging",
    impact: "$3,120/month",
    owner: "Data engineering",
    prUrl: "/dashboard/opportunities?focus=sql-tier-1",
  },
  {
    id: "app-service-1",
    title: "Move unused App Service plan to free tier",
    impact: "$1,870/month",
    owner: "Web platform",
    prUrl: "/dashboard/opportunities?focus=app-service-1",
  },
  {
    id: "storage-tier-1",
    title: "Archive cold blob storage",
    impact: "$980/month",
    owner: "Infra ops",
    prUrl: "/dashboard/opportunities?focus=storage-tier-1",
  },
  {
    id: "dns-cleanup-1",
    title: "Delete unused public IPs",
    impact: "$620/month",
    owner: "Network",
    prUrl: "/dashboard/opportunities?focus=dns-cleanup-1",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-10 bg-gradient-to-b from-background via-background to-secondary/10 px-6 py-10">
      <header className="max-w-5xl space-y-4">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Dashboard</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Cloud cost performance overview
        </h1>
        <p className="text-muted-foreground">
          Keep track of your spend, quantify avoidable waste, and action the top savings
          opportunities across your Azure estate.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-3">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-border/60 bg-card/95 p-6 shadow-sm backdrop-blur"
          >
            <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{kpi.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{kpi.delta}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Top actions this month</h2>
            <p className="text-sm text-muted-foreground">
              Prioritized by estimated monthly savings and implementation effort.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/dashboard/opportunities">View all opportunities</a>
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <table className="min-w-full divide-y divide-border/70 text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Recommendation</th>
                <th className="px-6 py-3 font-medium">Owner</th>
                <th className="px-6 py-3 font-medium">Impact</th>
                <th className="px-6 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {topActions.map((action) => (
                <tr key={action.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4 font-medium text-foreground">{action.title}</td>
                  <td className="px-6 py-4 text-muted-foreground">{action.owner}</td>
                  <td className="px-6 py-4 font-semibold text-emerald-600">{action.impact}</td>
                  <td className="px-6 py-4 text-right">
                    <Button size="sm" asChild>
                      <a href={action.prUrl}>Open PR</a>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
