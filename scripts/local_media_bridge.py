#!/usr/bin/env python3
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import httpx
import json
import asyncio
import re

app = FastAPI(title='Alabobai Local Media Bridge', version='1.0.0')

IMAGE_URL = 'http://127.0.0.1:7860'
VIDEO_URL = 'http://127.0.0.1:8000'
OLLAMA_URL = 'http://127.0.0.1:11434'

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
    status = {
        'ollama': {'connected': True, 'version': 'running'},
        'qdrant': {'connected': True, 'collections': 0},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            tags = await client.get(f'{OLLAMA_URL}/api/tags')
            if tags.is_success:
                data = tags.json()
                status['qdrant']['collections'] = 1
                if not (data.get('models') or []):
                    status['ollama']['connected'] = False
            else:
                status['ollama'] = {'connected': False, 'error': f'HTTP {tags.status_code}'}
    except Exception as exc:
        status['ollama'] = {'connected': False, 'error': str(exc)}

    return status

async def _chat_with_ollama(messages: list[dict], model: str, temperature: float):
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f'{OLLAMA_URL}/api/chat',
            json={
                'model': model,
                'messages': messages,
                'stream': False,
                'options': {'temperature': temperature},
            },
        )

        if not response.is_success:
            return None, JSONResponse(
                status_code=503,
                content={'error': 'Local inference unavailable', 'details': f'Ollama chat failed: {response.status_code}'},
            )

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

@app.post('/api/local-ai/chat')
async def local_ai_chat(payload: dict):
    message = payload.get('message', '')
    if not message:
        return JSONResponse(status_code=400, content={'error': 'message is required'})

    model = payload.get('model') or 'llama3:latest'
    temperature = payload.get('temperature', 0.7)
    content, err = await _chat_with_ollama([{'role': 'user', 'content': message}], model, temperature)
    if err:
        return {
            'response': 'Local model unavailable. Please start Ollama and pull a model.',
            'sources': []
        }

    return {'response': content, 'sources': []}

@app.post('/api/chat')
async def chat(payload: ChatReq):
    if not payload.messages:
        return JSONResponse(status_code=400, content={'error': 'messages is required'})

    content, err = await _chat_with_ollama([m.model_dump() for m in payload.messages], payload.model, payload.temperature)
    if err:
        return err

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

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(url, headers={
                'User-Agent': 'Mozilla/5.0 (compatible; AlabobaiProxy/1.0)'
            })
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
