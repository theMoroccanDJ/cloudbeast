export interface AzureCostContext {
  getAccessToken: () => Promise<string>;
  fetchFn?: typeof fetch;
}

interface CostQueryColumn {
  name: string;
  type: string;
}

interface CostQueryResponse {
  properties?: {
    columns?: CostQueryColumn[];
    rows?: Array<Array<string | number>>;
  };
}

async function authorizedFetch(
  context: AzureCostContext,
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

function sumCostFromResponse(response: CostQueryResponse, costColumnName: string): number {
  const columns = response.properties?.columns ?? [];
  const rows = response.properties?.rows ?? [];
  const costColumnIndex = columns.findIndex((column) => column.name === costColumnName);

  if (costColumnIndex === -1) {
    return 0;
  }

  return rows.reduce((total, row) => {
    const value = row[costColumnIndex];
    const numericValue = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0);
    return total + (Number.isFinite(numericValue) ? numericValue : 0);
  }, 0);
}

export async function getSubscriptionMonthlyCost(
  subscriptionId: string,
  context: AzureCostContext,
): Promise<number> {
  const url = `https://management.azure.com/subscriptions/${encodeURIComponent(
    subscriptionId,
  )}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`;

  const body = {
    type: "ActualCost",
    timeframe: "MonthToDate",
    dataset: {
      granularity: "Daily",
      aggregation: {
        Cost: {
          name: "PreTaxCost",
          function: "Sum",
        },
      },
    },
  };

  const response = await authorizedFetch(context, url, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to query subscription cost: ${response.status} ${response.statusText} ${text}`.trim(),
    );
  }

  const payload: CostQueryResponse = await response.json();
  return sumCostFromResponse(payload, "Cost");
}

export async function estimateResourceMonthlyCost(
  resourceId: string,
  context: AzureCostContext,
): Promise<number> {
  const url = `https://management.azure.com${resourceId}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`;

  const body = {
    type: "ActualCost",
    timeframe: "MonthToDate",
    dataset: {
      granularity: "Daily",
      aggregation: {
        Cost: {
          name: "PreTaxCost",
          function: "Sum",
        },
      },
      filter: {
        dimensions: {
          name: "ResourceId",
          operator: "In",
          values: [resourceId],
        },
      },
    },
  };

  const response = await authorizedFetch(context, url, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to estimate resource cost: ${response.status} ${response.statusText} ${text}`.trim(),
    );
  }

  const payload: CostQueryResponse = await response.json();
  return sumCostFromResponse(payload, "Cost");
}
