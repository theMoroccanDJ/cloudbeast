import { NextResponse, type NextRequest } from "next/server";

import { openFixPRForRecommendation } from "@/lib/github/prs";

interface CreatePrBody {
  orgId: string;
  recommendationId: string;
  repo: string;
  baseBranch: string;
}

function parseBody(body: unknown): CreatePrBody {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object.");
  }

  const { orgId, recommendationId, repo, baseBranch } = body as Record<string, unknown>;

  if (typeof orgId !== "string" || orgId.trim().length === 0) {
    throw new Error("orgId is required.");
  }
  if (typeof recommendationId !== "string" || recommendationId.trim().length === 0) {
    throw new Error("recommendationId is required.");
  }
  if (typeof repo !== "string" || repo.trim().length === 0) {
    throw new Error("repo is required.");
  }
  if (typeof baseBranch !== "string" || baseBranch.trim().length === 0) {
    throw new Error("baseBranch is required.");
  }

  return {
    orgId: orgId.trim(),
    recommendationId: recommendationId.trim(),
    repo: repo.trim(),
    baseBranch: baseBranch.trim(),
  };
}

export async function POST(request: NextRequest) {
  let body: CreatePrBody;
  try {
    const data = await request.json();
    body = parseBody(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const pullRequest = await openFixPRForRecommendation(body.orgId, body.recommendationId, {
      repo: body.repo,
      baseBranch: body.baseBranch,
    });
    return NextResponse.json({ pullRequest });
  } catch (error) {
    console.error("Failed to open pull request for recommendation", error);
    const message = error instanceof Error ? error.message : "Failed to create pull request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
