import { get, set } from "./cache.ts";
import { valid } from "../deps.ts";

interface GitHubTag {
  name: string;
  "zipball_url": string;
}

interface Result {
  versions: Map<string, string>;
  cached: boolean;
}

export default async function github(
  name: string,
  limit: number,
  cache: number,
): Promise<Result | null> {
  const url = `https://api.github.com/repos/${name}/tags?per_page=${limit}`;
  const versions = get(url, cache) as Record<string, string> | undefined;

  if (versions) {
    return {
      versions: new Map(Object.entries(versions)),
      cached: true,
    };
  }

  console.log(`Fetching available versions for ${name}`);

  const res = await fetch(url);

  if (res.status !== 200) {
    if (res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = new Date(
        parseInt(res.headers.get("x-ratelimit-reset")!) * 1000,
      );
      throw new Error(
        `Rate limit reached for GitHub. Try again at ${reset.getHours()}:${reset.getMinutes()}`,
      );
    }
    return null;
  }

  const tags = await res.json() as GitHubTag[];
  const result: Record<string, string> = {};

  tags.forEach((tag: GitHubTag) => {
    let version = valid(tag.name);

    if (!version) {
      // Fix short versions (1.0 => 1.0.0)
      if (tag.name.match(/^v?[0-9]+\.[0-9]+$/)) {
        version = `${tag.name}.0`;
      }
    }

    if (version) {
      result[version] = tag.zipball_url;
    }
  });

  set(url, result);

  return {
    versions: new Map(Object.entries(result)),
    cached: false,
  };
}
