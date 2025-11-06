import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { Rule } from "./types";
import { AZURE_RULE_DEFINITIONS, type RuleConfig } from "./rules-azure";

interface RuleOverride {
  enabled?: boolean;
  thresholds?: Record<string, number>;
}

type RulesConfigMap = Record<string, RuleOverride>;

function mergeConfig(defaultConfig: RuleConfig, override?: RuleOverride): RuleConfig {
  if (!override) {
    return defaultConfig;
  }

  const thresholds = { ...defaultConfig.thresholds, ...(override.thresholds ?? {}) };

  return {
    enabled: override.enabled ?? defaultConfig.enabled,
    thresholds,
  };
}

function normalizeRulesConfig(value: Prisma.JsonValue | null): RulesConfigMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as RulesConfigMap;
}

function bindRule(definition: (typeof AZURE_RULE_DEFINITIONS)[number], config: RuleConfig): Rule {
  return {
    id: definition.id,
    label: definition.label,
    run: (ctx) => definition.executor(ctx, config),
  };
}

export const AZURE_RULES: Rule[] = AZURE_RULE_DEFINITIONS.map((definition) =>
  bindRule(definition, definition.defaultConfig),
);

export async function getActiveRulesForOrg(orgId: string): Promise<Rule[]> {
  const rulesConfig = await prisma.rulesConfig.findUnique({
    where: { organizationId: orgId },
  });

  const overrides = normalizeRulesConfig(rulesConfig?.config ?? null);

  const activeRules: Rule[] = [];

  for (const definition of AZURE_RULE_DEFINITIONS) {
    const mergedConfig = mergeConfig(definition.defaultConfig, overrides[definition.id]);
    if (!mergedConfig.enabled) {
      continue;
    }
    activeRules.push(bindRule(definition, mergedConfig));
  }

  return activeRules;
}
