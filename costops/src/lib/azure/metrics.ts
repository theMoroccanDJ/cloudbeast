export interface AzureMetricsContext {
  getAccessToken: () => Promise<string>;
  fetchFn?: typeof fetch;
}

interface MetricsResponse {
  value?: Array<{
    name: { value: string };
    timeseries?: Array<{
      data?: Array<{
        average?: number;
      }>;
    }>;
  }>;
}

function buildTimespan(days: number): string {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return `${start.toISOString()}/${end.toISOString()}`;
}

async function authorizedFetch(
  context: AzureMetricsContext,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await context.getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return (context.fetchFn ?? fetch.bind(globalThis))(url, {
    ...init,
    headers,
  });
}

async function queryMetricAverage(
  resourceId: string,
  metricName: string,
  days: number,
  context: AzureMetricsContext,
  options?: { metricNamespace?: string },
): Promise<number | null> {
  const params = new URLSearchParams({
    "api-version": "2018-01-01",
    timespan: buildTimespan(days),
    interval: "PT1H",
    aggregation: "Average",
    metricnames: metricName,
  });

  if (options?.metricNamespace) {
    params.set("metricnamespace", options.metricNamespace);
  }

  const url = `https://management.azure.com${resourceId}/providers/microsoft.insights/metrics?${params.toString()}`;
  const response = await authorizedFetch(context, url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch metrics for ${resourceId}: ${response.status} ${response.statusText} ${text}`.trim(),
    );
  }

  const payload: MetricsResponse = await response.json();
  const metrics = payload.value ?? [];
  const series = metrics.flatMap((metric) => metric.timeseries ?? []);
  const dataPoints = series.flatMap((serie) => serie.data ?? []);

  if (dataPoints.length === 0) {
    return null;
  }

  const sum = dataPoints.reduce((total, point) => total + (point.average ?? 0), 0);
  return sum / dataPoints.length;
}

export async function getVmCpuAverage(
  vmId: string,
  days: number,
  context: AzureMetricsContext,
): Promise<number | null> {
  return queryMetricAverage(vmId, "Percentage CPU", days, context);
}

export async function getSqlUtilization(
  dbId: string,
  days: number,
  context: AzureMetricsContext,
): Promise<number | null> {
  return queryMetricAverage(dbId, "cpu_percent", days, context, {
    metricNamespace: "Microsoft.Sql/servers/databases",
  });
}

export async function getAppServiceCpu(
  appServiceId: string,
  days: number,
  context: AzureMetricsContext,
): Promise<number | null> {
  return queryMetricAverage(appServiceId, "CpuPercentage", days, context, {
    metricNamespace: "Microsoft.Web/sites",
  });
}
