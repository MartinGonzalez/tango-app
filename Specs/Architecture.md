# Tango Desktop Architecture

## Overview

Tango Desktop is an Electrobun app (Bun + WebKit) with two processes:

- **Main process** (`src/bun/index.ts`): Bun runtime. Manages windows, spawns Claude CLI sessions, runs the approval server, handles instrument backend modules, and syncs the instrument registry.
- **WebView process** (`src/mainview/index.ts`): Browser runtime. Renders the UI, manages panel layout, mounts instrument frontends, and routes host events.

Communication between processes uses Electrobun's RPC system (`BrowserView.defineRPC` in main, `Electroview.defineRPC` in webview).

---

## Panel System

### Layout: PanelLayout

`PanelLayout` (`src/mainview/components/panel-layout.ts`) creates a horizontal resizable layout with three panels:

| Panel ID   | Role                   | Default Width | Min Width |
|------------|------------------------|---------------|-----------|
| `sidebar`  | Navigation + controls  | 20%           | 220px     |
| `first`    | Primary content        | 35%           | 300px     |
| `second`   | Secondary content      | 45%           | 300px     |

PanelLayout handles:
- **Show/hide** via `showPanel(id)` / `hidePanel(id)` / `togglePanel(id)`
- **Drag-to-resize** between adjacent visible panels
- **Fixed sizing** via `setPanelSizing(id, { fixedPercent, resizable })`
- **Keyboard shortcuts**: Cmd+1 toggles sidebar, Cmd+2 toggles first panel

PanelLayout is purely structural. It does not know what content is inside each panel.

### Content: PanelSlotManager

`PanelSlotManager` (`src/mainview/components/panel-slot-manager.ts`) manages what lives _inside_ each panel. Each panel (slot) has two regions:

```
+--------------------------+
| header  (flex-shrink: 0) |  <- toolbar buttons, controls
+--------------------------+
| body    (flex: 1)        |  <- main content area
+--------------------------+
```

**API:**

```typescript
mount(slot, owner, { node, onUnmount? })       // Mount into body region
mountHeader(slot, owner, { node, onUnmount? })  // Mount into header region
unmount(slot)                                    // Clear both header + body
unmountHeader(slot)                              // Clear header only
unmountConsumer(owner)                           // Clear all regions owned by this consumer
unmountAll()                                     // Clear every region in every slot
getOwner(slot)                                   // Current body owner
getHost(slot)                                    // Body host element (escape hatch)
getHeaderHost(slot)                              // Header host element (escape hatch)
```

**Rules:**
- Each region has exactly one owner at a time
- Mounting always unmounts the previous owner first
- `onUnmount` callbacks are called when content is removed
- DOM nodes are re-parented (not cloned), preserving internal state

### Mode Activation Pattern

Every view mode has an activation function that follows the same pattern:

```typescript
async function activateStagesMode(): Promise<void> {
  await slotManager.unmountAll();   // 1. Clear everything
  await slotManager.mount(...)      // 2. Mount what this mode needs
  panelLayout.showPanel(...)        // 3. Ensure panels are visible
  panelLayout.setPanelSizing(...)   // 4. Configure sizing
}
```

The `unmountAll()` at the start is critical — it prevents stale content from one mode leaking into another.

**Mode-to-slot mapping:**

| Mode            | sidebar        | first (header) | first (body)       | second (header) | second (body)      |
|-----------------|----------------|----------------|--------------------|-----------------|--------------------|
| stages          | sidebarShell   | _(empty)_      | chatView           | diffToolbar     | diffView           |
| plugins         | sidebarShell   | _(empty)_      | pluginsPreview     | _(empty)_       | _(empty)_          |
| prs             | sidebarShell   | _(empty)_      | prView             | diffToolbar     | diffView           |
| connectors      | sidebarShell   | _(empty)_      | connectorsView     | _(empty)_       | _(empty)_          |
| instruments     | sidebarShell   | _(empty)_      | _(empty)_          | _(empty)_       | _(empty)_          |
| (runtime inst.) | inst. sidebar  | _(per inst.)_  | _(per inst.)_      | _(per inst.)_   | _(per inst.)_      |

---

## Instruments (Extensions)

Instruments are self-contained extensions that plug into Tango via the slot system. They have zero coupling with the host application's core code.

### Structure

Each instrument lives in `instruments/<name>/` and has:

```
instruments/tasks/
  package.json          # Manifest (tango.instrument config)
  src/
    index.tsx           # Frontend entry (browser target)
    backend.ts          # Backend entry (bun target, optional)
  dist/
    index.js            # Built frontend bundle
    backend.js          # Built backend bundle
```

### Manifest

The `tango.instrument` field in `package.json` defines the instrument:

```json
{
  "tango": {
    "instrument": {
      "id": "tasks",
      "name": "Tasks",
      "group": "Core",
      "runtime": "react",
      "entrypoint": "./dist/index.js",
      "backendEntrypoint": "./dist/backend.js",
      "hostApiVersion": "2.0.0",
      "panels": {
        "sidebar": true,
        "first": true,
        "second": false,
        "right": false
      },
      "permissions": [
        "storage.files",
        "storage.db",
        "storage.properties",
        "sessions"
      ],
      "launcher": {
        "sidebarShortcut": {
          "enabled": true,
          "label": "Tasks",
          "icon": "task",
          "order": 20
        }
      }
    }
  }
}
```

### Discovery

The main process discovers instruments automatically by scanning the `instruments/` directory. A directory is recognized as an instrument if its `package.json` contains a `tango.instrument.id` field. This means:

- No hardcoded list of instrument names in the host
- Adding a new instrument = creating a directory with a valid manifest
- Non-instrument directories (`sdk`, `ui`, `node_modules`) are safely skipped

Discovery result is synced to a registry file at `~/.tango/instruments/registry.json`, which the webview reads at runtime.

### Registry

The registry (`InstrumentRegistryFile`) is the single source of truth at runtime:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "tasks",
      "name": "Tasks",
      "panels": { "sidebar": true, "first": true, "second": false, "right": false },
      "permissions": ["storage.files", "storage.db", ...],
      "enabled": true,
      "status": "active",
      "installPath": "/absolute/path/to/instruments/tasks",
      "entrypoint": "./dist/index.js",
      ...
    }
  ]
}
```

The webview reads `panels` from the registry to decide which slots an instrument occupies. Changing panel config requires updating both `package.json` (source of truth for builds) and the registry (runtime truth, synced on startup).

### Frontend Loading

1. Webview reads the registry and renders launcher icons in the sidebar
2. User clicks an instrument icon
3. `activateRuntimeInstrument(entry)` is called:
   - Calls `deactivateRuntimeInstrument()` to clean up the previous instrument
   - Calls `loadInstrumentDefinition(entry)` which `import()`s the instrument's `dist/index.js` via file:// URL (with cache-busting timestamp)
   - Validates the module exports `kind: "tango.instrument.v2"`
   - Builds the `InstrumentFrontendAPI` for this instrument (scoped by permissions)
   - Calls `onStart(api)` lifecycle hook
   - For each declared panel (`entry.panels[slot] === true`), calls the panel component function with `{ api }` and mounts the returned node via `slotManager.mount()`

### Frontend API

Each instrument receives a scoped `InstrumentFrontendAPI`:

```typescript
{
  instrumentId: string;
  permissions: InstrumentPermission[];
  storage: StorageAPI;          // Key-value, file, and SQLite storage
  sessions: SessionsAPI;        // Start, kill, follow-up Claude sessions
  connectors: ConnectorsAPI;    // OAuth connector management
  stages: StageAPI;             // List/get active stages
  events: HostEventsAPI;        // Subscribe to host events
  actions: InstrumentActionsAPI; // Call backend actions
  settings: InstrumentSettingsAPI; // Read/write instrument settings
  registerShortcut: (shortcut) => void;
  emit: (event) => void;       // Emit events to other instruments
}
```

**Permission enforcement**: Every API call checks the instrument's declared permissions. For example, `sessions.start()` requires the `"sessions"` permission. Event subscriptions check permissions via `FRONTEND_EVENT_PERMISSION_MAP`.

### React Runtime

The SDK provides a React layer (`@tango/instrument-sdk/react`) that wraps the vanilla panel system:

- `defineReactInstrument({ panels, defaults, lifecycle })` converts React components into `TangoPanelComponent` functions
- Each React panel gets its own `createRoot()` with `InstrumentApiProvider`
- `useInstrumentApi()` hook accesses the scoped API from any component
- `useHostEvent(event, handler)` subscribes to host events with automatic cleanup
- `useInstrumentAction(name)` calls backend actions
- `useInstrumentSettings()` reads/writes instrument settings with loading state

### Backend Modules

Instruments can optionally declare a `backendEntrypoint` that runs in the main (Bun) process. Backend modules:

- Export `defineBackend({ kind, actions, onStart?, onStop? })`
- Define named **actions** that the frontend calls via `api.actions.call(name, input)`
- Receive an `InstrumentBackendContext` with the same storage/sessions/events APIs
- Run with full Bun capabilities (file system, network, native modules)

---

## Communication Patterns

### RPC (Main <-> WebView)

Electrobun RPC for cross-process communication:

```
Main Process                    WebView
     |                            |
     |-- message: snapshotUpdate ->|  (push: main -> webview)
     |<- request: startSession ---|  (pull: webview -> main)
     |-- response: { sessionId } ->|
```

- **Messages** (fire-and-forget): `snapshotUpdate`, `sessionStream`, `toolApproval`, `instrumentEvent`
- **Requests** (request-response): `startSession`, `killSession`, `getInstrumentFrontendSource`, `instrumentActionCall`

### Host Event Bus (WebView-internal)

An in-process pub/sub system for instrument event delivery:

```typescript
publishFrontendHostEvent(event, payload)    // Broadcast to all subscribers
subscribeFrontendHostEvent(entry, event, handler)  // Subscribe (permission-checked)
```

**Available events:**

| Event                           | Permission Required    | Description                          |
|---------------------------------|------------------------|--------------------------------------|
| `snapshot.update`               | `stages.observe`       | Watcher server snapshot              |
| `session.stream`                | `sessions`             | Claude streaming output              |
| `session.idResolved`            | `sessions`             | Temp session ID resolved to real ID  |
| `session.ended`                 | `sessions`             | Session exited                       |
| `tool.approval`                 | `sessions`             | Tool approval request                |
| `pullRequest.agentReviewChanged`| `stages.observe`       | PR review status changed             |
| `instrument.event`              | `stages.observe`       | Cross-instrument event               |
| `stage.added`                   | `stages.observe`       | New stage opened                     |
| `stage.removed`                 | `stages.observe`       | Stage closed                         |
| `stage.selected`                | `stages.observe`       | Stage metadata loaded (branch, HEAD SHA, change counts) |
| `connector.auth.changed`        | `connectors.read`      | OAuth connector status changed       |

### Cross-Instrument Events

Instruments communicate with each other through the `instrument.event` channel:

```
Instrument A                Host Event Bus              Instrument B
     |                            |                          |
     |-- api.emit({ event, payload }) ->|                    |
     |                            |-- instrument.event ->----|
     |                            |   { instrumentId, event, payload }
```

1. Instrument A calls `api.emit({ event: "tasks.selection", payload: { taskId } })`
2. Host publishes `instrument.event` with `{ instrumentId: "tasks", event: "tasks.selection", payload }`
3. Instrument B (subscribed via `api.events.subscribe("instrument.event", handler)`) receives the event

---

## Permissions

Instruments declare required permissions in their manifest. The host enforces them at every API call boundary.

| Permission                    | Grants Access To                                    |
|-------------------------------|-----------------------------------------------------|
| `storage.properties`          | Key-value property storage                          |
| `storage.files`               | File read/write within instrument sandbox           |
| `storage.db`                  | SQLite database queries                             |
| `sessions`                    | Start, kill, send follow-ups to Claude sessions     |
| `connectors.read`             | List stage connectors, check authorization status   |
| `connectors.credentials.read` | Read connector credentials (tokens)                 |
| `connectors.connect`          | Initiate OAuth flows                                |
| `stages.read`                 | List stages, get active stage                       |
| `stages.observe`              | Subscribe to stage/snapshot events                  |

---

## Storage Isolation

Each instrument gets sandboxed storage, scoped by `instrumentId`:

- **Properties**: Key-value pairs stored via `storage.getProperty` / `storage.setProperty`
- **Files**: Read/write files within the instrument's storage directory
- **SQLite**: Per-instrument database via `storage.sqlQuery` / `storage.sqlExecute`

Instruments cannot access each other's storage.

---

## Data Flow Summary

```
                          ┌─────────────────────┐
                          │    Instrument SDK    │
                          │  (build-time only)   │
                          └──────────┬──────────┘
                                     │ defines
                    ┌────────────────┼────────────────┐
                    │                │                 │
              instruments/     instruments/      instruments/
              hello-claude/       tasks/            .../
                    │                │                 │
                    └────────────────┼────────────────┘
                                     │ discovered by
                          ┌──────────┴──────────┐
                          │   Main Process (Bun) │
                          │   src/bun/index.ts   │
                          │                      │
                          │ - Auto-discovery      │
                          │ - Registry sync       │
                          │ - Backend modules     │
                          │ - Session management  │
                          │ - Approval server     │
                          └──────────┬──────────┘
                                     │ RPC
                          ┌──────────┴──────────┐
                          │  WebView (Browser)   │
                          │  src/mainview/       │
                          │                      │
                          │ ┌──────────────────┐ │
                          │ │   PanelLayout    │ │  <- structural (show/hide/resize)
                          │ └────────┬─────────┘ │
                          │ ┌────────┴─────────┐ │
                          │ │ PanelSlotManager │ │  <- content (mount/unmount)
                          │ └────────┬─────────┘ │
                          │     ┌────┼────┐      │
                          │  sidebar first second │  <- slots
                          │     │    │    │      │
                          │  [header][header][header]
                          │  [ body ][ body ][ body ]
                          └──────────────────────┘
```
