package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
)

func jsonResp(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// JSONResp is the exported version for use in main.go route handlers.
func JSONResp(w http.ResponseWriter, data any) {
	jsonResp(w, data)
}

func httpError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// pathParam extracts a URL path parameter by name.
// Works with the stdlib http.ServeMux patterns like /api/schemas/{id}
func pathParam(r *http.Request, name string) string {
	// Go 1.22+ ServeMux supports PathValue
	if v := r.PathValue(name); v != "" {
		return v
	}
	// Fallback: extract from URL path manually
	return ""
}

// trimTrailingSlash removes a trailing slash from the path.
func trimTrailingSlash(path string) string {
	return strings.TrimRight(path, "/")
}
