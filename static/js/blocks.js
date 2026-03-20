// blocks.js — Block model, registry, and factory

let nextId = 1;
function genId() { return 'b' + (nextId++); }

// Built-in block definitions
export const BLOCK_DEFS = {
    // Text
    text: {
        type: 'text',
        category: 'text',
        label: 'Text',
        shape: 'stack',
        color: 'text',
        slots: [],
        defaults: { value: 'Hello' },
    },
    // Values — dynamically added from schema
    value: {
        type: 'value',
        category: 'values',
        label: 'Value',
        shape: 'reporter',
        color: 'values',
        slots: [],
        defaults: { path: '.Field' },
    },
    // Control
    if: {
        type: 'if',
        category: 'control',
        label: 'if',
        shape: 'c-block',
        color: 'control',
        slots: ['condition'],
        defaults: {},
    },
    range: {
        type: 'range',
        category: 'control',
        label: 'range',
        shape: 'c-block',
        color: 'control',
        slots: ['source'],
        defaults: { variable: '$item' },
    },
    with: {
        type: 'with',
        category: 'control',
        label: 'with',
        shape: 'c-block',
        color: 'control',
        slots: ['source'],
        defaults: {},
    },
    define: {
        type: 'define',
        category: 'control',
        label: 'define',
        shape: 'c-block',
        color: 'control',
        slots: [],
        defaults: { value: 'blockName' },
    },
    template: {
        type: 'template',
        category: 'control',
        label: 'template',
        shape: 'stack',
        color: 'control',
        slots: ['source'],
        defaults: { value: 'blockName' },
    },
    // Operators
    eq: { type: 'operator', category: 'operators', label: 'eq', shape: 'reporter', color: 'operators', slots: [], defaults: { op: 'eq' } },
    ne: { type: 'operator', category: 'operators', label: 'ne', shape: 'reporter', color: 'operators', slots: [], defaults: { op: 'ne' } },
    lt: { type: 'operator', category: 'operators', label: 'lt', shape: 'reporter', color: 'operators', slots: [], defaults: { op: 'lt' } },
    gt: { type: 'operator', category: 'operators', label: 'gt', shape: 'reporter', color: 'operators', slots: [], defaults: { op: 'gt' } },
    le: { type: 'operator', category: 'operators', label: 'le', shape: 'reporter', color: 'operators', slots: [], defaults: { op: 'le' } },
    ge: { type: 'operator', category: 'operators', label: 'ge', shape: 'reporter', color: 'operators', slots: [], defaults: { op: 'ge' } },
    and: { type: 'operator', category: 'operators', label: 'and', shape: 'reporter', color: 'operators', slots: [], defaults: { op: 'and' } },
    or: { type: 'operator', category: 'operators', label: 'or', shape: 'reporter', color: 'operators', slots: [], defaults: { op: 'or' } },
    not: { type: 'operator', category: 'operators', label: 'not', shape: 'reporter', color: 'operators', slots: [], defaults: { op: 'not' } },
    // Builtins
    len: { type: 'builtin', category: 'builtins', label: 'len', shape: 'reporter', color: 'builtins', slots: [], defaults: { func: 'len' } },
    index: { type: 'builtin', category: 'builtins', label: 'index', shape: 'reporter', color: 'builtins', slots: [], defaults: { func: 'index' } },
    slice: { type: 'builtin', category: 'builtins', label: 'slice', shape: 'reporter', color: 'builtins', slots: [], defaults: { func: 'slice' } },
    printf: { type: 'builtin', category: 'builtins', label: 'printf', shape: 'reporter', color: 'builtins', slots: [], defaults: { func: 'printf' } },
    html: { type: 'builtin', category: 'builtins', label: 'html', shape: 'reporter', color: 'builtins', slots: [], defaults: { func: 'html' } },
    js: { type: 'builtin', category: 'builtins', label: 'js', shape: 'reporter', color: 'builtins', slots: [], defaults: { func: 'js' } },
    urlquery: { type: 'builtin', category: 'builtins', label: 'urlquery', shape: 'reporter', color: 'builtins', slots: [], defaults: { func: 'urlquery' } },
    // Pipeline
    pipeline: {
        type: 'pipeline',
        category: 'pipeline',
        label: 'pipe |',
        shape: 'reporter',
        color: 'pipeline',
        slots: [],
        defaults: { stages: [] },
    },
    // Literals
    string_literal: {
        type: 'literal',
        category: 'literals',
        label: 'string ""',
        shape: 'reporter',
        color: 'literals',
        slots: [],
        defaults: { datatype: 'string', value: '' },
    },
    number_literal: {
        type: 'literal',
        category: 'literals',
        label: 'number',
        shape: 'reporter',
        color: 'literals',
        slots: [],
        defaults: { datatype: 'number', value: '0' },
    },
    bool_literal: {
        type: 'literal',
        category: 'literals',
        label: 'bool',
        shape: 'reporter',
        color: 'literals',
        slots: [],
        defaults: { datatype: 'bool', value: 'true' },
    },
};

// Category metadata
export const CATEGORIES = [
    { id: 'text', label: 'Text', color: '#E8912D' },
    { id: 'values', label: 'Values', color: '#4A90D9' },
    { id: 'control', label: 'Control', color: '#D4A017' },
    { id: 'functions', label: 'Functions', color: '#4CAF50' },
    { id: 'operators', label: 'Operators', color: '#9C27B0' },
    { id: 'builtins', label: 'Builtins', color: '#00897B' },
    { id: 'pipeline', label: 'Pipeline', color: '#0097A7' },
    { id: 'literals', label: 'Literals', color: '#607D8B' },
];

// Registry: maps defKey → definition. Includes dynamic (schema/funcmap) blocks.
const registry = new Map();

export function initRegistry() {
    registry.clear();
    for (const [key, def] of Object.entries(BLOCK_DEFS)) {
        registry.set(key, def);
    }
}

export function registerBlock(key, def) {
    registry.set(key, def);
}

export function getBlockDef(key) {
    return registry.get(key);
}

export function getBlocksByCategory(category) {
    const result = [];
    for (const [key, def] of registry) {
        if (def.category === category) {
            result.push({ key, ...def });
        }
    }
    return result;
}

// Block factory: creates a block instance (plain object) from a definition key
export function createBlock(defKeyOrType, config = {}) {
    const def = registry.get(defKeyOrType);
    const base = def ? { ...def.defaults } : {};
    const block = {
        id: genId(),
        type: def ? def.type : defKeyOrType,
        ...base,
        ...config,
    };
    // Ensure children/body exist for c-blocks
    if (block.type === 'if' || block.type === 'range' || block.type === 'with' || block.type === 'define') {
        if (!block.body) {
            block.body = { type: 'sequence', children: [] };
        }
    }
    if (block.type === 'if' && block.else_body === undefined) {
        block.else_body = null;
    }
    return block;
}

// Serialization
export function blockTreeToJSON(blockTree) {
    return JSON.parse(JSON.stringify(blockTree));
}

export function blockTreeFromJSON(json) {
    if (typeof json === 'string') {
        return JSON.parse(json);
    }
    return JSON.parse(JSON.stringify(json));
}

// Reset ID counter (used when loading existing trees)
export function resetIdCounter(max) {
    nextId = max + 1;
}

// Find the max ID number in a block tree
export function findMaxId(block) {
    if (!block) return 0;
    let max = 0;
    if (block.id) {
        const num = parseInt(block.id.replace('b', ''), 10);
        if (!isNaN(num) && num > max) max = num;
    }
    if (block.children) {
        for (const child of block.children) {
            max = Math.max(max, findMaxId(child));
        }
    }
    if (block.body) max = Math.max(max, findMaxId(block.body));
    if (block.else_body) max = Math.max(max, findMaxId(block.else_body));
    if (block.condition) max = Math.max(max, findMaxId(block.condition));
    if (block.source) max = Math.max(max, findMaxId(block.source));
    if (block.args) {
        for (const arg of block.args) {
            max = Math.max(max, findMaxId(arg));
        }
    }
    if (block.stages) {
        for (const stage of block.stages) {
            max = Math.max(max, findMaxId(stage));
        }
    }
    return max;
}

initRegistry();
