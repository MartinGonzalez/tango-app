/**
 * Handles dev-reload requests from `tango-sdk dev`.
 * When an instrument is rebuilt externally, this module triggers a reload
 * of the instrument in the running app.
 */

export type DevReloadRequest = {
  instrumentId: string;
  installPath: string;
};

export type DevReloadHandler = (request: DevReloadRequest) => Promise<{ ok: boolean; message: string }>;

let handler: DevReloadHandler | null = null;

export function setDevReloadHandler(h: DevReloadHandler): void {
  handler = h;
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
