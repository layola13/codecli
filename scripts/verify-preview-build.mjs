#!/usr/bin/env bun

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const defaultJsArtifact = resolve("dist/claudenative.js");
const defaultBinaryArtifact = resolve("dist/claudenative");
const inputArtifact = process.argv[2];

const artifactPath = resolve(
  inputArtifact ??
    (existsSync(defaultJsArtifact) ? defaultJsArtifact : defaultBinaryArtifact)
);

if (!existsSync(artifactPath)) {
  console.error(`Artifact not found: ${artifactPath}`);
  process.exit(1);
}

const artifact = readFileSync(artifactPath);
const contains = (needle) => artifact.includes(Buffer.from(needle));

const markers = {
  previewDefineFolded: contains('CLI_INTERNAL_BETA_HEADER = "cli-internal-2026-02-09"'),
  previewGateConditional: contains('process.env.USER_TYPE === "ant" ? "cli-internal-2026-02-09" : ""'),
  delegatePermissions: contains("delegate-permissions"),
  antCommandSurface:
    contains("Manage task list tasks") ||
    contains("Manage conversation logs.") ||
    contains("Roll back to a previous release") ||
    contains('Initialize or upgrade the local dev environment using the "# claude up" section'),
};

let tier = "unknown";

if (
  markers.previewDefineFolded &&
  markers.delegatePermissions &&
  markers.antCommandSurface
) {
  tier = "full-preview-candidate";
} else if (markers.previewDefineFolded) {
  tier = "user-type-preview";
} else if (markers.previewGateConditional) {
  tier = "standard-build";
}

const sizeBytes = statSync(artifactPath).size;

console.log(`Artifact: ${artifactPath}`);
console.log(`Size: ${sizeBytes} bytes`);
console.log(`Tier: ${tier}`);
console.log(`preview_define_folded: ${markers.previewDefineFolded ? "yes" : "no"}`);
console.log(`preview_gate_conditional: ${markers.previewGateConditional ? "yes" : "no"}`);
console.log(`delegate_permissions: ${markers.delegatePermissions ? "yes" : "no"}`);
console.log(`ant_command_surface: ${markers.antCommandSurface ? "yes" : "no"}`);
