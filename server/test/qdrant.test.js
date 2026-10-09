import test from 'node:test';
import assert from 'node:assert/strict';
import { createQdrantStore, deterministicPointId } from '../src/rag/qdrant.js';

const chunk = { id: 'food_0', title: 'Food', content: 'Cơm tấm', source: 'food.md', embedding: [0.1, 0.2, 0.3] };

test('creates a missing cosine collection and upserts deterministic points', async () => {
  const calls = [];
  const client = {
    getCollection: async () => { const error = new Error('not found'); error.status = 404; throw error; },
    createCollection: async (...args) => calls.push(['create', ...args]),
    upsert: async (...args) => calls.push(['upsert', ...args]),
  };
  const store = createQdrantStore({ client, collection: 'test_chunks' });
  assert.deepEqual(await store.ensureCollection(3), { created: true, vectorSize: 3 });
  assert.equal(calls[0][2].vectors.distance, 'Cosine');
  await store.upsertChunks([chunk]);
  assert.equal(calls[1][2].points[0].id, deterministicPointId('food_0'));
  assert.equal(calls[1][2].points[0].payload.content, 'Cơm tấm');
});

test('reuses matching collections and rejects dimension mismatches', async () => {
  const client = { getCollection: async () => ({ config: { params: { vectors: { size: 3 } } } }) };
  const store = createQdrantStore({ client });
  assert.deepEqual(await store.ensureCollection(3), { created: false, vectorSize: 3 });
  await assert.rejects(() => store.ensureCollection(4), /uses vector dimension 3/);
});

test('maps top-k query results and surfaces connection errors', async () => {
  const client = { query: async (_collection, request) => ({ points: [{ score: 0.87654, payload: { chunkId: 'food_0', title: 'Food', content: 'Cơm tấm', source: 'food.md', chunkIndex: 0 } }], request }) };
  const store = createQdrantStore({ client });
  assert.deepEqual(await store.search([1, 2, 3], 1), [{ id: 'food_0', title: 'Food', content: 'Cơm tấm', source: 'food.md', chunkIndex: 0, score: 0.8765 }]);
  await assert.rejects(() => createQdrantStore({ client: { query: async () => { throw new Error('offline'); } } }).search([1], 1), /Qdrant search failed/);
});
