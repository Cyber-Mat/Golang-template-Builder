// preview.js — Live preview panel (right side)

import * as api from './api.js';
import { generate } from './codegen.js';

let validateTimer = null;
let currentTemplate = '';

export function initPreview() {
    // Tab switching
    const tabs = document.querySelectorAll('.panel-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
            document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
        });
    });

    // Render button
    document.getElementById('btn-render').addEventListener('click', doRender);
    document.getElementById('btn-push').addEventListener('click', doPush);
}

export function updatePreview(blockTree) {
    const source = generate(blockTree);
    currentTemplate = source;

    const codeEl = document.querySelector('#preview-source code');
    codeEl.textContent = source || '(empty template)';
    highlightSyntax(codeEl);

    // Debounced validation
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => validateSource(source), 300);
}

async function validateSource(source) {
    const msgEl = document.getElementById('preview-validation');
    if (!source) {
        msgEl.textContent = '';
        msgEl.className = 'validation-msg';
        return;
    }
    try {
        const result = await api.validateTemplate(source);
        if (result.valid) {
            msgEl.textContent = 'Template is valid';
            msgEl.className = 'validation-msg valid';
        } else {
            msgEl.textContent = result.error;
            msgEl.className = 'validation-msg invalid';
        }
    } catch (err) {
        msgEl.textContent = 'Validation failed: ' + err.message;
        msgEl.className = 'validation-msg invalid';
    }
}

async function doRender() {
    const fixtureSelect = document.getElementById('render-fixture-select');
    const fixtureId = fixtureSelect.value;
    const outputEl = document.getElementById('render-output');

    if (!fixtureId) {
        outputEl.textContent = 'Select a fixture first.';
        return;
    }

    // Get fixture data from the option
    const option = fixtureSelect.selectedOptions[0];
    let fixtureData;
    try {
        fixtureData = JSON.parse(option.dataset.fixtureData || '{}');
    } catch {
        outputEl.textContent = 'Invalid fixture data.';
        return;
    }

    try {
        outputEl.textContent = 'Rendering…';
        const result = await api.renderTemplate(currentTemplate, fixtureData);
        if (result.error) {
            outputEl.textContent = 'Error: ' + result.error;
        } else {
            outputEl.textContent = result.rendered;
        }
    } catch (err) {
        outputEl.textContent = 'Render failed: ' + err.message;
    }
}

async function doPush() {
    const outputEl = document.getElementById('render-output');
    try {
        const result = await api.pushTemplate('', '');
        outputEl.textContent = `Push: ${result.status}\n${result.message}`;
    } catch (err) {
        outputEl.textContent = 'Push failed: ' + err.message;
    }
}

// Load fixtures into the render fixture selector
export function loadFixturesIntoSelect(fixtures) {
    const select = document.getElementById('render-fixture-select');
    select.innerHTML = '<option value="">— Select Fixture —</option>';
    for (const f of fixtures) {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        opt.dataset.fixtureData = typeof f.data === 'string' ? f.data : JSON.stringify(f.data);
        select.appendChild(opt);
    }
}

// Basic syntax highlighting for Go template actions
function highlightSyntax(codeEl) {
    const text = codeEl.textContent;
    // Replace {{...}} with highlighted spans
    const html = text.replace(/(\{\{.*?\}\})/g, '<span style="color:var(--color-control)">$1</span>');
    codeEl.innerHTML = html;
}
