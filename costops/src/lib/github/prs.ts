import type { CloudResource, Recommendation } from "@prisma/client";
import { prisma } from "../db";
import {
  commitFiles,
  createBranch,
  getFileContent,
  openPR,
  type CommitFileInput,
} from "./client";
import { findIaCFileForResource } from "./repoMapper";

interface RecommendationDetails {
  repo?: string;
  baseBranch?: string;
  branchName?: string;
  labels?: string[];
  pullRequestTitle?: string;
  pullRequestBody?: string;
  commitMessage?: string;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function formatTerraformComment(
  recommendation: Recommendation,
  resource: CloudResource,
): string {
  const lines = [
    `# costops recommendation ${recommendation.id}`,
    `# resource: ${resource.name}`,
    `# title: ${recommendation.title}`,
    `# impact (monthly): ${recommendation.impactMonthly}`,
  ];
  return ensureTrailingNewline(lines.join("\n"));
}

function formatBicepComment(
  recommendation: Recommendation,
  resource: CloudResource,
): string {
  const lines = [
    `// costops recommendation ${recommendation.id}`,
    `// resource: ${resource.name}`,
    `// title: ${recommendation.title}`,
    `// impact (monthly): ${recommendation.impactMonthly}`,
  ];
  return ensureTrailingNewline(lines.join("\n"));
}

function applyArmMetadata(current: string, recommendation: Recommendation): string {
  try {
    const document = JSON.parse(current) as Record<string, unknown>;
    const metadata =
      ((document["metadata"] as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    const existingRaw = metadata["costopsRecommendations"];
    const existing = Array.isArray(existingRaw) ? [...existingRaw] : [];

    if (!existing.some((item) => (item as { id?: string })?.id === recommendation.id)) {
      existing.push({
        id: recommendation.id,
        title: recommendation.title,
        description: recommendation.description,
        impactMonthly: recommendation.impactMonthly,
      });
    }

    metadata["costopsRecommendations"] = existing;
    document["metadata"] = metadata;

    return `${JSON.stringify(document, null, 2)}\n`;
  } catch (error) {
    const fallback = [
      `// costops recommendation ${recommendation.id}`,
      `// title: ${recommendation.title}`,
    ].join("\n");
    return `${ensureTrailingNewline(current)}${fallback}\n`;
  }
}

function generateUpdatedContent(
  format: "terraform" | "bicep" | "arm",
  currentContent: string,
  recommendation: Recommendation,
  resource: CloudResource,
): string {
  const marker = `costops recommendation ${recommendation.id}`;
  switch (format) {
    case "terraform":
      if (currentContent.includes(marker)) {
        return currentContent;
      }
      return `${ensureTrailingNewline(currentContent)}${formatTerraformComment(recommendation, resource)}`;
    case "bicep":
      if (currentContent.includes(marker)) {
        return currentContent;
      }
      return `${ensureTrailingNewline(currentContent)}${formatBicepComment(recommendation, resource)}`;
    case "arm":
      return applyArmMetadata(currentContent, recommendation);
    default:
      return currentContent;
  }
}

function sanitizeBranchName(candidate: string): string {
  const cleaned = candidate
    .toLowerCase()
    .replace(/[^a-z0-9\-/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : `costops-recommendation`;
}

export async function openFixPRForRecommendation(
  organizationId: string,
  recommendationId: string,
): Promise<{ url: string; number: number; branch: string; htmlUrl: string }> {
  const recommendation = await prisma.recommendation.findFirst({
    where: { id: recommendationId, organizationId },
  });

  if (!recommendation) {
    throw new Error(`Recommendation ${recommendationId} was not found for organization ${organizationId}.`);
  }

  const resource = await prisma.cloudResource.findFirst({
    where: { resourceId: recommendation.resourceId, organizationId },
  });

  if (!resource) {
    throw new Error(
      `Cloud resource ${recommendation.resourceId} was not found for organization ${organizationId}.`,
    );
  }

  const details = (recommendation.details as RecommendationDetails | null) ?? {};
  const repo = details.repo;
  if (!repo) {
    throw new Error(`Recommendation ${recommendation.id} is missing a target repository in details.repo.`);
  }

  const baseBranch = details.baseBranch ?? "main";
  const branchName = sanitizeBranchName(details.branchName ?? `costops/recommendation-${recommendation.id}`);
  const iacFile = await findIaCFileForResource(repo, resource);

  if (!iacFile) {
    throw new Error(`Unable to locate an IaC file for resource ${resource.name} in repository ${repo}.`);
  }

  const { content: currentContent } = await getFileContent(repo, iacFile.path, baseBranch);
  const updatedContent = generateUpdatedContent(iacFile.format, currentContent, recommendation, resource);

  if (updatedContent === currentContent) {
    throw new Error("No changes were generated for the selected recommendation.");
  }

  await createBranch(repo, baseBranch, branchName);

  const files: CommitFileInput[] = [
    {
      path: iacFile.path,
      content: updatedContent,
    },
  ];

  const commitMessage =
    details.commitMessage ?? `Apply CostOps recommendation ${recommendation.id} for ${resource.name}`;

  await commitFiles(repo, branchName, files, commitMessage);

  const title =
    details.pullRequestTitle ?? `Apply recommendation: ${recommendation.title}`;
  const body =
    details.pullRequestBody ?? `This PR applies the CostOps recommendation **${recommendation.title}** for resource \`${resource.name}\`.

- Estimated monthly impact: ${recommendation.impactMonthly}
- Confidence: ${recommendation.confidence}`;

  const pr = await openPR(repo, branchName, baseBranch, title, body, details.labels ?? []);

  await prisma.pullRequestEvent.create({
    data: {
      organizationId,
      recommendationId: recommendation.id,
      provider: "github",
      repo,
      prNumber: pr.number,
      branch: pr.headRef,
      status: "opened",
      url: pr.html_url,
    },
  });

  await prisma.recommendation.update({
    where: { id: recommendation.id },
    data: { status: "in_pr" },
  });

  return { url: pr.url, number: pr.number, branch: pr.headRef, htmlUrl: pr.html_url };
}
