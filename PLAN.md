# GoTmpl Visual Editor — Implementation Plan

## Phase 1: Project Scaffolding & Backend Foundation

### 1.1 Go project setup
- `go mod init gotmpl-editor`
- Dependencies: `github.com/lib/pq` (PostgreSQL driver), `github.com/gorilla/mux` (router), standard library
- Directory structure:
  ```
  cmd/server/main.go        ← entry point
  internal/
    db/db.go                ← PostgreSQL connection, migrations
    db/migrations.go        ← Schema creation SQL
    handlers/schemas.go     ← Schema API handlers
    handlers/collections.go ← Collection API handlers
    handlers/templates.go   ← Template API handlers
    handlers/validate.go    ← Validation & preview handlers
    handlers/fixtures.go    ← Test fixture handlers
    handlers/push.go        ← Stub push endpoint
    models/models.go        ← Data structs
    funcmap/funcmap.go      ← FuncMap config loader
    codegen/codegen.go      ← Block tree → Go template string (server-side)
  funcmap_config.yaml       ← Developer-managed FuncMap definitions
  static/                   ← All frontend files (served as static)
  ```

### 1.2 Database schema (PostgreSQL)
```sql
CREATE TABLE schemas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    version     TEXT NOT NULL,
    json_schema JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(name, version)
);

CREATE TABLE template_collections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id   UUID REFERENCES schemas(id),
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id   UUID REFERENCES template_collections(id),
    name            TEXT NOT NULL,
    block_tree      JSONB NOT NULL DEFAULT '{"type":"sequence","children":[]}',
    rendered        TEXT NOT NULL DEFAULT '',
    revision        INT NOT NULL DEFAULT 1,
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE template_revisions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES templates(id),
    revision    INT NOT NULL,
    block_tree  JSONB NOT NULL,
    rendered    TEXT NOT NULL,
    created_by  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    comment     TEXT
);

CREATE TABLE test_fixtures (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id   UUID REFERENCES template_collections(id),
    name            TEXT NOT NULL,
    data            JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 1.3 FuncMap config file (`funcmap_config.yaml`)
```yaml
functions:
  - name: lookupUser
    description: "Fetch user display name by ID"
    args:
      - name: userID
        type: string
    returns: string
    category: lookup
    block:
      shape: reporter
      color: "#4CAF50"

  - name: formatDate
    description: "Format a date string"
    args:
      - name: date
        type: string
      - name: layout
        type: string
    returns: string
    category: formatting
    block:
      shape: reporter
      color: "#4CAF50"
```
- Loaded at server startup
- Served via `GET /api/funcmap` endpoint
- Frontend reads this to build FuncMap blocks in the palette

### 1.4 Backend API endpoints
All endpoints prefixed `/api/`, JSON request/response.

**Schemas:**
- `GET /api/schemas` — list all
- `POST /api/schemas` — create (accepts JSON schema paste/upload)
- `GET /api/schemas/:id` — get one
- `PUT /api/schemas/:id` — update

**Collections:**
- `GET /api/schemas/:id/collections` — list for schema
- `POST /api/collections` — create
- `GET /api/collections/:id` — get with template list
- `PUT /api/collections/:id` — update

**Templates:**
- `GET /api/templates/:id` — get latest
- `POST /api/templates` — create
- `PUT /api/templates/:id` — save (auto-creates revision)
- `GET /api/templates/:id/revisions` — list revisions
- `GET /api/templates/:id/revisions/:rev` — get specific revision
- `POST /api/templates/:id/restore/:rev` — restore (creates new revision)

**Validation & Render:**
- `POST /api/validate` — compile template, return errors
  - Body: `{ "template": "{{.Foo}}", "schema_id": "..." }`
  - Uses real `text/template` compilation with registered FuncMap stubs
- `POST /api/render` — execute template with fixture data
  - Body: `{ "template_id": "...", "fixture_id": "..." }`
  - Returns `{ "rendered": "<xhtml>...</xhtml>" }`

**Test Fixtures:**
- `GET /api/collections/:id/fixtures` — list fixtures for collection
- `POST /api/fixtures` — create fixture
- `PUT /api/fixtures/:id` — update
- `DELETE /api/fixtures/:id` — delete

**Push (stub):**
- `POST /api/push` — stub endpoint
  - Body: `{ "template_id": "...", "fixture_id": "..." }`
  - Returns `{ "status": "stub", "message": "Push integration not yet configured" }`

**FuncMap:**
- `GET /api/funcmap` — returns loaded funcmap_config.yaml as JSON

---

## Phase 2: Frontend — HTML Shell & CSS

### 2.1 `static/index.html`
Three-panel layout:
- **Left panel**: Block palette (categorized toolbox)
- **Center panel**: Workspace canvas (drag-drop area)
- **Right panel**: Preview + properties

Top bar: Schema selector, collection selector, template selector, save button, version history button.

### 2.2 `static/css/editor.css`
- CSS custom properties for block colors (from architecture)
- Three-panel flexbox layout
- Block shapes via CSS: stack blocks (flat), reporter blocks (rounded/oval), C-blocks (with mouth)
- Drop zone indicators (blue highlight lines)
- Drag ghost styling
- Responsive within reason (minimum 1024px width)
- Palette category accordion styling
- Version history modal/panel styling

---

## Phase 3: Frontend — Core JS Modules

### 3.1 `static/js/api.js`
- `fetch()` wrapper with error handling
- Methods for all backend endpoints
- Minimal: just thin wrappers around fetch

### 3.2 `static/js/blocks.js`
- `Block` class: `{ id, type, category, config, children, parent, slots }`
- `BLOCK_DEFS` — hardcoded definitions for built-in blocks:
  - **Text**: raw text input (stack block)
  - **Value**: schema field path (reporter block)
  - **Control**: `if`, `else`, `range`, `with`, `define`, `block`, `template` (C-blocks)
  - **Operators**: `eq`, `ne`, `lt`, `gt`, `le`, `ge`, `and`, `or`, `not` (reporter)
  - **Builtins**: `len`, `index`, `slice`, `printf`, `html`, `js`, `urlquery` (reporter)
  - **Pipeline**: pipe connector (cyan)
  - **Literals**: string, number, bool constants (reporter)
- FuncMap blocks loaded from `/api/funcmap` at runtime
- `BlockRegistry`, `BlockFactory.create(type, config)`
- `toJSON()` / `fromJSON()` serialization

### 3.3 `static/js/schema.js`
- `parseSchema(jsonSchema)` → list of dot-paths with types
- Handles `$ref`, `allOf`, `oneOf`, nested objects, arrays
- Generates value block definitions for each path
- Triggers palette rebuild when schema changes

### 3.4 `static/js/palette.js`
- Renders categorized block list in left panel
- Categories: Text, Values (schema-driven), Control, Functions (from config), Operators, Builtins, Pipeline, Literals
- Collapsible category sections
- Search/filter box
- Dragging from palette creates a clone (stamp behavior)

### 3.5 `static/js/workspace.js`
- Manages the block tree (sequence of connected blocks)
- Drop zones: between blocks, inside C-block mouths, inside reporter slots
- Visual snap indicators on dragover
- Undo/redo stack (block tree JSON snapshots)
- Keyboard: Delete to remove selected block, Ctrl+Z undo, Ctrl+Y redo
- Event delegation on workspace container
- Re-renders only changed subtrees on drop

### 3.6 `static/js/codegen.js`
- Pure function: `generate(blockTree)` → Go template source string
- Recursive walker over block tree JSON
- Handles all block types → correct Go template syntax
- Whitespace/indentation handling

### 3.7 `static/js/preview.js`
- Right panel: shows generated Go template source
- Syntax highlighting (basic: actions in color, text in default)
- Calls `POST /api/validate` on change (debounced 150ms)
- Shows validation errors inline
- "Test Render" button: calls `/api/render` with selected fixture
- "Push" button: calls `/api/push` (stub)
- Fixture selector dropdown

### 3.8 `static/js/versions.js`
- Version history panel/modal
- List all revisions for current template
- Side-by-side diff of rendered template text between two revisions
- Restore button (calls restore endpoint, reloads workspace)
- Shows revision metadata (date, comment)

### 3.9 `static/js/app.js`
- Boot: initialize all modules
- Wire up event listeners
- Load initial data (schemas, collections, funcmap)
- Schema selector → rebuilds palette values
- Collection selector → loads templates
- Template selector → loads block tree into workspace
- Auto-save debounced, or explicit save button

---

## Phase 4: Drag & Drop Implementation

### 4.1 Palette → Workspace drag
- `dragstart` on palette block: set dataTransfer with block type + config, create ghost
- `dragover` on workspace: find nearest valid drop zone, show indicator
- `drop`: create block via factory, insert into tree, re-render, trigger codegen

### 4.2 Workspace internal drag (rearrange)
- `dragstart` on existing block: detach from tree, set dataTransfer
- Same dragover/drop logic as palette drag
- Reattach at new position

### 4.3 Drop zone logic
- Between stack blocks: horizontal blue line indicator
- Inside C-block mouth: highlight mouth area
- Inside reporter slot: highlight slot oval
- Invalid drops: no indicator, drop rejected

---

## Phase 5: Integration & Polish

### 5.1 Validation flow
- On every block tree change (debounced):
  1. Run codegen client-side
  2. Update preview panel with generated source
  3. POST to `/api/validate` with generated source
  4. Show errors/success in preview panel

### 5.2 Test render flow
- Admin selects a fixture from dropdown (loaded from `/api/collections/:id/fixtures`)
- Clicks "Test Render"
- Backend compiles template, executes with fixture data, returns XHTML
- Rendered XHTML shown in a read-only panel/modal

### 5.3 Push stub
- "Push to Confluence" button
- Calls `/api/push` stub
- Shows stub response message

### 5.4 Fixture management
- Simple CRUD UI for test fixtures per collection
- JSON editor (textarea) for fixture data
- Validate fixture JSON against collection's schema before saving

---

## Build Order (implementation sequence)

1. Go project scaffolding (`go.mod`, directory structure, `main.go`)
2. Database connection + migrations
3. Models + basic CRUD handlers (schemas, collections, templates)
4. FuncMap config loader + endpoint
5. Validation endpoint (real `text/template` compilation)
6. HTML shell + CSS (three-panel layout, block shapes)
7. `api.js` + `blocks.js` + `schema.js` (core data layer)
8. `palette.js` (block toolbox rendering)
9. `workspace.js` (drag-drop canvas — the big one)
10. `codegen.js` (block tree → template string)
11. `preview.js` (live preview + validation display)
12. Revision endpoints + `versions.js` (version history + diff)
13. Test fixtures CRUD + render endpoint
14. Push stub endpoint
15. Integration testing, polish
