import type { PrismaClient } from "@prisma/client";
import type { AzureClient } from "../azure/client";

export interface RuleContext {
  orgId: string;
  prisma: PrismaClient;
  azure: AzureClient;
}

export interface RecommendationPayload {
  title: string;
  description: string;
  impactMonthly: number;
  confidence: number;
  details: Record<string, unknown>;
}

export interface Rule {
  id: string;
  label: string;
  run(ctx: RuleContext): Promise<RecommendationPayload[]>;
}
