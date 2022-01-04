import { get, set } from "./cache.ts";
import { valid } from "../deps.ts";

interface GitHubTag {
  name: string;
  "zipball_url": string;
}

export default async function github(
  name: string,
  limit: number,
  cache: number,
): Promise<Map<string, string> | null> {
  const url = `https://api.github.com/repos/${name}/tags?per_page=${limit}`;
  let tags = get(url, cache) as GitHubTag[] | undefined;

  if (!tags) {
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

    tags = await res.json() as GitHubTag[];
    set(url, tags);
  }

  const result: Map<string, string> = new Map();

  tags.forEach((tag: GitHubTag) => {
    let version = valid(tag.name);

    if (!version) {
      // Fix short versions (1.0 => 1.0.0)
      if (tag.name.match(/^v?[0-9]+\.[0-9]+$/)) {
        version = `${tag.name}.0`;
      }
    }

    if (version) {
      result.set(version, tag.zipball_url);
    }
  });

  return result;
}
