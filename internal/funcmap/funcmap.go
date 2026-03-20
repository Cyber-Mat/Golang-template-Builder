package funcmap

import (
	"fmt"
	"os"
	"text/template"

	"gopkg.in/yaml.v3"
	"gotmpl-editor/internal/models"
)

// Load reads funcmap_config.yaml and returns the parsed config.
func Load(path string) (*models.FuncMapConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &models.FuncMapConfig{}, nil
		}
		return nil, fmt.Errorf("read funcmap config: %w", err)
	}
	var cfg models.FuncMapConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse funcmap config: %w", err)
	}
	return &cfg, nil
}

// BuildStubFuncMap creates a template.FuncMap with stub implementations
// for all configured functions. This allows template compilation/validation
// without needing the real function implementations.
func BuildStubFuncMap(cfg *models.FuncMapConfig) template.FuncMap {
	fm := template.FuncMap{}
	for _, fn := range cfg.Functions {
		fn := fn // capture
		// Create a stub that accepts the right number of args and returns
		// a zero value of the declared return type.
		switch len(fn.Args) {
		case 0:
			fm[fn.Name] = func() string { return "" }
		case 1:
			fm[fn.Name] = func(a any) string { return "" }
		case 2:
			fm[fn.Name] = func(a, b any) string { return "" }
		case 3:
			fm[fn.Name] = func(a, b, c any) string { return "" }
		default:
			fm[fn.Name] = func(args ...any) string { return "" }
		}
	}
	return fm
}
