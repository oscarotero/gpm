import ghVersions from "./src/github.ts";
import {
  basename,
  dim,
  dirname,
  emptyDir,
  ensureDir,
  extname,
  green,
  join,
  JSZip,
  maxSatisfying,
  parse,
  red,
} from "./deps.ts";

export interface Package {
  /** Package name or file url */
  name: string;
  /** Package version (GIT tag) */
  version?: string;
  /** Files to download */
  files?: string[];
  /** Function to filter the files to download */
  filter?: (path: string) => boolean;
  /** Destination folder where the package files are downloaded */
  dest?: string;
  /** Cache of the package in miliseconds. 600000 (10 minutes) by default */
  cache?: number;
}

export default async function main(
  pkgs: (Package | string)[],
  dest = "./vendor",
) {
  install:
  for (let pkg of pkgs) {
    if (typeof pkg === "string") {
      pkg = { name: pkg };
    }

    // Is the url of a file
    if (pkg.name.startsWith("https://")) {
      await download(pkg, pkg.dest || dest);
      continue;
    }

    const dir = pkg.name.split("/").pop()!;
    const result = await ghVersions(pkg.name, 100, pkg.cache ?? 600000);

    if (!result) {
      console.error(red("Error:"), `${pkg.name} ${dim("not found")}`);
      continue;
    }

    const { versions, cached } = result;
    const version = maxSatisfying([...versions.keys()], pkg.version || "*");

    if (version) {
      const url = versions.get(version)!;
      const destination = pkg.dest || join(dest, dir);
      const files = pkg.files;
      const filter = pkg.filter;

      if (cached) {
        try {
          await Deno.stat(destination);
          continue install;
        } catch {
          // Ignore
        }
      }

      console.log(green("Install:"), `${pkg.name} ${dim(version)}`);
      await install(url, destination, files, filter);
    } else {
      console.error(
        red("Error:"),
        `${pkg.name}@${pkg.version} ${dim("not found")}`,
      );
    }
  }
}

async function cli(args: string[]): Promise<void> {
  const flags = parse(args);
  const pkgs = flags._.map((pkg) => parsePackage(pkg as string));
  const dest = flags.dest;
  try {
    await main(pkgs, dest);
  } catch (e) {
    if (flags.verbose) {
      console.error(e);
    } else {
      console.error(red("Error:"), e.message);
    }
  }
}

if (import.meta.main) {
  cli(Deno.args);
}

function parsePackage(pkg: string): Package {
  const result = pkg.match(/^([\w/\-\.]+)(?:@([^/]*))?(\/.*)?$/);
  if (!result) {
    throw new Error(`Invalid package name: ${pkg}`);
  }

  return {
    name: result[1],
    version: result[2] || "*",
    files: result[3] ? result[3].split(",") : undefined,
  };
}

async function install(
  url: string,
  dest: string,
  files?: string[],
  filter?: (path: string) => boolean,
): Promise<void> {
  const res = await fetch(url);
  const blob = await res.blob();
  const zip = new JSZip();
  await zip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
  let root = zip;

  // Get the first subfolder as root
  for (const file of zip) {
    if (file.dir) {
      root = zip.folder(file.name);
      break;
    }
  }

  if (!files) {
    files = await getNpmFiles(root);
  }

  if (files) {
    files = files.map((file) => {
      return file.replace(/^(\/|\.\/)/, "");
    });
  }

  await emptyDir(dest);

  const zipFiles = root.filter((path: string, file) => {
    if (file.dir) {
      return false;
    }

    if (files && files.every((f) => f !== path && !path.startsWith(`${f}/`))) {
      return false;
    }

    return filter ? filter(path) : true;
  });

  const rootPath = getRootPath(zipFiles.map((file) => file.name));

  await Promise.all(zipFiles.map(async (file) => {
    const path = join(dest, file.name.slice(rootPath.length));
    const dir = dirname(path);

    try {
      await Deno.mkdir(dir, { recursive: true });
    } catch {
      // Directory already exists
    }

    const content = await file.async("string");
    return Deno.writeTextFile(path, content);
  }));
}

async function getNpmFiles(root: JSZip): Promise<string[] | undefined> {
  const pkgFile = await root.file("package.json");

  if (!pkgFile) {
    return;
  }

  const pkg = JSON.parse(await pkgFile.async("string"));
  const files = new Set<string>();

  if (pkg.style) {
    files.add(pkg.style);
  }

  if (pkg.module) {
    files.add(pkg.module);
  } else if (pkg.modules) {
    pkg.modules.forEach((file: string) => files.add(file));
  } else if (pkg.files) {
    pkg.files.forEach((file: string) => files.add(file));
  } else if (pkg.browser) {
    files.add(pkg.browser);
  } else if (pkg.main) {
    if (!extname(pkg.main)) {
      return [pkg.main + ".js"];
    }

    files.add(pkg.main);
  }

  return [...files];
}

async function download(pkg: Package, dest: string): Promise<void> {
  const url = new URL(pkg.name);
  const res = await fetch(url);
  const blob = await res.blob();
  const content = new Uint8Array(await blob.arrayBuffer());

  await ensureDir(dest);

  console.log(green("Download:"), url.href);

  if (extname(url.pathname) !== ".zip") {
    if (extname(url.pathname) === extname(dest)) {
      return Deno.writeFile(dest, content);
    }
    return Deno.writeFile(join(dest, basename(url.pathname)), content);
  }

  const zip = new JSZip();
  await zip.loadAsync(content);
  await zip.unzip(dest);
}

function getRootPath(files: string[]): string {
  if (!files.length) {
    return "";
  }

  if (files.length === 1) {
    const base = basename(files[0]);
    return files[0].slice(0, -base.length);
  }

  let result = "";
  const parts = files[0].split("/", 2);

  while (parts.length) {
    const root = join(result, parts.shift()!);

    if (files.every((file) => file.startsWith(root))) {
      result = root;
    } else {
      break;
    }
  }

  return result;
}
