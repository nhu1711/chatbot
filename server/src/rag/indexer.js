import { config } from '../config.js';
import { loadAndChunkMarkdown } from './chunker.js';
import { embedText } from './gemini.js';
import { qdrantStore } from './qdrant.js';

/**
 * Indexes all markdown knowledge files by generating embeddings and upserting them into Qdrant.
 */
export async function runIndexer() {
  console.log(`[Indexer] Reading knowledge documents from: ${config.knowledgeDir}`);
  const chunks = loadAndChunkMarkdown(config.knowledgeDir);
  console.log(`[Indexer] Found ${chunks.length} sections to index.`);

  if (chunks.length === 0) {
    console.warn('[Indexer] Warning: No chunks found to index.');
    return { indexedChunks: 0, errors: [] };
  }

  const indexedChunks = [];
  const errors = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[Indexer] (${i + 1}/${chunks.length}) Embedding: [${chunk.source}] ${chunk.title}`);
    const textToEmbed = `${chunk.title}\n${chunk.content}`;
    try {
      const embedding = await embedText(textToEmbed);
      if (indexedChunks.length === 0) await qdrantStore.ensureCollection(embedding.length);
      else if (embedding.length !== indexedChunks[0].embedding.length) throw new Error(`Gemini returned inconsistent embedding dimension ${embedding.length}; expected ${indexedChunks[0].embedding.length}.`);
      indexedChunks.push({ ...chunk, embedding });
    } catch (error) {
      errors.push({ chunkId: chunk.id, message: error.message });
      console.error(`[Indexer] Failed: ${chunk.id}: ${error.message}`);
    }
  }
  if (indexedChunks.length) await qdrantStore.upsertChunks(indexedChunks);
  console.log(`[Indexer] Upserted ${indexedChunks.length} chunks into Qdrant collection "${config.qdrantCollection}". Errors: ${errors.length}.`);
  return { indexedChunks: indexedChunks.length, errors };
}

// Allow running directly via CLI (e.g., `npm run index` or `node src/rag/indexer.js`)
if (process.argv[1] && process.argv[1].endsWith('indexer.js')) {
  runIndexer().catch((err) => {
    console.error('[Indexer] Fatal error during indexing:', err.message);
    process.exit(1);
  });
}
