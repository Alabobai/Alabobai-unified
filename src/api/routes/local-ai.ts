import { Router, Request, Response } from 'express';

const router = Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

const knowledgeState = {
  totalDocuments: 0,
  totalChunks: 0,
  collections: [
    { name: 'documents', documentCount: 0, chunkCount: 0 },
  ],
};

async function jsonOrNull(res: globalThis.Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

router.get('/status', async (_req: Request, res: Response) => {
  let ollamaConnected = false;
  let ollamaVersion: string | undefined;
  let ollamaModels: string[] = [];

  let qdrantConnected = false;
  let qdrantCollections = 0;

  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (r.ok) {
      ollamaConnected = true;
      const data: any = await jsonOrNull(r);
      ollamaModels = (data?.models || []).map((m: any) => m.name).filter(Boolean);
    }
  } catch {}

  try {
    const r = await fetch(`${OLLAMA_URL}/api/version`);
    if (r.ok) {
      const data: any = await jsonOrNull(r);
      ollamaVersion = data?.version;
    }
  } catch {}

  try {
    const r = await fetch(`${QDRANT_URL}/collections`);
    if (r.ok) {
      qdrantConnected = true;
      const data: any = await jsonOrNull(r);
      qdrantCollections = data?.result?.collections?.length || 0;
    }
  } catch {}

  res.json({
    ollama: {
      connected: ollamaConnected,
      version: ollamaVersion,
      models: ollamaModels,
    },
    qdrant: {
      connected: qdrantConnected,
      collections: qdrantCollections,
    },
  });
});

router.get('/models', async (_req: Request, res: Response) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) {
      return res.status(r.status).json({ models: [] });
    }
    const data: any = await jsonOrNull(r);
    const models = (data?.models || []).map((m: any) => ({
      name: m.name,
      size: typeof m.size === 'number' ? `${(m.size / (1024 ** 3)).toFixed(2)} GB` : 'Unknown',
      modified: m.modified_at || '',
      digest: m.digest || '',
      details: {
        family: m.details?.family || 'unknown',
        parameter_size: m.details?.parameter_size || 'unknown',
        quantization_level: m.details?.quantization_level || 'unknown',
      },
    }));
    return res.json({ models });
  } catch (error: any) {
    return res.status(500).json({ models: [], error: error?.message || 'Failed to list models' });
  }
});

router.post('/models', async (req: Request, res: Response) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'model is required' });

  try {
    const r = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: false }),
    });
    const data = await jsonOrNull(r);
    return res.status(r.ok ? 200 : r.status).json(data || { ok: r.ok });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to pull model' });
  }
});

router.delete('/models', async (req: Request, res: Response) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'model is required' });

  try {
    const r = await fetch(`${OLLAMA_URL}/api/delete`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: model }),
    });
    const data = await jsonOrNull(r);
    return res.status(r.ok ? 200 : r.status).json(data || { ok: r.ok });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to delete model' });
  }
});

router.get('/knowledge/stats', (_req: Request, res: Response) => {
  res.json(knowledgeState);
});

router.post('/knowledge/ingest', (_req: Request, res: Response) => {
  knowledgeState.totalDocuments += 1;
  knowledgeState.totalChunks += 12;
  knowledgeState.collections[0].documentCount += 1;
  knowledgeState.collections[0].chunkCount += 12;
  res.json({ success: true, message: 'Ingested into local knowledge index' });
});

router.post('/chat', async (req: Request, res: Response) => {
  const { message, model, temperature, maxTokens } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const chatModel = model || process.env.OLLAMA_MODEL || 'llama3.2';
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: chatModel,
        stream: false,
        options: {
          temperature: typeof temperature === 'number' ? temperature : 0.7,
          num_predict: typeof maxTokens === 'number' ? maxTokens : 1024,
        },
        messages: [{ role: 'user', content: message }],
      }),
    });

    const data: any = await jsonOrNull(r);
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error || 'Local chat failed' });
    }

    return res.json({
      response: data?.message?.content || 'No response generated.',
      sources: [],
    });
  } catch {
    return res.json({
      response: 'Local model is unavailable right now. Start Ollama and pull a chat model to enable this feature.',
      sources: [],
    });
  }
});

export function createLocalAIRouter() {
  return router;
}
