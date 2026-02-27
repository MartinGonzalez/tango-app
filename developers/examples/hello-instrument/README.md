# Hello Instrument (Minimal Example)

This is a tiny Tango instrument used in the docs.

## Files

- `package.json`: instrument manifest (`tango.instrument`)
- `dist/index.js`: frontend lifecycle (`activate`, `deactivate`)
- `dist/backend.js`: backend `invoke` handler (`ping`)

## Install locally

1. Open Tango
2. Go to **Instruments**
3. Click **+**
4. Select this folder:

```text
developers/examples/hello-instrument
```

5. Click **Hello** from the Instruments list.
6. Verify hot-mount behavior:
- Sidebar is replaced by instrument sidebar content.
- Second panel renders Hello content.
- `Ping backend` returns JSON payload in the panel.
