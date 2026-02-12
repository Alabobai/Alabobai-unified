export const config = {
  runtime: 'edge',
};

// Neural TTS API - Uses free high-quality TTS services
// Supports multiple voices that sound natural (not robotic)

interface TTSRequest {
  text: string;
  voice?: string;
  rate?: number;
}

// Available neural voices (StreamElements/TikTok style)
const VOICES = {
  // Female voices
  'aria': { name: 'Aria', gender: 'female', service: 'streamelements' },
  'jenny': { name: 'Jenny', gender: 'female', service: 'streamelements' },
  'salli': { name: 'Salli', gender: 'female', service: 'streamelements' },
  'kimberly': { name: 'Kimberly', gender: 'female', service: 'streamelements' },
  'joanna': { name: 'Joanna', gender: 'female', service: 'streamelements' },
  'ivy': { name: 'Ivy', gender: 'female', service: 'streamelements' },
  'kendra': { name: 'Kendra', gender: 'female', service: 'streamelements' },

  // Male voices
  'brian': { name: 'Brian', gender: 'male', service: 'streamelements' },
  'joey': { name: 'Joey', gender: 'male', service: 'streamelements' },
  'justin': { name: 'Justin', gender: 'male', service: 'streamelements' },
  'matthew': { name: 'Matthew', gender: 'male', service: 'streamelements' },
  'russell': { name: 'Russell', gender: 'male', service: 'streamelements' },

  // Character voices
  'rocket': { name: 'Rocket (Fun)', gender: 'male', service: 'tiktok' },
  'ghostface': { name: 'Ghostface', gender: 'male', service: 'tiktok' },
  'chewbacca': { name: 'Chewbacca', gender: 'male', service: 'tiktok' },
  'stormtrooper': { name: 'Stormtrooper', gender: 'male', service: 'tiktok' },
  'stitch': { name: 'Stitch', gender: 'male', service: 'tiktok' },
};

// StreamElements TTS (free, high quality neural voices)
async function streamElementsTTS(text: string, voice: string): Promise<Response> {
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(text)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`StreamElements TTS error: ${response.status}`);
  }

  return response;
}

// Google Translate TTS (fallback, decent quality)
async function googleTTS(text: string, lang: string = 'en'): Promise<Response> {
  // Split long text into chunks (Google TTS has a limit)
  const maxLength = 200;
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
  }

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Google TTS error: ${response.status}`);
  }

  return response;
}

export default async function handler(req: Request) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // GET request to list available voices
  if (req.method === 'GET') {
    const voiceList = Object.entries(VOICES).map(([id, info]) => ({
      id,
      name: info.name,
      gender: info.gender,
    }));

    return new Response(JSON.stringify({ voices: voiceList }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body: TTSRequest = await req.json();
    const { text, voice = 'brian' } = body;

    if (!text || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Try StreamElements TTS first (best quality)
    try {
      const voiceId = voice.toLowerCase();
      const voiceInfo = VOICES[voiceId as keyof typeof VOICES];

      if (voiceInfo && voiceInfo.service === 'streamelements') {
        const response = await streamElementsTTS(text, voiceId);
        const audioData = await response.arrayBuffer();

        return new Response(audioData, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    } catch (e) {
      console.log('StreamElements TTS failed, trying fallback:', e);
    }

    // Fallback to Google TTS
    try {
      const response = await googleTTS(text, 'en');
      const audioData = await response.arrayBuffer();

      return new Response(audioData, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (e) {
      console.log('Google TTS also failed:', e);
    }

    // All TTS services failed
    return new Response(JSON.stringify({
      error: 'TTS service unavailable',
      message: 'Please try again later'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    console.error('TTS API Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate speech',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
