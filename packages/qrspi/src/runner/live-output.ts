import { appendFileSync } from "fs";

export function appendLiveOutput(path: string | undefined, content: string): void {
  if (!path || content.length === 0) return;
  appendFileSync(path, content, "utf-8");
}
