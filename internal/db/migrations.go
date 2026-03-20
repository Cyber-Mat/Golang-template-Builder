package db

import "database/sql"

const migrationSQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schemas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    version     TEXT NOT NULL,
    json_schema JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(name, version)
);

CREATE TABLE IF NOT EXISTS template_collections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id   UUID NOT NULL REFERENCES schemas(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id   UUID NOT NULL REFERENCES template_collections(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    block_tree      JSONB NOT NULL DEFAULT '{"type":"sequence","children":[]}',
    rendered        TEXT NOT NULL DEFAULT '',
    revision        INT NOT NULL DEFAULT 1,
    created_by      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_revisions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    revision    INT NOT NULL,
    block_tree  JSONB NOT NULL,
    rendered    TEXT NOT NULL,
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    comment     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS test_fixtures (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id   UUID NOT NULL REFERENCES template_collections(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    data            JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_schema ON template_collections(schema_id);
CREATE INDEX IF NOT EXISTS idx_templates_collection ON templates(collection_id);
CREATE INDEX IF NOT EXISTS idx_revisions_template ON template_revisions(template_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_collection ON test_fixtures(collection_id);
`

func RunMigrations(db *sql.DB) error {
	_, err := db.Exec(migrationSQL)
	return err
}
