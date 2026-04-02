#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const binaryPath = resolve(process.argv[2] ?? "dist/claudenative");
const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
const printPrompt = process.env.PREVIEW_SMOKE_PROMPT ?? "hello";

if (!existsSync(binaryPath)) {
  console.error(`Preview binary not found: ${binaryPath}`);
  process.exit(1);
}

const checks = [
  {
    label: "root help",
    command: [binaryPath, "--help"],
    includes: [
      "--delegate-permissions",
      "task",
      "log",
      "export",
      "rollback",
      "up",
    ],
  },
  {
    label: "task help",
    command: [binaryPath, "task", "--help"],
    includes: ["Manage task list tasks", "create", "list", "update"],
  },
  {
    label: "log help",
    command: [binaryPath, "log", "--help"],
    includes: ["Manage conversation logs."],
  },
  {
    label: "rollback help",
    command: [binaryPath, "rollback", "--help"],
    includes: ["Roll back to a previous release", "--safe", "--list"],
  },
  {
    label: "up help",
    command: [binaryPath, "up", "--help"],
    includes: ['Initialize or upgrade the local dev environment using the "# claude up" section'],
  },
  {
    label: "error help",
    command: [binaryPath, "error", "--help"],
    includes: ["View error logs."],
  },
  {
    label: "export help",
    command: [binaryPath, "export", "--help"],
    includes: ["Export a conversation to a text file.", "outputFile"],
  },
];

for (const check of checks) {
  const proc = Bun.spawnSync(check.command, {
    cwd: process.cwd(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  const stdout = new TextDecoder().decode(proc.stdout);
  const stderr = new TextDecoder().decode(proc.stderr);
  const normalizedStdout = stdout.replace(/\s+/g, " ").trim();

  if (proc.exitCode !== 0) {
    console.error(`[fail] ${check.label}: exit ${proc.exitCode}`);
    if (stdout) {
      console.error(stdout.trim());
    }
    if (stderr) {
      console.error(stderr.trim());
    }
    process.exit(proc.exitCode || 1);
  }

  for (const needle of check.includes) {
    const normalizedNeedle = needle.replace(/\s+/g, " ").trim();

    if (!normalizedStdout.includes(normalizedNeedle)) {
      console.error(`[fail] ${check.label}: missing "${needle}"`);
      console.error(stdout.trim());
      process.exit(1);
    }
  }

  console.log(`[ok] ${check.label}`);
}

if (anthropicBaseUrl) {
  const proc = Bun.spawnSync([binaryPath, "--print", printPrompt], {
    cwd: process.cwd(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  const stdout = new TextDecoder().decode(proc.stdout).trim();
  const stderr = new TextDecoder().decode(proc.stderr).trim();

  if (proc.exitCode !== 0) {
    console.error(`[fail] print smoke: exit ${proc.exitCode}`);
    if (stdout) {
      console.error(stdout);
    }
    if (stderr) {
      console.error(stderr);
    }
    process.exit(proc.exitCode || 1);
  }

  if (!stdout) {
    console.error("[fail] print smoke: empty stdout");
    if (stderr) {
      console.error(stderr);
    }
    process.exit(1);
  }

  console.log(
    `[ok] print smoke via ANTHROPIC_BASE_URL (${anthropicBaseUrl})`
  );
} else {
  console.log("[skip] print smoke: ANTHROPIC_BASE_URL is not set");
}

console.log(`[done] preview smoke checks passed for ${binaryPath}`);
