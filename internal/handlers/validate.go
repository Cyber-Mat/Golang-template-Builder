package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"text/template"
)

type ValidateHandlers struct {
	StubFuncMap template.FuncMap
}

func (h *ValidateHandlers) Validate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Template string `json:"template"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.Template == "" {
		httpError(w, http.StatusBadRequest, "template is required")
		return
	}

	_, err := template.New("validate").Funcs(h.StubFuncMap).Parse(req.Template)
	if err != nil {
		jsonResp(w, map[string]any{
			"valid": false,
			"error": err.Error(),
		})
		return
	}

	jsonResp(w, map[string]any{
		"valid": true,
		"error": nil,
	})
}

func (h *ValidateHandlers) Render(w http.ResponseWriter, r *http.Request) {
	// This endpoint compiles and executes the template with fixture data.
	// In this stub, the FuncMap uses stubs so function calls return "".
	// The real app would register actual FuncMap implementations.
	var req struct {
		Template string `json:"template"`
		Data     any    `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	tmpl, err := template.New("render").Funcs(h.StubFuncMap).Parse(req.Template)
	if err != nil {
		jsonResp(w, map[string]any{
			"rendered": "",
			"error":    err.Error(),
		})
		return
	}

	var buf strings.Builder
	if err := tmpl.Execute(&buf, req.Data); err != nil {
		jsonResp(w, map[string]any{
			"rendered": "",
			"error":    err.Error(),
		})
		return
	}

	jsonResp(w, map[string]any{
		"rendered": buf.String(),
		"error":    nil,
	})
}

type PushHandlers struct{}

func (h *PushHandlers) Push(w http.ResponseWriter, r *http.Request) {
	// Stub endpoint — real Confluence integration comes later
	var req struct {
		TemplateID string `json:"template_id"`
		FixtureID  string `json:"fixture_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	jsonResp(w, map[string]any{
		"status":  "stub",
		"message": "Push integration not yet configured. Template and fixture received.",
	})
}
