import { degradedEnvelope, healthGate, runWithReliability } from './_lib/reliability'

export const config = {
  runtime: 'edge',
};

interface CompanyRequest {
  action: 'generate-plan' | 'generate-logo' | 'generate-name' | 'create' | string;
  companyType?: string;
  description?: string;
  name?: string;
  industry?: string;
  logoUrl?: string; // User-selected logo URL from wizard
}

const BUSINESS_PROMPT = `You are a business strategist and startup advisor. Generate detailed, actionable business plans.
Always respond in valid JSON format. Be specific and practical.`;

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

function localNames(companyType?: string, industry?: string): string[] {
  const base = `${industry || companyType || 'Nova'}`.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Nova';
  const token = base.split(/\s+/)[0];
  return [
    `${token} Labs`,
    `${token} Systems`,
    `${token} Works`,
    `${token} Studio`,
    `${token} Collective`,
  ];
}

function localPlan(name?: string, companyType?: string, description?: string) {
  return {
    executive_summary: `${name || 'Your company'} is a ${companyType || 'technology'} venture focused on delivering practical customer outcomes quickly.`,
    mission: description || `Build a reliable ${companyType || 'technology'} business with clear customer value.`,
    vision: `Become a trusted leader in ${companyType || 'the market'} through execution speed and quality.`,
    target_market: 'Early adopters, SMB teams, and operators who value speed + reliability.',
    value_proposition: 'Fast deployment, clear ROI, and dependable operations.',
    revenue_model: 'Subscription + service enablement packages.',
    departments: [
      { name: 'Engineering', responsibilities: 'Build and maintain product capabilities', headcount: 3 },
      { name: 'Growth', responsibilities: 'Acquire customers and partnerships', headcount: 2 },
      { name: 'Operations', responsibilities: 'Support, quality, and delivery', headcount: 2 },
    ],
    milestones: [
      { month: 1, goal: 'Ship MVP and onboard first users' },
      { month: 3, goal: 'Reach repeatable acquisition channel' },
    ],
    estimated_costs: {
      monthly: 8000,
      yearly: 96000,
      currency: 'USD',
    },
  };
}

async function generateWithAI(prompt: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (geminiKey) {
    const geminiGate = await healthGate('company.gemini', {
      url: 'https://generativelanguage.googleapis.com/',
      timeoutMs: 1500,
      cacheTtlMs: 6000,
    })

    if (geminiGate.allow) {
      const response = (
        await runWithReliability(
          'company.gemini',
          () =>
            fetch(
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
            ),
          { attempts: 2 }
        )
      ).value

      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    }
  }

  if (groqKey) {
    const groqGate = await healthGate('company.groq', {
      url: 'https://api.groq.com/openai/v1/models',
      timeoutMs: 1500,
      cacheTtlMs: 6000,
    })

    if (groqGate.allow) {
      const response = (
        await runWithReliability(
          'company.groq',
          () =>
            fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            }),
          { attempts: 2 }
        )
      ).value

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
      }
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

    const normalizedAction = (action || '').toString().trim().toLowerCase().replace(/_/g, '-')

    switch (normalizedAction) {
      case 'generate-name':
      case 'name':
      case 'generate company name': {
        const prompt = `Generate 5 creative, memorable company names for a ${companyType} company in the ${industry || 'technology'} industry.
Description: ${description}

Return as JSON array: ["Name1", "Name2", "Name3", "Name4", "Name5"]
Only return the JSON array, nothing else.`;

        let names: string[];
        let warning = ''
        try {
          const result = await generateWithAI(prompt);
          names = safeJsonParse<string[]>(result, localNames(companyType, industry));
        } catch (error) {
          warning = error instanceof Error ? error.message : 'provider unavailable'
          names = localNames(companyType, industry);
        }

        const payload = { names }
        return new Response(JSON.stringify(
          warning
            ? degradedEnvelope(payload, {
                route: 'company.generate-name.local-fallback',
                warning,
                fallback: 'deterministic-name-generator',
              })
            : payload
        ), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      case 'generate-plan':
      case 'plan':
      case 'generate business plan': {
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

        let plan;
        let warning = ''
        try {
          const result = await generateWithAI(prompt);
          plan = safeJsonParse(result, localPlan(name, companyType, description));
        } catch (error) {
          warning = error instanceof Error ? error.message : 'provider unavailable'
          plan = localPlan(name, companyType, description);
        }

        const payload = { plan }
        return new Response(JSON.stringify(
          warning
            ? degradedEnvelope(payload, {
                route: 'company.generate-plan.local-fallback',
                warning,
                fallback: 'local-business-plan-template',
              })
            : payload
        ), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      case 'generate-logo':
      case 'logo': {
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

      case 'create':
      case 'create-company': {
        // Create the company (in a real app, this would save to a database)
        const companyId = crypto.randomUUID();

        // Use the user-selected logo URL if provided, otherwise generate one
        const finalLogoUrl = logoUrl || `https://image.pollinations.ai/prompt/${encodeURIComponent(`Professional logo for ${name} ${companyType}`)}&width=512&height=512&nologo=true`;

        // Generate business plan
        let plan;
        let warning = ''
        try {
          const planResult = await generateWithAI(`Create a brief business plan JSON for ${name}, a ${companyType} company: ${description}. Include: mission, vision, departments (array), revenue_model. Return only valid JSON.`);
          plan = safeJsonParse(planResult, localPlan(name, companyType, description));
        } catch (error) {
          warning = error instanceof Error ? error.message : 'provider unavailable'
          plan = localPlan(name, companyType, description);
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

        const payload = { company }
        return new Response(JSON.stringify(
          warning
            ? degradedEnvelope(payload, {
                route: 'company.create.local-fallback-plan',
                warning,
                fallback: 'local-business-plan-template',
              })
            : payload
        ), {
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
