export interface AzureResourcesContext {
  getAccessToken: () => Promise<string>;
  fetchFn?: typeof fetch;
}

export interface AzureResource {
  id: string;
  name: string;
  type: string;
  location: string;
  resourceGroup: string;
  subscriptionId: string;
  tags?: Record<string, string>;
}

export interface AzureUnattachedDisk {
  id: string;
  name: string;
  location: string;
  diskSizeGb?: number;
  sku?: { name?: string | null };
  timeCreated?: string;
}

export interface AzurePublicIp {
  id: string;
  name: string;
  location: string;
  ipAddress?: string;
  publicIPAllocationMethod?: string;
  idleTimeoutInMinutes?: number;
}

export interface AzureLoadBalancer {
  id: string;
  name: string;
  location: string;
  sku?: { name?: string | null };
  frontendIpConfigurations: Array<{
    name?: string;
    privateIpAddress?: string;
    publicIpAddressId?: string;
  }>;
}

export interface AzureBlobContainerStats {
  id: string;
  name: string;
  etag?: string;
  publicAccess?: string | null;
  lastModifiedOn?: string;
  leaseStatus?: string | null;
  leaseState?: string | null;
  metadata?: Record<string, string> | null;
}

interface ResourceGraphResponse {
  data?: Array<{
    id: string;
    name: string;
    type: string;
    location: string;
    resourceGroup: string;
    subscriptionId: string;
    tags?: Record<string, string>;
  }>;
}

interface PagedResponse<T> {
  value?: T[];
  nextLink?: string;
}

async function authorizedFetch(
  context: AzureResourcesContext,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await context.getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  return (context.fetchFn ?? fetch.bind(globalThis))(url, {
    ...init,
    headers,
  });
}

async function collectPagedResults<T>(
  context: AzureResourcesContext,
  url: string,
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const response = await authorizedFetch(context, nextUrl);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Azure request failed: ${response.status} ${response.statusText} ${text}`.trim(),
      );
    }

    const payload: PagedResponse<T> = await response.json();
    if (payload.value) {
      results.push(...payload.value);
    }

    nextUrl = payload.nextLink;
  }

  return results;
}

export async function listResources(
  subscriptionId: string,
  context: AzureResourcesContext,
): Promise<AzureResource[]> {
  const url = "https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01";
  const body = {
    query: `Resources | where subscriptionId == '${subscriptionId}' | project id, name, type, location, resourceGroup, subscriptionId, tags`.
      replace(/\s+/g, " "),
    subscriptions: [subscriptionId],
    options: {
      resultFormat: "objectArray",
    },
  };

  const response = await authorizedFetch(context, url, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to list resources: ${response.status} ${response.statusText} ${text}`.trim(),
    );
  }

  const payload: ResourceGraphResponse = await response.json();
  return (payload.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    location: item.location,
    resourceGroup: item.resourceGroup,
    subscriptionId: item.subscriptionId,
    tags: item.tags,
  }));
}

export async function listUnattachedDisks(
  subscriptionId: string,
  context: AzureResourcesContext,
): Promise<AzureUnattachedDisk[]> {
  const url = `https://management.azure.com/subscriptions/${encodeURIComponent(
    subscriptionId,
  )}/providers/Microsoft.Compute/disks?api-version=2023-01-02`;

  const disks = await collectPagedResults<
    AzureUnattachedDisk & { properties?: { managedBy?: string | null; diskSizeGB?: number; timeCreated?: string } }
  >(context, url);

  return disks
    .filter((disk) => !disk.properties?.managedBy)
    .map((disk) => ({
      id: disk.id,
      name: disk.name,
      location: disk.location,
      diskSizeGb: disk.properties?.diskSizeGB,
      sku: disk.sku,
      timeCreated: disk.properties?.timeCreated,
    }));
}

export async function listPublicIPs(
  subscriptionId: string,
  context: AzureResourcesContext,
): Promise<AzurePublicIp[]> {
  const url = `https://management.azure.com/subscriptions/${encodeURIComponent(
    subscriptionId,
  )}/providers/Microsoft.Network/publicIPAddresses?api-version=2023-09-01`;

  const ips = await collectPagedResults<
    AzurePublicIp & {
      properties?: {
        ipAddress?: string;
        publicIPAllocationMethod?: string;
        idleTimeoutInMinutes?: number;
      };
    }
  >(context, url);

  return ips.map((ip) => ({
    id: ip.id,
    name: ip.name,
    location: ip.location,
    ipAddress: ip.properties?.ipAddress,
    publicIPAllocationMethod: ip.properties?.publicIPAllocationMethod,
    idleTimeoutInMinutes: ip.properties?.idleTimeoutInMinutes,
  }));
}

export async function listLoadBalancers(
  subscriptionId: string,
  context: AzureResourcesContext,
): Promise<AzureLoadBalancer[]> {
  const url = `https://management.azure.com/subscriptions/${encodeURIComponent(
    subscriptionId,
  )}/providers/Microsoft.Network/loadBalancers?api-version=2023-09-01`;

  const loadBalancers = await collectPagedResults<
    AzureLoadBalancer & {
      properties?: {
        frontendIPConfigurations?: Array<{
          name?: string;
          properties?: {
            privateIPAddress?: string;
            publicIPAddress?: { id?: string };
          };
        }>;
      };
    }
  >(context, url);

  return loadBalancers.map((lb) => ({
    id: lb.id,
    name: lb.name,
    location: lb.location,
    sku: lb.sku,
    frontendIpConfigurations: (lb.properties?.frontendIPConfigurations ?? []).map((config) => ({
      name: config.name,
      privateIpAddress: config.properties?.privateIPAddress,
      publicIpAddressId: config.properties?.publicIPAddress?.id,
    })),
  }));
}

export async function getBlobContainerStats(
  subscriptionId: string,
  accountName: string,
  containerName: string,
  context: AzureResourcesContext,
): Promise<AzureBlobContainerStats> {
  const accountsUrl = `https://management.azure.com/subscriptions/${encodeURIComponent(
    subscriptionId,
  )}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`;

  const accounts = await collectPagedResults<
    { id: string; name: string; properties?: { primaryEndpoints?: { blob?: string } } }
  >(context, accountsUrl);

  const account = accounts.find((item) => item.name.toLowerCase() === accountName.toLowerCase());
  if (!account) {
    throw new Error(`Storage account ${accountName} not found in subscription ${subscriptionId}`);
  }

  const containerUrl = `https://management.azure.com${account.id}/blobServices/default/containers/${encodeURIComponent(
    containerName,
  )}?api-version=2023-01-01`;

  const response = await authorizedFetch(context, containerUrl);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to load container ${containerName}: ${response.status} ${response.statusText} ${text}`.trim(),
    );
  }

  const payload: {
    id: string;
    name: string;
    etag?: string;
    properties?: {
      publicAccess?: string | null;
      lastModifiedTime?: string;
      leaseStatus?: string | null;
      leaseState?: string | null;
      metadata?: Record<string, string> | null;
    };
  } = await response.json();

  return {
    id: payload.id,
    name: payload.name,
    etag: payload.etag,
    publicAccess: payload.properties?.publicAccess ?? null,
    lastModifiedOn: payload.properties?.lastModifiedTime,
    leaseStatus: payload.properties?.leaseStatus ?? null,
    leaseState: payload.properties?.leaseState ?? null,
    metadata: payload.properties?.metadata ?? null,
  };
}
