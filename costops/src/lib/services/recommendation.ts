import { runRulesForOrg } from "../rules/engine";

export async function recalculateRecommendations(orgId: string): Promise<void> {
  await runRulesForOrg(orgId);
}
