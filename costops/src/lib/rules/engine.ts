import type { Connection } from "@prisma/client";
import { AzureClient } from "../azure/client";
import { prisma } from "../db";
import type { RecommendationPayload, RuleContext } from "./types";
import { getActiveRulesForOrg } from "./registry";

interface AzureConnectionData {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
}

function isAzureConnection(connection: Connection): connection is Connection & { data: AzureConnectionData } {
  const data = connection.data as Partial<AzureConnectionData> | null;
  return (
    typeof data?.tenantId === "string" &&
    typeof data?.clientId === "string" &&
    typeof data?.clientSecret === "string" &&
    typeof data?.subscriptionId === "string"
  );
}

async function resolveAzureConnection(orgId: string): Promise<Connection & { data: AzureConnectionData }> {
  const connection = await prisma.connection.findFirst({
    where: { organizationId: orgId, type: "azure", status: "connected" },
    orderBy: { updatedAt: "desc" },
  });

  if (!connection || !isAzureConnection(connection)) {
    throw new Error(`Azure connection is not configured for organization ${orgId}`);
  }

  return connection as Connection & { data: AzureConnectionData };
}

async function ensureSubscriptionId(resourceId: string): Promise<string> {
  const resource = await prisma.cloudResource.findUnique({ where: { resourceId } });
  return resource?.subscriptionId ?? "";
}

async function upsertRecommendation(
  context: RuleContext,
  ruleId: string,
  payload: RecommendationPayload,
): Promise<void> {
  const details = payload.details ?? {};
  const resourceId = typeof details.resourceId === "string" ? details.resourceId : null;

  if (!resourceId) {
    return;
  }

  let subscriptionId = typeof details.subscriptionId === "string" ? details.subscriptionId : "";
  if (!subscriptionId) {
    subscriptionId = await ensureSubscriptionId(resourceId);
  }

  const existing = await prisma.recommendation.findFirst({
    where: {
      organizationId: context.orgId,
      ruleId,
      resourceId,
    },
  });

  if (!existing) {
    await prisma.recommendation.create({
      data: {
        organizationId: context.orgId,
        subscriptionId,
        resourceId,
        ruleId,
        title: payload.title,
        description: payload.description,
        impactMonthly: payload.impactMonthly,
        confidence: payload.confidence,
        status: "open",
        details: payload.details,
      },
    });
    return;
  }

  await prisma.recommendation.update({
    where: { id: existing.id },
    data: {
      title: payload.title,
      description: payload.description,
      impactMonthly: payload.impactMonthly,
      confidence: payload.confidence,
      details: payload.details,
      subscriptionId: subscriptionId || existing.subscriptionId,
    },
  });
}

export async function runRulesForOrg(orgId: string): Promise<void> {
  const connection = await resolveAzureConnection(orgId);
  const azure = new AzureClient({
    tenantId: connection.data.tenantId,
    clientId: connection.data.clientId,
    clientSecret: connection.data.clientSecret,
    subscriptionId: connection.data.subscriptionId,
  });

  const rules = await getActiveRulesForOrg(orgId);

  if (rules.length === 0) {
    return;
  }

  const context: RuleContext = {
    orgId,
    prisma,
    azure,
  };

  for (const rule of rules) {
    let payloads: RecommendationPayload[] = [];
    try {
      payloads = await rule.run(context);
    } catch (error) {
      console.error(`Failed to execute rule ${rule.id}:`, error);
      continue;
    }

    for (const payload of payloads) {
      try {
        await upsertRecommendation(context, rule.id, payload);
      } catch (error) {
        console.error(`Failed to persist recommendation for rule ${rule.id}:`, error);
      }
    }
  }
}
