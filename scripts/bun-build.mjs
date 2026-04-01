#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const compile = process.argv.includes("--compile");
const forceSource = process.argv.includes("--source");
const forcePublished = process.argv.includes("--published");

if (forceSource && forcePublished) {
  console.error("Choose either --source or --published, not both.");
  process.exit(1);
}

const publishedEntrypoint = resolve("cli.js");
const sourceEntrypoint = resolve("src/entrypoints/cli.tsx");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const hasPublishedBundle = existsSync(publishedEntrypoint);
const hasSourceEntrypoint = existsSync(sourceEntrypoint);

if (forcePublished && !hasPublishedBundle) {
  console.error(`Published entrypoint not found: ${publishedEntrypoint}`);
  process.exit(1);
}

if (forceSource && !hasSourceEntrypoint) {
  console.error(`Source entrypoint not found: ${sourceEntrypoint}`);
  process.exit(1);
}

if (!hasPublishedBundle && !hasSourceEntrypoint) {
  console.error("No build entrypoint found.");
  process.exit(1);
}

const usePublishedBundle = forcePublished
  ? true
  : forceSource
    ? false
    : hasPublishedBundle;
const entrypoint = usePublishedBundle ? publishedEntrypoint : sourceEntrypoint;
const outfile = resolve(
  compile
    ? "dist/claudecode"
    : usePublishedBundle || forceSource
      ? "dist/claudecode.js"
      : "cli.js"
);

mkdirSync(dirname(outfile), { recursive: true });

const macroValues = {
  VERSION: packageJson.version,
  PACKAGE_URL: "@anthropic-ai/claude-code",
  NATIVE_PACKAGE_URL: "@anthropic-ai/claude-code",
  BUILD_TIME: "2026-03-30T22:36:48.424Z",
  VERSION_CHANGELOG: "",
  FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues",
  ISSUES_EXPLAINER: "file an issue at https://github.com/anthropics/claude-code/issues"
};

const args = [
  "build",
  "--target=bun",
  "--outfile",
  outfile
];

if (!usePublishedBundle) {
  args.push(
    "--banner",
    `const MACRO = Object.freeze(${JSON.stringify(macroValues)});`
  );
}

args.push(entrypoint);

if (compile) {
  args.splice(1, 0, "--compile");
}

const proc = Bun.spawn([process.execPath, ...args], {
  cwd: process.cwd(),
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
  process.exit(exitCode);
}
