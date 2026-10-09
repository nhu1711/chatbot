import { embedText } from './gemini.js';
import { qdrantStore } from './qdrant.js';

/**
 * Calculates cosine similarity between two numeric vectors.
 * Returns a value between -1 and 1 (typically 0 to 1 for normalized embeddings).
 * 
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Cosine similarity score
 */
/**
 * Retrieves the Top-K most relevant chunks for a user query.
 * 
 * @param {string} query - The search query from the user
 * @param {number} topK - Number of top chunks to return
 * @returns {Promise<Array<{id: string, title: string, content: string, source: string, score: number}>>}
 */
export async function retrieveRelevantChunks(query, topK = 3) {
  if (!query || !query.trim()) {
    return [];
  }
  const queryEmbedding = await embedText(query.trim());
  return qdrantStore.search(queryEmbedding, topK);
}
