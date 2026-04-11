# GoTmpl Visual Editor — Roadmap

## Current State (as of 2026-04-11)

The repository is a working prototype of a Scratch-style visual editor for
Go `text/template` sources, with a Go/PostgreSQL backend and a vanilla-JS
module frontend.

### What exists

**Backend (Go 1.24, ~1,400 LOC)**
- `cmd/server/main.go` — HTTP server using `net/http.ServeMux` method-prefixed
  routing. No third-party router despite `PLAN.md` mentioning `gorilla/mux`.
- `internal/db/` — PostgreSQL connection, idempotent `CREATE TABLE IF NOT
  EXISTS` migrations, and first-run seeding of a default schema / collection /
  template / fixtures (`seed.go`, 314 lines).
- `internal/models/` — Structs for `Schema`, `TemplateCollection`,
  `Template`, `TemplateRevision`, `TestFixture`, and funcmap config. The
  `rendered` column is now `json:"-"` (matches commit 870cc23).
- `internal/handlers/` — CRUD for schemas, collections, templates (with
  revisions + restore), fixtures; `POST /api/validate`, `POST /api/render`,
  and the `POST /api/push` stub.
- `internal/codegen/codegen.go` — Server-side mirror of the client codegen
  walker; supports sequence, text, value, range (with `$var :=`), if/else,
  with/else, define, template, pipeline, html-wrapper, confluence-macro,
  and reporter-as-statement. Used to keep DB `rendered` column in sync.
- `internal/funcmap/funcmap.go` — Loads `funcmap_config.yaml`, builds a
  `template.FuncMap` of stubs for validation, with a real `sortBy`
  implementation.

**Frontend (~3,600 LOC of vanilla JS + 661 LOC CSS)**
- `static/index.html` — Three-panel layout with topbar, palette, workspace,
  and right-panel tabs (preview / render / fixtures) plus modals for version
  history, schema upload, new collection, new template.
- `static/js/workspace.js` — 1,254 lines; by far the biggest module.
  Implements drag/drop, drop zones, multi-select, copy/cut/paste, undo/redo,
  keyboard shortcuts, rendering, selection.
- `blocks.js`, `palette.js`, `schema.js`, `codegen.js`, `preview.js`,
  `versions.js`, `api.js`, `app.js` — each is relatively small and focused.
- Recent UI polish: autosizing text blocks, draggable variable chips on
  range headers with sub-property chips, HTML / Confluence wrapper blocks,
  keyboard shortcuts and shift-click multi-select.

**Config & docs**
- `funcmap_config.yaml` — starter funcmap definitions.
- `PLAN.md` — the original phased implementation plan (already largely
  executed).
- `.gitignore` — present.

### What is missing or weak

- **No tests anywhere.** `go test ./...` finds nothing; no JS tests either.
- **No README, LICENSE, CONTRIBUTING, Makefile, or Dockerfile.** New
  contributors have no run instructions other than reading `main.go`.
- **No CI.** Nothing enforces `go vet`, `go build`, or formatting.
- **No auth.** All API endpoints are open; `created_by` is client-supplied.
- **`POST /api/push` is a stub** and has no target integration.
- **`POST /api/render` accepts a raw template string + data** rather than the
  `template_id` + `fixture_id` form documented in `PLAN.md`. Nothing in the
  backend actually loads a template+fixture by ID and executes them together.
- **Real FuncMap implementations are stubs.** Only `sortBy` has a real
  implementation; everything else returns `""` or `nil`, so `/api/render`
  produces empty output for any template that calls real business logic.
- **`rendered` column is still written** on every create/update but is no
  longer served. Either keep it as a denormalised convenience for the push
  target or drop the column.
- **Codegen duplication.** `internal/codegen/codegen.go` (Go) and
  `static/js/codegen.js` (JS) are hand-maintained mirrors. Any drift is a
  silent bug; there's no shared fixture suite verifying they agree.
- **No JSON-schema validation of fixtures** against the collection's schema,
  despite the plan mentioning it.
- **`workspace.js` is 1.2k lines**, handling drag-drop, selection, clipboard,
  undo/redo, and DOM rendering all in one module.
- **No request validation / CSRF / rate limiting / CORS config** on the API.
- **No structured logging, metrics, or error reporting.**
- **Database migrations are a single embedded SQL string.** No versioning,
  no down migrations, no way to evolve the schema safely in production.
- **The default `http.ServeMux`** is used directly, so no middleware chain
  for logging, recovery, request IDs, or auth.

---

## Roadmap

Ordered by dependency and value. Items in each milestone are independent
enough to parallelise, but milestones build on each other.

### M1 — Project hygiene (unblocks everyone)

1. **README** with: what it is, prerequisites (Go 1.24, Postgres 14+),
   `DATABASE_URL` env, `go run ./cmd/server`, default port, screenshot.
2. **Makefile** or `justfile`: `run`, `build`, `test`, `lint`, `fmt`,
   `db-up` (docker compose postgres).
3. **docker-compose.yml** with Postgres 16 + the app, so contributors can
   `docker compose up` and hit `localhost:8080`.
4. **Dockerfile** for the Go binary (multi-stage, distroless).
5. **LICENSE** (confirm with owner — likely MIT or Apache-2.0).
6. **GitHub Actions CI** — `go vet`, `go build`, `go test`, `gofmt -l`,
   and a JS lint step (e.g. `eslint` or `biome`).
7. **Delete `PLAN.md`** or move it to `docs/history/PLAN.md`; it describes
   the now-shipped MVP and confuses new readers.

### M2 — Test coverage for the critical paths

1. **Codegen golden tests in Go.** Build a suite of `{blockTreeJSON,
   expectedTemplateSource}` fixtures under `internal/codegen/testdata/`
   and assert the walker round-trips. Cover every block type at least once,
   including nested range/with/if, pipelines, html-wrapper, confluence-macro.
2. **Shared fixtures for client/server codegen.** Serve the same JSON
   fixtures to a small JS test runner (e.g. `node --test`) so
   `static/js/codegen.js` is verified against the exact same expected
   template source as the Go walker. This kills the silent-drift risk.
3. **Handler tests** using `httptest` + a throwaway Postgres (either
   `testcontainers-go` or a `TEST_DATABASE_URL`). At minimum: create schema
   → create collection → create template → update → list revisions → restore.
4. **Validate/render tests** covering the stub funcmap paths and the real
   `sortBy` function.

### M3 — API correctness & consistency with PLAN.md

1. **`POST /api/render` by ID.** Accept `{template_id, fixture_id}`,
   load both from the DB, run codegen on the block tree, execute with the
   fixture data, return `{rendered, error}`. Keep the existing raw-template
   form as `POST /api/render/raw` if anything in the UI still needs it,
   or delete it.
2. **Decide the fate of the `rendered` column.** Either (a) remove the
   column + backfill migration, since `block_tree` is the source of truth;
   or (b) keep it but document it as a "last compiled output" cache used
   only by the push target.
3. **Fixture validation.** Validate posted fixture JSON against the
   collection's JSON schema on create/update, return a structured 422 on
   failure. Use a real JSON-schema library (e.g.
   `github.com/santhosh-tekuri/jsonschema/v5`).
4. **Consistent error envelope.** `{error: {code, message, details?}}`
   across all handlers instead of the current mix of `httpError` and
   inline maps.
5. **Input validation middleware / helpers.** Reject unknown fields
   (`json.Decoder.DisallowUnknownFields`), enforce max body size, require
   content-type.

### M4 — Production readiness

1. **Middleware chain.** Logging (request id, method, path, status,
   duration), panic recovery, CORS (configurable origins), optional auth.
2. **Structured logs.** Replace `log.Printf` with `log/slog` and JSON
   output when `ENV=production`.
3. **Versioned migrations.** Switch to `golang-migrate` or `pressly/goose`
   with numbered up/down files under `internal/db/migrations/*.sql`.
   Keep the current embedded block as migration `0001_init.sql`.
4. **Graceful shutdown.** `http.Server` with `ReadHeaderTimeout`,
   `IdleTimeout`, and `Shutdown` on SIGTERM.
5. **Config surface.** Collect env vars in a single `internal/config`
   package; fail loudly on required-but-missing values.
6. **Healthcheck endpoints.** `/healthz` (process up) and `/readyz`
   (DB ping).

### M5 — Auth & multi-user

1. **Minimal auth.** Header-based service token for machine callers plus
   a session cookie for the web UI. OIDC is overkill until there are
   users asking for it.
2. **`created_by` from the session** instead of from the request body.
3. **Per-collection ACLs** if multi-tenant becomes a real requirement
   (defer until asked).

### M6 — Push integration

1. **Pluggable push targets.** Define a `PushTarget` interface
   (`Push(ctx, rendered, meta) error`) and register targets by name.
2. **First real target: Confluence.** Given that `confluence-macro`
   blocks already exist, wire up a Confluence REST API client that
   creates or updates a page from the rendered storage-format XHTML.
3. **Dry-run mode.** Return the final payload without hitting the target,
   so the UI can show "what would be pushed".
4. **Push history.** A `template_pushes` table: which template, which
   revision, which fixture, which target, response, timestamp.

### M7 — FuncMap reality

1. **Real implementations.** The current `BuildStubFuncMap` is fine for
   validation, but a separate `BuildExecFuncMap` should back render/push
   with the actual functions. Keep the stub path for `/api/validate` so
   validation doesn't hit real systems.
2. **Plugin hook.** Let application code register additional functions at
   startup without editing `internal/funcmap`, e.g. a
   `funcmap.Register(name, impl)` API called from `main.go`.
3. **Document the YAML shape** in `funcmap_config.yaml` with comments,
   and validate it on load (duplicate names, unknown categories, etc.).

### M8 — Frontend refactor & polish

1. **Break up `workspace.js`.** Target modules:
   - `workspace/tree.js` — block tree ops, undo/redo.
   - `workspace/dnd.js` — drag, drop zones, drop handling.
   - `workspace/selection.js` — multi-select, shift-click, copy/cut/paste.
   - `workspace/render.js` — DOM rendering of the tree.
2. **Adopt a build step only if needed.** Plain ESM is fine today; defer
   Vite/esbuild until bundle size or TS becomes justified.
3. **Keyboard-accessible drag-drop.** Today it's mouse-only; add Enter to
   pick, arrow keys to move, Enter to drop. Useful for testing too.
4. **Undo/redo for fixture edits**, not just the block tree.
5. **Proper diff view.** `versions.js` currently shows two `<pre>` blocks
   side by side. Either highlight differences (a small LCS diff is enough)
   or switch to a line-level diff library.
6. **Error surfaces.** When `/api/validate` fails, point to the offending
   block in the workspace, not just text in the preview panel.

### M9 — Nice-to-haves (defer until asked)

- Collaborative editing via websockets.
- Template import from an existing `.tmpl` file (parse into blocks).
- Export to a Go package (`//go:embed` + a generated `Register()` func).
- Rich preview that actually renders the Confluence storage format.
- Block snippets / templates within the editor ("insert common header").
- Observability: Prometheus metrics, OpenTelemetry traces.
- Dark mode.

---

## Recommended first PRs (small, high leverage)

1. **README + Makefile + docker-compose** (M1 items 1–3). Unblocks
   everyone else and takes an afternoon.
2. **Codegen golden tests in Go** (M2 item 1). Locks behaviour before
   refactors and is a self-contained change.
3. **Shared codegen fixtures between Go and JS** (M2 item 2). Eliminates
   the silent-drift class of bugs.
4. **`/api/render` by ID + delete or rename the raw form** (M3 item 1).
   Small, visible, brings the code back in line with `PLAN.md` and the
   frontend.
5. **Structured error envelope + `DisallowUnknownFields`** (M3 items 4–5).
   Cheap hardening that every future handler benefits from.
