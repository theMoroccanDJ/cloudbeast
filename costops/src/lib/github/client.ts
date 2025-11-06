import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";

export interface CommitFileInput {
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
  mode?: "100644" | "100755";
}

interface RepoCoordinates {
  owner: string;
  repo: string;
}

interface RepoClientContext extends RepoCoordinates {
  octokit: Octokit;
}

let appOctokit: Octokit | null = null;
let appCredentials: { appId: string; privateKey: string } | null = null;

function getAppCredentials(): { appId: string; privateKey: string } {
  if (!appCredentials) {
    const appId = process.env.GITHUB_APP_ID;
    const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKeyRaw) {
      throw new Error(
        "Missing GitHub App credentials. Ensure GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are set.",
      );
    }

    appCredentials = {
      appId,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    };
  }

  return appCredentials;
}

function getAppOctokit(): Octokit {
  if (!appOctokit) {
    const { appId, privateKey } = getAppCredentials();

    appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
      },
    });
  }

  return appOctokit;
}

function parseRepo(repo: string): RepoCoordinates {
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error(`Invalid repository name: ${repo}`);
  }

  return { owner, repo: repoName };
}

async function getInstallationClient(repo: string): Promise<RepoClientContext> {
  const coordinates = parseRepo(repo);
  const baseOctokit = getAppOctokit();
  const { appId, privateKey } = getAppCredentials();

  const installation = await baseOctokit.apps.getRepoInstallation(coordinates);

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId: installation.data.id,
    },
  });

  return { ...coordinates, octokit };
}

async function ensureBranchExists(
  context: RepoClientContext,
  base: string,
  branch: string,
): Promise<void> {
  const { owner, repo, octokit } = context;
  const baseRef = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${base}` });

  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: baseRef.data.object.sha,
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error && "status" in error && (error as { status?: number }).status === 422) {
      // Branch already exists; leave it untouched
      return;
    }

    throw error;
  }
}

export async function createBranch(repo: string, base: string, branch: string): Promise<void> {
  const context = await getInstallationClient(repo);
  await ensureBranchExists(context, base, branch);
}

export async function commitFiles(
  repo: string,
  branch: string,
  files: CommitFileInput[],
  commitMessage = "Apply infrastructure recommendation",
): Promise<string> {
  if (files.length === 0) {
    throw new Error("commitFiles requires at least one file to update.");
  }

  const { owner, repo: repoName, octokit } = await getInstallationClient(repo);

  const branchRef = await octokit.rest.git.getRef({ owner, repo: repoName, ref: `heads/${branch}` });
  const latestCommitSha = branchRef.data.object.sha;
  const latestCommit = await octokit.rest.git.getCommit({ owner, repo: repoName, commit_sha: latestCommitSha });

  const blobs = await Promise.all(
    files.map((file) =>
      octokit.rest.git.createBlob({
        owner,
        repo: repoName,
        content: file.content,
        encoding: file.encoding ?? "utf-8",
      }),
    ),
  );

  const tree = await octokit.rest.git.createTree({
    owner,
    repo: repoName,
    base_tree: latestCommit.data.tree.sha,
    tree: files.map((file, index) => ({
      path: file.path,
      mode: file.mode ?? "100644",
      type: "blob" as const,
      sha: blobs[index].data.sha,
    })),
  });

  const commit = await octokit.rest.git.createCommit({
    owner,
    repo: repoName,
    message: commitMessage,
    tree: tree.data.sha,
    parents: [latestCommitSha],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo: repoName,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
  });

  return commit.data.sha;
}

export async function openPR(
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
  labels: string[] = [],
): Promise<{ url: string; number: number; html_url: string; headRef: string }> {
  const { owner, repo: repoName, octokit } = await getInstallationClient(repo);

  const pr = await octokit.rest.pulls.create({
    owner,
    repo: repoName,
    head,
    base,
    title,
    body,
  });

  if (labels.length > 0) {
    await octokit.rest.issues.addLabels({
      owner,
      repo: repoName,
      issue_number: pr.data.number,
      labels,
    });
  }

  return {
    url: pr.data.url,
    number: pr.data.number,
    html_url: pr.data.html_url,
    headRef: pr.data.head.ref,
  };
}

export async function getFileContent(
  repo: string,
  path: string,
  ref?: string,
): Promise<{ content: string; sha: string }> {
  const { owner, repo: repoName, octokit } = await getInstallationClient(repo);
  const response = await octokit.rest.repos.getContent({
    owner,
    repo: repoName,
    path,
    ref,
  });

  if (!Array.isArray(response.data) && response.data.type === "file") {
    const buffer = Buffer.from(response.data.content, response.data.encoding as BufferEncoding);
    return { content: buffer.toString("utf-8"), sha: response.data.sha };
  }

  throw new Error(`Expected ${path} to be a file in ${repo}.`);
}

export async function getRepositoryTree(
  repo: string,
  ref?: string,
): Promise<Array<{ path: string; type: "blob" | "tree" }>> {
  const { owner, repo: repoName, octokit } = await getInstallationClient(repo);
  const repoInfo = await octokit.rest.repos.get({ owner, repo: repoName });
  const branch = ref ?? repoInfo.data.default_branch;

  const branchRef = await octokit.rest.git.getRef({ owner, repo: repoName, ref: `heads/${branch}` });
  const commit = await octokit.rest.git.getCommit({ owner, repo: repoName, commit_sha: branchRef.data.object.sha });
  const tree = await octokit.rest.git.getTree({
    owner,
    repo: repoName,
    tree_sha: commit.data.tree.sha,
    recursive: "true",
  });

  return tree.data.tree
    .filter((item): item is { path: string; type: "blob" | "tree" } => Boolean(item.path) && Boolean(item.type))
    .map((item) => ({ path: item.path!, type: item.type as "blob" | "tree" }));
}
