import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

type PluginManifest = {
  skills?: string;
  hooks?: string;
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
      expectManifestPath(manifestPath, manifest.mcpServers);
      expectManifestPath(manifestPath, manifest.apps);
      expectManifestPath(manifestPath, manifest.interface?.composerIcon);
      expectManifestPath(manifestPath, manifest.interface?.logo);

      for (const screenshot of manifest.interface?.screenshots ?? []) {
        expectManifestPath(manifestPath, screenshot);
      }
    }
  });
});
