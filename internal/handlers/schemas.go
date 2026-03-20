package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"gotmpl-editor/internal/models"
)

type SchemaHandlers struct {
	DB *sql.DB
}

func (h *SchemaHandlers) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(`SELECT id, name, version, json_schema, created_at FROM schemas ORDER BY name, version`)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var schemas []models.Schema
	for rows.Next() {
		var s models.Schema
		if err := rows.Scan(&s.ID, &s.Name, &s.Version, &s.JSONSchema, &s.CreatedAt); err != nil {
			httpError(w, http.StatusInternalServerError, err.Error())
			return
		}
		schemas = append(schemas, s)
	}
	if schemas == nil {
		schemas = []models.Schema{}
	}
	jsonResp(w, schemas)
}

func (h *SchemaHandlers) Get(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	var s models.Schema
	err := h.DB.QueryRow(`SELECT id, name, version, json_schema, created_at FROM schemas WHERE id = $1`, id).
		Scan(&s.ID, &s.Name, &s.Version, &s.JSONSchema, &s.CreatedAt)
	if err == sql.ErrNoRows {
		httpError(w, http.StatusNotFound, "schema not found")
		return
	}
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResp(w, s)
}

func (h *SchemaHandlers) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name       string          `json:"name"`
		Version    string          `json:"version"`
		JSONSchema json.RawMessage `json:"json_schema"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.Name == "" || req.Version == "" || len(req.JSONSchema) == 0 {
		httpError(w, http.StatusBadRequest, "name, version, and json_schema are required")
		return
	}
	// Validate that json_schema is valid JSON
	var tmp any
	if err := json.Unmarshal(req.JSONSchema, &tmp); err != nil {
		httpError(w, http.StatusBadRequest, "json_schema is not valid JSON")
		return
	}

	var s models.Schema
	err := h.DB.QueryRow(
		`INSERT INTO schemas (name, version, json_schema) VALUES ($1, $2, $3)
		 RETURNING id, name, version, json_schema, created_at`,
		req.Name, req.Version, string(req.JSONSchema),
	).Scan(&s.ID, &s.Name, &s.Version, &s.JSONSchema, &s.CreatedAt)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonResp(w, s)
}

func (h *SchemaHandlers) Update(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	var req struct {
		Name       string          `json:"name"`
		Version    string          `json:"version"`
		JSONSchema json.RawMessage `json:"json_schema"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	var s models.Schema
	err := h.DB.QueryRow(
		`UPDATE schemas SET name = COALESCE(NULLIF($2,''), name),
		 version = COALESCE(NULLIF($3,''), version),
		 json_schema = CASE WHEN $4::text = '' THEN json_schema ELSE $4::jsonb END
		 WHERE id = $1
		 RETURNING id, name, version, json_schema, created_at`,
		id, req.Name, req.Version, string(req.JSONSchema),
	).Scan(&s.ID, &s.Name, &s.Version, &s.JSONSchema, &s.CreatedAt)
	if err == sql.ErrNoRows {
		httpError(w, http.StatusNotFound, "schema not found")
		return
	}
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResp(w, s)
}
