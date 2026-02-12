export const config = {
  runtime: 'edge',
};

interface CompanyRequest {
  action: 'generate-plan' | 'generate-logo' | 'generate-name' | 'create';
  companyType?: string;
  description?: string;
  name?: string;
  industry?: string;
  logoUrl?: string; // User-selected logo URL from wizard
}

const BUSINESS_PROMPT = `You are a business strategist and startup advisor. Generate detailed, actionable business plans.
Always respond in valid JSON format. Be specific and practical.`;

async function generateWithAI(prompt: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (geminiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: BUSINESS_PROMPT }] },
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  }

  if (groqKey) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: BUSINESS_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
  }

  throw new Error('No AI provider available');
}

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
    const body: CompanyRequest = await req.json();
    const { action, companyType, description, name, industry, logoUrl } = body;

    switch (action) {
      case 'generate-name': {
        const prompt = `Generate 5 creative, memorable company names for a ${companyType} company in the ${industry || 'technology'} industry.
Description: ${description}

Return as JSON array: ["Name1", "Name2", "Name3", "Name4", "Name5"]
Only return the JSON array, nothing else.`;

        const result = await generateWithAI(prompt);
        const names = JSON.parse(result.replace(/```json\n?|\n?```/g, '').trim());

        return new Response(JSON.stringify({ names }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      case 'generate-plan': {
        const prompt = `Create a comprehensive business plan for:
Company Name: ${name}
Type: ${companyType}
Description: ${description}

Return as JSON with this structure:
{
  "executive_summary": "2-3 sentence overview",
  "mission": "Company mission statement",
  "vision": "Company vision statement",
  "target_market": "Who are the customers",
  "value_proposition": "What makes this unique",
  "revenue_model": "How it makes money",
  "departments": [
    {"name": "Engineering", "responsibilities": "...", "headcount": 5},
    {"name": "Marketing", "responsibilities": "...", "headcount": 3}
  ],
  "milestones": [
    {"month": 1, "goal": "Launch MVP"},
    {"month": 3, "goal": "First 100 users"}
  ],
  "estimated_costs": {
    "monthly": 5000,
    "yearly": 60000,
    "currency": "USD"
  }
}
Only return valid JSON.`;

        const result = await generateWithAI(prompt);
        const plan = JSON.parse(result.replace(/```json\n?|\n?```/g, '').trim());

        return new Response(JSON.stringify({ plan }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      case 'generate-logo': {
        // Generate logo using Pollinations
        const logoPrompt = `${name} ${companyType} company`;
        const encodedPrompt = encodeURIComponent(
          `Professional minimalist logo for ${logoPrompt}, clean vector design, simple geometric shapes, modern branding, white background, no text`
        );

        const logoUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true`;

        return new Response(JSON.stringify({
          logoUrl,
          prompt: logoPrompt,
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      case 'create': {
        // Create the company (in a real app, this would save to a database)
        const companyId = crypto.randomUUID();

        // Use the user-selected logo URL if provided, otherwise generate one
        const finalLogoUrl = logoUrl || `https://image.pollinations.ai/prompt/${encodeURIComponent(`Professional logo for ${name} ${companyType}`)}&width=512&height=512&nologo=true`;

        // Generate business plan
        let plan;
        try {
          const planResult = await generateWithAI(`Create a brief business plan JSON for ${name}, a ${companyType} company: ${description}. Include: mission, vision, departments (array), revenue_model. Return only valid JSON.`);
          plan = JSON.parse(planResult.replace(/```json\n?|\n?```/g, '').trim());
        } catch {
          plan = { mission: description, vision: `Leading ${companyType} company`, departments: [] };
        }

        const company = {
          id: companyId,
          name,
          type: companyType,
          description,
          logo: finalLogoUrl,
          plan,
          createdAt: new Date().toISOString(),
          status: 'active',
        };

        return new Response(JSON.stringify({ company }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

  } catch (error) {
    console.error('Company API error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
