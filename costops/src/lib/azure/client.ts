import type { AzureBlobContainerStats, AzureLoadBalancer, AzurePublicIp, AzureResource, AzureUnattachedDisk } from "./resources";
import {
  getBlobContainerStats,
  listLoadBalancers as listLoadBalancersForSubscription,
  listPublicIPs as listPublicIpsForSubscription,
  listResources as listResourcesForSubscription,
  listUnattachedDisks as listUnattachedDisksForSubscription,
} from "./resources";
import {
  estimateResourceMonthlyCost,
  getSubscriptionMonthlyCost,
  type AzureCostContext,
} from "./cost";
import { getAppServiceCpu, getSqlUtilization, getVmCpuAverage } from "./metrics";

export interface AzureClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
  fetchFn?: typeof fetch;
}

export interface AzureSubscription {
  subscriptionId: string;
  displayName: string;
  state: string;
  tenantId?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const DEFAULT_SCOPE = "https://management.azure.com/.default";

export class AzureClient {
  private readonly tenantId: string;

  private readonly clientId: string;

  private readonly clientSecret: string;

  private readonly subscriptionId: string;

  private readonly fetchFn: typeof fetch;

  private tokenCache: CachedToken | null = null;

  constructor(config: AzureClientConfig) {
    this.tenantId = config.tenantId;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.subscriptionId = config.subscriptionId;
    this.fetchFn = config.fetchFn ?? fetch.bind(globalThis);
  }

  private get apiContext(): AzureCostContext {
    return {
      getAccessToken: this.getAccessToken.bind(this),
      fetchFn: this.fetchFn,
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.accessToken;
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const form = new URLSearchParams();
    form.set("client_id", this.clientId);
    form.set("client_secret", this.clientSecret);
    form.set("grant_type", "client_credentials");
    form.set("scope", DEFAULT_SCOPE);

    const response = await this.fetchFn(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Failed to acquire Azure access token: ${response.status} ${response.statusText} ${text}`.trim(),
      );
    }

    const payload: { access_token: string; expires_in?: number; ext_expires_in?: number } =
      await response.json();

    const expiresInSeconds = payload.expires_in ?? payload.ext_expires_in ?? 3600;
    this.tokenCache = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + (expiresInSeconds - 60) * 1000,
    };

    return payload.access_token;
  }

  async listSubscriptions(): Promise<AzureSubscription[]> {
    const token = await this.getAccessToken();
    const response = await this.fetchFn(
      "https://management.azure.com/subscriptions?api-version=2020-01-01",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Failed to list subscriptions: ${response.status} ${response.statusText} ${text}`.trim(),
      );
    }

    const data: { value?: AzureSubscription[] } = await response.json();
    return data.value ?? [];
  }

  async listResources(): Promise<AzureResource[]> {
    return listResourcesForSubscription(this.subscriptionId, this.apiContext);
  }

  async listUnattachedDisks(): Promise<AzureUnattachedDisk[]> {
    return listUnattachedDisksForSubscription(this.subscriptionId, this.apiContext);
  }

  async listPublicIPs(): Promise<AzurePublicIp[]> {
    return listPublicIpsForSubscription(this.subscriptionId, this.apiContext);
  }

  async listLoadBalancers(): Promise<AzureLoadBalancer[]> {
    return listLoadBalancersForSubscription(this.subscriptionId, this.apiContext);
  }

  async getVmMetrics(vmId: string, days: number): Promise<{
    cpuAverage: number | null;
  }> {
    const cpuAverage = await getVmCpuAverage(vmId, days, this.apiContext);
    return { cpuAverage };
  }

  async getSqlUtilization(dbId: string, days: number): Promise<number | null> {
    return getSqlUtilization(dbId, days, this.apiContext);
  }

  async getAppServiceCpu(appServiceId: string, days: number): Promise<number | null> {
    return getAppServiceCpu(appServiceId, days, this.apiContext);
  }

  async getSubscriptionMonthlyCost(): Promise<number> {
    return getSubscriptionMonthlyCost(this.subscriptionId, this.apiContext);
  }

  async estimateResourceMonthlyCost(resourceId: string): Promise<number> {
    return estimateResourceMonthlyCost(resourceId, this.apiContext);
  }

  async getBlobStats(account: string, container: string): Promise<AzureBlobContainerStats> {
    return getBlobContainerStats(this.subscriptionId, account, container, this.apiContext);
  }
}
