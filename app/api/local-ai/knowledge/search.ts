export const config = {
  runtime: 'edge',
};

// Local AI Brain Knowledge Search API
// Search the Qdrant knowledge base using semantic similarity

const OLLAMA_URL = 'http://localhost:11434';
const QDRANT_URL = 'http://localhost:6333';
const DEFAULT_COLLECTION = 'knowledge';
const EMBEDDING_MODEL = 'nomic-embed-text';

interface SearchRequest {
  query: string;
  collection?: string;
  topK?: number;
  scoreThreshold?: number;
  filter?: Record<string, any>;
}

interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: {
    title?: string;
    source?: string;
    documentId?: string;
    chunkIndex?: number;
    createdAt?: string;
    [key: string]: any;
  };
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  count: number;
  collection: string;
}

// Generate embeddings using Ollama
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate embedding: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding;
}

// Search Qdrant
async function searchQdrant(
  collection: string,
  vector: number[],
  topK: number,
  scoreThreshold?: number,
  filter?: Record<string, any>
): Promise<SearchResult[]> {
  const searchBody: any = {
    vector,
    limit: topK,
    with_payload: true,
    with_vector: false,
  };

  if (scoreThreshold !== undefined) {
    searchBody.score_threshold = scoreThreshold;
  }

  if (filter) {
    searchBody.filter = filter;
  }

  const response = await fetch(
    `${QDRANT_URL}/collections/${collection}/points/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody),
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return []; // Collection doesn't exist
    }
    const error = await response.text();
    throw new Error(`Qdrant search failed: ${error}`);
  }

  const data = await response.json();
  const results = data.result || [];

  return results.map((point: any) => ({
    id: String(point.id),
    content: point.payload?.content || point.payload?.text || '',
    score: point.score,
    metadata: {
      title: point.payload?.title,
      source: point.payload?.source,
      documentId: point.payload?.document_id,
      chunkIndex: point.payload?.chunk_index,
      createdAt: point.payload?.created_at,
      // Include any other metadata
      ...Object.fromEntries(
        Object.entries(point.payload || {}).filter(
          ([key]) =>
            !['content', 'text', 'title', 'source', 'document_id', 'chunk_index', 'created_at'].includes(key)
        )
      ),
    },
  }));
}

export default async function handler(req: Request) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const body: SearchRequest = await req.json();
    const {
      query,
      collection = DEFAULT_COLLECTION,
      topK = 10,
      scoreThreshold,
      filter,
    } = body;

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Generate embedding for query
    const embedding = await generateEmbedding(query);

    // Search Qdrant
    const results = await searchQdrant(
      collection,
      embedding,
      topK,
      scoreThreshold,
      filter
    );

    const response: SearchResponse = {
      query,
      results,
      count: results.length,
      collection,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Knowledge search error:', error);

    const isOllamaError =
      error instanceof Error &&
      (error.message.includes('embedding') ||
        error.message.includes('Ollama') ||
        error.message.includes('11434'));

    const isQdrantError =
      error instanceof Error &&
      (error.message.includes('Qdrant') ||
        error.message.includes('6333') ||
        error.message.includes('collection'));

    let errorMessage = 'Search failed';
    let statusCode = 500;

    if (isOllamaError) {
      errorMessage =
        'Cannot generate query embedding. Make sure Ollama is running with nomic-embed-text model';
      statusCode = 503;
    } else if (isQdrantError) {
      errorMessage =
        'Cannot search knowledge base. Make sure Qdrant is running on localhost:6333';
      statusCode = 503;
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
