/**
 * Handles dev-reload requests from `tango-sdk dev`.
 * When an instrument is rebuilt externally, this module triggers a reload
 * of the instrument in the running app.
 */

import type { InstrumentRegistryEntry } from "../../../shared/types/instruments.ts";

export type DevReloadRequest = {
  instrumentId: string;
  installPath: string;
};

export type DevReloadResult = {
  ok: boolean;
  message: string;
  entries?: InstrumentRegistryEntry[];
};

export type DevReloadHandler = (request: DevReloadRequest) => Promise<DevReloadResult>;

let handler: DevReloadHandler | null = null;

export function setDevReloadHandler(h: DevReloadHandler): void {
  handler = h;
}

/**
 * Deps for the handler logic, making it testable without Electrobun/runtime.
 */
export type DevReloadHandlerDeps = {
  get: (instrumentId: string) => InstrumentRegistryEntry | null;
  installDevOverride: (path: string) => Promise<InstrumentRegistryEntry>;
  list: () => InstrumentRegistryEntry[];
  sendDevReload: (msg: { instrumentId: string; entries?: InstrumentRegistryEntry[] }) => void;
};

/**
 * Creates the dev-reload handler logic as a pure function for testability.
 */
export function createDevReloadHandler(deps: DevReloadHandlerDeps): DevReloadHandler {
  return async ({ instrumentId, installPath }) => {
    const devId = `${instrumentId}::dev`;
    const isReload = !!deps.get(devId);
    const verb = isReload ? "Reloaded" : "Auto-installed";

    try {
      const devEntry = await deps.installDevOverride(installPath);
      const entries = deps.list();
      // Send devId so the frontend knows which entry to activate
      deps.sendDevReload({ instrumentId: devEntry.id, entries });
      console.log(`[dev-reload] ${verb} '${devId}' (dev override, marketplace untouched)`);
      return { ok: true, message: `${verb} ${instrumentId}`, entries };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[dev-reload] Install failed for '${instrumentId}': ${message}`);
      return { ok: false, message };
    }
  };
}

export async function handleDevReload(req: Request): Promise<Response> {
  if (!handler) {
    return new Response(
      JSON.stringify({ ok: false, message: "No dev-reload handler registered" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json() as Partial<DevReloadRequest>;
    const instrumentId = String(body.instrumentId ?? "").trim();
    const installPath = String(body.installPath ?? "").trim();

    if (!instrumentId || !installPath) {
      return new Response(
        JSON.stringify({ ok: false, message: "instrumentId and installPath are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await handler({ instrumentId, installPath });
    return new Response(
      JSON.stringify(result),
      { status: result.ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
