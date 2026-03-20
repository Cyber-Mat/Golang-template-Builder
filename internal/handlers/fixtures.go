package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"gotmpl-editor/internal/models"
)

type FixtureHandlers struct {
	DB *sql.DB
}

func (h *FixtureHandlers) ListForCollection(w http.ResponseWriter, r *http.Request) {
	colID := pathParam(r, "id")
	rows, err := h.DB.Query(
		`SELECT id, collection_id, name, data, created_at
		 FROM test_fixtures WHERE collection_id = $1 ORDER BY name`, colID)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var fixtures []models.TestFixture
	for rows.Next() {
		var f models.TestFixture
		if err := rows.Scan(&f.ID, &f.CollectionID, &f.Name, &f.Data, &f.CreatedAt); err != nil {
			httpError(w, http.StatusInternalServerError, err.Error())
			return
		}
		fixtures = append(fixtures, f)
	}
	if fixtures == nil {
		fixtures = []models.TestFixture{}
	}
	jsonResp(w, fixtures)
}

func (h *FixtureHandlers) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CollectionID string          `json:"collection_id"`
		Name         string          `json:"name"`
		Data         json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.CollectionID == "" || req.Name == "" || len(req.Data) == 0 {
		httpError(w, http.StatusBadRequest, "collection_id, name, and data are required")
		return
	}

	var f models.TestFixture
	err := h.DB.QueryRow(
		`INSERT INTO test_fixtures (collection_id, name, data) VALUES ($1, $2, $3)
		 RETURNING id, collection_id, name, data, created_at`,
		req.CollectionID, req.Name, string(req.Data),
	).Scan(&f.ID, &f.CollectionID, &f.Name, &f.Data, &f.CreatedAt)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonResp(w, f)
}

func (h *FixtureHandlers) Update(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	var req struct {
		Name string          `json:"name"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	var f models.TestFixture
	err := h.DB.QueryRow(
		`UPDATE test_fixtures SET
		 name = COALESCE(NULLIF($2,''), name),
		 data = CASE WHEN $3::text = '' THEN data ELSE $3::jsonb END
		 WHERE id = $1
		 RETURNING id, collection_id, name, data, created_at`,
		id, req.Name, string(req.Data),
	).Scan(&f.ID, &f.CollectionID, &f.Name, &f.Data, &f.CreatedAt)
	if err == sql.ErrNoRows {
		httpError(w, http.StatusNotFound, "fixture not found")
		return
	}
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResp(w, f)
}

func (h *FixtureHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	res, err := h.DB.Exec(`DELETE FROM test_fixtures WHERE id = $1`, id)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		httpError(w, http.StatusNotFound, "fixture not found")
		return
	}
	jsonResp(w, map[string]string{"status": "deleted"})
}
