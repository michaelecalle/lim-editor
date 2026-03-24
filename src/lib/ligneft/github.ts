import { DEFAULT_GITHUB_BRANCH } from "./constants.js";
import { LigneFtConfigurationError, LigneFtGithubError } from "./errors.js";

export type GithubTarget = "editor" | "lim2";

type GithubConfig = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
};

type GithubContentFileResponse = {
  type: "file";
  encoding: "base64";
  content: string;
  sha: string;
  path: string;
  name: string;
  size: number;
};

type GithubContentDirectoryItem = {
  type: "file" | "dir";
  name: string;
  path: string;
  sha: string;
  size?: number;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new LigneFtConfigurationError(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getGithubEnvNames(target: GithubTarget): {
  token: string;
  owner: string;
  repo: string;
  branch: string;
} {
  if (target === "editor") {
    return {
      token: "LIGNEFT_EDITOR_GITHUB_TOKEN",
      owner: "LIGNEFT_EDITOR_GITHUB_OWNER",
      repo: "LIGNEFT_EDITOR_GITHUB_REPO",
      branch: "LIGNEFT_EDITOR_GITHUB_BRANCH",
    };
  }

  return {
    token: "LIGNEFT_LIM2_GITHUB_TOKEN",
    owner: "LIGNEFT_LIM2_GITHUB_OWNER",
    repo: "LIGNEFT_LIM2_GITHUB_REPO",
    branch: "LIGNEFT_LIM2_GITHUB_BRANCH",
  };
}

function buildGithubApiUrl(path: string, target: GithubTarget = "editor"): string {
  const { owner, repo } = getGithubConfig(target);
  const normalizedPath = path.replace(/^\/+/, "");
  return `https://api.github.com/repos/${owner}/${repo}/contents/${normalizedPath}`;
}

function buildHeaders(target: GithubTarget = "editor"): HeadersInit {
  const { token } = getGithubConfig(target);

  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function parseGithubError(response: Response): Promise<never> {
  let details: unknown = undefined;

  try {
    details = await response.json();
  } catch {
    try {
      details = await response.text();
    } catch {
      details = undefined;
    }
  }

  throw new LigneFtGithubError(
    `GitHub request failed with status ${response.status}`,
    details,
  );
}

export function getGithubConfig(target: GithubTarget = "editor"): GithubConfig {
  const envNames = getGithubEnvNames(target);

  return {
    token: getRequiredEnv(envNames.token),
    owner: getRequiredEnv(envNames.owner),
    repo: getRequiredEnv(envNames.repo),
    branch: process.env[envNames.branch]?.trim() || DEFAULT_GITHUB_BRANCH,
  };
}

export async function githubGetFile(
  path: string,
  target: GithubTarget = "editor",
): Promise<{
  path: string;
  name: string;
  sha: string;
  size: number;
  content: string;
}> {
  const { branch } = getGithubConfig(target);

  const url = new URL(buildGithubApiUrl(path, target));
  url.searchParams.set("ref", branch);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(target),
    cache: "no-store",
  });

  if (!response.ok) {
    await parseGithubError(response);
  }

  const json = (await response.json()) as GithubContentFileResponse;

  if (json.type !== "file") {
    throw new LigneFtGithubError(`GitHub path is not a file: ${path}`, json);
  }

  if (json.encoding !== "base64") {
    throw new LigneFtGithubError(`Unsupported GitHub file encoding for path: ${path}`, json);
  }

  const content = Buffer.from(json.content, "base64").toString("utf-8");

  return {
    path: json.path,
    name: json.name,
    sha: json.sha,
    size: json.size,
    content,
  };
}

export async function githubPutFile(
  path: string,
  content: string,
  message: string,
  sha?: string,
  target: GithubTarget = "editor",
): Promise<{
  path: string;
  sha: string;
}> {
  const { branch } = getGithubConfig(target);

  const response = await fetch(buildGithubApiUrl(path, target), {
    method: "PUT",
    headers: buildHeaders(target),
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!response.ok) {
    await parseGithubError(response);
  }

  const json = (await response.json()) as {
    content?: {
      path: string;
      sha: string;
    };
  };

  if (!json.content?.path || !json.content?.sha) {
    throw new LigneFtGithubError(`Invalid GitHub PUT response for path: ${path}`, json);
  }

  return {
    path: json.content.path,
    sha: json.content.sha,
  };
}

export async function githubDeleteFile(
  path: string,
  message: string,
  sha: string,
  target: GithubTarget = "editor",
): Promise<void> {
  const { branch } = getGithubConfig(target);

  const response = await fetch(buildGithubApiUrl(path, target), {
    method: "DELETE",
    headers: buildHeaders(target),
    body: JSON.stringify({
      message,
      sha,
      branch,
    }),
  });

  if (!response.ok) {
    await parseGithubError(response);
  }
}

export async function githubListDirectory(
  path: string,
  target: GithubTarget = "editor",
): Promise<GithubContentDirectoryItem[]> {
  const { branch } = getGithubConfig(target);

  const url = new URL(buildGithubApiUrl(path, target));
  url.searchParams.set("ref", branch);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(target),
    cache: "no-store",
  });

  if (!response.ok) {
    await parseGithubError(response);
  }

  const json = (await response.json()) as unknown;

  if (!Array.isArray(json)) {
    throw new LigneFtGithubError(`GitHub directory response is not an array for path: ${path}`, json);
  }

  return json.map((item) => {
    const entry = item as Partial<GithubContentDirectoryItem>;

    if (
      (entry.type !== "file" && entry.type !== "dir") ||
      typeof entry.name !== "string" ||
      typeof entry.path !== "string" ||
      typeof entry.sha !== "string"
    ) {
      throw new LigneFtGithubError(
        `Invalid GitHub directory entry for path: ${path}`,
        item,
      );
    }

    return {
      type: entry.type,
      name: entry.name,
      path: entry.path,
      sha: entry.sha,
      size: typeof entry.size === "number" ? entry.size : 0,
    };
  });
}