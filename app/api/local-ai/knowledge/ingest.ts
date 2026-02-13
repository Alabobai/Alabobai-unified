// Note: This route uses Node.js runtime for file upload handling
export const config = {
  runtime: 'nodejs',
};

// Local AI Brain Knowledge Ingest API
// Ingest documents into Qdrant knowledge base

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || process.env.QDRANT_BASE_URL || 'http://localhost:6333';
const DEFAULT_COLLECTION = 'knowledge';
const EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_SIZE = 768; // nomic-embed-text dimension
const CHUNK_SIZE = 500; // characters per chunk
const CHUNK_OVERLAP = 50; // overlap between chunks

interface IngestRequest {
  type: 'text' | 'url' | 'file';
  content?: string;
  url?: string;
  title?: string;
  collection?: string;
  metadata?: Record<string, any>;
}

interface IngestResult {
  success: boolean;
  chunksCreated: number;
  collection: string;
  documentId: string;
  error?: string;
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

// Split text into chunks with overlap
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  // Clean and normalize text
  const cleanText = text.replace(/\s+/g, ' ').trim();

  while (start < cleanText.length) {
    let end = start + chunkSize;

    // Try to break at sentence boundary
    if (end < cleanText.length) {
      const sentenceEnd = cleanText.substring(start, end + 100).lastIndexOf('. ');
      if (sentenceEnd > chunkSize * 0.7) {
        end = start + sentenceEnd + 1;
      }
    }

    const chunk = cleanText.substring(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - overlap;
    if (start < 0) start = 0;
    if (end >= cleanText.length) break;
  }

  return chunks;
}

// Ensure collection exists in Qdrant
async function ensureCollection(collectionName: string): Promise<void> {
  // Check if collection exists
  const checkResponse = await fetch(
    `${QDRANT_URL}/collections/${collectionName}`,
    { method: 'GET' }
  );

  if (checkResponse.ok) {
    return; // Collection exists
  }

  // Create collection
  const createResponse = await fetch(
    `${QDRANT_URL}/collections/${collectionName}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: EMBEDDING_SIZE,
          distance: 'Cosine',
        },
        on_disk_payload: true,
      }),
    }
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create collection: ${error}`);
  }
}

// Upsert points to Qdrant
async function upsertPoints(
  collectionName: string,
  points: Array<{
    id: string;
    vector: number[];
    payload: Record<string, any>;
  }>
): Promise<void> {
  const response = await fetch(
    `${QDRANT_URL}/collections/${collectionName}/points`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upsert points: ${error}`);
  }
}

// Fetch and extract text from URL
async function fetchAndExtractText(url: string): Promise<{ text: string; title?: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Alabobai/2.0; +https://alabobai.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await response.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // Simple HTML to text conversion
  let text = html
    // Remove script and style content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return { text, title };
}

// Generate unique document ID
function generateDocumentId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Generate chunk ID
function generateChunkId(docId: string, index: number): string {
  return `${docId}_chunk_${index}`;
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
    let ingestRequest: IngestRequest;
    let textContent: string;
    let title: string | undefined;

    // Check content type for multipart form data (file upload)
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const collection = formData.get('collection') as string | null;
      const metadataStr = formData.get('metadata') as string | null;

      if (!file) {
        return new Response(
          JSON.stringify({ error: 'No file provided' }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      // Read file content
      textContent = await file.text();
      title = file.name;

      ingestRequest = {
        type: 'file',
        title: file.name,
        collection: collection || DEFAULT_COLLECTION,
        metadata: metadataStr ? JSON.parse(metadataStr) : undefined,
      };
    } else {
      // Handle JSON request (text or URL)
      ingestRequest = await req.json();

      if (ingestRequest.type === 'url' && ingestRequest.url) {
        // Fetch and extract text from URL
        const extracted = await fetchAndExtractText(ingestRequest.url);
        textContent = extracted.text;
        title = ingestRequest.title || extracted.title;
      } else if (ingestRequest.type === 'text' && ingestRequest.content) {
        textContent = ingestRequest.content;
        title = ingestRequest.title;
      } else {
        return new Response(
          JSON.stringify({
            error: 'Invalid request. Provide either content (text) or url',
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }
    }

    if (!textContent || textContent.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'No text content to ingest' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const collectionName = ingestRequest.collection || DEFAULT_COLLECTION;
    const documentId = generateDocumentId();
    const timestamp = new Date().toISOString();

    // Ensure collection exists
    await ensureCollection(collectionName);

    // Chunk the text
    const chunks = chunkText(textContent, CHUNK_SIZE, CHUNK_OVERLAP);

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No chunks generated from content' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Generate embeddings for all chunks (batch)
    const points: Array<{
      id: string;
      vector: number[];
      payload: Record<string, any>;
    }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);

      points.push({
        id: generateChunkId(documentId, i),
        vector: embedding,
        payload: {
          content: chunk,
          text: chunk, // Alias for compatibility
          document_id: documentId,
          chunk_index: i,
          total_chunks: chunks.length,
          title: title || 'Untitled',
          source: ingestRequest.type === 'url' ? ingestRequest.url : ingestRequest.type,
          created_at: timestamp,
          ...ingestRequest.metadata,
        },
      });
    }

    // Upsert all points to Qdrant
    await upsertPoints(collectionName, points);

    const result: IngestResult = {
      success: true,
      chunksCreated: chunks.length,
      collection: collectionName,
      documentId,
    };

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Ingest error:', error);

    const isOllamaError =
      error instanceof Error &&
      (error.message.includes('embedding') ||
        error.message.includes('Ollama'));

    const isQdrantError =
      error instanceof Error &&
      (error.message.includes('collection') ||
        error.message.includes('points') ||
        error.message.includes('Qdrant'));

    let errorMessage = 'Failed to ingest document';
    let statusCode = 500;

    if (isOllamaError) {
      errorMessage =
        'Cannot generate embeddings. Make sure Ollama is running and has the nomic-embed-text model installed';
      statusCode = 503;
    } else if (isQdrantError) {
      errorMessage =
        'Cannot store in knowledge base. Make sure Qdrant is running on localhost:6333';
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
