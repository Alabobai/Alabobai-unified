#!/usr/bin/env python3
"""
Local media inference service (no external API calls).

Implements:
- POST /sdapi/v1/txt2img  (Automatic1111-compatible shape)
- POST /generate          (video-style generation endpoint)

Outputs are generated locally from prompt + seeded procedural rendering.
"""

from __future__ import annotations

import base64
import hashlib
import io
import math
import random
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont


app = FastAPI(title="Alabobai Local Media Inference", version="1.0.0")


class Txt2ImgRequest(BaseModel):
    prompt: str
    width: int = 512
    height: int = 512
    steps: int = 24
    cfg_scale: float = 7.0
    sampler_name: Optional[str] = None


class VideoRequest(BaseModel):
    prompt: str
    durationSeconds: int = 4
    fps: int = 12
    width: int = 512
    height: int = 512


def _seed(prompt: str) -> int:
    return int(hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16], 16)


def _clamp_size(width: int, height: int) -> tuple[int, int]:
    w = max(256, min(width, 1024))
    h = max(256, min(height, 1024))
    return w, h


def _text_color(bg: tuple[int, int, int]) -> tuple[int, int, int]:
    luminance = (0.2126 * bg[0]) + (0.7152 * bg[1]) + (0.0722 * bg[2])
    return (245, 245, 245) if luminance < 130 else (20, 20, 20)


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, font: ImageFont.ImageFont) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        attempt = " ".join(current + [word])
        bbox = draw.textbbox((0, 0), attempt, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current.append(word)
        else:
            lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines[:4]


def _render_image(prompt: str, width: int, height: int) -> Image.Image:
    width, height = _clamp_size(width, height)
    seed = _seed(prompt)
    rnd = random.Random(seed)

    c1 = (rnd.randint(10, 80), rnd.randint(10, 80), rnd.randint(40, 140))
    c2 = (rnd.randint(70, 180), rnd.randint(20, 120), rnd.randint(70, 180))
    c3 = (rnd.randint(20, 150), rnd.randint(80, 200), rnd.randint(80, 220))

    img = Image.new("RGB", (width, height), c1)
    draw = ImageDraw.Draw(img)

    # Procedural gradient
    for y in range(height):
        t = y / max(1, (height - 1))
        r = int((1 - t) * c1[0] + t * c2[0])
        g = int((1 - t) * c1[1] + t * c2[1])
        b = int((1 - t) * c1[2] + t * c3[2])
        draw.line((0, y, width, y), fill=(r, g, b))

    # Add prompt-seeded shapes
    for i in range(14):
        x = rnd.randint(0, width)
        y = rnd.randint(0, height)
        rad = rnd.randint(18, max(32, min(width, height) // 5))
        alpha_c = (rnd.randint(130, 255), rnd.randint(130, 255), rnd.randint(130, 255))
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.ellipse((x - rad, y - rad, x + rad, y + rad), fill=(*alpha_c, 40 if i % 2 else 75))
        img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    # Foreground panel
    panel_h = 122
    panel_y = height - panel_h - 20
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((24, panel_y, width - 24, panel_y + panel_h), radius=14, fill=(12, 18, 28, 200))

    font = ImageFont.load_default()
    tcolor = _text_color(c2)
    draw.text((40, panel_y + 16), "Alabobai Local Image Generation", font=font, fill=tcolor)
    wrapped = _wrap_text(draw, prompt[:180], width - 84, font)
    for idx, line in enumerate(wrapped):
        draw.text((40, panel_y + 38 + (idx * 18)), line, font=font, fill=(220, 230, 240))

    return img


def _png_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _gif_data_url(frames: list[Image.Image], fps: int) -> str:
    delay_ms = max(50, int(1000 / max(1, fps)))
    buf = io.BytesIO()
    frames[0].save(
        buf,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=delay_ms,
        loop=0,
        optimize=False,
    )
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/gif;base64,{b64}"


def _render_video_frames(prompt: str, width: int, height: int, frame_count: int) -> list[Image.Image]:
    width, height = _clamp_size(width, height)
    seed = _seed(f"video::{prompt}")
    rnd = random.Random(seed)

    bg_a = (rnd.randint(8, 40), rnd.randint(20, 60), rnd.randint(60, 140))
    bg_b = (rnd.randint(20, 80), rnd.randint(40, 120), rnd.randint(120, 200))
    accent = (rnd.randint(140, 255), rnd.randint(100, 240), rnd.randint(100, 240))

    frames: list[Image.Image] = []
    font = ImageFont.load_default()
    radius = max(24, min(width, height) // 9)
    amplitude = max(80, width // 4)

    for idx in range(frame_count):
        t = idx / max(1, (frame_count - 1))
        img = Image.new("RGB", (width, height), bg_a)
        draw = ImageDraw.Draw(img)

        # Vertical gradient
        for y in range(height):
            ty = y / max(1, height - 1)
            r = int((1 - ty) * bg_a[0] + ty * bg_b[0])
            g = int((1 - ty) * bg_a[1] + ty * bg_b[1])
            b = int((1 - ty) * bg_a[2] + ty * bg_b[2])
            draw.line((0, y, width, y), fill=(r, g, b))

        # Motion path
        cx = int((width // 2) + math.sin(t * math.tau) * amplitude)
        cy = int((height // 2) + math.cos(t * math.tau * 1.4) * (height // 6))
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=accent)

        # Trails
        for trail in range(5):
            tt = max(0.0, t - (trail * 0.03))
            tx = int((width // 2) + math.sin(tt * math.tau) * amplitude)
            ty = int((height // 2) + math.cos(tt * math.tau * 1.4) * (height // 6))
            tr = max(8, radius - (trail * 8))
            c = (accent[0], accent[1], accent[2])
            draw.ellipse((tx - tr, ty - tr, tx + tr, ty + tr), outline=c, width=2)

        # Caption block
        block_y = height - 72
        draw.rectangle((0, block_y, width, height), fill=(8, 12, 20))
        caption = f"{prompt[:58]} {' ' if len(prompt) <= 58 else '...'}"
        draw.text((18, block_y + 14), "Alabobai Local Video Generation", fill=(236, 242, 248), font=font)
        draw.text((18, block_y + 34), caption, fill=(198, 214, 230), font=font)

        frames.append(img)

    return frames


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/sdapi/v1/txt2img")
def txt2img(payload: Txt2ImgRequest) -> dict[str, object]:
    img = _render_image(payload.prompt, payload.width, payload.height)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return {
        "images": [b64],
        "parameters": payload.model_dump(),
        "info": "generated-locally",
    }


@app.post("/generate")
def generate_video(payload: VideoRequest) -> dict[str, object]:
    frame_count = max(12, min(payload.durationSeconds * payload.fps, 96))
    frames = _render_video_frames(payload.prompt, payload.width, payload.height, frame_count)
    return {
        "url": _gif_data_url(frames, payload.fps),
        "durationSeconds": payload.durationSeconds,
        "fps": payload.fps,
        "backend": "local-procedural-gif",
    }
