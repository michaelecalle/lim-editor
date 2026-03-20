import { DEFAULT_GITHUB_BRANCH } from "./constants.js";
import { LigneFtConfigurationError, LigneFtGithubError } from "./errors.js";

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

function buildGithubApiUrl(path: string): string {
  const { owner, repo } = getGithubConfig();
  const normalizedPath = path.replace(/^\/+/, "");
  return `https://api.github.com/repos/${owner}/${repo}/contents/${normalizedPath}`;
}

function buildHeaders(): HeadersInit {
  const { token } = getGithubConfig();

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

export function getGithubConfig(): GithubConfig {
  return {
    token: getRequiredEnv("GITHUB_TOKEN"),
    owner: getRequiredEnv("GITHUB_OWNER"),
    repo: getRequiredEnv("GITHUB_REPO"),
    branch: process.env.GITHUB_BRANCH?.trim() || DEFAULT_GITHUB_BRANCH,
  };
}

export async function githubGetFile(
  path: string,
): Promise<{
  path: string;
  name: string;
  sha: string;
  size: number;
  content: string;
}> {
  const { branch } = getGithubConfig();

  const url = new URL(buildGithubApiUrl(path));
  url.searchParams.set("ref", branch);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(),
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
): Promise<{
  path: string;
  sha: string;
}> {
  const { branch } = getGithubConfig();

  const response = await fetch(buildGithubApiUrl(path), {
    method: "PUT",
    headers: buildHeaders(),
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
): Promise<void> {
  const { branch } = getGithubConfig();

  const response = await fetch(buildGithubApiUrl(path), {
    method: "DELETE",
    headers: buildHeaders(),
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
): Promise<GithubContentDirectoryItem[]> {
  const { branch } = getGithubConfig();

  const url = new URL(buildGithubApiUrl(path));
  url.searchParams.set("ref", branch);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(),
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