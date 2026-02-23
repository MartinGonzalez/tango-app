import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PS_ARGS = ["-axo", "pid=,ppid=,pcpu=,pmem=,stat=,etime=,command="];

export function parsePsOutput(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.toUpperCase().startsWith("PID "))
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(.+)$/);
      if (!match) {
        return null;
      }

      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        cpu: Number(match[3]),
        mem: Number(match[4]),
        stat: match[5],
        elapsed: match[6],
        command: match[7]
      };
    })
    .filter(Boolean);
}

export function isClaudeProcess(command) {
  const normalized = command.toLowerCase();
  if (normalized.includes("/claude.app/")) {
    return true;
  }

  return /(^|[\s/])claude([\s]|$)/i.test(command);
}

export function extractAppName(command) {
  // Match .app bundle names like /Applications/Claude.app/... or /Applications/Cursor.app/...
  const appMatch = command.match(/\/([^\/]+\.app)\//i);
  if (appMatch) {
    return appMatch[1];
  }

  // For CLI, check if it's the claude binary
  if (/(^|[\s/])claude([\s]|$)/i.test(command)) {
    return "Claude CLI";
  }

  // Fall back to "Claude"
  return "Claude";
}

export async function scanClaudeProcesses() {
  const { stdout } = await execFileAsync("ps", PS_ARGS);
  const allProcesses = parsePsOutput(stdout);

  // Build a map of PID -> process for quick parent lookup
  const processMap = new Map(allProcesses.map(p => [p.pid, p]));

  return allProcesses
    .filter((row) => isClaudeProcess(row.command))
    .map((row) => {
      let appName = extractAppName(row.command);

      // If it's a CLI instance, walk up the process tree to find the real terminal/IDE
      if (appName === "Claude CLI") {
        let currentPid = row.ppid;
        let depth = 0;
        const maxDepth = 5;

        while (currentPid && depth < maxDepth) {
          const parent = processMap.get(currentPid);
          if (!parent) break;

          const parentAppName = extractAppName(parent.command);

          // If we found an .app, use it and stop
          if (parentAppName.endsWith('.app')) {
            appName = parentAppName;
            break;
          }

          // If it's a generic shell, skip it and keep looking up
          if (parentAppName.match(/^(bash|zsh|sh|fish)$/i)) {
            currentPid = parent.ppid;
            depth++;
            continue;
          }

          // If it's something meaningful (not a shell, not "Claude"), use it
          if (parentAppName !== "Claude" && parentAppName !== "Claude CLI") {
            appName = parentAppName;
            break;
          }

          // Otherwise keep walking up
          currentPid = parent.ppid;
          depth++;
        }
      }

      return {
        ...row,
        state: normalizeStat(row.stat),
        appName,
        seenAt: new Date().toISOString()
      };
    });
}

function normalizeStat(stat) {
  if (stat.startsWith("R")) {
    return "running";
  }
  if (stat.startsWith("S") || stat.startsWith("I")) {
    return "sleeping";
  }
  if (stat.startsWith("T")) {
    return "stopped";
  }
  if (stat.startsWith("Z")) {
    return "zombie";
  }
  return "unknown";
}
