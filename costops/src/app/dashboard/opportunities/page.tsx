"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type OpportunityStatus = "open" | "in-progress" | "in-review" | "shipped";

type Opportunity = {
  id: string;
  title: string;
  rule: string;
  ruleLabel: string;
  environment: "prod" | "staging" | "dev";
  status: OpportunityStatus;
  impact: string;
  owner: string;
  summary: string;
  prLink: string;
  details: string[];
};

const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  open: "Open",
  "in-progress": "In progress",
  "in-review": "In review",
  shipped: "Merged",
};

const opportunities: Opportunity[] = [
  {
    id: "vm-rightsize-1",
    title: "Resize Standard_D8s_v5 VM to D4s_v5",
    rule: "azure.vm.rightsize",
    ruleLabel: "Right-size underutilized virtual machines",
    environment: "prod",
    status: "in-review",
    impact: "$4,120/month",
    owner: "Platform",
    summary:
      "Average CPU under 10% over the past 30 days. Recommending resize to D4s_v5 for 48% savings.",
    prLink: "https://github.com/example/costops/pull/421",
    details: [
      "VM name: core-api-eastus",
      "Subscription: prod-shared-services",
      "Last observed peak CPU: 18%",
      "Estimated completion: 2 hours",
    ],
  },
  {
    id: "sql-tier-1",
    title: "Downgrade SQL tier to S2 in staging",
    rule: "azure.sql.rightsize",
    ruleLabel: "Right-size SQL Database tier",
    environment: "staging",
    status: "open",
    impact: "$3,120/month",
    owner: "Data engineering",
    summary:
      "Staging workload idle 90% of the time. Switching to S2 retains headroom while cutting costs by 61%.",
    prLink: "https://github.com/example/costops/pull/418",
    details: [
      "Database: telemetry-staging",
      "Suggested tier: Standard S2",
      "Impact calculated from Azure pricing April 2024",
    ],
  },
  {
    id: "app-service-1",
    title: "Stop unused App Service plan",
    rule: "azure.appservice.cleanup",
    ruleLabel: "Decommission idle App Service plans",
    environment: "dev",
    status: "in-progress",
    impact: "$1,870/month",
    owner: "Web platform",
    summary:
      "No deployments for 45 days and no inbound requests detected. Automation prepared to stop the plan.",
    prLink: "https://github.com/example/costops/pull/413",
    details: [
      "Plan: appsvc-dev-eastus",
      "Last deployment: 2024-03-08",
      "Traffic: < 50 requests / day",
    ],
  },
  {
    id: "storage-tier-1",
    title: "Move cold blob data to archive tier",
    rule: "azure.storage.tiering",
    ruleLabel: "Tier cold blob storage",
    environment: "prod",
    status: "open",
    impact: "$980/month",
    owner: "Infra ops",
    summary:
      "45 TB of data not accessed in 120 days. Archiving to cool tier keeps compliance while lowering spend.",
    prLink: "https://github.com/example/costops/pull/409",
    details: [
      "Account: media-prod",
      "Container: recordings",
      "Projected retrieval cost: $120",
    ],
  },
  {
    id: "dns-cleanup-1",
    title: "Release unattached public IPs",
    rule: "azure.network.cleanup",
    ruleLabel: "Remove idle networking resources",
    environment: "prod",
    status: "shipped",
    impact: "$620/month",
    owner: "Network",
    summary:
      "Five static IP addresses were provisioned for pilot workloads and are no longer attached to resources.",
    prLink: "https://github.com/example/costops/pull/404",
    details: [
      "IPs: 20.14.20.100-104",
      "Completed during maintenance window",
      "Change approved by CAB on 2024-04-01",
    ],
  },
];

export default function OpportunitiesPage() {
  const [ruleFilter, setRuleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<OpportunityStatus | "all">("all");
  const [environmentFilter, setEnvironmentFilter] = useState<Opportunity["environment"] | "all">("all");
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);

  const rules = useMemo(() => Array.from(new Set(opportunities.map((item) => item.rule))), []);
  const environments = useMemo(
    () => Array.from(new Set(opportunities.map((item) => item.environment))),
    [],
  );

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((item) => {
      if (ruleFilter !== "all" && item.rule !== ruleFilter) {
        return false;
      }
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (environmentFilter !== "all" && item.environment !== environmentFilter) {
        return false;
      }
      return true;
    });
  }, [environmentFilter, ruleFilter, statusFilter]);

  return (
    <div className="space-y-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Opportunities</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Analyze and prioritize savings opportunities
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Filter by automation rule, environment, and delivery status. Click any row to view the
          detailed remediation plan and open the associated pull request.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex w-full flex-col gap-2 sm:w-1/3">
          <label htmlFor="rule" className="text-sm font-medium text-muted-foreground">
            Rule
          </label>
          <select
            id="rule"
            value={ruleFilter}
            onChange={(event) => setRuleFilter(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="all">All rules</option>
            {rules.map((rule) => (
              <option key={rule} value={rule}>
                {opportunities.find((item) => item.rule === rule)?.ruleLabel ?? rule}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-1/3">
          <label htmlFor="status" className="text-sm font-medium text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as OpportunityStatus | "all")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="all">All statuses</option>
            {Object.entries(OPPORTUNITY_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-1/3">
          <label htmlFor="environment" className="text-sm font-medium text-muted-foreground">
            Environment
          </label>
          <select
            id="environment"
            value={environmentFilter}
            onChange={(event) => setEnvironmentFilter(event.target.value as Opportunity["environment"] | "all")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="all">All environments</option>
            {environments.map((environment) => (
              <option key={environment} value={environment}>
                {environment}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <table className="min-w-full divide-y divide-border/70 text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-6 py-3 font-medium">Recommendation</th>
              <th className="px-6 py-3 font-medium">Rule</th>
              <th className="px-6 py-3 font-medium">Environment</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Impact</th>
              <th className="px-6 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {filteredOpportunities.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => setSelectedOpportunity(item)}
              >
                <td className="px-6 py-4">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.summary}</p>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{item.ruleLabel}</td>
                <td className="px-6 py-4 uppercase text-muted-foreground">{item.environment}</td>
                <td className="px-6 py-4 text-muted-foreground">
                  {OPPORTUNITY_STATUS_LABELS[item.status]}
                </td>
                <td className="px-6 py-4 font-semibold text-emerald-600">{item.impact}</td>
                <td className="px-6 py-4 text-right">
                  <Button
                    size="sm"
                    asChild
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <Link href={item.prLink} target="_blank">
                      Open PR
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
            {filteredOpportunities.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                  No opportunities found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedOpportunity && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/40"
            role="presentation"
            onClick={() => setSelectedOpportunity(null)}
          />
          <aside className="relative ml-auto flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-border/60 p-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{selectedOpportunity.ruleLabel}</p>
                <h2 className="mt-1 text-xl font-semibold leading-tight">
                  {selectedOpportunity.title}
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedOpportunity(null)}>
                Close
              </Button>
            </header>
            <div className="flex-1 space-y-6 overflow-y-auto p-6 text-sm">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Summary</h3>
                <p className="text-muted-foreground">{selectedOpportunity.summary}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Details</h3>
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {selectedOpportunity.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="border-t border-border/60 p-6">
              <Button className="w-full" asChild>
                <Link href={selectedOpportunity.prLink} target="_blank">
                  Open PR
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
