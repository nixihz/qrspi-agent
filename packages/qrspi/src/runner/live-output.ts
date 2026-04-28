import { appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export function appendLiveOutput(path: string | undefined, content: string): void {
  if (!path || content.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, content, "utf-8");
}
