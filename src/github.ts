interface GitHubTag {
  name: string;
  "zipball_url": string;
}

export default async function github(
  name: string,
  limit = 100,
): Promise<Map<string, string> | null> {
  const url = `https://api.github.com/repos/${name}/tags?per_page=${limit}`;
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

  const tags = await res.json();

  const result: Map<string, string> = new Map();

  tags.forEach((tag: GitHubTag) => {
    result.set(tag.name, tag.zipball_url);
  });

  return result;
}
