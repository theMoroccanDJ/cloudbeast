import type { CloudResource, Prisma } from "@prisma/client";
import {
  estimateAppServicePlanSavings,
  estimateDiskSkuSavings,
  estimateSqlSkuSavings,
  estimateStorageTierSavings,
  estimateVmResizeSavings,
  getRecommendedAppServiceSku,
  getRecommendedDiskSku,
  getRecommendedSqlSku,
  getRecommendedStorageTier,
  getRecommendedVmSku,
  LOAD_BALANCER_MONTHLY_COST,
  PUBLIC_IP_MONTHLY_COST,
} from "./savings";
import type { RecommendationPayload, RuleContext } from "./types";

interface RuleThresholds {
  [key: string]: number;
}

interface RuleConfig {
  enabled: boolean;
  thresholds: RuleThresholds;
}

interface AzureRuleDefinition {
  id: string;
  label: string;
  defaultConfig: RuleConfig;
  executor: (ctx: RuleContext, config: RuleConfig) => Promise<RecommendationPayload[]>;
}

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getResourceTag(resource: CloudResource, keys: string[]): string | null {
  const tags = jsonObject(resource.tags);
  if (!tags) {
    return null;
  }

  for (const key of keys) {
    const value = readString(tags[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function getResourceMetric(resource: CloudResource, keys: string[]): number | null {
  const metrics = jsonObject(resource.metrics as Prisma.JsonValue | null);
  if (!metrics) {
    return null;
  }

  for (const key of keys) {
    const value = readNumber(metrics[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function describePercentage(value: number | null, digits = 1): string {
  if (value === null) {
    return "unknown";
  }
  return `${value.toFixed(digits)}%`;
}

function mergeThresholds(defaults: RuleThresholds, overrides: RuleThresholds | undefined): RuleThresholds {
  return { ...defaults, ...(overrides ?? {}) };
}

function createRule(
  id: string,
  label: string,
  defaultThresholds: RuleThresholds,
  executor: (ctx: RuleContext, config: RuleConfig) => Promise<RecommendationPayload[]>,
  options?: { defaultEnabled?: boolean },
): AzureRuleDefinition {
  return {
    id,
    label,
    defaultConfig: {
      enabled: options?.defaultEnabled ?? true,
      thresholds: defaultThresholds,
    },
    executor,
  };
}

async function loadResourceMap(
  prisma: RuleContext["prisma"],
  orgId: string,
  type: string,
): Promise<Map<string, CloudResource>> {
  const resources = await prisma.cloudResource.findMany({
    where: { organizationId: orgId, type },
  });
  return new Map(resources.map((resource) => [resource.resourceId, resource]));
}

const vmRightsizeRule = createRule(
  "azure.vm.rightsize",
  "Right-size underutilized virtual machines",
  {
    cpuPercent: 20,
    lookbackDays: 30,
    minImpact: 25,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        cpuPercent: 20,
        lookbackDays: 30,
        minImpact: 25,
      },
      config.thresholds,
    );

    const vms = await ctx.prisma.cloudResource.findMany({
      where: { organizationId: ctx.orgId, type: "Microsoft.Compute/virtualMachines" },
    });

    const lookbackDays = thresholds.lookbackDays ?? 30;
    const minImpact = thresholds.minImpact ?? 25;
    const cpuLimit = thresholds.cpuPercent ?? 20;

    const recommendations: RecommendationPayload[] = [];

    for (const vm of vms) {
      const metricsObject = jsonObject(vm.metrics as Prisma.JsonValue | null);
      const currentSku =
        getResourceTag(vm, ["azure:vmSize", "vmSize", "VMSize", "sku", "skuName"]) ??
        readString(metricsObject ? metricsObject["vmSize"] : null);
      if (!currentSku) {
        continue;
      }
      const targetSku = getRecommendedVmSku(currentSku);
      if (!targetSku) {
        continue;
      }

      let cpuAverage: number | null = null;
      try {
        const metrics = await ctx.azure.getVmMetrics(vm.resourceId, lookbackDays);
        cpuAverage = metrics.cpuAverage ?? null;
      } catch (error) {
        cpuAverage = getResourceMetric(vm, ["cpuAverage", "avgCpu", "p95Cpu"]);
      }

      if (cpuAverage === null) {
        continue;
      }

      if (cpuAverage > cpuLimit) {
        continue;
      }

      const impact = estimateVmResizeSavings(currentSku, targetSku);
      if (impact < minImpact) {
        continue;
      }

      recommendations.push({
        title: `Right-size ${vm.name}`,
        description: `Average CPU usage for ${vm.name} was ${describePercentage(cpuAverage)} over the last ${lookbackDays} days. Downgrading to ${targetSku} can cut costs while staying within utilization thresholds.`,
        impactMonthly: impact,
        confidence: 0.6,
        details: {
          resourceId: vm.resourceId,
          subscriptionId: vm.subscriptionId,
          currentSku,
          targetSku,
          cpuAverage,
          lookbackDays,
          action: "resizeVm",
        },
      });
    }

    return recommendations;
  },
);

const vmIdleRule = createRule(
  "azure.vm.idle",
  "Shut down idle virtual machines",
  {
    cpuPercent: 5,
    lookbackDays: 14,
    minImpact: 20,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        cpuPercent: 5,
        lookbackDays: 14,
        minImpact: 20,
      },
      config.thresholds,
    );

    const vms = await ctx.prisma.cloudResource.findMany({
      where: { organizationId: ctx.orgId, type: "Microsoft.Compute/virtualMachines" },
    });

    const lookbackDays = thresholds.lookbackDays ?? 14;
    const cpuLimit = thresholds.cpuPercent ?? 5;
    const minImpact = thresholds.minImpact ?? 20;

    const results: RecommendationPayload[] = [];

    for (const vm of vms) {
      let cpuAverage: number | null = null;
      try {
        const metrics = await ctx.azure.getVmMetrics(vm.resourceId, lookbackDays);
        cpuAverage = metrics.cpuAverage ?? null;
      } catch (error) {
        cpuAverage = getResourceMetric(vm, ["cpuAverage", "avgCpu", "p95Cpu"]);
      }

      if (cpuAverage === null) {
        continue;
      }

      if (cpuAverage > cpuLimit) {
        continue;
      }

      const impact = vm.costMonthly ?? minImpact;
      if (impact < minImpact) {
        continue;
      }

      results.push({
        title: `Stop idle VM ${vm.name}`,
        description: `${vm.name} averaged ${describePercentage(cpuAverage)} CPU utilization in the past ${lookbackDays} days. Consider deallocating it to avoid compute charges when idle.`,
        impactMonthly: impact,
        confidence: 0.5,
        details: {
          resourceId: vm.resourceId,
          subscriptionId: vm.subscriptionId,
          cpuAverage,
          lookbackDays,
          action: "deallocateVm",
        },
      });
    }

    return results;
  },
);

const unattachedDiskRule = createRule(
  "azure.disk.unattached",
  "Remove unattached managed disks",
  {
    minAgeDays: 7,
    minImpact: 10,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        minAgeDays: 7,
        minImpact: 10,
      },
      config.thresholds,
    );

    const diskMap = await loadResourceMap(
      ctx.prisma,
      ctx.orgId,
      "Microsoft.Compute/disks",
    );

    const minAgeDays = thresholds.minAgeDays ?? 7;
    const minImpact = thresholds.minImpact ?? 10;

    const disks = await ctx.azure.listUnattachedDisks();
    const now = Date.now();

    const recommendations: RecommendationPayload[] = [];

    for (const disk of disks) {
      const resource = diskMap.get(disk.id);
      if (!resource) {
        continue;
      }

      const skuName = readString(disk.sku?.name) ??
        getResourceTag(resource, ["sku", "skuName", "skuTier", "storageAccountType"]);
      const targetSku = getRecommendedDiskSku(skuName ?? "");

      const resourceMetrics = jsonObject(resource.metrics as Prisma.JsonValue | null);
      const resourceTags = jsonObject(resource.tags);
      const sizeGb = disk.diskSizeGb ??
        readNumber(resourceMetrics ? resourceMetrics["sizeGb"] : null) ??
        readNumber(resourceTags ? resourceTags["diskSizeGb"] : null);

      const createdAt = parseIsoDate(disk.timeCreated ?? undefined);
      if (createdAt) {
        const ageDays = Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays < minAgeDays) {
          continue;
        }
      }

      const impact = skuName && targetSku
        ? estimateDiskSkuSavings(skuName, targetSku, sizeGb)
        : resource.costMonthly ?? 0;

      if (impact < minImpact) {
        continue;
      }

      recommendations.push({
        title: `Delete unattached disk ${resource.name}`,
        description: `${resource.name} is unattached and has been idle for more than ${minAgeDays} days. Removing or moving it to a lower tier can save costs immediately.`,
        impactMonthly: impact,
        confidence: 0.7,
        details: {
          resourceId: resource.resourceId,
          subscriptionId: resource.subscriptionId,
          sku: skuName,
          sizeGb,
          action: "deleteDisk",
        },
      });
    }

    return recommendations;
  },
);

const diskTierRule = createRule(
  "azure.disk.premium-downgrade",
  "Downgrade over-provisioned premium disks",
  {
    maxConsumedIops: 300,
    minImpact: 15,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        maxConsumedIops: 300,
        minImpact: 15,
      },
      config.thresholds,
    );

    const disks = await ctx.prisma.cloudResource.findMany({
      where: { organizationId: ctx.orgId, type: "Microsoft.Compute/disks" },
    });

    const maxIops = thresholds.maxConsumedIops ?? 300;
    const minImpact = thresholds.minImpact ?? 15;

    const results: RecommendationPayload[] = [];

    for (const disk of disks) {
      const sku = getResourceTag(disk, ["sku", "skuName", "storageAccountType"]);
      if (!sku || !sku.startsWith("Premium")) {
        continue;
      }

      const consumedIops =
        getResourceMetric(disk, ["avgConsumedIops", "iopsAverage", "iopsP95"]) ?? 0;
      if (consumedIops > maxIops) {
        continue;
      }

      const targetSku = getRecommendedDiskSku(sku);
      if (!targetSku) {
        continue;
      }

      const sizeGb =
        getResourceMetric(disk, ["sizeGb", "diskSizeGb"]) ??
        readNumber(jsonObject(disk.tags)?.["diskSizeGb"]);

      const impact = estimateDiskSkuSavings(sku, targetSku, sizeGb);
      if (impact < minImpact) {
        continue;
      }

      results.push({
        title: `Move disk ${disk.name} to ${targetSku}`,
        description: `${disk.name} averages ${consumedIops.toFixed(0)} IOPS. Downgrading from ${sku} to ${targetSku} keeps headroom while reducing spend.`,
        impactMonthly: impact,
        confidence: 0.55,
        details: {
          resourceId: disk.resourceId,
          subscriptionId: disk.subscriptionId,
          sku,
          targetSku,
          consumedIops,
          sizeGb,
          action: "updateDiskSku",
        },
      });
    }

    return results;
  },
);

const sqlRightsizeRule = createRule(
  "azure.sql.rightsize",
  "Right-size low-utilization SQL databases",
  {
    cpuPercent: 25,
    lookbackDays: 30,
    minImpact: 30,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        cpuPercent: 25,
        lookbackDays: 30,
        minImpact: 30,
      },
      config.thresholds,
    );

    const databases = await ctx.prisma.cloudResource.findMany({
      where: { organizationId: ctx.orgId, type: "Microsoft.Sql/servers/databases" },
    });

    const lookbackDays = thresholds.lookbackDays ?? 30;
    const cpuLimit = thresholds.cpuPercent ?? 25;
    const minImpact = thresholds.minImpact ?? 30;

    const recommendations: RecommendationPayload[] = [];

    for (const db of databases) {
      let cpuAverage: number | null = null;
      try {
        cpuAverage = await ctx.azure.getSqlUtilization(db.resourceId, lookbackDays);
      } catch (error) {
        cpuAverage = getResourceMetric(db, ["avgCpu", "cpuAverage"]);
      }

      if (cpuAverage === null || cpuAverage > cpuLimit) {
        continue;
      }

      const currentSku =
        getResourceTag(db, ["sku", "skuName", "edition", "serviceObjective"]);
      const targetSku = getRecommendedSqlSku(currentSku ?? "");
      if (!currentSku || !targetSku) {
        continue;
      }

      const impact = estimateSqlSkuSavings(currentSku, targetSku);
      if (impact < minImpact) {
        continue;
      }

      recommendations.push({
        title: `Right-size database ${db.name}`,
        description: `${db.name} averaged ${describePercentage(cpuAverage)} DTU utilization over ${lookbackDays} days. Scaling down to ${targetSku} keeps utilization within ${cpuLimit}% while saving costs.`,
        impactMonthly: impact,
        confidence: 0.6,
        details: {
          resourceId: db.resourceId,
          subscriptionId: db.subscriptionId,
          currentSku,
          targetSku,
          cpuAverage,
          lookbackDays,
          action: "resizeSqlDatabase",
        },
      });
    }

    return recommendations;
  },
);

const appServiceRule = createRule(
  "azure.appservice.rightsize",
  "Right-size App Service plans",
  {
    cpuPercent: 20,
    lookbackDays: 21,
    minImpact: 20,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        cpuPercent: 20,
        lookbackDays: 21,
        minImpact: 20,
      },
      config.thresholds,
    );

    const plans = await ctx.prisma.cloudResource.findMany({
      where: { organizationId: ctx.orgId, type: "Microsoft.Web/serverfarms" },
    });

    const lookbackDays = thresholds.lookbackDays ?? 21;
    const cpuLimit = thresholds.cpuPercent ?? 20;
    const minImpact = thresholds.minImpact ?? 20;

    const recommendations: RecommendationPayload[] = [];

    for (const plan of plans) {
      let cpuAverage: number | null = null;
      try {
        cpuAverage = await ctx.azure.getAppServiceCpu(plan.resourceId, lookbackDays);
      } catch (error) {
        cpuAverage = getResourceMetric(plan, ["avgCpu", "cpuAverage"]);
      }

      if (cpuAverage === null || cpuAverage > cpuLimit) {
        continue;
      }

      const currentSku = getResourceTag(plan, ["sku", "skuName", "tier"]);
      const targetSku = getRecommendedAppServiceSku(currentSku ?? "");
      if (!currentSku || !targetSku) {
        continue;
      }

      const impact = estimateAppServicePlanSavings(currentSku, targetSku);
      if (impact < minImpact) {
        continue;
      }

      recommendations.push({
        title: `Right-size App Service plan ${plan.name}`,
        description: `${plan.name} averaged ${describePercentage(cpuAverage)} CPU in the last ${lookbackDays} days. Switching from ${currentSku} to ${targetSku} retains buffer while lowering costs.`,
        impactMonthly: impact,
        confidence: 0.55,
        details: {
          resourceId: plan.resourceId,
          subscriptionId: plan.subscriptionId,
          currentSku,
          targetSku,
          cpuAverage,
          lookbackDays,
          action: "resizeAppServicePlan",
        },
      });
    }

    return recommendations;
  },
);

const storageTierRule = createRule(
  "azure.storage.cool-tier",
  "Move infrequently accessed storage to cool tier",
  {
    minInactiveDays: 30,
    minImpact: 15,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        minInactiveDays: 30,
        minImpact: 15,
      },
      config.thresholds,
    );

    const accounts = await ctx.prisma.cloudResource.findMany({
      where: { organizationId: ctx.orgId, type: "Microsoft.Storage/storageAccounts" },
    });

    const minInactiveDays = thresholds.minInactiveDays ?? 30;
    const minImpact = thresholds.minImpact ?? 15;

    const recommendations: RecommendationPayload[] = [];

    for (const account of accounts) {
      const accessTier = getResourceTag(account, ["accessTier", "AccessTier", "defaultAccessTier"]);
      if (!accessTier) {
        continue;
      }

      const targetTier = getRecommendedStorageTier(accessTier);
      if (!targetTier) {
        continue;
      }

      const metrics = jsonObject(account.metrics as Prisma.JsonValue | null);
      const inactiveDays =
        readNumber(metrics?.daysSinceLastAccess) ??
        readNumber(metrics?.inactiveDays) ??
        readNumber(metrics?.lastAccessedDaysAgo);

      if (inactiveDays === null || inactiveDays < minInactiveDays) {
        continue;
      }

      const totalStorageGb =
        readNumber(metrics?.totalStorageGb) ??
        readNumber(metrics?.sizeGb);

      const impact = estimateStorageTierSavings(accessTier, targetTier, totalStorageGb);
      if (impact < minImpact) {
        continue;
      }

      recommendations.push({
        title: `Move ${account.name} to ${targetTier} tier`,
        description: `${account.name} has seen no access for ${inactiveDays.toFixed(0)} days. Switching from ${accessTier} to ${targetTier} tier aligns costs to usage.`,
        impactMonthly: impact,
        confidence: 0.5,
        details: {
          resourceId: account.resourceId,
          subscriptionId: account.subscriptionId,
          accessTier,
          targetTier,
          inactiveDays,
          totalStorageGb,
          action: "updateStorageTier",
        },
      });
    }

    return recommendations;
  },
);

const publicIpRule = createRule(
  "azure.network.public-ip-unused",
  "Release unused public IP addresses",
  {
    minImpact: 3,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        minImpact: 3,
      },
      config.thresholds,
    );

    const minImpact = thresholds.minImpact ?? PUBLIC_IP_MONTHLY_COST;

    const ipMap = await loadResourceMap(
      ctx.prisma,
      ctx.orgId,
      "Microsoft.Network/publicIPAddresses",
    );

    const ips = await ctx.azure.listPublicIPs();

    const results: RecommendationPayload[] = [];

    for (const ip of ips) {
      const resource = ipMap.get(ip.id);
      if (!resource) {
        continue;
      }

      const hasAddress = typeof ip.ipAddress === "string" && ip.ipAddress.length > 0;
      const allocation = ip.publicIPAllocationMethod ?? "";
      if (hasAddress && allocation.toLowerCase() === "dynamic") {
        continue;
      }

      if (resource.costMonthly !== null && resource.costMonthly !== undefined && resource.costMonthly < minImpact) {
        continue;
      }

      results.push({
        title: `Release public IP ${resource.name}`,
        description: `${resource.name} is not associated with a resource. Releasing it avoids monthly static IP charges.`,
        impactMonthly: resource.costMonthly ?? PUBLIC_IP_MONTHLY_COST,
        confidence: 0.65,
        details: {
          resourceId: resource.resourceId,
          subscriptionId: resource.subscriptionId,
          ipAddress: ip.ipAddress ?? null,
          action: "releasePublicIp",
        },
      });
    }

    return results;
  },
);

const loadBalancerRule = createRule(
  "azure.network.load-balancer-idle",
  "Remove idle load balancers",
  {
    minImpact: 15,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        minImpact: 15,
      },
      config.thresholds,
    );

    const minImpact = thresholds.minImpact ?? LOAD_BALANCER_MONTHLY_COST;

    const lbMap = await loadResourceMap(
      ctx.prisma,
      ctx.orgId,
      "Microsoft.Network/loadBalancers",
    );

    const loadBalancers = await ctx.azure.listLoadBalancers();

    const recommendations: RecommendationPayload[] = [];

    for (const lb of loadBalancers) {
      const resource = lbMap.get(lb.id);
      if (!resource) {
        continue;
      }

      const hasFrontend = (lb.frontendIpConfigurations ?? []).some(
        (config) => config.publicIpAddressId || config.privateIpAddress,
      );

      if (hasFrontend) {
        continue;
      }

      const impact = resource.costMonthly ?? LOAD_BALANCER_MONTHLY_COST;
      if (impact < minImpact) {
        continue;
      }

      recommendations.push({
        title: `Remove idle load balancer ${resource.name}`,
        description: `${resource.name} has no active front-end configuration. Removing it avoids unnecessary network charges.`,
        impactMonthly: impact,
        confidence: 0.6,
        details: {
          resourceId: resource.resourceId,
          subscriptionId: resource.subscriptionId,
          action: "deleteLoadBalancer",
        },
      });
    }

    return recommendations;
  },
);

const subscriptionCostRule = createRule(
  "azure.subscription.high-cost",
  "Investigate high monthly subscription cost",
  {
    maxMonthlyCost: 5000,
  },
  async (ctx, config) => {
    const thresholds = mergeThresholds(
      {
        maxMonthlyCost: 5000,
      },
      config.thresholds,
    );

    const limit = thresholds.maxMonthlyCost ?? 5000;

    const cost = await ctx.azure.getSubscriptionMonthlyCost();

    if (cost < limit) {
      return [];
    }

    const subscription = await ctx.prisma.cloudSubscription.findFirst({
      where: { organizationId: ctx.orgId, provider: "azure" },
    });

    const subscriptionId = subscription?.subscriptionId ?? "";
    const resourceId = subscriptionId ? `/subscriptions/${subscriptionId}` : "azure-subscription";

    const impact = cost * 0.12;

    return [
      {
        title: `Subscription cost exceeds $${limit}`,
        description: `Month-to-date cost for the subscription is $${cost.toFixed(2)}, above the configured threshold of $${limit}. Review budgets, reserved instances, or savings plans to reduce spend.`,
        impactMonthly: impact,
        confidence: 0.4,
        details: {
          resourceId,
          subscriptionId: subscriptionId || resourceId,
          monthlyCost: cost,
          threshold: limit,
          action: "reviewSubscriptionSpend",
        },
      },
    ];
  },
);

export const AZURE_RULE_DEFINITIONS: AzureRuleDefinition[] = [
  vmRightsizeRule,
  vmIdleRule,
  unattachedDiskRule,
  diskTierRule,
  sqlRightsizeRule,
  appServiceRule,
  storageTierRule,
  publicIpRule,
  loadBalancerRule,
  subscriptionCostRule,
];
export type { AzureRuleDefinition, RuleConfig };
