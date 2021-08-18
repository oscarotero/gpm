import ghVersions from "./src/github.ts";
import {
  basename,
  dim,
  dirname,
  emptyDir,
  ensureDir,
  exists,
  extname,
  green,
  join,
  JSZip,
  maxSatisfying,
  parse,
  red,
} from "./deps.ts";

export interface Package {
  name: string;
  version?: string;
  files?: string[];
  filter?: (path: string) => boolean;
  dir?: string;
}

export default async function main(
  pkgs: (Package | string)[],
  dest = "./vendor",
) {
  for (let pkg of pkgs) {
    if (typeof pkg === "string") {
      pkg = { name: pkg };
    }

    // Is the url of a file
    if (pkg.name.startsWith("https://")) {
      await download(pkg, dest);
      continue;
    }

    const dir = pkg.name.split("/").pop()!;
    const versions = await ghVersions(pkg.name);

    if (!versions) {
      console.error(red("Error:"), `${pkg.name} ${dim("not found")}`);
      continue;
    }

    const version = maxSatisfying([...versions.keys()], pkg.version || "*");

    if (version) {
      console.log(green("Install:"), `${pkg.name} ${dim(version)}`);

      const url = new URL(versions.get(version)!);
      await install(url, join(dest, pkg.dir || dir), pkg.files, pkg.filter);
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
  url: URL,
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

    if (!exists(dir)) {
      await Deno.mkdir(dir, { recursive: true });
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

  if (pkg.module) {
    return [pkg.module];
  }

  if (pkg.modules) {
    return pkg.modules;
  }

  if (pkg.files) {
    return pkg.files;
  }

  if (pkg.browser) {
    return [pkg.browser];
  }

  if (pkg.main) {
    if (!extname(pkg.main)) {
      return [pkg.main + ".js"];
    }

    return [pkg.main];
  }
}

async function download(pkg: Package, dest: string): Promise<void> {
  const url = new URL(pkg.name);
  const res = await fetch(url);
  const blob = await res.blob();
  const content = new Uint8Array(await blob.arrayBuffer());

  dest = join(dest, pkg.dir || ".");

  await ensureDir(dest);

  console.log(green("Download:"), url);

  if (extname(url.pathname) !== ".zip") {
    await Deno.writeFile(join(dest, basename(url.pathname)), content);
    return;
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
