package models

import "time"

type Schema struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Version    string    `json:"version"`
	JSONSchema string    `json:"json_schema"` // raw JSON string
	CreatedAt  time.Time `json:"created_at"`
}

type TemplateCollection struct {
	ID          string    `json:"id"`
	SchemaID    string    `json:"schema_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Template struct {
	ID           string    `json:"id"`
	CollectionID string    `json:"collection_id"`
	Name         string    `json:"name"`
	BlockTree    string    `json:"block_tree"` // JSON string
	Rendered     string    `json:"-"`
	Revision     int       `json:"revision"`
	CreatedBy    string    `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
}

type TemplateRevision struct {
	ID         string    `json:"id"`
	TemplateID string    `json:"template_id"`
	Revision   int       `json:"revision"`
	BlockTree  string    `json:"block_tree"`
	Rendered   string    `json:"-"`
	CreatedBy  string    `json:"created_by"`
	CreatedAt  time.Time `json:"created_at"`
	Comment    string    `json:"comment"`
}

type TestFixture struct {
	ID           string    `json:"id"`
	CollectionID string    `json:"collection_id"`
	Name         string    `json:"name"`
	Data         string    `json:"data"` // JSON string
	CreatedAt    time.Time `json:"created_at"`
}

// FuncMapDef represents a custom function available in templates.
type FuncMapDef struct {
	Name        string       `json:"name" yaml:"name"`
	Description string       `json:"description" yaml:"description"`
	Args        []FuncMapArg `json:"args" yaml:"args"`
	Returns     string       `json:"returns" yaml:"returns"`
	Category    string       `json:"category" yaml:"category"`
	Block       BlockDef     `json:"block" yaml:"block"`
}

type FuncMapArg struct {
	Name string `json:"name" yaml:"name"`
	Type string `json:"type" yaml:"type"`
}

type BlockDef struct {
	Shape string `json:"shape" yaml:"shape"`
	Color string `json:"color" yaml:"color"`
}

type FuncMapConfig struct {
	Functions []FuncMapDef `json:"functions" yaml:"functions"`
}
