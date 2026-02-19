#!/usr/bin/env python3
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import json
import asyncio
import re
import time
import ipaddress
import io
import math
import struct
import wave
import uuid
import os
from urllib.parse import urlparse
from typing import Optional

import socketio

# Create Socket.IO server with CORS
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=False,
)

app = FastAPI(title='Alabobai Local Media Bridge', version='1.0.0')

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wrap FastAPI with Socket.IO
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Connected clients tracking
connected_clients: dict[str, dict] = {}
presence_data: dict[str, dict] = {}

IMAGE_URL = 'http://127.0.0.1:7860'
VIDEO_URL = 'http://127.0.0.1:8000'
OLLAMA_URL = 'http://127.0.0.1:11434'

# Simple circuit breaker for local inference stability.
OLLAMA_FAILURE_COUNT = 0
OLLAMA_CIRCUIT_OPEN_UNTIL = 0.0
CIRCUIT_FAILURE_THRESHOLD = 3
CIRCUIT_COOLDOWN_SECONDS = 30
WEBHOOK_EVENTS: list[dict] = []


def _is_public_http_url(raw_url: str) -> bool:
    try:
        parsed = urlparse(raw_url)
        if parsed.scheme not in ('http', 'https'):
            return False

        host = (parsed.hostname or '').strip().lower()
        if not host:
            return False

        if host in {'localhost', '127.0.0.1', '::1'}:
            return False
        if host.endswith('.local') or host.endswith('.internal'):
            return False

        try:
            ip = ipaddress.ip_address(host)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        except ValueError:
            # Hostname (not a literal IP). Keep allowed unless it matches blocked local/internal patterns above.
            pass

        return True
    except Exception:
        return False

class ImageReq(BaseModel):
    prompt: str
    width: int = 512
    height: int = 512
    style: str = 'logo'

class VideoReq(BaseModel):
    prompt: str
    durationSeconds: int = 4
    fps: int = 12
    width: int = 512
    height: int = 512

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatReq(BaseModel):
    messages: list[ChatMessage]
    model: str = 'llama3:latest'
    stream: bool = True
    temperature: float = 0.7

def enhance_prompt(prompt: str, style: str) -> str:
    if style == 'logo':
        return f'professional minimalist logo, vector style, clean lines, branding, {prompt}'
    if style == 'hero':
        return f'cinematic hero image, high detail, modern commercial style, {prompt}'
    if style == 'icon':
        return f'flat icon design, simple composition, transparent background, {prompt}'
    return prompt

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.get('/api/local-ai/status')
async def local_ai_status():
    started = time.time()
    response = {
        'status': 'healthy',
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'services': {
            'ollama': {'connected': True, 'latencyMs': 0, 'version': 'running'},
            'qdrant': {'connected': True, 'latencyMs': 0, 'version': 'local'},
        },
        'models': [],
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            tags = await client.get(f'{OLLAMA_URL}/api/tags')
            if tags.is_success:
                data = tags.json()
                models = [m.get('name') for m in (data.get('models') or []) if m.get('name')]
                response['models'] = models
                response['services']['ollama']['latencyMs'] = int((time.time() - started) * 1000)
                if not models:
                    response['status'] = 'degraded'
                    response['services']['ollama']['connected'] = False
            else:
                response['status'] = 'degraded'
                response['services']['ollama'] = {
                    'connected': False,
                    'latencyMs': int((time.time() - started) * 1000),
                    'error': f'HTTP {tags.status_code}',
                }
    except Exception as exc:
        response['status'] = 'degraded'
        response['services']['ollama'] = {
            'connected': False,
            'latencyMs': int((time.time() - started) * 1000),
            'error': str(exc),
        }

    return response

async def _chat_with_ollama(messages: list[dict], model: str, temperature: float):
    global OLLAMA_FAILURE_COUNT, OLLAMA_CIRCUIT_OPEN_UNTIL

    now = time.time()
    if now < OLLAMA_CIRCUIT_OPEN_UNTIL:
      retry_in = int(OLLAMA_CIRCUIT_OPEN_UNTIL - now)
      print(f"[Ollama] Circuit breaker open, retry in {retry_in}s")
      return None, JSONResponse(
          status_code=503,
          content={'error': 'Local inference unavailable', 'details': f'circuit_open_retry_in_{retry_in}s'},
      )

    # Allow sufficient time for complex prompts like research synthesis (LLMs can take 2-3 min for long outputs)
    timeout = httpx.Timeout(180.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        requested_model = model or 'llama3:latest'
        print(f"[Ollama] Sending request to model: {requested_model}, message length: {len(str(messages))}")

        async def do_chat(model_name: str):
            return await client.post(
                f'{OLLAMA_URL}/api/chat',
                json={
                    'model': model_name,
                    'messages': messages,
                    'stream': False,
                    'options': {'temperature': temperature},
                },
            )

        try:
            response = await do_chat(requested_model)
            print(f"[Ollama] Response status: {response.status_code}")
        except Exception as exc:
            print(f"[Ollama] Exception: {type(exc).__name__}: {exc}")
            OLLAMA_FAILURE_COUNT += 1
            if OLLAMA_FAILURE_COUNT >= CIRCUIT_FAILURE_THRESHOLD:
                OLLAMA_CIRCUIT_OPEN_UNTIL = time.time() + CIRCUIT_COOLDOWN_SECONDS
            return None, JSONResponse(
                status_code=503,
                content={'error': 'Local inference unavailable', 'details': str(exc)},
            )

        # Retry with first installed model for any non-success status.
        if not response.is_success:
            try:
                tags = await client.get(f'{OLLAMA_URL}/api/tags')
                if tags.is_success:
                    models = (tags.json() or {}).get('models') or []
                    fallback_model = (models[0] or {}).get('name') if models else None
                    if fallback_model and fallback_model != requested_model:
                        response = await do_chat(fallback_model)
            except Exception:
                # Keep original response/error handling below.
                pass

        if not response.is_success:
            OLLAMA_FAILURE_COUNT += 1
            if OLLAMA_FAILURE_COUNT >= CIRCUIT_FAILURE_THRESHOLD:
                OLLAMA_CIRCUIT_OPEN_UNTIL = time.time() + CIRCUIT_COOLDOWN_SECONDS
            return None, JSONResponse(
                status_code=503,
                content={'error': 'Local inference unavailable', 'details': f'Ollama chat failed: {response.status_code}'},
            )

        # Recovery path
        OLLAMA_FAILURE_COUNT = 0
        OLLAMA_CIRCUIT_OPEN_UNTIL = 0.0

        content = (response.json().get('message') or {}).get('content', '')
        return content, None


# =============================================================================
# MOONSHOT / KIMI K2.5 API INTEGRATION (Hybrid Routing)
# =============================================================================

MOONSHOT_API_URL = 'https://api.moonshot.ai/v1'

# Keywords that trigger cloud API for complex tasks
COMPLEX_TASK_KEYWORDS = [
    'agent swarm', 'multi-agent', 'parallel agents', 'coordinate agents',
    'complex analysis', 'deep research', 'comprehensive', 'thorough investigation',
    'analyze image', 'analyze video', 'vision', 'look at this',
    'step by step plan', 'detailed breakdown', 'orchestrate',
]

def _should_use_cloud(messages: list[dict], force_cloud: bool = False) -> bool:
    """Determine if request should use Kimi K2.5 cloud API."""
    if force_cloud:
        return True

    # Check if Moonshot API key is available
    if not os.environ.get('MOONSHOT_API_KEY'):
        return False

    # Check for complex task keywords in recent messages
    recent_content = ' '.join([
        m.get('content', '') for m in messages[-3:]
        if isinstance(m.get('content'), str)
    ]).lower()

    for keyword in COMPLEX_TASK_KEYWORDS:
        if keyword in recent_content:
            return True

    # Check message length (very long prompts benefit from larger models)
    total_length = sum(len(m.get('content', '')) for m in messages)
    if total_length > 8000:
        return True

    return False


async def _chat_with_moonshot(
    messages: list[dict],
    model: str = 'kimi-k2.5',
    temperature: float = 0.7,
    mode: str = 'thinking'  # instant, thinking, agent, agent-swarm
) -> tuple[str | None, JSONResponse | None]:
    """Call Moonshot/Kimi K2.5 API for complex tasks."""
    moonshot_key = os.environ.get('MOONSHOT_API_KEY', '')
    if not moonshot_key:
        return None, JSONResponse(
            status_code=503,
            content={'error': 'MOONSHOT_API_KEY not configured'}
        )

    # Map mode to model variant
    model_map = {
        'instant': 'kimi-k2.5',
        'thinking': 'kimi-k2.5-thinking',
        'agent': 'kimi-k2.5-agent',
        'agent-swarm': 'kimi-k2.5-agent-swarm',
    }
    actual_model = model_map.get(mode, model)

    timeout = httpx.Timeout(300.0, connect=15.0)  # Agent swarm can take longer
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            print(f"[Moonshot] Calling {actual_model}, mode={mode}, messages={len(messages)}")

            response = await client.post(
                f'{MOONSHOT_API_URL}/chat/completions',
                headers={
                    'Authorization': f'Bearer {moonshot_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': actual_model,
                    'messages': messages,
                    'temperature': temperature,
                    'stream': False,
                },
            )

            if response.is_success:
                data = response.json()
                content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                print(f"[Moonshot] Success, response length: {len(content)}")
                return content, None
            else:
                print(f"[Moonshot] Error: {response.status_code} - {response.text[:200]}")
                return None, JSONResponse(
                    status_code=response.status_code,
                    content={'error': f'Moonshot API error: {response.status_code}'}
                )

    except Exception as exc:
        print(f"[Moonshot] Exception: {type(exc).__name__}: {exc}")
        return None, JSONResponse(
            status_code=503,
            content={'error': f'Moonshot API unavailable: {exc}'}
        )


async def _hybrid_chat(
    messages: list[dict],
    model: str = 'auto',
    temperature: float = 0.7,
    force_local: bool = False,
    force_cloud: bool = False,
    cloud_mode: str = 'thinking'
) -> tuple[str, str, JSONResponse | None]:
    """
    Hybrid routing: Local Ollama for simple tasks, Kimi K2.5 for complex ones.
    Returns: (content, provider, error)
    """
    # Determine routing
    use_cloud = not force_local and _should_use_cloud(messages, force_cloud)

    if use_cloud:
        content, err = await _chat_with_moonshot(messages, temperature=temperature, mode=cloud_mode)
        if content:
            return content, 'kimi-k2.5', None
        # Fall back to local if cloud fails
        print("[Hybrid] Cloud failed, falling back to local")

    # Use local Ollama
    local_model = model if model != 'auto' else 'qwen2.5:14b-instruct-q4_K_M'
    content, err = await _chat_with_ollama(messages, local_model, temperature)
    if content:
        return content, 'local', None

    # Both failed
    return '', 'none', err

@app.get('/api/local-ai/models')
async def local_ai_models():
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            tags = await client.get(f'{OLLAMA_URL}/api/tags')
            if not tags.is_success:
                return {'models': []}
            data = tags.json()
            models = []
            for m in data.get('models', []):
                size = m.get('size')
                size_str = f"{round(size / (1024**3), 2)} GB" if isinstance(size, (int, float)) else 'Unknown'
                details = m.get('details') or {}
                models.append({
                    'name': m.get('name', 'unknown'),
                    'size': size_str,
                    'modified': m.get('modified_at', ''),
                    'digest': m.get('digest', ''),
                    'details': {
                        'family': details.get('family', 'unknown'),
                        'parameter_size': details.get('parameter_size', 'unknown'),
                        'quantization_level': details.get('quantization_level', 'unknown'),
                    }
                })
            return {'models': models}
    except Exception:
        return {'models': []}

@app.post('/api/local-ai/models')
async def local_ai_pull_model(payload: dict):
    model = payload.get('model')
    if not model:
        return JSONResponse(status_code=400, content={'error': 'model is required'})

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f'{OLLAMA_URL}/api/pull', json={'model': model, 'stream': False})
        if not resp.is_success:
            return JSONResponse(status_code=resp.status_code, content={'error': 'Failed to pull model'})
        return {'success': True}

@app.delete('/api/local-ai/models')
async def local_ai_delete_model(payload: dict):
    model = payload.get('model')
    if not model:
        return JSONResponse(status_code=400, content={'error': 'model is required'})

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.delete(f'{OLLAMA_URL}/api/delete', json={'name': model})
        if not resp.is_success:
            return JSONResponse(status_code=resp.status_code, content={'error': 'Failed to delete model'})
        return {'success': True}

QDRANT_URL = 'http://127.0.0.1:6333'
QDRANT_COLLECTION = 'alabobai_knowledge'
EMBEDDING_DIMENSION = 1536  # OpenAI ada-002 dimension, or adjust for Ollama model


async def _get_embedding(text: str) -> list[float] | None:
    """Generate embeddings using Ollama or OpenAI fallback."""
    import os

    # Try Ollama first (local, free)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f'{OLLAMA_URL}/api/embeddings',
                json={'model': 'nomic-embed-text', 'prompt': text},
            )
            if response.is_success:
                data = response.json()
                embedding = data.get('embedding')
                if embedding:
                    return embedding
    except Exception as e:
        print(f"[Embeddings] Ollama error: {e}")

    # Fallback to OpenAI
    openai_key = os.environ.get('OPENAI_API_KEY', '')
    if openai_key:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    'https://api.openai.com/v1/embeddings',
                    headers={
                        'Authorization': f'Bearer {openai_key}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'model': 'text-embedding-ada-002',
                        'input': text[:8000],  # Truncate to limit
                    },
                )
                if response.is_success:
                    data = response.json()
                    return data.get('data', [{}])[0].get('embedding')
        except Exception as e:
            print(f"[Embeddings] OpenAI error: {e}")

    return None


async def _ensure_qdrant_collection():
    """Ensure the Qdrant collection exists."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Check if collection exists
            check = await client.get(f'{QDRANT_URL}/collections/{QDRANT_COLLECTION}')
            if check.status_code == 200:
                return True

            # Create collection with appropriate vector size
            # First try to get embedding dimension from a test
            test_embedding = await _get_embedding('test')
            dim = len(test_embedding) if test_embedding else EMBEDDING_DIMENSION

            await client.put(
                f'{QDRANT_URL}/collections/{QDRANT_COLLECTION}',
                json={
                    'vectors': {
                        'size': dim,
                        'distance': 'Cosine',
                    }
                },
            )
            return True
    except Exception as e:
        print(f"[Qdrant] Collection setup error: {e}")
        return False


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]

        # Try to break at sentence boundary
        if end < len(text):
            last_period = chunk.rfind('.')
            last_newline = chunk.rfind('\n')
            break_point = max(last_period, last_newline)
            if break_point > chunk_size // 2:
                chunk = text[start:start + break_point + 1]
                end = start + break_point + 1

        chunks.append(chunk.strip())
        start = end - overlap

    return [c for c in chunks if c]


@app.get('/api/local-ai/knowledge/stats')
async def local_ai_knowledge_stats():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f'{QDRANT_URL}/collections/{QDRANT_COLLECTION}')
            if response.is_success:
                data = response.json()
                result = data.get('result', {})
                points_count = result.get('points_count', 0)
                return {
                    'totalDocuments': points_count,
                    'totalChunks': points_count,
                    'collections': [
                        {'name': QDRANT_COLLECTION, 'documentCount': points_count, 'chunkCount': points_count}
                    ]
                }
    except Exception as e:
        print(f"[Knowledge Stats] Error: {e}")

    return {
        'totalDocuments': 0,
        'totalChunks': 0,
        'collections': [
            {'name': QDRANT_COLLECTION, 'documentCount': 0, 'chunkCount': 0}
        ]
    }


@app.post('/api/local-ai/knowledge/ingest')
async def local_ai_knowledge_ingest(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={'error': 'Invalid JSON payload'})

    text = (payload or {}).get('text', '').strip()
    content = (payload or {}).get('content', '').strip()
    url = (payload or {}).get('url', '').strip()
    title = (payload or {}).get('title', 'Untitled')
    source = (payload or {}).get('source', 'manual')
    metadata = (payload or {}).get('metadata', {})

    # Use content or text field
    document_text = content or text

    # If URL provided, fetch content
    if url and not document_text:
        if _is_public_http_url(url):
            try:
                async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                    r = await client.get(url, headers={'User-Agent': 'AlabobaiKnowledgeBot/1.0'})
                    html = r.text
                    # Extract text from HTML
                    document_text = re.sub(r'<script[^>]*>[\s\S]*?</script>', ' ', html, flags=re.IGNORECASE)
                    document_text = re.sub(r'<style[^>]*>[\s\S]*?</style>', ' ', document_text, flags=re.IGNORECASE)
                    document_text = re.sub(r'<[^>]+>', ' ', document_text)
                    document_text = re.sub(r'\s+', ' ', document_text).strip()

                    # Extract title if not provided
                    if title == 'Untitled':
                        title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
                        if title_match:
                            title = title_match.group(1).strip()
            except Exception as e:
                return JSONResponse(status_code=400, content={'error': f'Failed to fetch URL: {e}'})
        else:
            return JSONResponse(status_code=400, content={'error': 'Invalid or blocked URL'})

    if not document_text:
        return JSONResponse(status_code=400, content={'error': 'text, content, or url is required'})

    # Ensure Qdrant collection exists
    await _ensure_qdrant_collection()

    # Chunk the document
    chunks = _chunk_text(document_text)

    # Generate embeddings and store in Qdrant
    ingested_count = 0
    points = []

    for i, chunk in enumerate(chunks):
        embedding = await _get_embedding(chunk)
        if embedding:
            point_id = str(uuid.uuid4())
            points.append({
                'id': point_id,
                'vector': embedding,
                'payload': {
                    'text': chunk,
                    'title': title,
                    'source': source,
                    'url': url,
                    'chunk_index': i,
                    'total_chunks': len(chunks),
                    'ingested_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    **metadata,
                }
            })
            ingested_count += 1

    if points:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.put(
                    f'{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points?wait=true',
                    json={'points': points},
                )
                if not response.is_success:
                    print(f"[Knowledge Ingest] Qdrant error: {response.text}")
                    return JSONResponse(status_code=500, content={'error': 'Failed to store in vector database'})
        except Exception as e:
            print(f"[Knowledge Ingest] Qdrant exception: {e}")
            return JSONResponse(status_code=500, content={'error': f'Vector database error: {e}'})

    return {
        'success': True,
        'message': f'Ingested {ingested_count} chunks from document',
        'document': {
            'title': title,
            'source': source,
            'url': url,
            'chunks': ingested_count,
            'totalLength': len(document_text),
        }
    }


@app.post('/api/local-ai/knowledge/search')
async def local_ai_knowledge_search(payload: dict):
    query = (payload or {}).get('query', '').strip()
    limit = int((payload or {}).get('limit', 5))
    threshold = float((payload or {}).get('threshold', 0.7))

    if not query:
        return JSONResponse(status_code=400, content={'error': 'query is required'})

    # Generate embedding for query
    query_embedding = await _get_embedding(query)
    if not query_embedding:
        return {
            'results': [],
            'query': query,
            'count': 0,
            'error': 'Failed to generate embedding for query'
        }

    # Search Qdrant
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f'{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points/search',
                json={
                    'vector': query_embedding,
                    'limit': limit,
                    'with_payload': True,
                    'score_threshold': threshold,
                },
            )
            if response.is_success:
                data = response.json()
                results = []
                for hit in data.get('result', []):
                    payload = hit.get('payload', {})
                    results.append({
                        'text': payload.get('text', ''),
                        'title': payload.get('title', 'Untitled'),
                        'source': payload.get('source', 'unknown'),
                        'url': payload.get('url', ''),
                        'score': hit.get('score', 0),
                        'metadata': {k: v for k, v in payload.items() if k not in ['text', 'title', 'source', 'url']},
                    })
                return {
                    'results': results,
                    'query': query,
                    'count': len(results),
                }
    except Exception as e:
        print(f"[Knowledge Search] Error: {e}")

    return {
        'results': [],
        'query': query,
        'count': 0,
    }

@app.post('/api/local-ai/chat')
async def local_ai_chat(payload: dict):
    # Accept both legacy `{message: string}` and canonical `{messages: [{role, content}]}` payloads
    messages = payload.get('messages')
    message = payload.get('message', '')

    normalized_messages = []
    if isinstance(messages, list) and len(messages) > 0:
      for m in messages:
        role = m.get('role', 'user') if isinstance(m, dict) else 'user'
        content = m.get('content', '') if isinstance(m, dict) else ''
        if content:
          normalized_messages.append({'role': role, 'content': content})
    elif message:
      normalized_messages = [{'role': 'user', 'content': message}]

    if not normalized_messages:
      return JSONResponse(status_code=400, content={'error': 'message or messages[] is required'})

    model = payload.get('model') or 'auto'
    temperature = payload.get('temperature', 0.7)
    force_local = payload.get('forceLocal', False)
    force_cloud = payload.get('forceCloud', False)
    cloud_mode = payload.get('cloudMode', 'thinking')  # instant, thinking, agent, agent-swarm

    # Use hybrid routing
    content, provider, err = await _hybrid_chat(
        normalized_messages,
        model=model,
        temperature=temperature,
        force_local=force_local,
        force_cloud=force_cloud,
        cloud_mode=cloud_mode
    )

    if err:
        fallback = 'AI models unavailable. Please check Ollama or configure MOONSHOT_API_KEY.'
        return {
            'response': fallback,
            'content': fallback,
            'sources': [],
            'provider': 'none'
        }

    # Return both keys for compatibility across frontend call sites
    return {
        'response': content,
        'content': content,
        'sources': [],
        'provider': provider  # 'local' or 'kimi-k2.5'
    }


@app.post('/api/hybrid/chat')
async def hybrid_chat_endpoint(payload: dict):
    """
    Explicit hybrid chat endpoint with full control over routing.

    Params:
    - messages: list of {role, content}
    - model: 'auto' (default), or specific model name
    - temperature: 0.0-1.0
    - forceLocal: always use local Ollama
    - forceCloud: always use Kimi K2.5 API
    - cloudMode: 'instant', 'thinking', 'agent', 'agent-swarm'
    """
    messages = payload.get('messages', [])
    if not messages:
        return JSONResponse(status_code=400, content={'error': 'messages is required'})

    content, provider, err = await _hybrid_chat(
        messages,
        model=payload.get('model', 'auto'),
        temperature=payload.get('temperature', 0.7),
        force_local=payload.get('forceLocal', False),
        force_cloud=payload.get('forceCloud', False),
        cloud_mode=payload.get('cloudMode', 'thinking')
    )

    if err:
        return err

    return {
        'content': content,
        'provider': provider,
        'model': payload.get('model', 'auto'),
        'cloudMode': payload.get('cloudMode', 'thinking') if provider == 'kimi-k2.5' else None
    }


@app.get('/api/hybrid/status')
async def hybrid_status():
    """Check status of hybrid routing providers."""
    moonshot_configured = bool(os.environ.get('MOONSHOT_API_KEY'))

    # Check Ollama
    ollama_available = False
    ollama_models = []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f'{OLLAMA_URL}/api/tags')
            if resp.is_success:
                ollama_available = True
                ollama_models = [m.get('name') for m in resp.json().get('models', [])]
    except Exception:
        pass

    return {
        'providers': {
            'local': {
                'available': ollama_available,
                'models': ollama_models,
                'url': OLLAMA_URL,
            },
            'cloud': {
                'available': moonshot_configured,
                'provider': 'Moonshot AI',
                'model': 'Kimi K2.5',
                'modes': ['instant', 'thinking', 'agent', 'agent-swarm'],
            }
        },
        'routing': {
            'strategy': 'auto',
            'complexTaskKeywords': COMPLEX_TASK_KEYWORDS[:5] + ['...'],
        }
    }

@app.post('/api/chat')
async def chat(payload: ChatReq):
    if not payload.messages:
        return JSONResponse(status_code=400, content={'error': 'messages is required'})

    content, err = await _chat_with_ollama([m.model_dump() for m in payload.messages], payload.model, payload.temperature)
    if err:
        fallback = 'Local model is currently unavailable. I can still help with planning and execution steps while Ollama is offline.'
        if payload.stream:
            async def degraded_stream():
                for word in fallback.split(' '):
                    yield f"data: {json.dumps({'token': word})}\n\n"
                    await asyncio.sleep(0.01)
                yield "data: [DONE]\n\n"
            return StreamingResponse(degraded_stream(), media_type='text/event-stream')
        return {'content': fallback, 'degraded': True}

    if payload.stream:
        async def event_stream():
            for word in content.split(' '):
                yield f"data: {json.dumps({'token': word})}\n\n"
                await asyncio.sleep(0.01)
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_stream(), media_type='text/event-stream')

    return {'content': content}

@app.post('/api/company')
async def company(payload: dict):
    action = payload.get('action')
    company_type = payload.get('companyType', 'business')
    description = payload.get('description', '')
    name = payload.get('name', 'New Company')
    logo_url = payload.get('logoUrl')

    if action == 'generate-name':
        base = ''.join(ch for ch in (description or company_type).title() if ch.isalnum())[:12] or 'Nova'
        names = [f"{base} Labs", f"{base} AI", f"{base} Systems", f"{base} Works", f"{base} Co"]
        return {'names': names}

    if action == 'create':
        import uuid
        final_logo = logo_url or f"https://image.pollinations.ai/prompt/{name.replace(' ', '%20')}%20logo&width=512&height=512&nologo=true"
        return {
            'company': {
                'id': str(uuid.uuid4()),
                'name': name,
                'type': company_type,
                'description': description,
                'logo': final_logo,
                'createdAt': 'now',
                'status': 'active'
            }
        }

    if action == 'generate-plan':
        return {'plan': {'mission': description or f'Build {name}', 'vision': f'Lead {company_type}', 'departments': []}}

    return JSONResponse(status_code=400, content={'error': 'Invalid action'})

@app.post('/api/proxy')
async def proxy(payload: dict):
    action = payload.get('action')
    url = payload.get('url')
    query = payload.get('query')

    if action == 'search':
        return {'query': query, 'results': []}

    if not url:
        return JSONResponse(status_code=400, content={'error': 'url is required'})

    if not _is_public_http_url(url):
        return JSONResponse(status_code=400, content={'error': 'Invalid or blocked URL'})

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; AlabobaiProxy/1.0)'
        }

        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                r = await client.get(url, headers=headers)
                html = r.text
        except httpx.ConnectError as exc:
            # Some local Python/OpenSSL setups fail certificate validation for otherwise
            # valid hosts (e.g. CERTIFICATE_VERIFY_FAILED). In local dev, retry once
            # without TLS verification so /api/proxy remains functional.
            if 'CERTIFICATE_VERIFY_FAILED' not in str(exc):
                raise
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, verify=False) as client:
                r = await client.get(url, headers=headers)
                html = r.text

        title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
        title = title_match.group(1).strip() if title_match else ''

        sanitized = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', html, flags=re.IGNORECASE)
        sanitized = f'<html><head><base href="{url}" target="_blank"></head><body>{sanitized}</body></html>'

        if action == 'extract':
            text = re.sub(r'<[^>]+>', ' ', html)
            text = re.sub(r'\s+', ' ', text).strip()
            return {'url': url, 'title': title, 'text': text[:8000]}

        return {'success': True, 'url': url, 'title': title, 'content': sanitized}
    except Exception as exc:
        return JSONResponse(status_code=500, content={'error': str(exc)})

@app.post('/api/search')
async def search(payload: dict):
    """Multi-source web search - DuckDuckGo HTML + Wikipedia for comprehensive results"""
    query = (payload or {}).get('query', '').strip()
    limit = int((payload or {}).get('limit', 10) or 10)
    if not query:
        return JSONResponse(status_code=400, content={'error': 'Query is required'})

    results = []
    errors = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. DuckDuckGo HTML search (real web results)
        try:
            ddg_response = await client.post(
                'https://html.duckduckgo.com/html/',
                data={'q': query},
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            )
            if ddg_response.is_success:
                html = ddg_response.text
                # Parse result links
                import re as regex
                link_pattern = regex.compile(
                    r'<a[^>]*rel="nofollow"[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</a>',
                    regex.IGNORECASE
                )
                snippet_pattern = regex.compile(
                    r'<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)</a>',
                    regex.IGNORECASE
                )

                links = link_pattern.findall(html)
                snippets_raw = snippet_pattern.findall(html)

                for i, (url, title) in enumerate(links):
                    if 'duckduckgo.com' in url:
                        continue
                    # Clean up HTML entities
                    title = title.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&#x27;', "'").strip()
                    snippet = ''
                    if i < len(snippets_raw):
                        snippet = regex.sub(r'<[^>]+>', '', snippets_raw[i]).replace('&amp;', '&').replace('&#x27;', "'").strip()
                    results.append({
                        'title': title,
                        'url': url,
                        'snippet': snippet[:300] if snippet else '',
                        'source': 'duckduckgo'
                    })
                    if len(results) >= limit:
                        break
        except Exception as e:
            errors.append(f'DuckDuckGo: {str(e)}')

        # 2. Wikipedia search (supplemental, reliable)
        if len(results) < limit:
            try:
                wiki = await client.get(
                    'https://en.wikipedia.org/w/api.php',
                    params={
                        'action': 'query',
                        'list': 'search',
                        'srsearch': query,
                        'srlimit': min(5, limit - len(results)),
                        'format': 'json',
                        'srprop': 'snippet',
                    },
                    headers={'User-Agent': 'AlabobaiLocalBridge/1.0'},
                )
                if wiki.is_success:
                    data = wiki.json()
                    search_results = data.get('query', {}).get('search', [])
                    for item in search_results:
                        title = item.get('title', '')
                        snippet = regex.sub(r'<[^>]+>', '', item.get('snippet', ''))
                        results.append({
                            'title': title,
                            'url': f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                            'snippet': snippet,
                            'source': 'wikipedia'
                        })
            except Exception as e:
                errors.append(f'Wikipedia: {str(e)}')

    # Deduplicate by URL
    seen_urls = set()
    unique_results = []
    for r in results:
        url_key = r['url'].lower().rstrip('/')
        if url_key not in seen_urls:
            seen_urls.add(url_key)
            unique_results.append(r)

    response = {
        'query': query,
        'results': unique_results[:limit],
        'count': len(unique_results[:limit]),
        'sources_searched': 2
    }
    if errors:
        response['errors'] = errors

    return response

@app.post('/api/fetch-page')
async def fetch_page(payload: dict):
    url = (payload or {}).get('url', '').strip()
    if not url:
        return JSONResponse(status_code=400, content={'error': 'url is required'})
    if not _is_public_http_url(url):
        return JSONResponse(status_code=400, content={'error': 'Invalid or blocked URL'})

    try:
        headers = {'User-Agent': 'AlabobaiFetchPage/1.0'}
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                r = await client.get(url, headers=headers)
                html = r.text
        except httpx.ConnectError as exc:
            if 'CERTIFICATE_VERIFY_FAILED' not in str(exc):
                raise
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, verify=False) as client:
                r = await client.get(url, headers=headers)
                html = r.text
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
        title = title_match.group(1).strip() if title_match else ''
        text = re.sub(r'<script[^>]*>[\s\S]*?</script>', ' ', html, flags=re.IGNORECASE)
        text = re.sub(r'<style[^>]*>[\s\S]*?</style>', ' ', text, flags=re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return {'url': url, 'title': title, 'content': text[:20000]}
    except Exception as exc:
        return JSONResponse(status_code=500, content={'error': str(exc)})

@app.post('/api/tts')
async def tts(payload: dict):
    text = (payload or {}).get('text', '').strip()
    if not text:
        return JSONResponse(status_code=400, content={'error': 'text is required'})

    voice = (payload or {}).get('voice', 'alloy')  # alloy, echo, fable, onyx, nova, shimmer
    model = (payload or {}).get('model', 'tts-1')  # tts-1 or tts-1-hd
    speed = float((payload or {}).get('speed', 1.0))  # 0.25 to 4.0

    # Validate speed
    speed = max(0.25, min(4.0, speed))

    # Validate voice
    valid_voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
    if voice not in valid_voices:
        voice = 'alloy'

    # Check for OpenAI API key
    import os
    openai_key = os.environ.get('OPENAI_API_KEY', '')

    if openai_key:
        # Use OpenAI TTS API
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    'https://api.openai.com/v1/audio/speech',
                    headers={
                        'Authorization': f'Bearer {openai_key}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'model': model,
                        'input': text[:4096],  # OpenAI TTS limit
                        'voice': voice,
                        'speed': speed,
                        'response_format': 'mp3',
                    },
                )

                if response.status_code == 200:
                    return StreamingResponse(
                        io.BytesIO(response.content),
                        media_type='audio/mpeg',
                        headers={'Content-Disposition': 'inline; filename="speech.mp3"'}
                    )
                else:
                    print(f"[TTS] OpenAI error: {response.status_code} - {response.text}")
                    # Fall through to fallback
        except Exception as e:
            print(f"[TTS] OpenAI exception: {e}")
            # Fall through to fallback

    # Fallback: Use free StreamElements TTS
    try:
        encoded_text = text[:500].replace(' ', '%20').replace('\n', '%20')
        streamelements_url = f'https://api.streamelements.com/kappa/v2/speech?voice=Brian&text={encoded_text}'

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(streamelements_url)
            if response.status_code == 200:
                return StreamingResponse(
                    io.BytesIO(response.content),
                    media_type='audio/mpeg',
                    headers={'Content-Disposition': 'inline; filename="speech.mp3"'}
                )
    except Exception as e:
        print(f"[TTS] StreamElements fallback error: {e}")

    # Final fallback: Local synthetic tone-sequence WAV
    duration = min(6.0, max(0.8, len(text) * 0.05))
    sample_rate = 22050
    frame_count = int(sample_rate * duration)
    volume = 0.25
    base_freq = 220.0 + (len(text) % 120)

    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for i in range(frame_count):
            t = i / sample_rate
            freq = base_freq + (40.0 * math.sin(t * 3.0))
            sample = volume * math.sin(2.0 * math.pi * freq * t)
            wf.writeframesraw(struct.pack('<h', int(sample * 32767.0)))

    return StreamingResponse(io.BytesIO(buf.getvalue()), media_type='audio/wav')

@app.post('/api/webhook/test')
async def webhook_test(payload: dict):
    event = {
        'id': str(uuid.uuid4()),
        'webhookId': 'test',
        'payload': payload or {},
        'timestamp': time.time(),
    }
    WEBHOOK_EVENTS.append(event)
    return {
        'success': True,
        'eventId': event['id'],
        'webhookId': 'test',
        'message': 'Webhook event recorded',
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }

@app.post('/api/webhook/dispatch')
async def webhook_dispatch(payload: dict):
    event = {
        'id': str(uuid.uuid4()),
        'webhookId': 'dispatch',
        'payload': payload or {},
        'timestamp': time.time(),
    }
    WEBHOOK_EVENTS.append(event)
    return {
        'success': True,
        'eventId': event['id'],
        'webhookId': 'dispatch',
        'message': 'Webhook event recorded',
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }

@app.get('/api/webhook/events')
async def webhook_events():
    recent = WEBHOOK_EVENTS[-20:]
    return {
        'webhookId': 'events',
        'eventCount': len(recent),
        'recentEvents': recent,
    }

@app.get('/api/webhook')
async def webhook_root():
    return {
        'status': 'ok',
        'message': 'Webhook API is available',
        'routes': ['/api/webhook/test', '/api/webhook/dispatch', '/api/webhook/events'],
    }

@app.post('/api/web-agent')
async def web_agent(payload: dict):
    url = (payload or {}).get('url', '')
    task = (payload or {}).get('task', 'analyze')
    return {
        'success': True,
        'task': task,
        'url': url,
        'message': 'Local web-agent stub is active in localhost mode',
    }

@app.post('/api/generate-image')
async def generate_image(payload: ImageReq):
    enhanced = enhance_prompt(payload.prompt, payload.style)
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f'{IMAGE_URL}/sdapi/v1/txt2img',
            json={
                'prompt': enhanced,
                'width': payload.width,
                'height': payload.height,
                'steps': 24,
                'cfg_scale': 7,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    image_b64 = (data.get('images') or [None])[0]
    if not image_b64:
        return {'error': 'No image returned from local backend'}
    return {
        'url': f'data:image/png;base64,{image_b64}',
        'prompt': enhanced,
        'width': payload.width,
        'height': payload.height,
        'backend': 'local-media-inference',
        'fallback': False,
    }

@app.post('/api/generate-video')
async def generate_video(payload: VideoReq):
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f'{VIDEO_URL}/generate',
            json={
                'prompt': payload.prompt,
                'durationSeconds': payload.durationSeconds,
                'fps': payload.fps,
                'width': payload.width,
                'height': payload.height,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        'url': data.get('url'),
        'prompt': payload.prompt,
        'durationSeconds': payload.durationSeconds,
        'fps': payload.fps,
        'width': payload.width,
        'height': payload.height,
        'backend': 'local-media-inference',
        'fallback': False,
    }


# =============================================================================
# EMAIL SERVICE
# =============================================================================

@app.post('/api/email/send')
async def send_email(payload: dict):
    """Send email via Resend or SMTP fallback."""
    to = (payload or {}).get('to', '').strip()
    subject = (payload or {}).get('subject', '').strip()
    html = (payload or {}).get('html', '').strip()
    text = (payload or {}).get('text', '').strip()
    template = (payload or {}).get('template', '')

    if not to:
        return JSONResponse(status_code=400, content={'error': 'to is required'})
    if not subject:
        return JSONResponse(status_code=400, content={'error': 'subject is required'})
    if not html and not text:
        return JSONResponse(status_code=400, content={'error': 'html or text is required'})

    # Handle email templates
    if template == 'password_reset':
        reset_url = (payload or {}).get('resetUrl', '')
        user_name = (payload or {}).get('userName', 'User')
        html = f'''
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #d9a07a 0%, #c4956d 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .button {{ display: inline-block; background: #d9a07a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 20px; color: #888; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Alabobai</h1>
                </div>
                <div class="content">
                    <h2>Reset Your Password</h2>
                    <p>Hi {user_name},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password:</p>
                    <p style="text-align: center;">
                        <a href="{reset_url}" class="button">Reset Password</a>
                    </p>
                    <p>This link will expire in 60 minutes.</p>
                    <p>If you didn't request this, you can safely ignore this email.</p>
                </div>
                <div class="footer">
                    <p>&copy; Alabobai. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        '''
        text = f"Hi {user_name},\n\nReset your password by visiting: {reset_url}\n\nThis link expires in 60 minutes.\n\nIf you didn't request this, ignore this email."

    elif template == 'email_verification':
        verify_url = (payload or {}).get('verifyUrl', '')
        user_name = (payload or {}).get('userName', 'User')
        html = f'''
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #d9a07a 0%, #c4956d 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .button {{ display: inline-block; background: #d9a07a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 20px; color: #888; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Alabobai</h1>
                </div>
                <div class="content">
                    <h2>Verify Your Email</h2>
                    <p>Hi {user_name},</p>
                    <p>Thanks for signing up! Please verify your email address by clicking the button below:</p>
                    <p style="text-align: center;">
                        <a href="{verify_url}" class="button">Verify Email</a>
                    </p>
                    <p>This link will expire in 24 hours.</p>
                </div>
                <div class="footer">
                    <p>&copy; Alabobai. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        '''
        text = f"Hi {user_name},\n\nVerify your email by visiting: {verify_url}\n\nThis link expires in 24 hours."

    # Try Resend API first
    resend_key = os.environ.get('RESEND_API_KEY', '')
    from_email = os.environ.get('EMAIL_FROM', 'Alabobai <noreply@alabobai.com>')

    if resend_key:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    'https://api.resend.com/emails',
                    headers={
                        'Authorization': f'Bearer {resend_key}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'from': from_email,
                        'to': [to] if isinstance(to, str) else to,
                        'subject': subject,
                        'html': html,
                        'text': text or None,
                    },
                )
                if response.is_success:
                    data = response.json()
                    return {
                        'success': True,
                        'messageId': data.get('id'),
                        'provider': 'resend',
                    }
                else:
                    print(f"[Email] Resend error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"[Email] Resend exception: {e}")

    # Fallback: log the email for development
    print(f"[Email] Would send to: {to}")
    print(f"[Email] Subject: {subject}")
    print(f"[Email] Body preview: {text[:200] if text else html[:200]}...")

    return {
        'success': True,
        'messageId': f'dev-{uuid.uuid4()}',
        'provider': 'console',
        'note': 'Email logged to console (no RESEND_API_KEY configured)',
    }


# =============================================================================
# SOCKET.IO EVENT HANDLERS
# =============================================================================

@sio.event
async def connect(sid, environ):
    """Handle client connection."""
    print(f"[Socket.IO] Client connected: {sid}")
    connected_clients[sid] = {
        'connected_at': time.time(),
        'user_id': None,
        'user_name': None,
    }

    # Send current presence to the new client
    await sio.emit('presence_sync', list(presence_data.values()), room=sid)

    # Broadcast connection event
    await sio.emit('user_connected', {'sid': sid, 'count': len(connected_clients)})


@sio.event
async def disconnect(sid):
    """Handle client disconnection."""
    print(f"[Socket.IO] Client disconnected: {sid}")

    # Get user info before removing
    client_info = connected_clients.get(sid, {})
    user_id = client_info.get('user_id')

    # Remove from presence
    if user_id and user_id in presence_data:
        del presence_data[user_id]
        await sio.emit('presence_leave', {'userId': user_id})

    # Remove from connected clients
    if sid in connected_clients:
        del connected_clients[sid]

    await sio.emit('user_disconnected', {'sid': sid, 'count': len(connected_clients)})


@sio.event
async def presence_join(sid, data):
    """Handle user joining with presence data."""
    user_id = data.get('userId')
    user_data = {
        'id': user_id,
        'name': data.get('name', 'Anonymous'),
        'email': data.get('email', ''),
        'color': data.get('color', '#d9a07a'),
        'status': data.get('status', 'online'),
        'currentView': data.get('currentView'),
        'currentFile': data.get('currentFile'),
        'lastSeen': time.time(),
    }

    # Update tracking
    if sid in connected_clients:
        connected_clients[sid]['user_id'] = user_id
        connected_clients[sid]['user_name'] = user_data['name']

    # Store presence
    presence_data[user_id] = user_data

    # Broadcast to all clients
    await sio.emit('presence_update', user_data)
    print(f"[Socket.IO] Presence join: {user_data['name']} ({user_id})")


@sio.event
async def presence_update(sid, data):
    """Handle presence updates (cursor, typing, etc.)."""
    user_id = data.get('userId')
    if user_id and user_id in presence_data:
        presence_data[user_id].update({
            'cursor': data.get('cursor'),
            'selection': data.get('selection'),
            'activity': data.get('activity', 'idle'),
            'isTyping': data.get('isTyping', False),
            'typingIn': data.get('typingIn'),
            'currentView': data.get('currentView'),
            'currentFile': data.get('currentFile'),
            'lastSeen': time.time(),
        })

        # Broadcast update to all except sender
        await sio.emit('presence_update', presence_data[user_id], skip_sid=sid)


@sio.event
async def presence_leave(sid, data):
    """Handle explicit presence leave."""
    user_id = data.get('userId')
    if user_id and user_id in presence_data:
        del presence_data[user_id]
        await sio.emit('presence_leave', {'userId': user_id})


@sio.event
async def notification(sid, data):
    """Handle notification broadcast."""
    notification_data = {
        'id': str(uuid.uuid4()),
        'type': data.get('type', 'info'),
        'title': data.get('title', ''),
        'message': data.get('message', ''),
        'timestamp': time.time(),
        'userId': data.get('userId'),
        'userName': data.get('userName'),
        'userColor': data.get('userColor'),
    }

    # Broadcast to specific user or all
    target_user = data.get('targetUserId')
    if target_user:
        # Find sid for target user
        for client_sid, client_info in connected_clients.items():
            if client_info.get('user_id') == target_user:
                await sio.emit('notification', notification_data, room=client_sid)
                break
    else:
        # Broadcast to all
        await sio.emit('notification', notification_data)


@sio.event
async def activity(sid, data):
    """Handle activity feed broadcast."""
    activity_data = {
        'id': str(uuid.uuid4()),
        'userId': data.get('userId'),
        'userName': data.get('userName'),
        'userColor': data.get('userColor'),
        'type': data.get('type', 'file_edit'),
        'description': data.get('description', ''),
        'target': data.get('target'),
        'timestamp': time.time(),
    }

    # Broadcast to all clients
    await sio.emit('activity', activity_data)


@sio.event
async def typing_start(sid, data):
    """Handle typing indicator start."""
    await sio.emit('typing_start', {
        'userId': data.get('userId'),
        'userName': data.get('userName'),
        'location': data.get('location', 'chat'),
    }, skip_sid=sid)


@sio.event
async def typing_stop(sid, data):
    """Handle typing indicator stop."""
    await sio.emit('typing_stop', {
        'userId': data.get('userId'),
    }, skip_sid=sid)


# REST endpoint to send notifications programmatically
@app.post('/api/notifications/send')
async def send_notification(payload: dict):
    """Send notification via Socket.IO."""
    notification_data = {
        'id': str(uuid.uuid4()),
        'type': (payload or {}).get('type', 'info'),
        'title': (payload or {}).get('title', ''),
        'message': (payload or {}).get('message', ''),
        'timestamp': time.time(),
        'userId': (payload or {}).get('userId'),
        'userName': (payload or {}).get('userName'),
        'userColor': (payload or {}).get('userColor'),
    }

    target_user = (payload or {}).get('targetUserId')
    if target_user:
        for client_sid, client_info in connected_clients.items():
            if client_info.get('user_id') == target_user:
                await sio.emit('notification', notification_data, room=client_sid)
                return {'success': True, 'sent': True, 'target': 'user'}
        return {'success': True, 'sent': False, 'reason': 'user_not_connected'}
    else:
        await sio.emit('notification', notification_data)
        return {'success': True, 'sent': True, 'target': 'broadcast', 'recipients': len(connected_clients)}


@app.get('/api/presence')
async def get_presence():
    """Get current presence data."""
    return {
        'users': list(presence_data.values()),
        'connectedClients': len(connected_clients),
    }


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

if __name__ == '__main__':
    import uvicorn
    port = int(os.environ.get('BRIDGE_PORT', 8765))
    print(f"[Alabobai] Starting Local Media Bridge on port {port}")
    print(f"[Alabobai] Socket.IO enabled for real-time features")
    # Use socket_app instead of app to enable Socket.IO
    uvicorn.run(socket_app, host='0.0.0.0', port=port)
