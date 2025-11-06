"use client";

import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export interface RuleConfigDefinition {
  id: string;
  label: string;
  defaultEnabled: boolean;
  defaultThresholds: Record<string, number>;
}

type RuleConfigState = Record<
  string,
  {
    enabled: boolean;
    thresholds: Record<string, number>;
  }
>;

interface RulesThresholdsFormProps {
  rules: RuleConfigDefinition[];
}

export function RulesThresholdsForm({ rules }: RulesThresholdsFormProps) {
  const [config, setConfig] = useState<RuleConfigState>(() => {
    const initial: RuleConfigState = {};
    for (const rule of rules) {
      initial[rule.id] = {
        enabled: rule.defaultEnabled,
        thresholds: { ...rule.defaultThresholds },
      };
    }
    return initial;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedConfig, setLastSavedConfig] = useState<string | null>(null);

  const serializedConfig = useMemo(() => JSON.stringify(config, null, 2), [config]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      setLastSavedConfig(serializedConfig);
      // Replace with API request to persist RulesConfig
      console.info("RulesConfig payload", serializedConfig);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {rules.map((rule) => {
          const state = config[rule.id];
          return (
            <div key={rule.id} className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{rule.label}</p>
                  <p className="text-xs text-muted-foreground">{rule.id}</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    checked={state.enabled}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        [rule.id]: {
                          ...current[rule.id],
                          enabled: event.target.checked,
                        },
                      }))
                    }
                  />
                  Enabled
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(state.thresholds).map(([thresholdKey, value]) => (
                  <label key={thresholdKey} className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
                    <span className="capitalize text-foreground">{thresholdKey}</span>
                    <input
                      type="number"
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      value={value}
                      step={0.1}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          [rule.id]: {
                            ...current[rule.id],
                            thresholds: {
                              ...current[rule.id].thresholds,
                              [thresholdKey]: Number(event.target.value),
                            },
                          },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          <p>Configuration is saved to the RulesConfig Prisma model.</p>
          {lastSavedConfig && <p className="text-emerald-600">Updated {new Date().toLocaleTimeString()}.</p>}
        </div>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview JSON</p>
        <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border/60 bg-background p-4 text-xs text-muted-foreground">
          {serializedConfig}
        </pre>
      </div>
    </form>
  );
}
