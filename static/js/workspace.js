// workspace.js — Drag-drop canvas (center panel)

import { createBlock, findMaxId, resetIdCounter } from './blocks.js';
import { getSubProperties } from './schema.js';

let blockTree = { type: 'sequence', children: [] };
let undoStack = [];
let redoStack = [];
let selectedBlockId = null;
let onChangeCallback = null;
let draggedBlockInfo = null; // { id, data } — set on dragstart, consumed on drop

// Public API
export function initWorkspace(onChange) {
    onChangeCallback = onChange;
    const ws = document.getElementById('workspace');
    const blocksContainer = document.getElementById('workspace-blocks');

    // Drop on workspace
    ws.addEventListener('dragover', handleDragOver);
    ws.addEventListener('dragleave', handleDragLeave);
    ws.addEventListener('drop', handleDrop);

    // Keyboard
    ws.addEventListener('keydown', handleKeyDown);

    // Click to select/deselect
    ws.addEventListener('click', (e) => {
        const blockEl = e.target.closest('[data-block-id]');
        if (blockEl) {
            selectBlock(blockEl.dataset.blockId);
        } else {
            selectBlock(null);
        }
    });

    // Undo/redo buttons
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);

    render();
}

export function getBlockTree() {
    return blockTree;
}

export function setBlockTree(tree) {
    blockTree = tree || { type: 'sequence', children: [] };
    const maxId = findMaxId(blockTree);
    resetIdCounter(maxId);
    undoStack = [];
    redoStack = [];
    selectedBlockId = null;
    render();
    notifyChange();
}

// Snapshot for undo
function pushUndo() {
    undoStack.push(JSON.stringify(blockTree));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    updateUndoButtons();
}

export function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify(blockTree));
    blockTree = JSON.parse(undoStack.pop());
    render();
    notifyChange();
    updateUndoButtons();
}

export function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify(blockTree));
    blockTree = JSON.parse(redoStack.pop());
    render();
    notifyChange();
    updateUndoButtons();
}

function updateUndoButtons() {
    document.getElementById('btn-undo').disabled = undoStack.length === 0;
    document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

function notifyChange() {
    if (onChangeCallback) onChangeCallback(blockTree);
}

function selectBlock(id) {
    selectedBlockId = id;
    // Update visual selection
    const ws = document.getElementById('workspace-blocks');
    ws.querySelectorAll('.block.selected').forEach(el => el.classList.remove('selected'));
    if (id) {
        const el = ws.querySelector(`[data-block-id="${id}"]`);
        if (el) el.classList.add('selected');
    }
}

// Keyboard handling
function handleKeyDown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBlockId) {
            e.preventDefault();
            pushUndo();
            removeBlock(blockTree, selectedBlockId);
            selectedBlockId = null;
            render();
            notifyChange();
        }
    }
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
    }
}

// Remove block by ID from tree
function removeBlock(tree, id) {
    if (tree.children) {
        const idx = tree.children.findIndex(c => c.id === id);
        if (idx !== -1) {
            tree.children.splice(idx, 1);
            return true;
        }
        for (const child of tree.children) {
            if (removeBlock(child, id)) return true;
        }
    }
    if (tree.body) {
        if (tree.body.id === id) { tree.body = { type: 'sequence', children: [] }; return true; }
        if (removeBlock(tree.body, id)) return true;
    }
    if (tree.else_body) {
        if (tree.else_body.id === id) { tree.else_body = null; return true; }
        if (removeBlock(tree.else_body, id)) return true;
    }
    if (tree.condition && tree.condition.id === id) { tree.condition = null; return true; }
    if (tree.source && tree.source.id === id) { tree.source = null; return true; }
    if (tree.args) {
        const ai = tree.args.findIndex(a => a && a.id === id);
        if (ai !== -1) { tree.args[ai] = null; return true; }
        for (const arg of tree.args) {
            if (arg && removeBlock(arg, id)) return true;
        }
    }
    return false;
}

// Drag & Drop
let dropTarget = null;
let dropPosition = null; // { parent, index } or { parent, slot }

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    const indicator = document.getElementById('drop-indicator');
    const target = findDropTarget(e);

    if (target) {
        dropTarget = target;
        if (target.type === 'between') {
            // Show horizontal line between blocks
            const rect = target.refEl.getBoundingClientRect();
            const wsRect = document.getElementById('workspace').getBoundingClientRect();
            indicator.classList.remove('hidden');
            indicator.style.left = (rect.left - wsRect.left) + 'px';
            indicator.style.width = rect.width + 'px';
            if (target.position === 'before') {
                indicator.style.top = (rect.top - wsRect.top - 2) + 'px';
            } else {
                indicator.style.top = (rect.bottom - wsRect.top - 1) + 'px';
            }
        } else if (target.type === 'mouth') {
            target.el.classList.add('drop-active');
            indicator.classList.add('hidden');
        } else if (target.type === 'slot') {
            target.el.classList.add('drop-active');
            indicator.classList.add('hidden');
        } else if (target.type === 'empty') {
            indicator.classList.remove('hidden');
            const wsRect = document.getElementById('workspace').getBoundingClientRect();
            indicator.style.left = '20px';
            indicator.style.top = '20px';
            indicator.style.width = '200px';
        }
    } else {
        indicator.classList.add('hidden');
    }
}

function handleDragLeave(e) {
    // Clear indicators
    document.getElementById('drop-indicator').classList.add('hidden');
    document.querySelectorAll('.drop-active').forEach(el => el.classList.remove('drop-active'));
    dropTarget = null;
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('drop-indicator').classList.add('hidden');
    document.querySelectorAll('.drop-active').forEach(el => el.classList.remove('drop-active'));

    const blockKey = e.dataTransfer.getData('application/x-block-key');
    const blockJSON = e.dataTransfer.getData('application/x-block-json');

    let newBlock;
    if (blockKey) {
        newBlock = createBlock(blockKey);
    } else if (blockJSON) {
        newBlock = JSON.parse(blockJSON);
    } else {
        return;
    }

    // Single undo snapshot before any mutations
    pushUndo();

    // If this is an internal move (rearranging), remove original from tree
    if (draggedBlockInfo && newBlock.id === draggedBlockInfo.id) {
        removeBlock(blockTree, draggedBlockInfo.id);
        draggedBlockInfo = null;
    }

    if (!dropTarget) {
        // Default: append to root
        blockTree.children.push(newBlock);
        render();
        notifyChange();
        return;
    }

    if (dropTarget.type === 'between') {
        const parent = dropTarget.parentSeq;
        const idx = dropTarget.index;
        parent.children.splice(idx, 0, newBlock);
    } else if (dropTarget.type === 'mouth') {
        const seq = dropTarget.seq;
        seq.children.push(newBlock);
    } else if (dropTarget.type === 'slot') {
        // Set reporter block into a slot
        dropTarget.setter(newBlock);
    } else if (dropTarget.type === 'empty') {
        blockTree.children.push(newBlock);
    }

    dropTarget = null;
    render();
    notifyChange();
}

function findDropTarget(e) {
    const target = e.target;

    // Drop into a slot (reporter)
    const slotEl = target.closest('.block-slot');
    if (slotEl) {
        return {
            type: 'slot',
            el: slotEl,
            setter: slotEl._setter,
        };
    }

    // Drop into a C-block mouth
    const mouthEl = target.closest('.block-mouth, .block-else-mouth');
    if (mouthEl) {
        return {
            type: 'mouth',
            el: mouthEl,
            seq: mouthEl._seq,
        };
    }

    // Drop between blocks
    const blockEl = target.closest('[data-block-id]');
    if (blockEl) {
        const rect = blockEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isAbove = e.clientY < midY;
        const parentEl = blockEl.parentElement;
        const parentSeq = parentEl?._seq;
        if (parentSeq) {
            const siblings = Array.from(parentEl.children).filter(c => c.dataset?.blockId);
            const blockIndex = siblings.indexOf(blockEl);
            return {
                type: 'between',
                refEl: blockEl,
                position: isAbove ? 'before' : 'after',
                parentSeq,
                index: isAbove ? blockIndex : blockIndex + 1,
            };
        }
    }

    // Empty workspace
    if (blockTree.children.length === 0) {
        return { type: 'empty' };
    }

    // Append to end
    const blocksContainer = document.getElementById('workspace-blocks');
    if (target === blocksContainer || target === document.getElementById('workspace')) {
        return {
            type: 'between',
            refEl: blocksContainer.lastElementChild || blocksContainer,
            position: 'after',
            parentSeq: blockTree,
            index: blockTree.children.length,
        };
    }

    return null;
}

// === Rendering ===

export function render() {
    const container = document.getElementById('workspace-blocks');
    container.innerHTML = '';
    container._seq = blockTree;

    if (blockTree.children.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);padding:40px;text-align:center;pointer-events:none">Drag blocks here to start building your template</div>';
        return;
    }

    for (const child of blockTree.children) {
        const el = renderBlock(child);
        container.appendChild(el);
    }

    updateStatus();
}

function renderBlock(block) {
    if (!block) return document.createTextNode('');

    switch (block.type) {
        case 'text': return renderTextBlock(block);
        case 'value': return renderValueBlock(block);
        case 'if': return renderIfBlock(block);
        case 'range': return renderRangeBlock(block);
        case 'with': return renderWithBlock(block);
        case 'define': return renderDefineBlock(block);
        case 'template': return renderTemplateBlock(block);
        case 'operator': return renderOperatorBlock(block);
        case 'builtin': return renderBuiltinBlock(block);
        case 'function': return renderFunctionBlock(block);
        case 'literal': return renderLiteralBlock(block);
        case 'pipeline': return renderPipelineBlock(block);
        case 'html-wrapper': return renderHtmlWrapperBlock(block);
        case 'confluence-macro': return renderConfluenceMacroBlock(block);
        default:
            const el = document.createElement('div');
            el.className = 'block block-stack block-text';
            el.textContent = `[${block.type}]`;
            el.dataset.blockId = block.id;
            el.draggable = true;
            addWorkspaceDrag(el, block);
            return el;
    }
}

function renderTextBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-stack block-text';
    el.dataset.blockId = block.id;
    el.draggable = true;

    const label = document.createElement('span');
    label.textContent = 'text ';
    el.appendChild(label);

    const input = document.createElement('textarea');
    input.className = 'block-input block-textarea';
    input.value = block.value || '';
    input.rows = 1;
    autoSizeTextarea(input);
    input.addEventListener('input', (e) => {
        pushUndo();
        block.value = e.target.value;
        autoSizeTextarea(input);
        notifyChange();
    });
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    el.appendChild(input);

    addWorkspaceDrag(el, block);
    return el;
}

function renderValueBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-reporter block-values';
    el.dataset.blockId = block.id;
    el.draggable = true;
    el.textContent = block.path || '.Field';
    addWorkspaceDrag(el, block);
    return el;
}

function renderIfBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-c block-control';
    el.dataset.blockId = block.id;
    el.draggable = true;

    // Header: if [condition]
    const header = document.createElement('div');
    header.className = 'block-header';
    header.innerHTML = '<span>if</span>';
    const condSlot = createSlot(block.condition, (val) => { pushUndo(); block.condition = val; render(); notifyChange(); });
    header.appendChild(condSlot);
    el.appendChild(header);

    // Body mouth
    if (!block.body) block.body = { type: 'sequence', children: [] };
    const mouth = createMouth(block.body);
    el.appendChild(mouth);

    // Else section
    if (block.else_body) {
        const elseHeader = document.createElement('div');
        elseHeader.className = 'block-else-header';
        elseHeader.textContent = 'else';
        el.appendChild(elseHeader);

        const elseMouth = document.createElement('div');
        elseMouth.className = 'block-else-mouth';
        elseMouth._seq = block.else_body;
        for (const child of block.else_body.children || []) {
            elseMouth.appendChild(renderBlock(child));
        }
        el.appendChild(elseMouth);
    } else {
        // Add else button
        const addElse = document.createElement('div');
        addElse.className = 'block-else-header';
        addElse.innerHTML = '<button class="btn" style="font-size:10px;padding:1px 8px">+ else</button>';
        addElse.querySelector('button').addEventListener('click', (e) => {
            e.stopPropagation();
            pushUndo();
            block.else_body = { type: 'sequence', children: [] };
            render();
            notifyChange();
        });
        el.appendChild(addElse);
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'block-footer';
    footer.textContent = 'end';
    el.appendChild(footer);

    addWorkspaceDrag(el, block);
    return el;
}

function renderRangeBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-c block-control';
    el.dataset.blockId = block.id;
    el.draggable = true;

    const header = document.createElement('div');
    header.className = 'block-header';

    const label = document.createElement('span');
    label.textContent = 'range ';
    header.appendChild(label);

    // Variable input
    const varInput = document.createElement('input');
    varInput.type = 'text';
    varInput.className = 'block-input';
    varInput.value = block.variable || '$item';
    varInput.style.width = '70px';
    varInput.addEventListener('input', (e) => {
        pushUndo();
        block.variable = e.target.value;
        notifyChange();
    });
    varInput.addEventListener('mousedown', (e) => e.stopPropagation());
    varInput.addEventListener('click', (e) => e.stopPropagation());
    header.appendChild(varInput);

    header.appendChild(document.createTextNode(' := '));

    // Source slot
    const srcSlot = createSlot(block.source, (val) => { pushUndo(); block.source = val; render(); notifyChange(); });
    header.appendChild(srcSlot);

    // Draggable variable chip — drag into range body to create a value block for the variable
    const varChip = document.createElement('span');
    varChip.className = 'block-var-chip block-reporter block-values';
    const varName = block.variable || '$item';
    varChip.textContent = varName;
    varChip.title = `Drag to use ${varName}`;
    varChip.draggable = true;
    varChip.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        const newBlock = createBlock('value', { path: block.variable || '$item' });
        e.dataTransfer.setData('application/x-block-json', JSON.stringify(newBlock));
        e.dataTransfer.effectAllowed = 'copy';
        varChip.classList.add('dragging');
    });
    varChip.addEventListener('dragend', () => varChip.classList.remove('dragging'));
    varChip.addEventListener('mousedown', (e) => e.stopPropagation());
    if (varName) header.appendChild(varChip);

    // Sub-property chips for array-of-objects (e.g., $section.Heading, $section.Body)
    const subChipEls = [];
    const sourcePath = block.source?.path;
    if (sourcePath) {
        const subProps = getSubProperties(sourcePath);
        for (const suffix of subProps) {
            const subChip = document.createElement('span');
            subChip.className = 'block-var-chip block-reporter block-values';
            subChip.textContent = (block.variable || '$item') + suffix;
            subChip.title = `Drag to use ${(block.variable || '$item') + suffix}`;
            subChip.draggable = true;
            subChip.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                const newBlock = createBlock('value', { path: (block.variable || '$item') + suffix });
                e.dataTransfer.setData('application/x-block-json', JSON.stringify(newBlock));
                e.dataTransfer.effectAllowed = 'copy';
                subChip.classList.add('dragging');
            });
            subChip.addEventListener('dragend', () => subChip.classList.remove('dragging'));
            subChip.addEventListener('mousedown', (e) => e.stopPropagation());
            header.appendChild(subChip);
            subChipEls.push({ el: subChip, suffix });
        }
    }

    // Keep chip text in sync with variable input
    varInput.addEventListener('input', () => {
        const v = block.variable || '$item';
        varChip.textContent = v;
        varChip.title = `Drag to use ${v}`;
        for (const { el: chip, suffix } of subChipEls) {
            chip.textContent = v + suffix;
            chip.title = `Drag to use ${v + suffix}`;
        }
    });

    el.appendChild(header);

    if (!block.body) block.body = { type: 'sequence', children: [] };
    el.appendChild(createMouth(block.body));

    const footer = document.createElement('div');
    footer.className = 'block-footer';
    footer.textContent = 'end';
    el.appendChild(footer);

    addWorkspaceDrag(el, block);
    return el;
}

function renderWithBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-c block-control';
    el.dataset.blockId = block.id;
    el.draggable = true;

    const header = document.createElement('div');
    header.className = 'block-header';
    header.innerHTML = '<span>with</span>';
    const srcSlot = createSlot(block.source, (val) => { pushUndo(); block.source = val; render(); notifyChange(); });
    header.appendChild(srcSlot);
    el.appendChild(header);

    if (!block.body) block.body = { type: 'sequence', children: [] };
    el.appendChild(createMouth(block.body));

    const footer = document.createElement('div');
    footer.className = 'block-footer';
    footer.textContent = 'end';
    el.appendChild(footer);

    addWorkspaceDrag(el, block);
    return el;
}

function renderDefineBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-c block-control';
    el.dataset.blockId = block.id;
    el.draggable = true;

    const header = document.createElement('div');
    header.className = 'block-header';
    header.innerHTML = '<span>define</span>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'block-input';
    nameInput.value = block.value || '';
    nameInput.style.width = '100px';
    nameInput.addEventListener('input', (e) => {
        pushUndo();
        block.value = e.target.value;
        notifyChange();
    });
    nameInput.addEventListener('mousedown', (e) => e.stopPropagation());
    nameInput.addEventListener('click', (e) => e.stopPropagation());
    header.appendChild(nameInput);
    el.appendChild(header);

    if (!block.body) block.body = { type: 'sequence', children: [] };
    el.appendChild(createMouth(block.body));

    const footer = document.createElement('div');
    footer.className = 'block-footer';
    footer.textContent = 'end';
    el.appendChild(footer);

    addWorkspaceDrag(el, block);
    return el;
}

function renderTemplateBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-stack block-control';
    el.dataset.blockId = block.id;
    el.draggable = true;

    el.innerHTML = '<span>template</span>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'block-input';
    nameInput.value = block.value || '';
    nameInput.style.width = '100px';
    nameInput.addEventListener('input', (e) => {
        pushUndo();
        block.value = e.target.value;
        notifyChange();
    });
    nameInput.addEventListener('mousedown', (e) => e.stopPropagation());
    nameInput.addEventListener('click', (e) => e.stopPropagation());
    el.appendChild(nameInput);

    const srcSlot = createSlot(block.source, (val) => { pushUndo(); block.source = val; render(); notifyChange(); });
    el.appendChild(srcSlot);

    addWorkspaceDrag(el, block);
    return el;
}

function renderHtmlWrapperBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-c block-html';
    el.dataset.blockId = block.id;
    el.draggable = true;

    const header = document.createElement('div');
    header.className = 'block-header';

    const openTag = document.createElement('span');
    openTag.textContent = `<${block.tag || 'div'}`;
    header.appendChild(openTag);

    const attrsInput = document.createElement('input');
    attrsInput.type = 'text';
    attrsInput.className = 'block-input';
    attrsInput.value = block.attrs || '';
    attrsInput.placeholder = 'class="..." id="..."';
    attrsInput.style.width = Math.max(80, (block.attrs || '').length * 8 + 20) + 'px';
    attrsInput.addEventListener('input', (e) => {
        pushUndo();
        block.attrs = e.target.value;
        attrsInput.style.width = Math.max(80, e.target.value.length * 8 + 20) + 'px';
        notifyChange();
    });
    attrsInput.addEventListener('mousedown', (e) => e.stopPropagation());
    attrsInput.addEventListener('click', (e) => e.stopPropagation());
    header.appendChild(attrsInput);

    header.appendChild(document.createTextNode('>'));
    el.appendChild(header);

    if (!block.body) block.body = { type: 'sequence', children: [] };
    el.appendChild(createMouth(block.body));

    const footer = document.createElement('div');
    footer.className = 'block-footer';
    footer.textContent = `</${block.tag || 'div'}>`;
    el.appendChild(footer);

    addWorkspaceDrag(el, block);
    return el;
}

function renderConfluenceMacroBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-c block-confluence';
    el.dataset.blockId = block.id;
    el.draggable = true;

    const header = document.createElement('div');
    header.className = 'block-header';

    const label = document.createElement('span');
    label.textContent = `ac:${block.macroName || 'code'} `;
    header.appendChild(label);

    const paramsInput = document.createElement('input');
    paramsInput.type = 'text';
    paramsInput.className = 'block-input';
    paramsInput.value = block.params || '';
    paramsInput.placeholder = 'language=go title=...';
    paramsInput.style.width = Math.max(100, (block.params || '').length * 8 + 20) + 'px';
    paramsInput.addEventListener('input', (e) => {
        pushUndo();
        block.params = e.target.value;
        paramsInput.style.width = Math.max(100, e.target.value.length * 8 + 20) + 'px';
        notifyChange();
    });
    paramsInput.addEventListener('mousedown', (e) => e.stopPropagation());
    paramsInput.addEventListener('click', (e) => e.stopPropagation());
    header.appendChild(paramsInput);

    el.appendChild(header);

    if (!block.body) block.body = { type: 'sequence', children: [] };
    el.appendChild(createMouth(block.body));

    const footer = document.createElement('div');
    footer.className = 'block-footer';
    footer.textContent = `end ac:${block.macroName || 'code'}`;
    el.appendChild(footer);

    addWorkspaceDrag(el, block);
    return el;
}

function renderOperatorBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-reporter block-operators';
    el.dataset.blockId = block.id;
    el.draggable = true;

    el.appendChild(document.createTextNode(block.op + ' '));

    // Args: two slots for binary ops, one for 'not'
    const argCount = block.op === 'not' ? 1 : 2;
    if (!block.args) block.args = new Array(argCount).fill(null);
    for (let i = 0; i < argCount; i++) {
        const idx = i;
        const slot = createSlot(block.args[i], (val) => {
            pushUndo();
            block.args[idx] = val;
            render();
            notifyChange();
        });
        el.appendChild(slot);
        if (i < argCount - 1) el.appendChild(document.createTextNode(' '));
    }

    addWorkspaceDrag(el, block);
    return el;
}

function renderBuiltinBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-reporter block-builtins';
    el.dataset.blockId = block.id;
    el.draggable = true;

    el.appendChild(document.createTextNode(block.func + ' '));

    // Single arg slot (most builtins take 1 primary arg)
    if (!block.args) block.args = [null];
    for (let i = 0; i < block.args.length; i++) {
        const idx = i;
        const slot = createSlot(block.args[i], (val) => {
            pushUndo();
            block.args[idx] = val;
            render();
            notifyChange();
        });
        el.appendChild(slot);
    }

    // + arg button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.style.cssText = 'font-size:10px;padding:0 6px;margin-left:4px';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pushUndo();
        block.args.push(null);
        render();
        notifyChange();
    });
    el.appendChild(addBtn);

    addWorkspaceDrag(el, block);
    return el;
}

function renderFunctionBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-reporter block-functions';
    el.dataset.blockId = block.id;
    el.draggable = true;

    el.appendChild(document.createTextNode(block.func + ' '));

    if (!block.args) block.args = [];
    for (let i = 0; i < block.args.length; i++) {
        const idx = i;
        const slot = createSlot(block.args[i], (val) => {
            pushUndo();
            block.args[idx] = val;
            render();
            notifyChange();
        });
        el.appendChild(slot);
    }

    addWorkspaceDrag(el, block);
    return el;
}

function renderLiteralBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-reporter block-literals';
    el.dataset.blockId = block.id;
    el.draggable = true;

    const prefix = block.datatype === 'string' ? '"'
        : block.datatype === 'bool' ? ''
        : '';
    const suffix = block.datatype === 'string' ? '"' : '';

    if (block.datatype === 'bool') {
        const select = document.createElement('select');
        select.className = 'block-input';
        select.innerHTML = '<option value="true">true</option><option value="false">false</option>';
        select.value = block.value;
        select.addEventListener('change', (e) => {
            pushUndo();
            block.value = e.target.value;
            notifyChange();
        });
        select.addEventListener('mousedown', (e) => e.stopPropagation());
        el.appendChild(select);
    } else {
        if (prefix) el.appendChild(document.createTextNode(prefix));
        const input = document.createElement('input');
        input.type = block.datatype === 'number' ? 'number' : 'text';
        input.className = 'block-input';
        input.value = block.value || '';
        input.style.width = Math.max(40, (block.value || '').length * 8 + 16) + 'px';
        input.addEventListener('input', (e) => {
            pushUndo();
            block.value = e.target.value;
            input.style.width = Math.max(40, e.target.value.length * 8 + 16) + 'px';
            notifyChange();
        });
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('click', (e) => e.stopPropagation());
        el.appendChild(input);
        if (suffix) el.appendChild(document.createTextNode(suffix));
    }

    addWorkspaceDrag(el, block);
    return el;
}

function renderPipelineBlock(block) {
    const el = document.createElement('div');
    el.className = 'block block-reporter block-pipeline';
    el.dataset.blockId = block.id;
    el.draggable = true;

    if (!block.stages) block.stages = [];
    for (let i = 0; i < block.stages.length; i++) {
        if (i > 0) el.appendChild(document.createTextNode(' | '));
        const idx = i;
        const slot = createSlot(block.stages[i], (val) => {
            pushUndo();
            block.stages[idx] = val;
            render();
            notifyChange();
        });
        el.appendChild(slot);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.style.cssText = 'font-size:10px;padding:0 6px;margin-left:4px';
    addBtn.textContent = '+ |';
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pushUndo();
        block.stages.push(null);
        render();
        notifyChange();
    });
    el.appendChild(addBtn);

    addWorkspaceDrag(el, block);
    return el;
}

// Helper: auto-size a textarea to fit its content
function autoSizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
    const lines = el.value.split('\n');
    const maxLen = Math.max(...lines.map(l => l.length), 6);
    el.style.width = Math.max(60, maxLen * 8 + 20) + 'px';
}

// Helper: create a slot element that accepts a reporter block
function createSlot(currentBlock, setter) {
    const slot = document.createElement('span');
    slot.className = 'block-slot';
    slot._setter = setter;

    if (currentBlock) {
        slot.appendChild(renderBlock(currentBlock));
    } else {
        slot.textContent = '…';
    }

    // Allow drop into slot
    slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.add('drop-active');
    });
    slot.addEventListener('dragleave', () => {
        slot.classList.remove('drop-active');
    });
    slot.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('drop-active');

        const blockKey = e.dataTransfer.getData('application/x-block-key');
        const blockJSON = e.dataTransfer.getData('application/x-block-json');
        let newBlock;
        if (blockKey) {
            newBlock = createBlock(blockKey);
        } else if (blockJSON) {
            newBlock = JSON.parse(blockJSON);
        }
        if (newBlock) {
            pushUndo();
            // If internal move, remove original first
            if (draggedBlockInfo && newBlock.id === draggedBlockInfo.id) {
                removeBlock(blockTree, draggedBlockInfo.id);
                draggedBlockInfo = null;
            }
            setter(newBlock);
        }
    });

    return slot;
}

// Helper: create a mouth element for C-blocks
function createMouth(seq) {
    const mouth = document.createElement('div');
    mouth.className = 'block-mouth';
    mouth._seq = seq;

    if (seq.children && seq.children.length > 0) {
        for (const child of seq.children) {
            mouth.appendChild(renderBlock(child));
        }
    }

    return mouth;
}

// Make workspace blocks draggable (for rearranging)
function addWorkspaceDrag(el, block) {
    el.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('application/x-block-json', JSON.stringify(block));
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');

        // Store info — do NOT remove from tree yet (removed on successful drop)
        draggedBlockInfo = { id: block.id, data: JSON.stringify(block) };
    });
    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        // If still set, drop didn't happen — block stays where it was
        draggedBlockInfo = null;
    });
}

function updateStatus() {
    const count = countBlocks(blockTree);
    document.getElementById('status-text').textContent = `${count} block${count !== 1 ? 's' : ''}`;
}

function countBlocks(block) {
    if (!block) return 0;
    let count = block.id ? 1 : 0;
    if (block.children) for (const c of block.children) count += countBlocks(c);
    if (block.body) count += countBlocks(block.body);
    if (block.else_body) count += countBlocks(block.else_body);
    if (block.condition) count += countBlocks(block.condition);
    if (block.source) count += countBlocks(block.source);
    if (block.args) for (const a of block.args) count += countBlocks(a);
    if (block.stages) for (const s of block.stages) count += countBlocks(s);
    return count;
}
