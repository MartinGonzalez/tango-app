import { execFile } from "node:child_process";

/**
 * Fire-and-forget macOS notification via osascript.
 * Silently no-ops on non-macOS or if osascript fails.
 */
export function notify(title, message) {
  try {
    const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
    execFile("osascript", ["-e", script], () => {});
  } catch {
    // swallow — non-macOS or missing osascript
  }
}
