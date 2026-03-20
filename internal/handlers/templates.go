package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"gotmpl-editor/internal/codegen"
	"gotmpl-editor/internal/models"
)

type TemplateHandlers struct {
	DB *sql.DB
}

func (h *TemplateHandlers) Get(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	var t models.Template
	err := h.DB.QueryRow(
		`SELECT id, collection_id, name, block_tree, rendered, revision, created_by, created_at
		 FROM templates WHERE id = $1`, id,
	).Scan(&t.ID, &t.CollectionID, &t.Name, &t.BlockTree, &t.Rendered, &t.Revision, &t.CreatedBy, &t.CreatedAt)
	if err == sql.ErrNoRows {
		httpError(w, http.StatusNotFound, "template not found")
		return
	}
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResp(w, t)
}

func (h *TemplateHandlers) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CollectionID string          `json:"collection_id"`
		Name         string          `json:"name"`
		BlockTree    json.RawMessage `json:"block_tree"`
		CreatedBy    string          `json:"created_by"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.CollectionID == "" || req.Name == "" {
		httpError(w, http.StatusBadRequest, "collection_id and name are required")
		return
	}

	blockTree := string(req.BlockTree)
	if blockTree == "" || blockTree == "null" {
		blockTree = `{"type":"sequence","children":[]}`
	}

	rendered, _ := codegen.Generate(blockTree)

	var t models.Template
	err := h.DB.QueryRow(
		`INSERT INTO templates (collection_id, name, block_tree, rendered, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, collection_id, name, block_tree, rendered, revision, created_by, created_at`,
		req.CollectionID, req.Name, blockTree, rendered, req.CreatedBy,
	).Scan(&t.ID, &t.CollectionID, &t.Name, &t.BlockTree, &t.Rendered, &t.Revision, &t.CreatedBy, &t.CreatedAt)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Create initial revision
	h.DB.Exec(
		`INSERT INTO template_revisions (template_id, revision, block_tree, rendered, created_by, comment)
		 VALUES ($1, $2, $3, $4, $5, 'Initial version')`,
		t.ID, t.Revision, t.BlockTree, t.Rendered, t.CreatedBy,
	)

	w.WriteHeader(http.StatusCreated)
	jsonResp(w, t)
}

func (h *TemplateHandlers) Update(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	var req struct {
		BlockTree json.RawMessage `json:"block_tree"`
		CreatedBy string          `json:"created_by"`
		Comment   string          `json:"comment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	blockTree := string(req.BlockTree)
	if blockTree == "" || blockTree == "null" {
		httpError(w, http.StatusBadRequest, "block_tree is required")
		return
	}

	rendered, _ := codegen.Generate(blockTree)

	var t models.Template
	err := h.DB.QueryRow(
		`UPDATE templates SET
		 block_tree = $2, rendered = $3, revision = revision + 1,
		 created_by = COALESCE(NULLIF($4,''), created_by)
		 WHERE id = $1
		 RETURNING id, collection_id, name, block_tree, rendered, revision, created_by, created_at`,
		id, blockTree, rendered, req.CreatedBy,
	).Scan(&t.ID, &t.CollectionID, &t.Name, &t.BlockTree, &t.Rendered, &t.Revision, &t.CreatedBy, &t.CreatedAt)
	if err == sql.ErrNoRows {
		httpError(w, http.StatusNotFound, "template not found")
		return
	}
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Create revision
	h.DB.Exec(
		`INSERT INTO template_revisions (template_id, revision, block_tree, rendered, created_by, comment)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		t.ID, t.Revision, t.BlockTree, t.Rendered, req.CreatedBy, req.Comment,
	)

	jsonResp(w, t)
}

func (h *TemplateHandlers) ListRevisions(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	rows, err := h.DB.Query(
		`SELECT id, template_id, revision, created_by, created_at, comment
		 FROM template_revisions WHERE template_id = $1 ORDER BY revision DESC`, id)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type revSummary struct {
		ID         string `json:"id"`
		TemplateID string `json:"template_id"`
		Revision   int    `json:"revision"`
		CreatedBy  string `json:"created_by"`
		CreatedAt  string `json:"created_at"`
		Comment    string `json:"comment"`
	}
	var revs []revSummary
	for rows.Next() {
		var rv revSummary
		if err := rows.Scan(&rv.ID, &rv.TemplateID, &rv.Revision, &rv.CreatedBy, &rv.CreatedAt, &rv.Comment); err != nil {
			httpError(w, http.StatusInternalServerError, err.Error())
			return
		}
		revs = append(revs, rv)
	}
	if revs == nil {
		revs = []revSummary{}
	}
	jsonResp(w, revs)
}

func (h *TemplateHandlers) GetRevision(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	rev := pathParam(r, "rev")

	var rv models.TemplateRevision
	err := h.DB.QueryRow(
		`SELECT id, template_id, revision, block_tree, rendered, created_by, created_at, comment
		 FROM template_revisions WHERE template_id = $1 AND revision = $2`, id, rev,
	).Scan(&rv.ID, &rv.TemplateID, &rv.Revision, &rv.BlockTree, &rv.Rendered, &rv.CreatedBy, &rv.CreatedAt, &rv.Comment)
	if err == sql.ErrNoRows {
		httpError(w, http.StatusNotFound, "revision not found")
		return
	}
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResp(w, rv)
}

func (h *TemplateHandlers) Restore(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	rev := pathParam(r, "rev")

	// Get the revision to restore
	var rv models.TemplateRevision
	err := h.DB.QueryRow(
		`SELECT block_tree, rendered, created_by FROM template_revisions
		 WHERE template_id = $1 AND revision = $2`, id, rev,
	).Scan(&rv.BlockTree, &rv.Rendered, &rv.CreatedBy)
	if err == sql.ErrNoRows {
		httpError(w, http.StatusNotFound, "revision not found")
		return
	}
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Update template and bump revision
	var t models.Template
	err = h.DB.QueryRow(
		`UPDATE templates SET block_tree = $2, rendered = $3, revision = revision + 1
		 WHERE id = $1
		 RETURNING id, collection_id, name, block_tree, rendered, revision, created_by, created_at`,
		id, rv.BlockTree, rv.Rendered,
	).Scan(&t.ID, &t.CollectionID, &t.Name, &t.BlockTree, &t.Rendered, &t.Revision, &t.CreatedBy, &t.CreatedAt)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Create new revision from restored content
	h.DB.Exec(
		`INSERT INTO template_revisions (template_id, revision, block_tree, rendered, created_by, comment)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		t.ID, t.Revision, t.BlockTree, t.Rendered, rv.CreatedBy, "Restored from revision "+rev,
	)

	jsonResp(w, t)
}
