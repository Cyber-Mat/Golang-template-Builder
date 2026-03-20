// api.js — Thin fetch() wrappers for all backend endpoints

const BASE = '/api';

async function request(method, path, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, opts);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}

// Schemas
export const listSchemas = () => request('GET', '/schemas');
export const getSchema = (id) => request('GET', `/schemas/${id}`);
export const createSchema = (name, version, jsonSchema) =>
    request('POST', '/schemas', { name, version, json_schema: jsonSchema });
export const updateSchema = (id, data) => request('PUT', `/schemas/${id}`, data);

// Collections
export const listCollections = (schemaId) => request('GET', `/schemas/${schemaId}/collections`);
export const getCollection = (id) => request('GET', `/collections/${id}`);
export const createCollection = (schemaId, name, description) =>
    request('POST', '/collections', { schema_id: schemaId, name, description });
export const updateCollection = (id, data) => request('PUT', `/collections/${id}`, data);

// Templates
export const getTemplate = (id) => request('GET', `/templates/${id}`);
export const createTemplate = (collectionId, name) =>
    request('POST', '/templates', { collection_id: collectionId, name });
export const saveTemplate = (id, blockTree, comment) =>
    request('PUT', `/templates/${id}`, { block_tree: blockTree, comment });
export const listRevisions = (id) => request('GET', `/templates/${id}/revisions`);
export const getRevision = (id, rev) => request('GET', `/templates/${id}/revisions/${rev}`);
export const restoreRevision = (id, rev) => request('POST', `/templates/${id}/restore/${rev}`);

// Fixtures
export const listFixtures = (collectionId) => request('GET', `/collections/${collectionId}/fixtures`);
export const createFixture = (collectionId, name, data) =>
    request('POST', '/fixtures', { collection_id: collectionId, name, data });
export const updateFixture = (id, name, data) =>
    request('PUT', `/fixtures/${id}`, { name, data });
export const deleteFixture = (id) => request('DELETE', `/fixtures/${id}`);

// Validation & Render
export const validateTemplate = (template) =>
    request('POST', '/validate', { template });
export const renderTemplate = (template, data) =>
    request('POST', '/render', { template, data });

// Push (stub)
export const pushTemplate = (templateId, fixtureId) =>
    request('POST', '/push', { template_id: templateId, fixture_id: fixtureId });

// FuncMap
export const getFuncMap = () => request('GET', '/funcmap');
