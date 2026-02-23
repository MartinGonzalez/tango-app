# Claude Watcher Server

Local Node.js API server used by Claude Watcher desktop to track Claude processes and session events.

## Requirements

- Node.js 18+

## Install

```bash
cd server
npm install
```

## Run

```bash
npm start
```

Default URL: `http://localhost:4242`

## Test

```bash
npm test
```

## Environment Variables

- `PORT` (default: `4242`): HTTP port
- `POLL_MS` (default: `2000`): process scan interval in milliseconds

## API Endpoints

- `GET /health`: health check (`{ "ok": true }`)
- `GET /`: service metadata JSON
- `GET /api/snapshot`: current processes/tasks/subagents snapshot
- `POST /api/events`: ingest Claude lifecycle/task hook events
- `POST /api/focus`: request macOS app focus by app name

## Notes

- This server is API-only.
- No web dashboard is served from this module.
