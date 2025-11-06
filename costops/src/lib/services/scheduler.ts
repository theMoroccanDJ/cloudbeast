import { ingestMetrics, ingestResources, ingestSubscriptions } from "./ingestion";
import { recalculateRecommendations } from "./recommendation";
import { reconcileIaCMapping } from "./reconciliation";

export async function runDaily(orgId: string): Promise<void> {
  const steps: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "ingestSubscriptions", run: () => ingestSubscriptions(orgId) },
    { name: "ingestResources", run: () => ingestResources(orgId) },
    { name: "ingestMetrics", run: () => ingestMetrics(orgId) },
    { name: "reconcileIaCMapping", run: () => reconcileIaCMapping(orgId) },
    { name: "recalculateRecommendations", run: () => recalculateRecommendations(orgId) },
  ];

  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      console.error(`Scheduler step ${step.name} failed for organization ${orgId}:`, error);
    }
  }
}
