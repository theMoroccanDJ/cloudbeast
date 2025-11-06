import { NextResponse, type NextRequest } from "next/server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

interface ParsedQuery {
  orgId: string;
  status?: string;
  ruleId?: string;
  page: number;
  pageSize: number;
}

function parseQuery(request: NextRequest): ParsedQuery {
  const { searchParams } = new URL(request.url);

  const orgId = searchParams.get("orgId");
  if (!orgId) {
    throw new Error("orgId query parameter is required.");
  }

  const status = searchParams.get("status") ?? undefined;
  const ruleId = searchParams.get("ruleId") ?? undefined;

  const pageRaw = searchParams.get("page");
  const page = Math.max(1, pageRaw ? Number.parseInt(pageRaw, 10) || 1 : 1);

  const pageSizeRaw = searchParams.get("pageSize");
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) || 20 : 20));

  return {
    orgId,
    status,
    ruleId,
    page,
    pageSize,
  };
}

export async function GET(request: NextRequest) {
  let query: ParsedQuery;
  try {
    query = parseQuery(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid query parameters.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const where: Prisma.RecommendationWhereInput = {
    organizationId: query.orgId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.ruleId ? { ruleId: query.ruleId } : {}),
  };

  try {
    const [total, recommendations] = await Promise.all([
      prisma.recommendation.count({ where }),
      prisma.recommendation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const resourceIds = Array.from(new Set(recommendations.map((recommendation) => recommendation.resourceId)));
    const resources = resourceIds.length
      ? await prisma.cloudResource.findMany({
          where: { organizationId: query.orgId, resourceId: { in: resourceIds } },
        })
      : [];
    const resourcesById = new Map(resources.map((resource) => [resource.resourceId, resource]));

    const items = recommendations.map((recommendation) => ({
      ...recommendation,
      resource: resourcesById.get(recommendation.resourceId) ?? null,
    }));

    return NextResponse.json({
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  } catch (error) {
    console.error("Failed to list recommendations", error);
    const message = error instanceof Error ? error.message : "Failed to list recommendations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
