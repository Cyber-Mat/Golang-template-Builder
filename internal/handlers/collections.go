package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"gotmpl-editor/internal/models"
)

type CollectionHandlers struct {
	DB *sql.DB
}

func (h *CollectionHandlers) ListForSchema(w http.ResponseWriter, r *http.Request) {
	schemaID := pathParam(r, "id")
	rows, err := h.DB.Query(
		`SELECT id, schema_id, name, description, created_at, updated_at
		 FROM template_collections WHERE schema_id = $1 ORDER BY name`, schemaID)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var cols []models.TemplateCollection
	for rows.Next() {
		var c models.TemplateCollection
		if err := rows.Scan(&c.ID, &c.SchemaID, &c.Name, &c.Description, &c.CreatedAt, &c.UpdatedAt); err != nil {
			httpError(w, http.StatusInternalServerError, err.Error())
			return
		}
		cols = append(cols, c)
	}
	if cols == nil {
		cols = []models.TemplateCollection{}
	}
	jsonResp(w, cols)
}

func (h *CollectionHandlers) Get(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")

	var c models.TemplateCollection
	err := h.DB.QueryRow(
		`SELECT id, schema_id, name, description, created_at, updated_at
		 FROM template_collections WHERE id = $1`, id,
	).Scan(&c.ID, &c.SchemaID, &c.Name, &c.Description, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		httpError(w, http.StatusNotFound, "collection not found")
		return
	}
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Include templates list
	rows, err := h.DB.Query(
		`SELECT id, collection_id, name, revision, created_at FROM templates WHERE collection_id = $1 ORDER BY name`, id)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type tmplSummary struct {
		ID           string `json:"id"`
		CollectionID string `json:"collection_id"`
		Name         string `json:"name"`
		Revision     int    `json:"revision"`
		CreatedAt    string `json:"created_at"`
	}
	var templates []tmplSummary
	for rows.Next() {
		var t tmplSummary
		if err := rows.Scan(&t.ID, &t.CollectionID, &t.Name, &t.Revision, &t.CreatedAt); err != nil {
			httpError(w, http.StatusInternalServerError, err.Error())
			return
		}
		templates = append(templates, t)
	}
	if templates == nil {
		templates = []tmplSummary{}
	}

	jsonResp(w, map[string]any{
		"collection": c,
		"templates":  templates,
	})
}

func (h *CollectionHandlers) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SchemaID    string `json:"schema_id"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.SchemaID == "" || req.Name == "" {
		httpError(w, http.StatusBadRequest, "schema_id and name are required")
		return
	}

	var c models.TemplateCollection
	err := h.DB.QueryRow(
		`INSERT INTO template_collections (schema_id, name, description) VALUES ($1, $2, $3)
		 RETURNING id, schema_id, name, description, created_at, updated_at`,
		req.SchemaID, req.Name, req.Description,
	).Scan(&c.ID, &c.SchemaID, &c.Name, &c.Description, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonResp(w, c)
}

func (h *CollectionHandlers) Update(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	var c models.TemplateCollection
	err := h.DB.QueryRow(
		`UPDATE template_collections SET
		 name = COALESCE(NULLIF($2,''), name),
		 description = COALESCE(NULLIF($3,''), description),
		 updated_at = now()
		 WHERE id = $1
		 RETURNING id, schema_id, name, description, created_at, updated_at`,
		id, req.Name, req.Description,
	).Scan(&c.ID, &c.SchemaID, &c.Name, &c.Description, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		httpError(w, http.StatusNotFound, "collection not found")
		return
	}
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResp(w, c)
}
