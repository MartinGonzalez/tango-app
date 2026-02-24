type SecurityRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type SecurityCommandRunner = (
  args: string[]
) => Promise<SecurityRunResult>;

export class KeychainStoreError extends Error {
  code: "not_found" | "command_failed";
  stderr: string;
  exitCode: number;
  args: string[];

  constructor(params: {
    code: "not_found" | "command_failed";
    message: string;
    stderr: string;
    exitCode: number;
    args: string[];
  }) {
    super(params.message);
    this.name = "KeychainStoreError";
    this.code = params.code;
    this.stderr = params.stderr;
    this.exitCode = params.exitCode;
    this.args = params.args;
  }
}

export class KeychainStore {
  #run: SecurityCommandRunner;

  constructor(run: SecurityCommandRunner = runSecurityCommand) {
    this.#run = run;
  }

  async setSecret(service: string, account: string, secret: string): Promise<void> {
    const args = [
      "add-generic-password",
      "-U",
      "-s",
      service,
      "-a",
      account,
      "-w",
      secret,
    ];
    const result = await this.#run(args);
    if (result.exitCode === 0) return;
    throw buildKeychainError("command_failed", result, args);
  }

  async getSecret(service: string, account: string): Promise<string | null> {
    const args = [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
    ];
    const result = await this.#run(args);
    if (result.exitCode === 0) {
      return result.stdout.replace(/\r?\n$/, "");
    }

    if (isSecurityItemNotFound(result.stderr)) {
      return null;
    }

    throw buildKeychainError("command_failed", result, args);
  }

  async deleteSecret(service: string, account: string): Promise<void> {
    const args = [
      "delete-generic-password",
      "-s",
      service,
      "-a",
      account,
    ];
    const result = await this.#run(args);
    if (result.exitCode === 0) return;
    if (isSecurityItemNotFound(result.stderr)) return;
    throw buildKeychainError("command_failed", result, args);
  }
}

function buildKeychainError(
  fallbackCode: "not_found" | "command_failed",
  result: SecurityRunResult,
  args: string[]
): KeychainStoreError {
  const code = isSecurityItemNotFound(result.stderr) ? "not_found" : fallbackCode;
  const stderr = result.stderr.trim();
  const message = stderr || `security command failed (${result.exitCode})`;
  return new KeychainStoreError({
    code,
    message,
    stderr,
    exitCode: result.exitCode,
    args,
  });
}

function isSecurityItemNotFound(stderr: string): boolean {
  const normalized = String(stderr ?? "").toLowerCase();
  return normalized.includes("could not be found")
    || normalized.includes("item not found")
    || normalized.includes("the specified item could not be found in the keychain");
}

async function runSecurityCommand(args: string[]): Promise<SecurityRunResult> {
  const proc = Bun.spawn(["security", ...args], {
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
