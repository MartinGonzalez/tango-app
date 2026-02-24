import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type OAuthCallbackPayload = {
  state: string | null;
  code: string | null;
  error: string | null;
  errorDescription: string | null;
};

export type OAuthCallbackResult = {
  ok: boolean;
  title: string;
  message: string;
};

export type ConnectorOAuthServerStatus = {
  ready: boolean;
  trusted: boolean;
  message: string | null;
  port: number;
  keyPath: string;
  certPath: string;
};

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export class ConnectorOAuthServer {
  #server: Bun.Server | null = null;
  #handler: (payload: OAuthCallbackPayload) => Promise<OAuthCallbackResult>;
  #status: ConnectorOAuthServerStatus;
  #port: number;
  #certDir: string;
  #keyPath: string;
  #certPath: string;

  constructor(
    handler: (payload: OAuthCallbackPayload) => Promise<OAuthCallbackResult>,
    opts?: {
      port?: number;
      certDir?: string;
    }
  ) {
    this.#handler = handler;
    this.#port = opts?.port ?? 4344;
    this.#certDir = opts?.certDir
      ?? join(homedir(), ".claude-sessions", "connectors", "certs");
    this.#keyPath = join(this.#certDir, "localhost.key.pem");
    this.#certPath = join(this.#certDir, "localhost.cert.pem");
    this.#status = {
      ready: false,
      trusted: false,
      message: null,
      port: this.#port,
      keyPath: this.#keyPath,
      certPath: this.#certPath,
    };
  }

  get status(): ConnectorOAuthServerStatus {
    return { ...this.#status };
  }

  async start(): Promise<void> {
    if (this.#server) return;

    try {
      await ensureLocalhostCertificate(this.#certDir, this.#keyPath, this.#certPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#status = {
        ...this.#status,
        ready: false,
        trusted: false,
        message: `Failed to prepare HTTPS certificate: ${message}`,
      };
      return;
    }

    const trust = await ensureTrustedCertificate(this.#certPath);
    this.#status = {
      ...this.#status,
      trusted: trust.trusted,
      message: trust.message,
    };

    try {
      this.#server = Bun.serve({
        port: this.#port,
        tls: {
          key: Bun.file(this.#keyPath),
          cert: Bun.file(this.#certPath),
        },
        fetch: async (req) => this.#handleRequest(req),
      });
      this.#status = {
        ...this.#status,
        ready: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#status = {
        ...this.#status,
        ready: false,
        message: `Failed to start OAuth callback server: ${message}`,
      };
    }
  }

  stop(): void {
    this.#server?.stop(true);
    this.#server = null;
    this.#status = {
      ...this.#status,
      ready: false,
    };
  }

  async #handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (
      req.method === "GET"
      && (url.pathname === "/oauth/slack/callback" || url.pathname === "/oauth/jira/callback")
    ) {
      const payload: OAuthCallbackPayload = {
        state: normalizeNullableString(url.searchParams.get("state")),
        code: normalizeNullableString(url.searchParams.get("code")),
        error: normalizeNullableString(url.searchParams.get("error")),
        errorDescription: normalizeNullableString(
          url.searchParams.get("error_description")
        ),
      };

      let result: OAuthCallbackResult;
      try {
        result = await this.#handler(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = {
          ok: false,
          title: "Slack authorization failed",
          message: message || "Unexpected error while processing OAuth callback.",
        };
      }

      return new Response(renderCallbackPage(result), {
        status: result.ok ? 200 : 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}

function renderCallbackPage(result: OAuthCallbackResult): string {
  const title = escapeHtml(result.title);
  const message = escapeHtml(result.message);
  const tone = result.ok ? "#10b981" : "#ef4444";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #151515;
      color: #f5f5f5;
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      width: min(640px, 100%);
      border: 1px solid #333;
      border-radius: 14px;
      background: #1f1f1f;
      padding: 20px 22px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 22px;
      line-height: 1.25;
      color: ${tone};
    }
    p {
      margin: 0;
      font-size: 15px;
      line-height: 1.55;
      color: #e7e7e7;
    }
  </style>
</head>
<body>
  <article class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </article>
</body>
</html>`;
}

async function ensureLocalhostCertificate(
  certDir: string,
  keyPath: string,
  certPath: string
): Promise<void> {
  if (existsSync(keyPath) && existsSync(certPath)) {
    return;
  }

  await mkdir(certDir, { recursive: true });

  const primary = await runCommand([
    "openssl",
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-sha256",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "3650",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ]);

  if (primary.exitCode === 0) {
    return;
  }

  const opensslConfigPath = join(certDir, "localhost.openssl.cnf");
  const opensslConfig = [
    "[req]",
    "prompt = no",
    "distinguished_name = dn",
    "x509_extensions = v3_req",
    "",
    "[dn]",
    "CN = localhost",
    "",
    "[v3_req]",
    "subjectAltName = @alt_names",
    "",
    "[alt_names]",
    "DNS.1 = localhost",
    "IP.1 = 127.0.0.1",
  ].join("\n");
  await writeFile(opensslConfigPath, opensslConfig, "utf8");

  const fallback = await runCommand([
    "openssl",
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-sha256",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "3650",
    "-config",
    opensslConfigPath,
    "-extensions",
    "v3_req",
  ]);

  if (fallback.exitCode !== 0) {
    const message = fallback.stderr.trim() || primary.stderr.trim() || "openssl failed";
    throw new Error(message);
  }
}

async function ensureTrustedCertificate(certPath: string): Promise<{
  trusted: boolean;
  message: string | null;
}> {
  const verified = await runCommand([
    "security",
    "verify-cert",
    "-c",
    certPath,
    "-p",
    "ssl",
  ]);
  if (verified.exitCode === 0) {
    return {
      trusted: true,
      message: null,
    };
  }

  const keychainPath = join(homedir(), "Library", "Keychains", "login.keychain-db");
  const trust = await runCommand([
    "security",
    "add-trusted-cert",
    "-d",
    "-r",
    "trustRoot",
    "-k",
    keychainPath,
    certPath,
  ]);

  const afterTrust = await runCommand([
    "security",
    "verify-cert",
    "-c",
    certPath,
    "-p",
    "ssl",
  ]);

  if (afterTrust.exitCode === 0) {
    return {
      trusted: true,
      message: null,
    };
  }

  const trustError = trust.stderr.trim();
  const verifyError = afterTrust.stderr.trim();
  const message = trustError || verifyError
    || "TLS certificate is not trusted yet. Open Connectors and retry authorization.";
  return {
    trusted: false,
    message: `Local HTTPS certificate trust failed. ${message}`,
  };
}

async function runCommand(args: string[]): Promise<CommandResult> {
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    stdout,
    stderr,
    exitCode,
  };
}

function normalizeNullableString(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
