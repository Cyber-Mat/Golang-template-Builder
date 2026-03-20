package db

import "database/sql"

const defaultSchema = `{
  "type": "object",
  "properties": {
    "Title": { "type": "string" },
    "Author": { "type": "string" },
    "Published": { "type": "boolean" },
    "Tags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "Sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "Heading": { "type": "string" },
          "Body": { "type": "string" },
          "Order": { "type": "number" }
        }
      }
    },
    "Meta": {
      "type": "object",
      "properties": {
        "CreatedAt": { "type": "string" },
        "UpdatedAt": { "type": "string" },
        "WordCount": { "type": "number" }
      }
    }
  }
}`

const defaultBlockTree = `{
  "type": "sequence",
  "children": [
    {
      "id": "b1",
      "type": "text",
      "value": "# "
    },
    {
      "id": "b2",
      "type": "value",
      "path": ".Title"
    },
    {
      "id": "b3",
      "type": "text",
      "value": "\nBy: "
    },
    {
      "id": "b4",
      "type": "value",
      "path": ".Author"
    },
    {
      "id": "b5",
      "type": "text",
      "value": "\n\n"
    },
    {
      "id": "b6",
      "type": "if",
      "condition": {
        "id": "b7",
        "type": "value",
        "path": ".Published"
      },
      "body": {
        "type": "sequence",
        "children": [
          {
            "id": "b8",
            "type": "text",
            "value": "Status: Published\n"
          }
        ]
      },
      "else_body": {
        "type": "sequence",
        "children": [
          {
            "id": "b9",
            "type": "text",
            "value": "Status: Draft\n"
          }
        ]
      }
    },
    {
      "id": "b10",
      "type": "text",
      "value": "\n## Sections\n\n"
    },
    {
      "id": "b11",
      "type": "range",
      "variable": "$section",
      "source": {
        "id": "b12",
        "type": "value",
        "path": ".Sections"
      },
      "body": {
        "type": "sequence",
        "children": [
          {
            "id": "b13",
            "type": "text",
            "value": "### "
          },
          {
            "id": "b14",
            "type": "value",
            "path": "$section.Heading"
          },
          {
            "id": "b15",
            "type": "text",
            "value": "\n"
          },
          {
            "id": "b16",
            "type": "value",
            "path": "$section.Body"
          },
          {
            "id": "b17",
            "type": "text",
            "value": "\n\n"
          }
        ]
      }
    },
    {
      "id": "b18",
      "type": "text",
      "value": "Tags: "
    },
    {
      "id": "b19",
      "type": "range",
      "variable": "$tag",
      "source": {
        "id": "b20",
        "type": "value",
        "path": ".Tags"
      },
      "body": {
        "type": "sequence",
        "children": [
          {
            "id": "b21",
            "type": "value",
            "path": "$tag"
          },
          {
            "id": "b22",
            "type": "text",
            "value": " "
          }
        ]
      }
    },
    {
      "id": "b23",
      "type": "text",
      "value": "\n\nWord count: "
    },
    {
      "id": "b24",
      "type": "value",
      "path": ".Meta.WordCount"
    }
  ]
}`

const defaultRendered = `# {{.Title}}
By: {{.Author}}

{{if .Published}}Status: Published
{{else}}Status: Draft
{{end}}
## Sections

{{range $section := .Sections}}### {{$section.Heading}}
{{$section.Body}}

{{end}}Tags: {{range $tag := .Tags}}{{$tag}} {{end}}

Word count: {{.Meta.WordCount}}`

const defaultFixture = `{
  "Title": "Getting Started with Go Templates",
  "Author": "Jane Developer",
  "Published": true,
  "Tags": ["golang", "templates", "tutorial"],
  "Sections": [
    {
      "Heading": "Introduction",
      "Body": "Go templates provide a powerful way to generate text output. They are used extensively in web applications, configuration generation, and code scaffolding.",
      "Order": 1
    },
    {
      "Heading": "Basic Syntax",
      "Body": "Actions are delimited by {{ and }}. Inside actions you can reference data fields, call functions, and use control structures like if, range, and with.",
      "Order": 2
    },
    {
      "Heading": "Pipelines",
      "Body": "Pipelines chain commands together using the | operator, similar to Unix pipes. The output of one command becomes the last argument of the next.",
      "Order": 3
    }
  ],
  "Meta": {
    "CreatedAt": "2026-01-15T10:00:00Z",
    "UpdatedAt": "2026-03-20T14:30:00Z",
    "WordCount": 342
  }
}`

const defaultFixture2 = `{
  "Title": "Empty Draft Post",
  "Author": "Test User",
  "Published": false,
  "Tags": [],
  "Sections": [],
  "Meta": {
    "CreatedAt": "2026-03-20T00:00:00Z",
    "UpdatedAt": "2026-03-20T00:00:00Z",
    "WordCount": 0
  }
}`

// SeedDefaults inserts a default schema, collection, template, and fixtures
// if the database is empty. This gives new users something to explore immediately.
func SeedDefaults(db *sql.DB) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schemas`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil // already has data
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Schema
	var schemaID string
	err = tx.QueryRow(
		`INSERT INTO schemas (name, version, json_schema) VALUES ($1, $2, $3) RETURNING id`,
		"Blog Post", "1.0.0", defaultSchema,
	).Scan(&schemaID)
	if err != nil {
		return err
	}

	// Collection
	var colID string
	err = tx.QueryRow(
		`INSERT INTO template_collections (schema_id, name, description) VALUES ($1, $2, $3) RETURNING id`,
		schemaID, "Blog Templates", "Example templates for rendering blog posts",
	).Scan(&colID)
	if err != nil {
		return err
	}

	// Template
	var tmplID string
	err = tx.QueryRow(
		`INSERT INTO templates (collection_id, name, block_tree, rendered, created_by)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		colID, "Full Post", defaultBlockTree, defaultRendered, "system",
	).Scan(&tmplID)
	if err != nil {
		return err
	}

	// Initial revision
	_, err = tx.Exec(
		`INSERT INTO template_revisions (template_id, revision, block_tree, rendered, created_by, comment)
		 VALUES ($1, 1, $2, $3, 'system', 'Default example template')`,
		tmplID, defaultBlockTree, defaultRendered,
	)
	if err != nil {
		return err
	}

	// Fixtures
	_, err = tx.Exec(
		`INSERT INTO test_fixtures (collection_id, name, data) VALUES ($1, $2, $3)`,
		colID, "Sample Blog Post", defaultFixture,
	)
	if err != nil {
		return err
	}
	_, err = tx.Exec(
		`INSERT INTO test_fixtures (collection_id, name, data) VALUES ($1, $2, $3)`,
		colID, "Empty Draft", defaultFixture2,
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}
