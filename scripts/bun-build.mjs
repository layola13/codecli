#!/usr/bin/env bun

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const compile = process.argv.includes("--compile");

const publishedEntrypoint = resolve("cli.js");
const sourceEntrypoint = resolve("src/entrypoints/cli.tsx");
const usePublishedBundle = existsSync(publishedEntrypoint);
const entrypoint = usePublishedBundle ? publishedEntrypoint : sourceEntrypoint;
const outfile = resolve(
  compile ? "dist/claudecode" : usePublishedBundle ? "dist/claudecode.js" : "cli.js"
);

mkdirSync(dirname(outfile), { recursive: true });

const macroValues = {
  VERSION: "2.1.88",
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
