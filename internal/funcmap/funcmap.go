package funcmap

import (
	"fmt"
	"os"
	"reflect"
	"sort"
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

// builtinFuncs contains real implementations for functions that need
// actual logic (not just stubs). These are used both in template
// execution and validation.
var builtinFuncs = template.FuncMap{
	"sortBy": sortByFunc,
}

// sortByFunc sorts a slice by a struct field name. It returns a new
// sorted slice, leaving the original unchanged.
func sortByFunc(items any, field string) (any, error) {
	v := reflect.ValueOf(items)
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	if v.Kind() != reflect.Slice {
		return items, fmt.Errorf("sortBy: expected slice, got %T", items)
	}
	if v.Len() == 0 {
		return items, nil
	}

	// Copy to avoid mutating the original
	sorted := make([]reflect.Value, v.Len())
	for i := 0; i < v.Len(); i++ {
		sorted[i] = v.Index(i)
	}

	sort.SliceStable(sorted, func(i, j int) bool {
		fi := fieldValue(sorted[i], field)
		fj := fieldValue(sorted[j], field)
		return compareValues(fi, fj)
	})

	// Build result slice of same type
	result := reflect.MakeSlice(v.Type(), len(sorted), len(sorted))
	for i, sv := range sorted {
		result.Index(i).Set(sv)
	}
	return result.Interface(), nil
}

// fieldValue extracts a struct field or map key value, dereferencing pointers.
func fieldValue(v reflect.Value, field string) reflect.Value {
	if v.Kind() == reflect.Ptr || v.Kind() == reflect.Interface {
		v = v.Elem()
	}
	switch v.Kind() {
	case reflect.Struct:
		return v.FieldByName(field)
	case reflect.Map:
		return v.MapIndex(reflect.ValueOf(field))
	default:
		return reflect.Value{}
	}
}

// compareValues does a best-effort less-than comparison for common types.
func compareValues(a, b reflect.Value) bool {
	if !a.IsValid() || !b.IsValid() {
		return false
	}
	if a.Kind() == reflect.Interface {
		a = a.Elem()
	}
	if b.Kind() == reflect.Interface {
		b = b.Elem()
	}
	switch a.Kind() {
	case reflect.String:
		return a.String() < b.String()
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return a.Int() < b.Int()
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return a.Uint() < b.Uint()
	case reflect.Float32, reflect.Float64:
		return a.Float() < b.Float()
	case reflect.Bool:
		return !a.Bool() && b.Bool()
	default:
		// Fall back to string representation
		return fmt.Sprint(a.Interface()) < fmt.Sprint(b.Interface())
	}
}

// BuildStubFuncMap creates a template.FuncMap with stub implementations
// for all configured functions. This allows template compilation/validation
// without needing the real function implementations. Functions with real
// implementations in builtinFuncs use those instead of stubs.
func BuildStubFuncMap(cfg *models.FuncMapConfig) template.FuncMap {
	fm := template.FuncMap{}
	for _, fn := range cfg.Functions {
		fn := fn // capture

		// Use real implementation if available
		if impl, ok := builtinFuncs[fn.Name]; ok {
			fm[fn.Name] = impl
			continue
		}

		// Create a stub that accepts the right number of args.
		// Return type depends on the declared return: slice-compatible
		// for non-string returns (so range works during validation).
		if fn.Returns != "" && fn.Returns != "string" {
			switch len(fn.Args) {
			case 0:
				fm[fn.Name] = func() []any { return nil }
			case 1:
				fm[fn.Name] = func(a any) []any { return nil }
			case 2:
				fm[fn.Name] = func(a, b any) []any { return nil }
			case 3:
				fm[fn.Name] = func(a, b, c any) []any { return nil }
			default:
				fm[fn.Name] = func(args ...any) []any { return nil }
			}
		} else {
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
	}
	return fm
}
