export const config = {
  runtime: 'edge',
};

// Pollinations.ai - 100% free, no API key needed
// Supports: Flux, Stable Diffusion, and more
export default async function handler(req: Request) {
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
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { prompt, width = 512, height = 512, style = 'logo' } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Enhance prompt based on style
    let enhancedPrompt = prompt;
    if (style === 'logo') {
      enhancedPrompt = `Professional minimalist logo design for ${prompt}, clean vector style, simple shapes, modern branding, white background, high quality`;
    } else if (style === 'hero') {
      enhancedPrompt = `${prompt}, professional photography, high resolution, modern, sleek design`;
    } else if (style === 'icon') {
      enhancedPrompt = `Simple flat icon of ${prompt}, minimal design, solid colors, app icon style`;
    }

    // Pollinations.ai free API - generates image URL directly
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true`;

    // Verify the image is accessible
    const imageResponse = await fetch(imageUrl, { method: 'HEAD' });

    if (!imageResponse.ok) {
      throw new Error('Failed to generate image');
    }

    return new Response(JSON.stringify({
      url: imageUrl,
      prompt: enhancedPrompt,
      width,
      height,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Image generation error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate image',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
