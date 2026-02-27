# Hello UI Instrument

Example instrument that uses `@tango/instrument-ui` primitives.

## Structure

```text
developers/examples/hello-ui-instrument
  package.json
  src/index.ts
  dist/index.js
  dist/backend.js
```

## Build frontend bundle

```bash
cd developers/examples/hello-ui-instrument
bun install
bun run build
```

`dist/index.js` must be a bundled single-file frontend module for Tango runtime.

## Install in Tango

1. Open `Instruments`.
2. Click `+`.
3. Select `developers/examples/hello-ui-instrument`.
4. Activate `Hello UI`.
