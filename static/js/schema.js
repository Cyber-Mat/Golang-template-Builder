// schema.js — JSON Schema → block definitions for the palette

import { registerBlock } from './blocks.js';

let _schemaPaths = [];

export function clearSchemaPaths() { _schemaPaths = []; }

/**
 * Given a range source path like ".Sections", return sub-property suffixes
 * for array item properties. E.g., [".Heading", ".Body", ".Order"]
 * Returns empty array for simple arrays or unknown paths.
 */
export function getSubProperties(sourcePath) {
    const prefix = sourcePath + '[].';
    const suffixes = [];
    for (const { path } of _schemaPaths) {
        if (path.startsWith(prefix)) {
            suffixes.push(path.slice(sourcePath.length + 2)); // skip "[]", keep ".Heading"
        }
    }
    return suffixes;
}

/**
 * Parse a JSON Schema and return a flat list of dot-paths with types.
 * E.g., { properties: { Name: { type: "string" } } } → [{ path: ".Name", type: "string" }]
 */
export function parseSchema(schema) {
    const paths = [];
    walkSchema(schema, '.', paths, new Set());
    return paths;
}

function walkSchema(schema, prefix, paths, seen) {
    if (!schema || typeof schema !== 'object') return;

    // Handle $ref (inline only, same-document refs)
    if (schema.$ref) {
        // Not resolving external refs — just note it
        return;
    }

    // Handle allOf
    if (schema.allOf) {
        for (const sub of schema.allOf) {
            walkSchema(sub, prefix, paths, seen);
        }
        return;
    }

    // Handle oneOf / anyOf (list all paths from all branches)
    if (schema.oneOf || schema.anyOf) {
        const variants = schema.oneOf || schema.anyOf;
        for (const sub of variants) {
            walkSchema(sub, prefix, paths, seen);
        }
        return;
    }

    const schemaType = schema.type;

    if (schemaType === 'object' || schema.properties) {
        const props = schema.properties || {};
        for (const [key, val] of Object.entries(props)) {
            const p = prefix === '.' ? `.${key}` : `${prefix}.${key}`;
            const childType = val.type || 'any';

            if (childType === 'object' || val.properties) {
                // Add the object itself as a path (for use with `with`)
                paths.push({ path: p, type: 'object' });
                walkSchema(val, p, paths, seen);
            } else if (childType === 'array') {
                paths.push({ path: p, type: 'array' });
                // Walk array items
                if (val.items) {
                    walkSchema(val.items, p + '[]', paths, seen);
                }
            } else {
                paths.push({ path: p, type: childType });
            }
        }
    } else if (schemaType === 'array' && schema.items) {
        // Array items — paths like .Items[].Name
        walkSchema(schema.items, prefix, paths, seen);
    }
}

/**
 * Register value blocks for each schema path.
 * Called when a schema is loaded/changed.
 */
export function registerSchemaBlocks(schemaPaths) {
    _schemaPaths = schemaPaths;
    for (const { path, type } of schemaPaths) {
        const key = `value_${path}`;
        registerBlock(key, {
            type: 'value',
            category: 'values',
            label: path,
            shape: 'reporter',
            color: 'values',
            slots: [],
            defaults: { path },
            schemaType: type,
        });
    }
}

/**
 * Register FuncMap function blocks from the config.
 */
export function registerFuncMapBlocks(funcMapConfig) {
    if (!funcMapConfig || !funcMapConfig.functions) return;
    for (const fn of funcMapConfig.functions) {
        const key = `func_${fn.name}`;
        registerBlock(key, {
            type: 'function',
            category: 'functions',
            label: fn.name,
            shape: fn.block?.shape || 'reporter',
            color: 'functions',
            slots: fn.args.map(a => a.name),
            defaults: {
                func: fn.name,
                args: fn.args.map(() => null),
            },
            funcDef: fn,
        });
    }
}
