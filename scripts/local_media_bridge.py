#!/usr/bin/env python3
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
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
from urllib.parse import urlparse

app = FastAPI(title='Alabobai Local Media Bridge', version='1.0.0')

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

@app.get('/api/local-ai/knowledge/stats')
async def local_ai_knowledge_stats():
    return {
        'totalDocuments': 0,
        'totalChunks': 0,
        'collections': [
            {'name': 'documents', 'documentCount': 0, 'chunkCount': 0}
        ]
    }

@app.post('/api/local-ai/knowledge/ingest')
async def local_ai_knowledge_ingest(_request: Request):
    return {'success': True, 'message': 'Ingest endpoint is available'}

@app.post('/api/local-ai/knowledge/search')
async def local_ai_knowledge_search(payload: dict):
    query = (payload or {}).get('query', '')
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

    model = payload.get('model') or 'llama3:latest'
    temperature = payload.get('temperature', 0.7)
    content, err = await _chat_with_ollama(normalized_messages, model, temperature)
    if err:
        fallback = 'Local model unavailable. Please start Ollama and pull a model.'
        return {
            'response': fallback,
            'content': fallback,
            'sources': []
        }

    # Return both keys for compatibility across frontend call sites
    return {'response': content, 'content': content, 'sources': []}

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

    # Local synthetic tone-sequence WAV (no external API dependency).
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
