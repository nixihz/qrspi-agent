#!/usr/bin/env node
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);

type CliResult = {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

type FeatureSummary = {
  featureId: string;
  currentStage: string;
  status: string;
};

const featureSchema = z.object({
  root: z.string().default(process.env.QRSPI_PROJECT_ROOT ?? "."),
  feature: z.string().optional(),
});

const rootSchema = z.object({
  root: z.string().default(process.env.QRSPI_PROJECT_ROOT ?? "."),
});

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveCliCommand(): Promise<{ command: string; prefixArgs: string[] }> {
  if (process.env.QRSPI_CLI) {
    return { command: process.env.QRSPI_CLI, prefixArgs: [] };
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const repoLocalCli = resolve(currentDir, "../../qrspi/dist/cli/main.js");
  if (await fileExists(repoLocalCli)) {
    return { command: process.execPath, prefixArgs: [repoLocalCli] };
  }

  return { command: "qrspi", prefixArgs: [] };
}

async function runQrspi(args: string[], root: string): Promise<CliResult> {
  const { command, prefixArgs } = await resolveCliCommand();
  const fullArgs = [...prefixArgs, ...args];

  try {
    const { stdout, stderr } = await execFileAsync(command, fullArgs, {
      cwd: root,
      timeout: 0,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      command,
      args: fullArgs,
      exitCode: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    const maybeError = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      command,
      args: fullArgs,
      exitCode: typeof maybeError.code === "number" ? maybeError.code : 1,
      stdout: maybeError.stdout ?? "",
      stderr: maybeError.stderr ?? maybeError.message ?? "",
    };
  }
}

function parseFeatureList(stdout: string): FeatureSummary[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:[✓○!⏸])\s+([^:]+):\s+([A-Z?]+)\s+\(([^)]+)\)/u))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      featureId: match[1].trim(),
      currentStage: match[2].trim(),
      status: match[3].trim(),
    }));
}

function parseStatus(stdout: string): Record<string, string> {
  const summary: Record<string, string> = {};
  const currentStage = stdout.match(/Current Stage:\s*([A-Z]+)\s*-\s*(.+)$/m);
  const workflow = stdout.match(/\[QRSPI\]\s+Workflow:\s+(.+)\s+\(Feature:\s+([^)]+)\)/m);
  const engineStatus = stdout.match(/^Engine Status:\s*(.+)$/m);

  if (workflow) {
    summary.workflow = workflow[1].trim();
    summary.featureId = workflow[2].trim();
  }
  if (currentStage) {
    summary.currentStage = currentStage[1].trim();
    summary.currentStageName = currentStage[2].trim();
  }
  if (engineStatus) {
    summary.engineStatus = engineStatus[1].trim();
  }

  return summary;
}

function jsonText(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function addFeatureArgs(args: string[], input: { feature?: string }): string[] {
  if (!input.feature) return args;
  return [...args, "--feature", input.feature];
}

const server = new McpServer(
  {
    name: "qrspi-mcp",
    version: "0.1.0-preview",
  },
  {
    instructions: [
      "Use these tools to operate the qrspi CLI as the single source of truth.",
      "Do not write .qrspi state files directly.",
      "Do not bypass D, S, or PR human gates.",
    ].join(" "),
  },
);

server.registerTool(
  "qrspi_list",
  {
    description: "List QRSPI workflows in a project.",
    inputSchema: rootSchema.shape,
  },
  async (input) => {
    const result = await runQrspi(["list", "--root", input.root], input.root);
    return jsonText({
      ...result,
      workflows: parseFeatureList(result.stdout),
    });
  },
);

server.registerTool(
  "qrspi_status",
  {
    description: "Show QRSPI status for the only workflow or the selected feature.",
    inputSchema: featureSchema.shape,
  },
  async (input) => {
    const args = addFeatureArgs(["status", "--root", input.root], input);
    const result = await runQrspi(args, input.root);
    return jsonText({
      ...result,
      summary: parseStatus(result.stdout),
    });
  },
);

server.registerTool(
  "qrspi_init",
  {
    description: "Initialize a QRSPI workflow for a feature.",
    inputSchema: rootSchema.extend({
      featureId: z.string().min(1),
    }).shape,
  },
  async (input) => {
    const result = await runQrspi(["init", input.featureId, "--root", input.root], input.root);
    return jsonText({
      ...result,
      featureId: input.featureId,
    });
  },
);

server.registerTool(
  "qrspi_run",
  {
    description: "Run QRSPI from the current stage. Stops at human gates by default.",
    inputSchema: featureSchema.extend({
      input: z.string().optional(),
      runner: z.enum(["claude", "codex", "mock"]).optional(),
      model: z.string().optional(),
      maxStages: z.number().int().positive().optional(),
    }).shape,
  },
  async (input) => {
    let args = addFeatureArgs(["run", "--root", input.root], input);
    if (input.input) args = [...args, "--input", input.input];
    if (input.runner) args = [...args, "--runner", input.runner];
    if (input.model) args = [...args, "--model", input.model];
    if (input.maxStages) args = [...args, "--max-stages", String(input.maxStages)];

    const result = await runQrspi(args, input.root);
    return jsonText({
      ...result,
      summary: parseStatus(result.stdout),
      stoppedAtGate: /waiting for human confirmation|waiting_approval/i.test(result.stdout),
    });
  },
);

server.registerTool(
  "qrspi_approve_or_reject",
  {
    description: "Approve or reject the current QRSPI gate stage.",
    inputSchema: featureSchema.extend({
      decision: z.enum(["approve", "reject"]),
      stage: z.enum(["D", "S", "PR"]).optional(),
      comment: z.string().optional(),
    }).shape,
  },
  async (input) => {
    let args = addFeatureArgs([input.decision, "--root", input.root], input);
    if (input.stage) args = [input.decision, input.stage, "--root", input.root, ...(input.feature ? ["--feature", input.feature] : [])];
    if (input.decision === "reject" && input.comment) args = [...args, "--comment", input.comment];

    const result = await runQrspi(args, input.root);
    return jsonText({
      ...result,
      decision: input.decision,
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
