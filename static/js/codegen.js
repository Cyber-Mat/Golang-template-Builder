// codegen.js — Block tree → Go template string (client-side, pure function)

/**
 * Generate Go template source from a block tree.
 * @param {object} blockTree - The root block (usually type:"sequence")
 * @returns {string} Go template source
 */
export function generate(blockTree) {
    if (!blockTree) return '';
    return genBlock(blockTree);
}

function genBlock(b) {
    if (!b) return '';

    switch (b.type) {
        case 'sequence':
            return (b.children || []).map(genBlock).join('');

        case 'text':
            return b.value || '';

        case 'value':
            return `{{${b.path || '.'}}}`;

        case 'range': {
            let out = '{{range ';
            if (b.variable) out += `${b.variable} := `;
            if (b.source) out += genExpr(b.source);
            out += '}}';
            if (b.body) out += genBlock(b.body);
            out += '{{end}}';
            return out;
        }

        case 'if': {
            let out = '{{if ';
            if (b.condition) out += genExpr(b.condition);
            out += '}}';
            if (b.body) out += genBlock(b.body);
            if (b.else_body) {
                out += '{{else}}';
                out += genBlock(b.else_body);
            }
            out += '{{end}}';
            return out;
        }

        case 'with': {
            let out = '{{with ';
            if (b.source) out += genExpr(b.source);
            out += '}}';
            if (b.body) out += genBlock(b.body);
            if (b.else_body) {
                out += '{{else}}';
                out += genBlock(b.else_body);
            }
            out += '{{end}}';
            return out;
        }

        case 'define': {
            let out = `{{define "${b.value || ''}"}}`;
            if (b.body) out += genBlock(b.body);
            out += '{{end}}';
            return out;
        }

        case 'template': {
            let out = `{{template "${b.value || ''}"`;
            if (b.source) out += ' ' + genExpr(b.source);
            out += '}}';
            return out;
        }

        case 'pipeline': {
            const stages = (b.stages || []).filter(Boolean).map(genExpr);
            return `{{${stages.join(' | ')}}}`;
        }

        default:
            // Reporter block used as a statement
            return `{{${genExpr(b)}}}`;
    }
}

function genExpr(b) {
    if (!b) return '';

    switch (b.type) {
        case 'value':
            return b.path || '.';

        case 'literal':
            if (b.datatype === 'string') return `"${b.value || ''}"`;
            return b.value || '0';

        case 'operator': {
            let out = b.op || 'eq';
            for (const arg of (b.args || [])) {
                if (!arg) continue;
                out += ' ';
                const needParen = arg.type === 'builtin' || arg.type === 'operator' || arg.type === 'function';
                if (needParen) out += '(';
                out += genExpr(arg);
                if (needParen) out += ')';
            }
            return out;
        }

        case 'builtin': {
            let out = b.func || 'len';
            for (const arg of (b.args || [])) {
                if (!arg) continue;
                out += ' ';
                const needParen = arg.type === 'builtin' || arg.type === 'operator' || arg.type === 'function';
                if (needParen) out += '(';
                out += genExpr(arg);
                if (needParen) out += ')';
            }
            return out;
        }

        case 'function': {
            let out = b.func || '';
            for (const arg of (b.args || [])) {
                if (!arg) continue;
                out += ' ';
                const needParen = arg.type === 'builtin' || arg.type === 'operator' || arg.type === 'function';
                if (needParen) out += '(';
                out += genExpr(arg);
                if (needParen) out += ')';
            }
            return out;
        }

        case 'pipeline': {
            return (b.stages || []).filter(Boolean).map(genExpr).join(' | ');
        }

        default:
            return '';
    }
}
