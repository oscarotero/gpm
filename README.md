# GPM

Git Package Manager: Simple Deno library to download git packages.

## Motivation

I just want to download assets from git repositories without depending on any
package registry like npm. For example,
[css packages](https://github.com/necolas/normalize.css),
[javascript polyfills](https://github.com/GoogleChrome/dialog-polyfill), etc.
But, at the same time, I want semantic versioning using the git tags.

## Usage

This is a Deno package, written in typescript:

```ts
import gpm from "https://deno.land/x/gpm/mod.ts";

const packages = [
  // Use the github repository name (it download the latest tag)
  "necolas/normalize.css",

  // Or you can specify a version (tags)
  {
    name: "GoogleChrome/dialog-polyfill",
    version: "0.5",
  },

  // And also configure the files/folders to copy
  // (it uses package.json as fallback)
  {
    name: "oom-components/page-loader",
    files: ["src"],
    filter: (path) => path.endsWith(".js"),
  },

  // Use full urls to download files directly
  "https://unpkg.com/react@17.0.2/umd/react.production.min.js"
];

const destination = "./vendors";

gpm(packages, destination);
```

## Cli

```bash
# Install
deno install --unstable -A https://deno.land/x/gpm/mod.ts

# Download necolas/normalize.css
gpm necolas/normalize.css

# Use the latest 7.x version
gpm necolas/normalize.css@7

# Set a different destination path
gpm necolas/normalize.css@7 --dest=./packages
```
