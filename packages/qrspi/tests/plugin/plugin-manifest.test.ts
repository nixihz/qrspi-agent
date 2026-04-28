import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

type PluginManifest = {
  skills?: string;
  hooks?: string;
  scripts?: string;
  mcpServers?: string;
  apps?: string;
  interface?: {
    composerIcon?: string;
    logo?: string;
    screenshots?: string[];
  };
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function readManifest(path: string): PluginManifest {
  return JSON.parse(readFileSync(path, "utf-8")) as PluginManifest;
}

function expectManifestPath(manifestPath: string, target?: string) {
  if (!target) return;
  const pluginRoot = dirname(dirname(manifestPath));
  expect(existsSync(resolve(pluginRoot, target)), `${target} referenced by ${manifestPath}`).toBe(true);
}

describe("Codex plugin manifests", () => {
  it("only declare paths that exist relative to each plugin root", () => {
    const manifestPaths = [
      resolve(repoRoot, ".codex-plugin/plugin.json"),
      resolve(repoRoot, "plugins/qrspi/.codex-plugin/plugin.json"),
    ];

    for (const manifestPath of manifestPaths) {
      const manifest = readManifest(manifestPath);

      expectManifestPath(manifestPath, manifest.skills);
      expectManifestPath(manifestPath, manifest.hooks);
      expectManifestPath(manifestPath, manifest.scripts);
      expectManifestPath(manifestPath, manifest.mcpServers);
      expectManifestPath(manifestPath, manifest.apps);
      expectManifestPath(manifestPath, manifest.interface?.composerIcon);
      expectManifestPath(manifestPath, manifest.interface?.logo);

      for (const screenshot of manifest.interface?.screenshots ?? []) {
        expectManifestPath(manifestPath, screenshot);
      }
    }
  });

  it("declares shell scripts with a shebang when scripts are present", () => {
    const manifestPath = resolve(repoRoot, "plugins/qrspi/.codex-plugin/plugin.json");
    const manifest = readManifest(manifestPath);
    if (!manifest.scripts) {
      return;
    }

    const scriptsDir = resolve(dirname(dirname(manifestPath)), manifest.scripts);
    expect(existsSync(scriptsDir)).toBe(true);

    for (const filename of ["qrspi-status-context.sh", "qrspi-gate-review-context.sh", "qrspi-approve.sh"]) {
      const filePath = resolve(scriptsDir, filename);
      expect(existsSync(filePath), `${filename} should exist`).toBe(true);
      expect(readFileSync(filePath, "utf-8").startsWith("#!/bin/bash")).toBe(true);
    }
  });
});
