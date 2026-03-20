package codegen

// Server-side codegen is a mirror of the client-side codegen.js.
// It exists so the backend can re-generate the rendered template from
// block_tree JSON when needed (e.g., during validation or render).

import (
	"encoding/json"
	"fmt"
	"strings"
)

type block struct {
	Type     string  `json:"type"`
	ID       string  `json:"id,omitempty"`
	Value    string  `json:"value,omitempty"`
	Path     string  `json:"path,omitempty"`
	Op       string  `json:"op,omitempty"`
	Func     string  `json:"func,omitempty"`
	Datatype string  `json:"datatype,omitempty"`
	Variable string  `json:"variable,omitempty"`
	Format   string  `json:"format,omitempty"`
	Source   *block  `json:"source,omitempty"`
	Args     []block `json:"args,omitempty"`
	// For control blocks
	Condition *block `json:"condition,omitempty"`
	Body      *block `json:"body,omitempty"`
	ElseBody  *block `json:"else_body,omitempty"`
	// For sequence
	Children []block `json:"children,omitempty"`
	// For pipeline
	Stages []block `json:"stages,omitempty"`
}

// Generate converts a block tree JSON string to a Go template source string.
func Generate(blockTreeJSON string) (string, error) {
	var root block
	if err := json.Unmarshal([]byte(blockTreeJSON), &root); err != nil {
		return "", fmt.Errorf("parse block tree: %w", err)
	}
	var sb strings.Builder
	if err := genBlock(&sb, &root); err != nil {
		return "", err
	}
	return sb.String(), nil
}

func genBlock(sb *strings.Builder, b *block) error {
	switch b.Type {
	case "sequence":
		for _, child := range b.Children {
			child := child
			if err := genBlock(sb, &child); err != nil {
				return err
			}
		}
	case "text":
		sb.WriteString(b.Value)
	case "value":
		sb.WriteString("{{")
		sb.WriteString(b.Path)
		sb.WriteString("}}")
	case "range":
		sb.WriteString("{{range ")
		if b.Variable != "" {
			sb.WriteString(b.Variable)
			sb.WriteString(" := ")
		}
		if b.Source != nil {
			if err := genExpr(sb, b.Source); err != nil {
				return err
			}
		}
		sb.WriteString("}}")
		if b.Body != nil {
			if err := genBlock(sb, b.Body); err != nil {
				return err
			}
		}
		sb.WriteString("{{end}}")
	case "if":
		sb.WriteString("{{if ")
		if b.Condition != nil {
			if err := genExpr(sb, b.Condition); err != nil {
				return err
			}
		}
		sb.WriteString("}}")
		if b.Body != nil {
			if err := genBlock(sb, b.Body); err != nil {
				return err
			}
		}
		if b.ElseBody != nil {
			sb.WriteString("{{else}}")
			if err := genBlock(sb, b.ElseBody); err != nil {
				return err
			}
		}
		sb.WriteString("{{end}}")
	case "with":
		sb.WriteString("{{with ")
		if b.Source != nil {
			if err := genExpr(sb, b.Source); err != nil {
				return err
			}
		}
		sb.WriteString("}}")
		if b.Body != nil {
			if err := genBlock(sb, b.Body); err != nil {
				return err
			}
		}
		if b.ElseBody != nil {
			sb.WriteString("{{else}}")
			if err := genBlock(sb, b.ElseBody); err != nil {
				return err
			}
		}
		sb.WriteString("{{end}}")
	case "define":
		sb.WriteString("{{define \"")
		sb.WriteString(b.Value)
		sb.WriteString("\"}}")
		if b.Body != nil {
			if err := genBlock(sb, b.Body); err != nil {
				return err
			}
		}
		sb.WriteString("{{end}}")
	case "template":
		sb.WriteString("{{template \"")
		sb.WriteString(b.Value)
		sb.WriteString("\"")
		if b.Source != nil {
			sb.WriteString(" ")
			if err := genExpr(sb, b.Source); err != nil {
				return err
			}
		}
		sb.WriteString("}}")
	case "pipeline":
		for i, stage := range b.Stages {
			if i > 0 {
				sb.WriteString(" | ")
			}
			if err := genExpr(sb, &stage); err != nil {
				return err
			}
		}
	default:
		// Treat as expression (reporter block inside a stack context)
		sb.WriteString("{{")
		if err := genExpr(sb, b); err != nil {
			return err
		}
		sb.WriteString("}}")
	}
	return nil
}

func genExpr(sb *strings.Builder, b *block) error {
	switch b.Type {
	case "value":
		sb.WriteString(b.Path)
	case "literal":
		switch b.Datatype {
		case "string":
			sb.WriteString("\"")
			sb.WriteString(b.Value)
			sb.WriteString("\"")
		default:
			sb.WriteString(b.Value)
		}
	case "operator":
		sb.WriteString(b.Op)
		for _, arg := range b.Args {
			sb.WriteString(" ")
			arg := arg
			needParen := arg.Type == "builtin" || arg.Type == "operator" || arg.Type == "function"
			if needParen {
				sb.WriteString("(")
			}
			if err := genExpr(sb, &arg); err != nil {
				return err
			}
			if needParen {
				sb.WriteString(")")
			}
		}
	case "builtin":
		sb.WriteString(b.Func)
		for _, arg := range b.Args {
			sb.WriteString(" ")
			arg := arg
			needParen := arg.Type == "builtin" || arg.Type == "operator" || arg.Type == "function"
			if needParen {
				sb.WriteString("(")
			}
			if err := genExpr(sb, &arg); err != nil {
				return err
			}
			if needParen {
				sb.WriteString(")")
			}
		}
	case "function":
		sb.WriteString(b.Func)
		for _, arg := range b.Args {
			sb.WriteString(" ")
			arg := arg
			needParen := arg.Type == "builtin" || arg.Type == "operator" || arg.Type == "function"
			if needParen {
				sb.WriteString("(")
			}
			if err := genExpr(sb, &arg); err != nil {
				return err
			}
			if needParen {
				sb.WriteString(")")
			}
		}
	case "pipeline":
		for i, stage := range b.Stages {
			if i > 0 {
				sb.WriteString(" | ")
			}
			stage := stage
			if err := genExpr(sb, &stage); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unknown expression type: %s", b.Type)
	}
	return nil
}
