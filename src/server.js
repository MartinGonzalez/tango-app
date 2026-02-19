import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";

import { scanClaudeProcesses } from "./processScanner.js";
import { TaskStore } from "./taskStore.js";
import { readPromptFromTranscript } from "./transcriptReader.js";
import { processHookEvent } from "./eventProcessor.js";
import { notify } from "./notifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

const PORT = Number(process.env.PORT ?? 4242);
const POLL_MS = Number(process.env.POLL_MS ?? 2000);

const taskStore = new TaskStore();
let latestProcesses = [];

async function refreshProcesses() {
  try {
    latestProcesses = await scanClaudeProcesses();
  } catch (error) {
    console.error("Failed to scan processes", error);
  }
}

await refreshProcesses();
setInterval(refreshProcesses, POLL_MS);

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.url === "/api/events" && req.method === "POST") {
      const payload = await readJsonBody(req);

      if (payload.hook_event_name) {
        const hook = payload.hook_event_name;
        const sid = (payload.session_id ?? "").slice(0, 8);
        const tool = payload.tool_name ? ` → ${payload.tool_name}` : "";
        console.log(`\n${"─".repeat(60)}`);
        console.log(`[hook] ${hook}${tool}  (session: ${sid}…)`);
        const { events, notifications } = processHookEvent(payload);
        for (const event of events) {
          console.log(`  ↳ ${event.type}  status=${event.status ?? "—"}  title=${event.title ?? "—"}`);
          taskStore.ingest(event);
        }
        for (const n of notifications) {
          console.log(`  🔔 ${n.message}`);
          notify(n.title, n.message);
        }
      } else {
        console.log(`\n[legacy] ${payload.type ?? "unknown"}`, JSON.stringify(payload));
        taskStore.ingest(payload);
      }

      return sendJson(res, 202, { accepted: true });
    }

    if (req.url === "/api/focus" && req.method === "POST") {
      const { appName } = await readJsonBody(req);
      if (!appName || typeof appName !== "string") {
        return sendJson(res, 400, { error: "appName required" });
      }
      const name = appName.replace(/\.app$/i, "");
      const escaped = name.replace(/"/g, '\\"');
      execFile("osascript", ["-e", `tell application "${escaped}" to activate`], (err) => {
        if (err) console.log(`[focus] Failed to activate "${name}": ${err.message}`);
      });
      return sendJson(res, 200, { focused: name });
    }

    if (req.url === "/api/snapshot") {
      const tasksSnapshot = taskStore.snapshot();
      await resolvePrompts(tasksSnapshot.tasks);
      const now = new Date().toISOString();
      return sendJson(res, 200, {
        timestamp: now,
        processes: latestProcesses.map((process) => {
          const linked = taskStore.taskForProcess(process, { now });
          return {
            ...process,
            task: linked.task,
            activity: linked.activity,
            attribution: linked.attribution
          };
        }),
        tasks: tasksSnapshot.tasks,
        subagents: tasksSnapshot.subagents,
        eventCount: tasksSnapshot.events.length
      });
    }

    if (req.method === "GET") {
      const filePath = req.url === "/" ? "index.html" : req.url.slice(1);
      if (filePath.includes("..")) {
        return sendJson(res, 400, { error: "Invalid path" });
      }

      const absolutePath = path.join(publicDir, filePath);
      const content = await readFile(absolutePath);
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(content);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    sendJson(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Claude Watcher listening on http://localhost:${PORT}`);
});

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw || "{}");
}

async function resolvePrompts(tasks) {
  const pending = tasks.filter((t) => t.transcriptPath && !t.prompt);
  const results = await Promise.allSettled(
    pending.map(async (task) => {
      const result = await readPromptFromTranscript(task.transcriptPath);
      if (result) {
        taskStore.setPrompt(task.sessionId, result.prompt, result.topic);
        task.prompt = result.prompt;
        task.topic = result.topic;
      }
    })
  );
}

function contentType(filePath) {
  if (filePath.endsWith(".js")) {
    return "text/javascript";
  }
  if (filePath.endsWith(".css")) {
    return "text/css";
  }
  if (filePath.endsWith(".json")) {
    return "application/json";
  }
  if (filePath.endsWith(".png")) {
    return "image/png";
  }
  return "text/html";
}
