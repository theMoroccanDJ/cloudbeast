import { ingestMetrics, ingestResources, ingestSubscriptions } from "./ingestion";
import { recalculateRecommendations } from "./recommendation";
import { reconcileIaCMapping } from "./reconciliation";

export interface SchedulerStepResult {
  name: string;
  success: boolean;
  startedAt: string;
  finishedAt: string;
  error?: string;
}

export interface SchedulerRunSummary {
  organizationId: string;
  startedAt: string;
  finishedAt: string;
  steps: SchedulerStepResult[];
}

export async function runDaily(orgId: string): Promise<SchedulerRunSummary> {
  const steps: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "ingestSubscriptions", run: () => ingestSubscriptions(orgId) },
    { name: "ingestResources", run: () => ingestResources(orgId) },
    { name: "ingestMetrics", run: () => ingestMetrics(orgId) },
    { name: "reconcileIaCMapping", run: () => reconcileIaCMapping(orgId) },
    { name: "recalculateRecommendations", run: () => recalculateRecommendations(orgId) },
  ];

  const startedAt = new Date();
  const stepResults: SchedulerStepResult[] = [];

  for (const step of steps) {
    const stepStartedAt = new Date();
    try {
      await step.run();
      stepResults.push({
        name: step.name,
        success: true,
        startedAt: stepStartedAt.toISOString(),
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Scheduler step ${step.name} failed for organization ${orgId}:`, error);
      stepResults.push({
        name: step.name,
        success: false,
        startedAt: stepStartedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    organizationId: orgId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    steps: stepResults,
  };
}
