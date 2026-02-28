# Tango Developers Docs

Local documentation website for Tango Instruments.

## Run locally

From repository root:

```bash
npm run dev:docs
```

Then open:

```text
http://localhost:4173
```

## Scope

- Instrument architecture and mental model
- Manifest format (`package.json` + `tango.instrument`)
- Frontend declarative contract (`defineInstrument`)
- Backend typed actions contract (`kind: tango.instrument.backend.v2`)
- SDK API overview (`@tango/instrument-sdk` + `@tango/instrument-sdk/react`)
- `tango-sdk sync` flow to generate `tango-env.d.ts` from manifest settings
- Local path installation flow
- Minimal runnable examples:
  - `developers/examples/hello-instrument` (runtime minimum)
  - `developers/examples/hello-ui-instrument` (`@tango/instrument-ui` primitives)
- Tasks pilot notes (fully decoupled runtime instrument)

Publishing/marketplace flow is intentionally not covered in this phase.
