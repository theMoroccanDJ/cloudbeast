import type { Connection } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { AzureClient } from "../azure/client";
import { prisma } from "../db";

interface AzureConnectionData {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
}

function isAzureConnection(
  connection: Connection,
): connection is Connection & { data: AzureConnectionData } {
  const data = connection.data as Partial<AzureConnectionData> | null;
  return (
    typeof data?.tenantId === "string" &&
    typeof data?.clientId === "string" &&
    typeof data?.clientSecret === "string" &&
    typeof data?.subscriptionId === "string"
  );
}

async function resolveAzureConnection(
  orgId: string,
): Promise<Connection & { data: AzureConnectionData }> {
  const connection = await prisma.connection.findFirst({
    where: { organizationId: orgId, type: "azure", status: "connected" },
    orderBy: { updatedAt: "desc" },
  });

  if (!connection || !isAzureConnection(connection)) {
    throw new Error(`Azure connection is not configured for organization ${orgId}`);
  }

  return connection as Connection & { data: AzureConnectionData };
}

function createAzureClient(connection: AzureConnectionData, subscriptionId?: string): AzureClient {
  return new AzureClient({
    tenantId: connection.tenantId,
    clientId: connection.clientId,
    clientSecret: connection.clientSecret,
    subscriptionId: subscriptionId ?? connection.subscriptionId,
  });
}

export async function ingestSubscriptions(orgId: string): Promise<void> {
  const connection = await resolveAzureConnection(orgId);
  const azure = createAzureClient(connection.data);

  const subscriptions = await azure.listSubscriptions();
  const seen = new Set<string>();

  for (const subscription of subscriptions) {
    const subscriptionId = subscription.subscriptionId;
    if (!subscriptionId) {
      continue;
    }

    seen.add(subscriptionId);

    await prisma.cloudSubscription.upsert({
      where: { subscriptionId },
      update: {
        organizationId: orgId,
        provider: "azure",
        name: subscription.displayName,
      },
      create: {
        organizationId: orgId,
        provider: "azure",
        subscriptionId,
        name: subscription.displayName,
      },
    });
  }

  await prisma.cloudSubscription.deleteMany({
    where: {
      organizationId: orgId,
      subscriptionId: subscriptions.length > 0 ? { notIn: Array.from(seen) } : undefined,
    },
  });
}

export async function ingestResources(orgId: string): Promise<void> {
  const connection = await resolveAzureConnection(orgId);
  const subscriptions = await prisma.cloudSubscription.findMany({
    where: { organizationId: orgId },
  });

  if (subscriptions.length === 0) {
    return;
  }

  const seenResourceIds = new Set<string>();

  for (const subscription of subscriptions) {
    const azure = createAzureClient(connection.data, subscription.subscriptionId);

    let resources = [];
    try {
      resources = await azure.listResources();
    } catch (error) {
      console.error(
        `Failed to list resources for subscription ${subscription.subscriptionId} in org ${orgId}:`,
        error,
      );
      continue;
    }

    for (const resource of resources) {
      const resourceId = resource.id;
      if (!resourceId) {
        continue;
      }

      seenResourceIds.add(resourceId);

      const tags = resource.tags ?? null;

      await prisma.cloudResource.upsert({
        where: { resourceId },
        update: {
          organizationId: orgId,
          subscriptionId: subscription.subscriptionId,
          name: resource.name,
          type: resource.type,
          rg: resource.resourceGroup,
          location: resource.location,
          tags: tags ?? Prisma.JsonNull,
        },
        create: {
          organizationId: orgId,
          subscriptionId: subscription.subscriptionId,
          resourceId,
          name: resource.name,
          type: resource.type,
          rg: resource.resourceGroup,
          location: resource.location,
          tags: tags ?? Prisma.JsonNull,
          metrics: Prisma.JsonNull,
        },
      });
    }
  }

  if (seenResourceIds.size > 0) {
    await prisma.cloudResource.deleteMany({
      where: {
        organizationId: orgId,
        resourceId: { notIn: Array.from(seenResourceIds) },
      },
    });
  }
}

export async function ingestMetrics(orgId: string): Promise<void> {
  const connection = await resolveAzureConnection(orgId);
  const resources = await prisma.cloudResource.findMany({
    where: { organizationId: orgId },
  });

  if (resources.length === 0) {
    return;
  }

  const clientCache = new Map<string, AzureClient>();
  const getClient = (subscriptionId: string): AzureClient => {
    if (!clientCache.has(subscriptionId)) {
      clientCache.set(subscriptionId, createAzureClient(connection.data, subscriptionId));
    }
    return clientCache.get(subscriptionId)!;
  };

  for (const resource of resources) {
    const azure = getClient(resource.subscriptionId);
    const updateData: Prisma.CloudResourceUpdateInput = {};

    try {
      const cost = await azure.estimateResourceMonthlyCost(resource.resourceId);
      updateData.costMonthly = cost;
    } catch (error) {
      console.error(
        `Failed to estimate cost for resource ${resource.resourceId} in org ${orgId}:`,
        error,
      );
    }

    try {
      if (resource.type === "Microsoft.Compute/virtualMachines") {
        const metrics = await azure.getVmMetrics(resource.resourceId, 30);
        updateData.metrics = { cpuAverage: metrics.cpuAverage ?? null };
      } else if (resource.type === "Microsoft.Sql/servers/databases") {
        const cpu = await azure.getSqlUtilization(resource.resourceId, 30);
        updateData.metrics = { avgCpu: cpu ?? null };
      } else if (resource.type === "Microsoft.Web/serverfarms") {
        const cpu = await azure.getAppServiceCpu(resource.resourceId, 30);
        updateData.metrics = { avgCpu: cpu ?? null };
      }
    } catch (error) {
      console.error(
        `Failed to ingest metrics for resource ${resource.resourceId} in org ${orgId}:`,
        error,
      );
    }

    if (Object.keys(updateData).length === 0) {
      continue;
    }

    if (updateData.metrics === undefined) {
      // ensure metrics remains untouched when not updated
      delete updateData.metrics;
    }

    await prisma.cloudResource.update({
      where: { id: resource.id },
      data: updateData,
    });
  }
}
