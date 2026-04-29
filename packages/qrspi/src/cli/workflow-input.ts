import { readFile, stat } from "fs/promises";
import { extname, resolve } from "path";

import type {
  ResolvedWorkflowInput,
  WorkflowInputErrorCode,
  WorkflowInputFileKind,
  WorkflowInputFileValidation,
  WorkflowInputMetadata,
  WorkflowInputRequest,
} from "../workflow/types.js";

export class WorkflowInputError extends Error {
  code: WorkflowInputErrorCode;
  details?: Record<string, unknown>;

  constructor(
    code: WorkflowInputErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkflowInputError";
    this.code = code;
    this.details = details;
  }
}

export function getWorkflowInputFileKind(filePath: string): WorkflowInputFileKind | undefined {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".md") return "markdown";
  if (extension === ".txt") return "text";
  return undefined;
}

export function validateWorkflowInputRequest(request: WorkflowInputRequest): void {
  if (request.inline !== undefined && request.file !== undefined) {
    throw new WorkflowInputError(
      "INPUT_CONFLICT",
      "[QRSPI] --input and --input-file cannot be used together",
      { options: ["--input", "--input-file"] },
    );
  }
}

export async function validateWorkflowInputFile(
  filePath: string,
  projectRoot: string,
): Promise<WorkflowInputFileValidation> {
  const fileKind = getWorkflowInputFileKind(filePath);
  if (!fileKind) {
    throw new WorkflowInputError(
      "INPUT_FILE_UNSUPPORTED_TYPE",
      "[QRSPI] --input-file only supports .md and .txt files",
      { path: filePath, supported_extensions: [".md", ".txt"] },
    );
  }

  const resolvedPath = resolve(projectRoot, filePath);
  let stats;
  try {
    stats = await stat(resolvedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new WorkflowInputError(
        "INPUT_FILE_NOT_FOUND",
        `[QRSPI] Input file not found: ${filePath}`,
        { path: filePath, resolved_path: resolvedPath },
      );
    }

    throw new WorkflowInputError(
      "INPUT_FILE_UNREADABLE",
      `[QRSPI] Input file is not readable: ${filePath}`,
      { path: filePath, resolved_path: resolvedPath, cause: error instanceof Error ? error.message : String(error) },
    );
  }

  if (stats.isDirectory()) {
    throw new WorkflowInputError(
      "INPUT_FILE_IS_DIRECTORY",
      `[QRSPI] Input file points to a directory: ${filePath}`,
      { path: filePath, resolved_path: resolvedPath },
    );
  }

  return {
    path: filePath,
    resolved_path: resolvedPath,
    file_kind: fileKind,
  };
}

export async function readWorkflowInputFile(
  validation: WorkflowInputFileValidation,
): Promise<string> {
  try {
    return await readFile(validation.resolved_path, "utf-8");
  } catch (error) {
    throw new WorkflowInputError(
      "INPUT_FILE_UNREADABLE",
      `[QRSPI] Input file is not readable: ${validation.path}`,
      {
        path: validation.path,
        resolved_path: validation.resolved_path,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

export function createWorkflowInputMetadata(
  input: ResolvedWorkflowInput,
): WorkflowInputMetadata {
  return {
    input_source: input.input_source,
    source_file: input.source_file,
    file_kind: input.file_kind,
  };
}

export async function resolveWorkflowInput(
  request: WorkflowInputRequest,
): Promise<ResolvedWorkflowInput> {
  validateWorkflowInputRequest(request);

  if (request.file !== undefined) {
    const validation = await validateWorkflowInputFile(request.file, request.projectRoot);
    return {
      input_source: "file",
      source_file: validation.path,
      file_kind: validation.file_kind,
      resolved_path: validation.resolved_path,
      content: await readWorkflowInputFile(validation),
    };
  }

  if (request.inline !== undefined) {
    return {
      input_source: "inline",
      content: request.inline,
    };
  }

  return {
    input_source: "none",
  };
}
