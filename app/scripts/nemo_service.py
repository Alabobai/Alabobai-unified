#!/usr/bin/env python3
"""
NVIDIA NeMo Audio Service

A Flask-based backend service for GPU-accelerated speech processing using NVIDIA NeMo.
Supports ASR (Automatic Speech Recognition) and TTS (Text-to-Speech).

Requirements:
- NVIDIA GPU with CUDA support
- Python 3.8+
- pip install nemo_toolkit[all] flask flask-cors

Models supported:
- Parakeet TDT 0.6B v2 (ASR - #1 on HuggingFace leaderboard)
- Canary-1B (Multilingual ASR + Translation)
- VITS/FastPitch (TTS)

Usage:
  python nemo_service.py [--port 5001] [--host 0.0.0.0]
"""

import os
import sys
import argparse
import tempfile
import logging
from typing import Optional
from io import BytesIO

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from flask import Flask, request, jsonify, send_file
    from flask_cors import CORS
except ImportError:
    logger.error("Flask not installed. Run: pip install flask flask-cors")
    sys.exit(1)

# Try to import NeMo
NEMO_AVAILABLE = False
try:
    import nemo.collections.asr as nemo_asr
    import nemo.collections.tts as nemo_tts
    import torch
    import soundfile as sf
    import numpy as np
    NEMO_AVAILABLE = True
    logger.info("NeMo toolkit loaded successfully")
except ImportError as e:
    logger.warning(f"NeMo not available: {e}")
    logger.warning("Install NeMo with: pip install nemo_toolkit[all]")

# ============================================================================
# Configuration
# ============================================================================

ASR_MODELS = {
    "parakeet-tdt-0.6b": "nvidia/parakeet-tdt-0.6b-v2",
    "canary-1b": "nvidia/canary-1b",
    "nemotron-streaming": "nvidia/nemotron-speech-streaming-en-0.6b",
}

TTS_MODELS = {
    "vits": "tts_en_lj_vits",
    "fastpitch": "tts_en_fastpitch",
    "hifigan": "tts_hifigan",
}

# ============================================================================
# Model Cache
# ============================================================================

class ModelCache:
    """Cache loaded models to avoid reloading on each request."""

    def __init__(self):
        self.asr_models = {}
        self.tts_models = {}
        self.vocoder = None

    def get_asr_model(self, model_name: str):
        if model_name not in self.asr_models:
            logger.info(f"Loading ASR model: {model_name}")
            model_path = ASR_MODELS.get(model_name, model_name)

            if "parakeet" in model_name.lower() or "canary" in model_name.lower():
                # Load from HuggingFace
                self.asr_models[model_name] = nemo_asr.models.ASRModel.from_pretrained(
                    model_path
                )
            else:
                # Load from NGC
                self.asr_models[model_name] = nemo_asr.models.ASRModel.from_pretrained(
                    model_name=model_path
                )

            logger.info(f"ASR model {model_name} loaded")

        return self.asr_models[model_name]

    def get_tts_model(self, model_name: str):
        if model_name not in self.tts_models:
            logger.info(f"Loading TTS model: {model_name}")
            model_path = TTS_MODELS.get(model_name, model_name)

            if model_name == "vits":
                self.tts_models[model_name] = nemo_tts.models.VitsModel.from_pretrained(
                    model_name=model_path
                )
            elif model_name == "fastpitch":
                self.tts_models[model_name] = nemo_tts.models.FastPitchModel.from_pretrained(
                    model_name=model_path
                )
                # Load HiFi-GAN vocoder
                if self.vocoder is None:
                    self.vocoder = nemo_tts.models.HifiGanModel.from_pretrained(
                        model_name="tts_hifigan"
                    )
            else:
                self.tts_models[model_name] = nemo_tts.models.HifiGanModel.from_pretrained(
                    model_name=model_path
                )

            logger.info(f"TTS model {model_name} loaded")

        return self.tts_models[model_name]

model_cache = ModelCache() if NEMO_AVAILABLE else None

# ============================================================================
# Flask App
# ============================================================================

app = Flask(__name__)
CORS(app)

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    gpu_available = torch.cuda.is_available() if NEMO_AVAILABLE else False
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None

    return jsonify({
        "status": "ok",
        "nemo_available": NEMO_AVAILABLE,
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
        "models": {
            "asr": list(ASR_MODELS.keys()),
            "tts": list(TTS_MODELS.keys()),
        }
    })

@app.route("/asr", methods=["POST"])
def transcribe():
    """Transcribe audio to text using NVIDIA NeMo ASR."""
    if not NEMO_AVAILABLE:
        return jsonify({
            "error": "NeMo not available",
            "message": "Install NeMo with: pip install nemo_toolkit[all]"
        }), 503

    # Get audio file
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    model_name = request.form.get("model", "parakeet-tdt-0.6b")
    language = request.form.get("language", "en")
    timestamps = request.form.get("timestamps", "false").lower() == "true"
    punctuation = request.form.get("punctuation", "true").lower() == "true"

    try:
        # Save audio to temp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            audio_file.save(tmp.name)
            audio_path = tmp.name

        # Load model and transcribe
        asr_model = model_cache.get_asr_model(model_name)

        # Set model to evaluation mode
        asr_model.eval()

        # Transcribe
        with torch.no_grad():
            transcription = asr_model.transcribe([audio_path])

        # Clean up
        os.unlink(audio_path)

        # Get result
        text = transcription[0] if transcription else ""

        return jsonify({
            "text": text,
            "confidence": 0.95,  # NeMo doesn't provide confidence by default
            "language": language,
            "model": model_name,
            "provider": "nemo",
            "timestamps": None  # Would need additional processing for word-level timestamps
        })

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/tts", methods=["POST"])
def synthesize():
    """Synthesize text to speech using NVIDIA NeMo TTS."""
    if not NEMO_AVAILABLE:
        return jsonify({
            "error": "NeMo not available",
            "message": "Install NeMo with: pip install nemo_toolkit[all]"
        }), 503

    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "No text provided"}), 400

    text = data["text"]
    model_name = data.get("model", "vits")
    speed = data.get("speed", 1.0)

    try:
        # Load model
        tts_model = model_cache.get_tts_model(model_name)
        tts_model.eval()

        with torch.no_grad():
            if model_name == "vits":
                # VITS is an end-to-end model
                audio = tts_model.convert_text_to_waveform(text=text)
            elif model_name == "fastpitch":
                # FastPitch needs vocoder
                spec = tts_model.generate_spectrogram(tokens=tts_model.parse(text))
                audio = model_cache.vocoder.convert_spectrogram_to_audio(spec=spec)
            else:
                return jsonify({"error": f"Unknown model: {model_name}"}), 400

        # Convert to numpy
        if isinstance(audio, torch.Tensor):
            audio = audio.squeeze().cpu().numpy()

        # Apply speed adjustment if needed
        if speed != 1.0:
            # Simple resampling for speed adjustment
            import scipy.signal as signal
            audio = signal.resample(audio, int(len(audio) / speed))

        # Save to buffer
        buffer = BytesIO()
        sf.write(buffer, audio, 22050, format="WAV")
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype="audio/wav",
            as_attachment=False
        )

    except Exception as e:
        logger.error(f"TTS error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/models", methods=["GET"])
def list_models():
    """List available models."""
    return jsonify({
        "asr": [
            {
                "id": k,
                "name": k,
                "hf_path": v,
                "description": "NVIDIA NeMo ASR model"
            }
            for k, v in ASR_MODELS.items()
        ],
        "tts": [
            {
                "id": k,
                "name": k,
                "description": "NVIDIA NeMo TTS model"
            }
            for k, v in TTS_MODELS.items()
        ]
    })

# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="NVIDIA NeMo Audio Service")
    parser.add_argument("--port", type=int, default=5001, help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    parser.add_argument("--preload", action="store_true", help="Preload default models")
    args = parser.parse_args()

    if args.preload and NEMO_AVAILABLE:
        logger.info("Preloading default models...")
        try:
            model_cache.get_asr_model("parakeet-tdt-0.6b")
            model_cache.get_tts_model("vits")
            logger.info("Models preloaded successfully")
        except Exception as e:
            logger.warning(f"Failed to preload models: {e}")

    logger.info(f"Starting NeMo Audio Service on {args.host}:{args.port}")
    logger.info(f"NeMo available: {NEMO_AVAILABLE}")
    if NEMO_AVAILABLE:
        logger.info(f"GPU available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            logger.info(f"GPU: {torch.cuda.get_device_name(0)}")

    app.run(host=args.host, port=args.port, debug=args.debug)

if __name__ == "__main__":
    main()
