import { AZURE_RULE_DEFINITIONS } from "@/lib/rules/rules-azure";

import { Button } from "@/components/ui/button";

import { RulesThresholdsForm, type RuleConfigDefinition } from "./rules-thresholds-form";

const connections = [
  {
    id: "azure",
    name: "Azure",
    description: "Ingest cost, usage, and asset inventory from your Azure subscriptions.",
    status: "Connected",
    cta: "Manage",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Sync infrastructure pull requests to automate savings delivery.",
    status: "Connected",
    cta: "Re-authorize",
  },
];

function getRuleConfigDefinitions(): RuleConfigDefinition[] {
  return AZURE_RULE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    defaultEnabled: definition.defaultConfig.enabled,
    defaultThresholds: definition.defaultConfig.thresholds,
  }));
}

export default function SettingsPage() {
  const ruleDefinitions = getRuleConfigDefinitions();

  return (
    <div className="space-y-10 px-6 py-10">
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Configure cost operations</h1>
        <p className="max-w-3xl text-muted-foreground">
          Connect cost data sources and adjust the thresholds driving automated recommendations. All
          changes persist to the <code className="rounded bg-muted px-1 py-0.5">RulesConfig</code>
          Prisma model.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Connections</h2>
          <Button variant="outline">Add connection</Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {connections.map((connection) => (
            <div key={connection.id} className="rounded-xl border border-border/70 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{connection.name}</h3>
                  <p className="text-sm text-muted-foreground">{connection.description}</p>
                </div>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {connection.status}
                </span>
              </div>
              <div className="mt-6 flex justify-end">
                <Button size="sm" variant="secondary">
                  {connection.cta}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Rule thresholds</h2>
          <p className="text-sm text-muted-foreground">
            Fine-tune automation by toggling rules on or off and adjusting the thresholds that
            determine when a recommendation is opened.
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-6 shadow-sm">
          <RulesThresholdsForm rules={ruleDefinitions} />
        </div>
      </section>
    </div>
  );
}
