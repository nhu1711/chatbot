import crypto from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';

export function deterministicPointId(chunkId) {
  const hash = crypto.createHash('sha256').update(chunkId).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function createQdrantStore({ client = new QdrantClient({ url: config.qdrantUrl }), collection = config.qdrantCollection } = {}) {
  async function getExistingCollection() {
    try { return await client.getCollection(collection); }
    catch (error) {
      if (error?.status === 404 || error?.statusCode === 404) return null;
      throw new Error(`Cannot connect to Qdrant at ${config.qdrantUrl}: ${error.message}`);
    }
  }
  async function ensureCollection(vectorSize) {
    if (!Number.isInteger(vectorSize) || vectorSize <= 0) throw new Error(`Invalid Gemini embedding dimension: ${vectorSize}`);
    const existing = await getExistingCollection();
    if (!existing) {
      try { await client.createCollection(collection, { vectors: { size: vectorSize, distance: 'Cosine' } }); }
      catch (error) { throw new Error(`Unable to initialize Qdrant collection "${collection}": ${error.message}`); }
      return { created: true, vectorSize };
    }
    const actualSize = existing.config?.params?.vectors?.size;
    if (actualSize !== vectorSize) throw new Error(`Qdrant collection "${collection}" uses vector dimension ${actualSize}, but Gemini model "${config.embeddingModel}" returned ${vectorSize}. Use a collection configured for this model; it will not be recreated automatically.`);
    return { created: false, vectorSize };
  }
  async function upsertChunks(chunks) {
    if (!chunks.length) return 0;
    await client.upsert(collection, { wait: true, points: chunks.map((chunk) => ({
      id: deterministicPointId(chunk.id), vector: chunk.embedding,
      payload: { chunkId: chunk.id, source: chunk.source, title: chunk.title, content: chunk.content, chunkIndex: Number(chunk.id.split('_').at(-1)) },
    })) });
    return chunks.length;
  }
  async function search(vector, limit) {
    try {
      const response = await client.query(collection, { query: vector, limit, with_payload: true });
      return response.points.map((point) => ({ id: point.payload.chunkId, title: point.payload.title, content: point.payload.content, source: point.payload.source, chunkIndex: point.payload.chunkIndex, score: Number(point.score.toFixed(4)) }));
    } catch (error) { throw new Error(`Qdrant search failed for collection "${collection}": ${error.message}`); }
  }
  async function count() {
    try { return (await client.count(collection, { exact: true })).count; }
    catch (error) { throw new Error(`Qdrant count failed for collection "${collection}": ${error.message}`); }
  }
  return { ensureCollection, upsertChunks, search, count };
}

export const qdrantStore = createQdrantStore();
