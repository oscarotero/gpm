import ghVersions from "./src/github.ts";
import {
  basename,
  copy,
  dim,
  emptyDir,
  exists,
  extname,
  green,
  join,
  maxSatisfying,
  parse,
  red,
} from "./deps.ts";

interface Package {
  name: string;
  version?: string;
  files?: string[];
}

export default async function main(
  pkgs: (Package | string)[],
  dest = "./vendor",
) {
  for (let pkg of pkgs) {
    if (typeof pkg === "string") {
      pkg = { name: pkg };
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
      await install(url, join(dest, dir), pkg.files);
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
  const result = pkg.match(/^([\w/\-\.]+)(?:@([^/]+))?(\/.*)?$/);
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
): Promise<boolean> {
  const res = await fetch(url);
  const blog = await res.blob();
  const data = new Uint8Array(await blog.arrayBuffer());

  const tmp = await Deno.makeTempDir();
  const zip = join(tmp, "package.zip");
  Deno.writeFile(zip, data);
  const process = Deno.run({
    cmd: Deno.build.os === "windows"
      ? [
        "PowerShell",
        "Expand-Archive",
        "-Path",
        zip,
        "-DestinationPath",
        tmp,
      ]
      : ["unzip", zip, "-d", tmp],
    stdout: "piped",
    stderr: "piped",
  });

  const status = await process.status();

  for await (const entry of Deno.readDir(tmp)) {
    if (!entry.isDirectory) {
      continue;
    }

    const fromFiles = files
      ? files
      : await getNpmFiles(join(tmp, entry.name)) || [];

    if (!fromFiles.length) {
      console.error(red("Error:"), `Set the files to copy for ${url}`);
      break;
    }
    const toFiles = stripBasePath(fromFiles.concat([]));

    await emptyDir(dest);

    await Promise.all(fromFiles.map(async (file, index) => {
      const from = join(tmp, entry.name, file);
      let to = join(dest, toFiles[index]);
      const info = await Deno.stat(from);

      if (info.isFile && !toFiles[index]) {
        to = join(to, basename(from));
      }

      console.log("  ", dim(info.isDirectory ? `${to}/*` : to));
      return copy(from, to, { overwrite: true });
    }));

    break;
  }

  await Deno.remove(tmp, { recursive: true });
  return status.success;
}

async function getNpmFiles(path: string): Promise<string[] | undefined> {
  const pkgFile = join(path, "package.json");

  if (await exists(pkgFile)) {
    const pkg = JSON.parse(Deno.readTextFileSync(pkgFile));

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
}

function stripBasePath(files: string[]): string[] {
  while (true) {
    const file = files[0];
    const base = file.includes("/") ? file.split("/", 2).shift() + "/" : file;

    if (!base) {
      break;
    }

    if (files.every((file) => file.startsWith(base))) {
      files = files.map((file) => file.substr(base.length));
    } else {
      break;
    }
  }

  return files;
}
