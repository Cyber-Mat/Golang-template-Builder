package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"gotmpl-editor/internal/db"
	"gotmpl-editor/internal/funcmap"
	"gotmpl-editor/internal/handlers"
)

func main() {
	// Connect to PostgreSQL
	database, err := db.Connect()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	// Run migrations
	if err := db.RunMigrations(database); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Database migrations complete")

	// Load FuncMap config
	fmcPath := envOr("FUNCMAP_CONFIG", "funcmap_config.yaml")
	fmConfig, err := funcmap.Load(fmcPath)
	if err != nil {
		log.Fatalf("Failed to load funcmap config: %v", err)
	}
	log.Printf("Loaded %d FuncMap functions", len(fmConfig.Functions))
	stubFM := funcmap.BuildStubFuncMap(fmConfig)

	// Init handlers
	schemaH := &handlers.SchemaHandlers{DB: database}
	collectionH := &handlers.CollectionHandlers{DB: database}
	templateH := &handlers.TemplateHandlers{DB: database}
	fixtureH := &handlers.FixtureHandlers{DB: database}
	validateH := &handlers.ValidateHandlers{StubFuncMap: stubFM}
	pushH := &handlers.PushHandlers{}

	mux := http.NewServeMux()

	// --- API routes ---
	// Schemas
	mux.HandleFunc("GET /api/schemas", schemaH.List)
	mux.HandleFunc("POST /api/schemas", schemaH.Create)
	mux.HandleFunc("GET /api/schemas/{id}", schemaH.Get)
	mux.HandleFunc("PUT /api/schemas/{id}", schemaH.Update)

	// Collections
	mux.HandleFunc("GET /api/schemas/{id}/collections", collectionH.ListForSchema)
	mux.HandleFunc("POST /api/collections", collectionH.Create)
	mux.HandleFunc("GET /api/collections/{id}", collectionH.Get)
	mux.HandleFunc("PUT /api/collections/{id}", collectionH.Update)

	// Templates
	mux.HandleFunc("GET /api/templates/{id}", templateH.Get)
	mux.HandleFunc("POST /api/templates", templateH.Create)
	mux.HandleFunc("PUT /api/templates/{id}", templateH.Update)
	mux.HandleFunc("GET /api/templates/{id}/revisions", templateH.ListRevisions)
	mux.HandleFunc("GET /api/templates/{id}/revisions/{rev}", templateH.GetRevision)
	mux.HandleFunc("POST /api/templates/{id}/restore/{rev}", templateH.Restore)

	// Fixtures
	mux.HandleFunc("GET /api/collections/{id}/fixtures", fixtureH.ListForCollection)
	mux.HandleFunc("POST /api/fixtures", fixtureH.Create)
	mux.HandleFunc("PUT /api/fixtures/{id}", fixtureH.Update)
	mux.HandleFunc("DELETE /api/fixtures/{id}", fixtureH.Delete)

	// Validation & Render
	mux.HandleFunc("POST /api/validate", validateH.Validate)
	mux.HandleFunc("POST /api/render", validateH.Render)

	// Push (stub)
	mux.HandleFunc("POST /api/push", pushH.Push)

	// FuncMap config
	mux.HandleFunc("GET /api/funcmap", func(w http.ResponseWriter, r *http.Request) {
		handlers.JSONResp(w, fmConfig)
	})

	// --- Static files ---
	fs := http.FileServer(http.Dir("static"))
	mux.Handle("/", fs)

	port := envOr("PORT", "8080")
	addr := fmt.Sprintf(":%s", port)
	log.Printf("GoTmpl Editor listening on http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
