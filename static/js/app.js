// app.js — Boot: init all modules, wire events

import * as api from './api.js';
import { initRegistry, blockTreeFromJSON, blockTreeToJSON } from './blocks.js';
import { parseSchema, registerSchemaBlocks, registerFuncMapBlocks } from './schema.js';
import { initPalette, renderPalette } from './palette.js';
import { initWorkspace, setBlockTree, getBlockTree } from './workspace.js';
import { updatePreview, initPreview, loadFixturesIntoSelect } from './preview.js';
import { initVersions, setCurrentTemplateId } from './versions.js';

// State
let currentSchemaId = null;
let currentCollectionId = null;
let currentTemplateId = null;

async function boot() {
    initRegistry();
    initPalette();
    initWorkspace(onBlockTreeChange);
    initPreview();
    initVersions();

    // Load FuncMap config and register blocks
    try {
        const fmConfig = await api.getFuncMap();
        registerFuncMapBlocks(fmConfig);
        renderPalette();
    } catch (err) {
        console.warn('Failed to load FuncMap config:', err);
    }

    // Load schemas
    await loadSchemas();

    // Wire up top bar
    document.getElementById('schema-select').addEventListener('change', onSchemaChange);
    document.getElementById('collection-select').addEventListener('change', onCollectionChange);
    document.getElementById('template-select').addEventListener('change', onTemplateChange);
    document.getElementById('btn-save').addEventListener('click', onSave);

    // New entity buttons
    document.getElementById('btn-new-schema').addEventListener('click', () => openModal('schema-modal'));
    document.getElementById('btn-new-collection').addEventListener('click', () => openModal('collection-modal'));
    document.getElementById('btn-new-template').addEventListener('click', () => openModal('template-modal'));

    // Modal save buttons
    document.getElementById('btn-save-schema').addEventListener('click', onSaveSchema);
    document.getElementById('btn-save-collection').addEventListener('click', onSaveCollection);
    document.getElementById('btn-save-template').addEventListener('click', onSaveNewTemplate);

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.add('hidden');
        });
    });
    document.querySelectorAll('.modal-backdrop').forEach(el => {
        el.addEventListener('click', () => {
            el.closest('.modal').classList.add('hidden');
        });
    });

    // Fixture management
    document.getElementById('btn-new-fixture').addEventListener('click', showFixtureEditor);
    document.getElementById('btn-save-fixture').addEventListener('click', onSaveFixture);
    document.getElementById('btn-cancel-fixture').addEventListener('click', hideFixtureEditor);

    // Expose reload function for version restore
    window._reloadCurrentTemplate = loadCurrentTemplate;
}

// Block tree change callback
function onBlockTreeChange(blockTree) {
    updatePreview(blockTree);
}

// === Schema loading ===

async function loadSchemas() {
    const select = document.getElementById('schema-select');
    try {
        const schemas = await api.listSchemas();
        select.innerHTML = '<option value="">— Select Schema —</option>';
        for (const s of schemas) {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.name} v${s.version}`;
            select.appendChild(opt);
        }
    } catch (err) {
        console.error('Failed to load schemas:', err);
    }
}

async function onSchemaChange(e) {
    currentSchemaId = e.target.value || null;
    currentCollectionId = null;
    currentTemplateId = null;

    const colSelect = document.getElementById('collection-select');
    const tmplSelect = document.getElementById('template-select');
    colSelect.disabled = !currentSchemaId;
    tmplSelect.disabled = true;
    document.getElementById('btn-new-collection').disabled = !currentSchemaId;
    document.getElementById('btn-new-template').disabled = true;
    document.getElementById('btn-save').disabled = true;
    document.getElementById('btn-versions').disabled = true;

    if (!currentSchemaId) {
        colSelect.innerHTML = '<option value="">— Select Collection —</option>';
        tmplSelect.innerHTML = '<option value="">— Select Template —</option>';
        // Reset palette to remove schema-specific blocks
        initRegistry();
        try {
            const fmConfig = await api.getFuncMap();
            registerFuncMapBlocks(fmConfig);
        } catch { /* ignore */ }
        renderPalette();
        return;
    }

    // Load schema and register value blocks
    try {
        const schema = await api.getSchema(currentSchemaId);
        const jsonSchema = typeof schema.json_schema === 'string'
            ? JSON.parse(schema.json_schema) : schema.json_schema;
        const paths = parseSchema(jsonSchema);

        // Rebuild registry with schema blocks
        initRegistry();
        registerSchemaBlocks(paths);
        try {
            const fmConfig = await api.getFuncMap();
            registerFuncMapBlocks(fmConfig);
        } catch { /* ignore */ }
        renderPalette();
    } catch (err) {
        console.error('Failed to load schema:', err);
    }

    // Load collections
    try {
        const collections = await api.listCollections(currentSchemaId);
        colSelect.innerHTML = '<option value="">— Select Collection —</option>';
        for (const c of collections) {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            colSelect.appendChild(opt);
        }
    } catch (err) {
        console.error('Failed to load collections:', err);
    }
}

async function onCollectionChange(e) {
    currentCollectionId = e.target.value || null;
    currentTemplateId = null;

    const tmplSelect = document.getElementById('template-select');
    tmplSelect.disabled = !currentCollectionId;
    document.getElementById('btn-new-template').disabled = !currentCollectionId;
    document.getElementById('btn-save').disabled = true;
    document.getElementById('btn-versions').disabled = true;

    if (!currentCollectionId) {
        tmplSelect.innerHTML = '<option value="">— Select Template —</option>';
        return;
    }

    // Load templates for collection
    try {
        const result = await api.getCollection(currentCollectionId);
        const templates = result.templates || [];
        tmplSelect.innerHTML = '<option value="">— Select Template —</option>';
        for (const t of templates) {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.name} (rev ${t.revision})`;
            tmplSelect.appendChild(opt);
        }
    } catch (err) {
        console.error('Failed to load templates:', err);
    }

    // Load fixtures
    await loadFixtures();
}

async function onTemplateChange(e) {
    currentTemplateId = e.target.value || null;
    document.getElementById('btn-save').disabled = !currentTemplateId;
    document.getElementById('btn-versions').disabled = !currentTemplateId;
    setCurrentTemplateId(currentTemplateId);

    if (!currentTemplateId) {
        setBlockTree(null);
        return;
    }

    await loadCurrentTemplate();
}

async function loadCurrentTemplate() {
    if (!currentTemplateId) return;
    try {
        const tmpl = await api.getTemplate(currentTemplateId);
        const tree = typeof tmpl.block_tree === 'string'
            ? JSON.parse(tmpl.block_tree) : tmpl.block_tree;
        setBlockTree(tree);
    } catch (err) {
        console.error('Failed to load template:', err);
    }
}

// === Save ===

async function onSave() {
    if (!currentTemplateId) return;
    const blockTree = getBlockTree();
    const comment = prompt('Revision comment (optional):') || '';
    try {
        await api.saveTemplate(currentTemplateId, blockTree, comment);
        document.getElementById('status-text').textContent = 'Saved!';
        setTimeout(() => {
            document.getElementById('status-text').textContent = '';
        }, 2000);
    } catch (err) {
        alert('Save failed: ' + err.message);
    }
}

// === Create entities ===

async function onSaveSchema() {
    const name = document.getElementById('schema-name').value.trim();
    const version = document.getElementById('schema-version').value.trim();
    const jsonStr = document.getElementById('schema-json').value.trim();

    if (!name || !version || !jsonStr) {
        alert('All fields are required.');
        return;
    }

    let jsonSchema;
    try {
        jsonSchema = JSON.parse(jsonStr);
    } catch {
        alert('Invalid JSON schema.');
        return;
    }

    try {
        await api.createSchema(name, version, jsonSchema);
        closeModal('schema-modal');
        document.getElementById('schema-name').value = '';
        document.getElementById('schema-version').value = '';
        document.getElementById('schema-json').value = '';
        await loadSchemas();
    } catch (err) {
        alert('Create schema failed: ' + err.message);
    }
}

async function onSaveCollection() {
    if (!currentSchemaId) return;
    const name = document.getElementById('collection-name').value.trim();
    const desc = document.getElementById('collection-description').value.trim();

    if (!name) { alert('Name is required.'); return; }

    try {
        await api.createCollection(currentSchemaId, name, desc);
        closeModal('collection-modal');
        document.getElementById('collection-name').value = '';
        document.getElementById('collection-description').value = '';
        // Trigger reload of collections
        document.getElementById('schema-select').dispatchEvent(new Event('change'));
    } catch (err) {
        alert('Create collection failed: ' + err.message);
    }
}

async function onSaveNewTemplate() {
    if (!currentCollectionId) return;
    const name = document.getElementById('template-name').value.trim();
    if (!name) { alert('Name is required.'); return; }

    try {
        await api.createTemplate(currentCollectionId, name);
        closeModal('template-modal');
        document.getElementById('template-name').value = '';
        // Trigger reload of templates
        document.getElementById('collection-select').dispatchEvent(new Event('change'));
    } catch (err) {
        alert('Create template failed: ' + err.message);
    }
}

// === Fixtures ===

let editingFixtureId = null;

async function loadFixtures() {
    if (!currentCollectionId) return;
    try {
        const fixtures = await api.listFixtures(currentCollectionId);
        loadFixturesIntoSelect(fixtures);
        renderFixtureList(fixtures);
    } catch (err) {
        console.error('Failed to load fixtures:', err);
    }
}

function renderFixtureList(fixtures) {
    const listEl = document.getElementById('fixture-list');
    listEl.innerHTML = '';
    for (const f of fixtures) {
        const item = document.createElement('div');
        item.className = 'fixture-item';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = f.name;
        item.appendChild(nameSpan);

        const actions = document.createElement('div');
        actions.className = 'fixture-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
            editingFixtureId = f.id;
            document.getElementById('fixture-name').value = f.name;
            const data = typeof f.data === 'string' ? f.data : JSON.stringify(f.data, null, 2);
            document.getElementById('fixture-data').value = data;
            document.getElementById('fixture-editor').classList.remove('hidden');
        });
        actions.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
            if (!confirm(`Delete fixture "${f.name}"?`)) return;
            try {
                await api.deleteFixture(f.id);
                await loadFixtures();
            } catch (err) {
                alert('Delete failed: ' + err.message);
            }
        });
        actions.appendChild(delBtn);

        item.appendChild(actions);
        listEl.appendChild(item);
    }
}

function showFixtureEditor() {
    editingFixtureId = null;
    document.getElementById('fixture-name').value = '';
    document.getElementById('fixture-data').value = '';
    document.getElementById('fixture-editor').classList.remove('hidden');
}

function hideFixtureEditor() {
    document.getElementById('fixture-editor').classList.add('hidden');
    editingFixtureId = null;
}

async function onSaveFixture() {
    const name = document.getElementById('fixture-name').value.trim();
    const dataStr = document.getElementById('fixture-data').value.trim();
    if (!name || !dataStr) { alert('Name and data are required.'); return; }

    let data;
    try {
        data = JSON.parse(dataStr);
    } catch {
        alert('Invalid JSON data.');
        return;
    }

    try {
        if (editingFixtureId) {
            await api.updateFixture(editingFixtureId, name, data);
        } else {
            await api.createFixture(currentCollectionId, name, data);
        }
        hideFixtureEditor();
        await loadFixtures();
    } catch (err) {
        alert('Save fixture failed: ' + err.message);
    }
}

// === Modals ===

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// Boot!
document.addEventListener('DOMContentLoaded', boot);
