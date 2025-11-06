import type { CloudResource } from "@prisma/client";
import { getRepositoryTree } from "./client";

export type IaCFileFormat = "terraform" | "bicep" | "arm";

export interface IaCFileMatch {
  path: string;
  format: IaCFileFormat;
}

function inferFormatFromPath(path: string): IaCFileFormat | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tf")) {
    return "terraform";
  }
  if (lower.endsWith(".bicep")) {
    return "bicep";
  }
  if (lower.endsWith(".json") || lower.endsWith(".arm")) {
    return "arm";
  }
  return null;
}

function normalizeResourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function findIaCFileForResource(
  repo: string,
  resource: CloudResource,
): Promise<IaCFileMatch | null> {
  const tags = (resource.tags as Record<string, string> | null) ?? null;
  const tagPath = tags?.iac_path ?? tags?.IacPath ?? tags?.iacPath;
  if (typeof tagPath === "string") {
    const format = inferFormatFromPath(tagPath);
    if (format) {
      return { path: tagPath, format };
    }
  }

  const tree = await getRepositoryTree(repo);
  const files = tree.filter((item) => item.type === "blob");
  const resourceSlug = normalizeResourceName(resource.name);

  if (resourceSlug) {
    const matchingByName = files.find((item) => {
      const filename = item.path.split("/").pop()?.toLowerCase() ?? "";
      return filename.includes(resourceSlug);
    });

    if (matchingByName) {
      const format = inferFormatFromPath(matchingByName.path);
      if (format) {
        return { path: matchingByName.path, format };
      }
    }
  }

  const fallbackPatterns: Array<{ regex: RegExp; format: IaCFileFormat }> = [
    { regex: /^(infra|iac|terraform)\/.+\.(tf)$/, format: "terraform" },
    { regex: /^(modules|environments)\/.+\.(tf)$/, format: "terraform" },
    { regex: /^(bicep|azure-bicep)\/.+\.bicep$/, format: "bicep" },
    { regex: /^(arm|templates|deployments)\/.+\.(json|arm)$/, format: "arm" },
    { regex: /main\.tf$/, format: "terraform" },
  ];

  for (const candidate of files) {
    for (const pattern of fallbackPatterns) {
      if (pattern.regex.test(candidate.path)) {
        const format = inferFormatFromPath(candidate.path);
        if (format) {
          return { path: candidate.path, format };
        }
      }
    }
  }

  return null;
}
