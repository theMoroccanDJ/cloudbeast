import { prisma } from "../db";
import type { CloudResource } from "@prisma/client";
import { findIaCFileForResource } from "../github/repoMapper";

interface GithubConnectionData {
  repo?: string;
  repos?: string[];
  repositories?: string[];
}

function ensureTagObject(tags: CloudResource["tags"]): Record<string, unknown> {
  if (!tags || typeof tags !== "object") {
    return {};
  }
  if (Array.isArray(tags)) {
    return {};
  }
  return { ...(tags as Record<string, unknown>) };
}

function extractRepos(connectionData: unknown): string[] {
  if (!connectionData || typeof connectionData !== "object") {
    return [];
  }

  const data = connectionData as GithubConnectionData;
  const repos = new Set<string>();

  if (typeof data.repo === "string") {
    repos.add(data.repo);
  }

  const repoLists = [data.repos, data.repositories];
  for (const list of repoLists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const repo of list) {
      if (typeof repo === "string") {
        repos.add(repo);
      }
    }
  }

  return Array.from(repos);
}

export async function reconcileIaCMapping(orgId: string): Promise<void> {
  const connections = await prisma.connection.findMany({
    where: { organizationId: orgId, type: "github", status: "connected" },
  });

  const repos = new Set<string>();
  for (const connection of connections) {
    for (const repo of extractRepos(connection.data)) {
      repos.add(repo);
    }
  }

  if (repos.size === 0) {
    return;
  }

  const resources = await prisma.cloudResource.findMany({
    where: { organizationId: orgId },
  });

  for (const resource of resources) {
    const tags = ensureTagObject(resource.tags);
    const existingPath = typeof tags["costops_iac_path"] === "string" ? tags["costops_iac_path"] : null;
    const existingRepo = typeof tags["costops_iac_repo"] === "string" ? tags["costops_iac_repo"] : null;

    if (existingPath && existingRepo) {
      continue;
    }

    let matched = false;

    for (const repo of repos) {
      try {
        const result = await findIaCFileForResource(repo, resource);
        if (!result) {
          continue;
        }

        tags["costops_iac_repo"] = repo;
        tags["costops_iac_path"] = result.path;
        tags["costops_iac_format"] = result.format;
        matched = true;
        break;
      } catch (error) {
        console.error(
          `Failed to reconcile IaC mapping for resource ${resource.resourceId} in org ${orgId} using repo ${repo}:`,
          error,
        );
      }
    }

    if (!matched) {
      continue;
    }

    await prisma.cloudResource.update({
      where: { id: resource.id },
      data: { tags },
    });
  }
}
