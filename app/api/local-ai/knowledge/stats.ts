export const config = {
  runtime: 'edge',
};

// Local AI Brain Knowledge Stats API
// Get statistics about the knowledge base stored in Qdrant

const QDRANT_URL = process.env.QDRANT_URL || process.env.QDRANT_BASE_URL || 'http://localhost:6333';
const DEFAULT_COLLECTION = 'knowledge';

interface CollectionInfo {
  name: string;
  vectorCount: number;
  pointsCount: number;
  segmentsCount: number;
  status: string;
  vectorSize?: number;
  onDiskPayload?: boolean;
}

interface KnowledgeStats {
  totalDocuments: number;
  totalChunks: number;
  collections: CollectionInfo[];
  lastUpdated?: string;
  storageSize?: string;
}

async function getCollections(): Promise<string[]> {
  const response = await fetch(`${QDRANT_URL}/collections`, {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Failed to get collections: ${response.status}`);
  }

  const data = await response.json();
  return (data.result?.collections || []).map((c: any) => c.name);
}

async function getCollectionInfo(name: string): Promise<CollectionInfo | null> {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${name}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get collection info: ${response.status}`);
    }

    const data = await response.json();
    const result = data.result;

    return {
      name,
      vectorCount: result.vectors_count || 0,
      pointsCount: result.points_count || 0,
      segmentsCount: result.segments_count || 0,
      status: result.status || 'unknown',
      vectorSize: result.config?.params?.vectors?.size,
      onDiskPayload: result.config?.params?.on_disk_payload,
    };
  } catch (error) {
    console.error(`Error getting collection ${name}:`, error);
    return null;
  }
}

async function getLastUpdated(collectionName: string): Promise<string | null> {
  try {
    // Scroll to get the most recent point (sorted by id desc)
    const response = await fetch(
      `${QDRANT_URL}/collections/${collectionName}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 1,
          with_payload: true,
          order_by: [{ key: 'created_at', direction: 'desc' }],
        }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const points = data.result?.points || [];
    if (points.length > 0 && points[0].payload?.created_at) {
      return points[0].payload.created_at;
    }

    // Fallback: try to get updated_at from first point
    if (points.length > 0 && points[0].payload?.updated_at) {
      return points[0].payload.updated_at;
    }

    return null;
  } catch (error) {
    return null;
  }
}

export default async function handler(req: Request) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    // Get URL params
    const url = new URL(req.url);
    const specificCollection = url.searchParams.get('collection');

    // Get all collections or specific one
    let collectionNames: string[];
    if (specificCollection) {
      collectionNames = [specificCollection];
    } else {
      collectionNames = await getCollections();
    }

    // Get info for each collection
    const collectionsInfo = await Promise.all(
      collectionNames.map((name) => getCollectionInfo(name))
    );

    const validCollections = collectionsInfo.filter(
      (c): c is CollectionInfo => c !== null
    );

    // Calculate totals
    const totalChunks = validCollections.reduce(
      (sum, c) => sum + c.pointsCount,
      0
    );

    // Estimate document count (rough: assume average 5 chunks per doc)
    const estimatedDocs = Math.ceil(totalChunks / 5);

    // Try to get last updated timestamp from default collection
    let lastUpdated: string | null = null;
    if (collectionNames.includes(DEFAULT_COLLECTION)) {
      lastUpdated = await getLastUpdated(DEFAULT_COLLECTION);
    } else if (collectionNames.length > 0) {
      lastUpdated = await getLastUpdated(collectionNames[0]);
    }

    const stats: KnowledgeStats = {
      totalDocuments: estimatedDocs,
      totalChunks,
      collections: validCollections.map((c) => ({
        name: c.name,
        vectorCount: c.vectorCount,
        pointsCount: c.pointsCount,
        segmentsCount: c.segmentsCount,
        status: c.status,
        vectorSize: c.vectorSize,
        onDiskPayload: c.onDiskPayload,
      })),
      lastUpdated: lastUpdated || undefined,
    };

    return new Response(JSON.stringify(stats), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=30', // Cache for 30 seconds
      },
    });
  } catch (error) {
    console.error('Knowledge stats error:', error);

    const isConnectionError =
      error instanceof Error &&
      (error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('Connection refused'));

    return new Response(
      JSON.stringify({
        error: isConnectionError
          ? 'Cannot connect to Qdrant. Make sure Qdrant is running on localhost:6333'
          : 'Failed to get knowledge stats',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: isConnectionError ? 503 : 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
