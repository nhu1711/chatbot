import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(serverRoot, '..');

// Load environment variables from server/.env
dotenv.config({ path: path.join(serverRoot, '.env') });

export const config = {
  port: process.env.PORT || 3000,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  embeddingModel: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.60'),
  topK: parseInt(process.env.TOP_K || '3', 10),
  qdrantUrl: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
  qdrantCollection: process.env.QDRANT_COLLECTION || 'hcmc_travel_chunks',
  knowledgeDir: path.join(projectRoot, 'data', 'knowledge'),
};
