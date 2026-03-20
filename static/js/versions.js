// versions.js — Version history UI & diffing

import * as api from './api.js';
import { generate } from './codegen.js';

let currentTemplateId = null;
let revisions = [];
let selectedRevisions = []; // up to 2 selected for diff

export function initVersions() {
    document.getElementById('btn-versions').addEventListener('click', openVersionModal);

    // Modal close
    const modal = document.getElementById('version-modal');
    modal.querySelector('.modal-close').addEventListener('click', closeVersionModal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closeVersionModal);
}

export function setCurrentTemplateId(id) {
    currentTemplateId = id;
}

async function openVersionModal() {
    if (!currentTemplateId) return;
    const modal = document.getElementById('version-modal');
    modal.classList.remove('hidden');

    try {
        revisions = await api.listRevisions(currentTemplateId);
        renderRevisionList();
    } catch (err) {
        document.getElementById('version-list').innerHTML =
            `<div style="color:var(--danger);padding:12px">Failed to load revisions: ${err.message}</div>`;
    }
}

function closeVersionModal() {
    document.getElementById('version-modal').classList.add('hidden');
    selectedRevisions = [];
}

function renderRevisionList() {
    const listEl = document.getElementById('version-list');
    listEl.innerHTML = '';

    if (revisions.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-muted);padding:12px">No revisions yet.</div>';
        return;
    }

    for (const rev of revisions) {
        const item = document.createElement('div');
        item.className = 'version-item';
        if (selectedRevisions.includes(rev.revision)) item.classList.add('selected');

        const meta = document.createElement('div');
        meta.className = 'version-meta';
        meta.innerHTML = `
            <span class="version-rev">Revision ${rev.revision}</span>
            <span class="version-date">${formatDate(rev.created_at)}</span>
            ${rev.comment ? `<span class="version-comment">${escapeHtml(rev.comment)}</span>` : ''}
        `;
        item.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'version-actions';

        const diffBtn = document.createElement('button');
        diffBtn.className = 'btn';
        diffBtn.textContent = 'Diff';
        diffBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDiffSelection(rev.revision);
        });
        actions.appendChild(diffBtn);

        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn';
        restoreBtn.textContent = 'Restore';
        restoreBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await doRestore(rev.revision);
        });
        actions.appendChild(restoreBtn);

        item.appendChild(actions);
        listEl.appendChild(item);
    }
}

function toggleDiffSelection(revNum) {
    const idx = selectedRevisions.indexOf(revNum);
    if (idx >= 0) {
        selectedRevisions.splice(idx, 1);
    } else {
        selectedRevisions.push(revNum);
        if (selectedRevisions.length > 2) {
            selectedRevisions.shift();
        }
    }
    renderRevisionList();
    if (selectedRevisions.length === 2) {
        showDiff(selectedRevisions[0], selectedRevisions[1]);
    } else {
        clearDiff();
    }
}

async function showDiff(revA, revB) {
    const diffEl = document.getElementById('version-diff');
    const leftLabel = document.getElementById('diff-left-label');
    const rightLabel = document.getElementById('diff-right-label');
    const leftPre = document.getElementById('diff-left');
    const rightPre = document.getElementById('diff-right');

    try {
        const [a, b] = await Promise.all([
            api.getRevision(currentTemplateId, revA),
            api.getRevision(currentTemplateId, revB),
        ]);

        leftLabel.textContent = `Revision ${revA}`;
        rightLabel.textContent = `Revision ${revB}`;

        // Regenerate template source from block_tree (single source of truth)
        const treeA = typeof a.block_tree === 'string' ? JSON.parse(a.block_tree) : a.block_tree;
        const treeB = typeof b.block_tree === 'string' ? JSON.parse(b.block_tree) : b.block_tree;
        const linesA = generate(treeA).split('\n');
        const linesB = generate(treeB).split('\n');

        leftPre.innerHTML = '';
        rightPre.innerHTML = '';

        const maxLen = Math.max(linesA.length, linesB.length);
        for (let i = 0; i < maxLen; i++) {
            const la = linesA[i] ?? '';
            const lb = linesB[i] ?? '';

            const leftLine = document.createElement('div');
            const rightLine = document.createElement('div');
            leftLine.textContent = la;
            rightLine.textContent = lb;

            if (la !== lb) {
                if (la && !lb) {
                    leftLine.className = 'diff-line-removed';
                } else if (!la && lb) {
                    rightLine.className = 'diff-line-added';
                } else {
                    leftLine.className = 'diff-line-removed';
                    rightLine.className = 'diff-line-added';
                }
            }

            leftPre.appendChild(leftLine);
            rightPre.appendChild(rightLine);
        }

        diffEl.style.display = 'block';
    } catch (err) {
        leftPre.textContent = 'Error loading revision';
        rightPre.textContent = err.message;
    }
}

function clearDiff() {
    document.getElementById('version-diff').style.display = 'none';
}

async function doRestore(revNum) {
    if (!currentTemplateId) return;
    try {
        await api.restoreRevision(currentTemplateId, revNum);
        closeVersionModal();
        // Trigger reload of the template in the workspace
        if (window._reloadCurrentTemplate) {
            window._reloadCurrentTemplate();
        }
    } catch (err) {
        alert('Restore failed: ' + err.message);
    }
}

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr);
        return d.toLocaleString();
    } catch {
        return dateStr;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
