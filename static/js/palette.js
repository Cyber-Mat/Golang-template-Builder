// palette.js — Block toolbox (left panel)

import { CATEGORIES, getBlocksByCategory } from './blocks.js';

let searchFilter = '';

export function initPalette() {
    const searchInput = document.getElementById('palette-search');
    searchInput.addEventListener('input', (e) => {
        searchFilter = e.target.value.toLowerCase();
        renderPalette();
    });
    renderPalette();
}

export function renderPalette() {
    const container = document.getElementById('palette-categories');
    container.innerHTML = '';

    for (const cat of CATEGORIES) {
        const blocks = getBlocksByCategory(cat.id);
        // Filter by search
        const filtered = searchFilter
            ? blocks.filter(b => b.label.toLowerCase().includes(searchFilter))
            : blocks;

        if (filtered.length === 0 && searchFilter) continue;

        const catEl = document.createElement('div');
        catEl.className = 'palette-category';

        // Header
        const header = document.createElement('div');
        header.className = 'palette-category-header';
        header.innerHTML = `
            <span class="arrow">▼</span>
            <span class="palette-category-color" style="background:${cat.color}"></span>
            <span>${cat.label}</span>
            <span style="color:var(--text-muted);font-weight:normal;font-size:11px">(${filtered.length})</span>
        `;
        header.addEventListener('click', () => {
            catEl.classList.toggle('collapsed');
        });
        catEl.appendChild(header);

        // Blocks
        const blocksEl = document.createElement('div');
        blocksEl.className = 'palette-category-blocks';
        for (const block of filtered) {
            const blockEl = createPaletteBlock(block);
            blocksEl.appendChild(blockEl);
        }
        catEl.appendChild(blocksEl);
        container.appendChild(catEl);
    }
}

function createPaletteBlock(blockDef) {
    const el = document.createElement('div');
    const shapeClass = blockDef.shape === 'reporter' ? 'block-reporter'
        : blockDef.shape === 'c-block' ? 'block-stack' // palette shows c-blocks as stack shape
        : 'block-stack';
    el.className = `block ${shapeClass} block-${blockDef.color || blockDef.category}`;
    el.textContent = blockDef.label;
    el.draggable = true;

    el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-block-key', blockDef.key);
        e.dataTransfer.effectAllowed = 'copy';
        el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
    });

    return el;
}
