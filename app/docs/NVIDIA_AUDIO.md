# NVIDIA Audio Integration

Alabobai integrates NVIDIA's open-source audio AI capabilities for high-quality speech recognition (ASR) and text-to-speech (TTS).

## Features

- **Sherpa-ONNX (Browser)**: Runs directly in the browser using WebAssembly, no server needed
- **NeMo Backend (Server)**: GPU-accelerated processing using NVIDIA NeMo for maximum performance
- **Web Speech API Fallback**: Uses native browser APIs when other providers are unavailable

## Models Supported

### Speech Recognition (ASR)

| Model | Parameters | Languages | Best For |
|-------|------------|-----------|----------|
| Parakeet TDT 0.6B v2 | 600M | English | Best accuracy (#1 on HuggingFace) |
| Canary-1B | 1B | 25 EU languages | Multilingual + Translation |
| Nemotron Streaming | 600M | English | Low latency (<24ms) |

### Text-to-Speech (TTS)

| Model | Type | Quality |
|-------|------|---------|
| VITS | End-to-end | Fast, natural |
| FastPitch | Mel spectrogram | High quality |
| HiFi-GAN | Vocoder | Ultra quality |

## Quick Start

### Browser-Only (No Setup Required)

The Sherpa-ONNX WebAssembly provider works out of the box:

1. Open Alabobai
2. Go to Settings > Audio (NVIDIA)
3. Click "Test ASR" or use voice input in any chat

### Server-Side (GPU Acceleration)

For maximum performance with NVIDIA GPUs:

```bash
# Install dependencies
pip install nemo_toolkit[all] flask flask-cors

# Start the NeMo service
python scripts/nemo_service.py --port 5001

# Or with model preloading
python scripts/nemo_service.py --port 5001 --preload
```

Then configure in Settings > Audio (NVIDIA):
- Set NeMo API URL to `http://localhost:5001`
- Enable GPU acceleration

## API Reference

### ASR Endpoint

```bash
POST /api/nemo?endpoint=asr
Content-Type: multipart/form-data

audio: <audio file>
model: parakeet-tdt-0.6b | canary-1b | nemotron-streaming
language: en | de | fr | es | ...
timestamps: true | false
punctuation: true | false
```

Response:
```json
{
  "text": "Transcribed text here",
  "confidence": 0.95,
  "language": "en",
  "provider": "nemo"
}
```

### TTS Endpoint

```bash
POST /api/nemo?endpoint=tts
Content-Type: application/json

{
  "text": "Hello, world!",
  "model": "vits",
  "voice": "default",
  "speed": 1.0
}
```

Response: `audio/wav` binary

## React Hook Usage

```tsx
import { useNvidiaAudio } from '@/hooks/useNvidiaAudio'

function VoiceChat() {
  const {
    isListening,
    transcript,
    audioLevel,
    providers,
    startListening,
    stopListening,
    speak
  } = useNvidiaAudio({
    onTranscript: (result) => {
      console.log('Transcribed:', result.text)
      console.log('Provider:', result.provider)
    }
  })

  return (
    <div>
      <button onClick={isListening ? stopListening : startListening}>
        {isListening ? 'Stop' : 'Start'} Listening
      </button>
      <p>Transcript: {transcript}</p>
      <p>Audio Level: {Math.round(audioLevel * 100)}%</p>
      <p>Provider: {providers.nemoApi ? 'NeMo' : providers.sherpaOnnx ? 'Sherpa-ONNX' : 'Web Speech'}</p>

      <button onClick={() => speak('Hello from NVIDIA!')}>
        Speak
      </button>
    </div>
  )
}
```

## Configuration Options

```typescript
interface NvidiaAudioConfig {
  // ASR settings
  asrModel: 'parakeet-tdt-0.6b' | 'canary-1b' | 'nemotron-streaming'
  asrLanguage: string
  enableTimestamps: boolean
  enablePunctuation: boolean

  // TTS settings
  ttsModel: 'vits' | 'fastpitch' | 'hifigan'
  ttsVoice: string
  ttsSpeakingRate: number
  ttsPitch: number

  // Backend settings
  nemoApiUrl?: string
  useGpuAcceleration: boolean
  enableWebSpeechFallback: boolean
}
```

## Environment Variables

```bash
# Enable NeMo backend
NEMO_ENABLED=true

# Riva server URL (alternative to NeMo)
NVIDIA_RIVA_URL=http://localhost:50051

# GPU device ID
NVIDIA_GPU_DEVICE=0

# CUDA availability
CUDA_AVAILABLE=true
```

## Performance Comparison

| Provider | Latency | Accuracy | Offline |
|----------|---------|----------|---------|
| NeMo (GPU) | ~50ms | 99%+ | No |
| Sherpa-ONNX | ~200ms | 95%+ | Yes |
| Web Speech API | Varies | 90%+ | No |

## Troubleshooting

### Sherpa-ONNX not loading
- Check browser console for WebAssembly errors
- Ensure the browser supports WebAssembly
- Try refreshing the page

### NeMo service not connecting
- Verify the service is running: `curl http://localhost:5001/health`
- Check firewall settings
- Ensure CORS is enabled

### Poor transcription quality
- Check microphone permissions
- Reduce background noise
- Speak clearly at a moderate pace
- Try a different ASR model

## Links

- [NVIDIA NeMo](https://github.com/NVIDIA-NeMo/NeMo)
- [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx)
- [Parakeet Models](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2)
- [Canary Models](https://huggingface.co/nvidia/canary-1b)
