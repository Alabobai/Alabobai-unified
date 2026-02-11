# Create Company in Minutes - Complete User Flow

## The Alabobai Core Product Experience

**Total Time: 3-4 minutes** from user input to fully operational company with website, legal documents, financial models, strategy documents, social profiles, tools, and initial leads.

---

## Flow Diagram

```
+------------------+     +--------------------+     +----------------------+     +------------------+
|   INPUT PHASE    | --> |  BRAND DECISION    | --> |  PARALLEL EXECUTION  | --> |   COMPLETION     |
|   (30 seconds)   |     |   (30 seconds)     |     |    (2-3 minutes)     |     |   PHASE          |
+------------------+     +--------------------+     +----------------------+     +------------------+
        |                        |                          |                          |
        v                        v                          v                          v
  Form Submission         Brand Strategy            9 Agent Swarms              Dashboard Ready
  Smart Defaults          Selection                 Working in Parallel         Asset Organization
  Validation              Asset Analysis            Real-time Progress          Agent Introduction
                                                    Sync Points                 First Actions
```

---

## PHASE 1: INPUT PHASE (30 seconds)

### 1.1 Primary Input Form

```typescript
interface CompanyCreationInput {
  // REQUIRED FIELDS (4 fields)
  companyName: string;           // "Acme Solutions"
  industry: IndustryType;        // dropdown with AI-assist
  oneLineDescription: string;    // "AI-powered customer support"
  founderEmail: string;          // Primary contact

  // SMART-DEFAULTED FIELDS (shown collapsed, expandable)
  targetMarket?: TargetMarket;   // B2B / B2C / Both - defaults based on industry
  businessModel?: BusinessModel; // SaaS / Marketplace / Services - AI inferred
  stage?: CompanyStage;          // Idea / MVP / Revenue - defaults to "Idea"
  geography?: string;            // defaults to user's location

  // OPTIONAL ADVANCED (hidden by default)
  existingAssets?: {
    domain?: string;
    logo?: File;
    brandGuide?: File;
    existingDocs?: File[];
  };
  teamSize?: number;
  fundingStatus?: FundingStatus;
}
```

### 1.2 Field Specifications

| Field | Type | Required | Validation | Placeholder | Smart Default |
|-------|------|----------|------------|-------------|---------------|
| `companyName` | text | Yes | 2-50 chars, no special chars except &-' | "e.g., Acme Solutions" | None |
| `industry` | select+search | Yes | Must match taxonomy | "Start typing..." | AI-suggested from description |
| `oneLineDescription` | textarea | Yes | 10-200 chars | "What does your company do in one sentence?" | None |
| `founderEmail` | email | Yes | Valid email format | "founder@company.com" | User's auth email |
| `targetMarket` | radio | No | B2B/B2C/Both | N/A | Inferred from industry |
| `businessModel` | select | No | SaaS/Marketplace/Services/E-commerce/Other | N/A | Inferred from description |
| `stage` | select | No | Idea/MVP/Revenue/Growth | N/A | "Idea" |
| `geography` | autocomplete | No | Valid location | "San Francisco, CA" | User's IP location |

### 1.3 Industry Taxonomy (Top Level)

```typescript
type IndustryType =
  | 'ai-ml'           // AI & Machine Learning
  | 'fintech'         // Financial Technology
  | 'healthtech'      // Healthcare Technology
  | 'edtech'          // Education Technology
  | 'saas-b2b'        // B2B SaaS
  | 'saas-b2c'        // Consumer SaaS
  | 'ecommerce'       // E-commerce
  | 'marketplace'     // Marketplace
  | 'hardware'        // Hardware/IoT
  | 'cleantech'       // Climate/Clean Tech
  | 'biotech'         // Biotechnology
  | 'gaming'          // Gaming/Entertainment
  | 'social'          // Social/Community
  | 'enterprise'      // Enterprise Software
  | 'developer-tools' // Developer Tools
  | 'cybersecurity'   // Cybersecurity
  | 'proptech'        // Property Technology
  | 'legaltech'       // Legal Technology
  | 'hrtech'          // HR Technology
  | 'other';          // Other (with sub-input)
```

### 1.4 Real-time Validation

```typescript
const validationRules = {
  companyName: {
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9\s&\-']+$/,
    asyncValidation: async (name) => {
      // Check domain availability
      const domains = await checkDomainAvailability([
        `${sanitize(name)}.com`,
        `${sanitize(name)}.io`,
        `${sanitize(name)}.co`,
        `get${sanitize(name)}.com`,
        `${sanitize(name)}hq.com`
      ]);
      return { domains, suggestions: generateDomainSuggestions(name) };
    }
  },
  oneLineDescription: {
    required: true,
    minLength: 10,
    maxLength: 200,
    aiEnhancement: async (description) => {
      // Suggest improvements to make it punchier
      return await enhanceDescription(description);
    }
  }
};
```

### 1.5 Input UI Interaction Flow

```
1. User lands on /create
2. Company name input focused (auto-focus)
3. As user types company name:
   - Real-time domain availability check (debounced 300ms)
   - Domain suggestions appear below field
4. Tab/Enter moves to industry dropdown
5. Industry selected triggers:
   - AI inference of target market
   - Business model suggestions
6. Description entered triggers:
   - AI enhancement suggestions (optional accept)
   - Industry refinement if applicable
7. Email auto-filled from auth, editable
8. "Create My Company" button active when required fields valid
9. Optional: "Customize More" expands advanced options
```

---

## PHASE 2: BRAND DECISION PHASE (30 seconds)

### 2.1 Brand Decision Modal

```typescript
interface BrandDecision {
  strategy: BrandStrategy;
  preferences?: BrandPreferences;
  existingAssets?: ExistingBrandAssets;
}

type BrandStrategy =
  | 'generate-new'      // Create everything from scratch
  | 'use-existing'      // Use uploaded brand assets as-is
  | 'refine-existing'   // Enhance uploaded assets slightly
  | 'refresh-existing'  // Modernize uploaded assets significantly
  | 'rebrand';          // Complete brand overhaul based on uploads as inspiration

interface BrandPreferences {
  style: 'modern' | 'classic' | 'playful' | 'corporate' | 'minimal' | 'bold';
  colorPreference?: 'warm' | 'cool' | 'neutral' | 'vibrant' | 'muted';
  industryAlignment: boolean;  // Should brand look like industry standard?
  keywords: string[];          // Up to 5 brand personality keywords
}

interface ExistingBrandAssets {
  logo?: {
    file: File;
    format: 'svg' | 'png' | 'jpg' | 'pdf';
    analysis?: LogoAnalysis;
  };
  brandGuide?: File;
  colorPalette?: string[];
  fonts?: string[];
  website?: string;  // Existing website to analyze
}
```

### 2.2 Brand Decision UI Flow

```
Decision Tree:

Q1: "Do you have existing brand assets?"
    [No, create everything fresh] -> Generate New flow
    [Yes, I have some assets] -> Asset Upload flow

If "Generate New":
    Q2: "What style resonates with your brand?"
        [Grid of 6 style options with visual examples]
        - Modern: Clean lines, tech-forward
        - Classic: Timeless, established
        - Playful: Fun, approachable
        - Corporate: Professional, trustworthy
        - Minimal: Simple, focused
        - Bold: Striking, memorable

    Q3: "Any brand keywords?" (optional, 5 max)
        [Tag input with suggestions based on industry]
        e.g., "innovative", "trusted", "fast", "secure", "friendly"

If "Asset Upload":
    Q2: Upload existing assets
        - Logo (required for this path)
        - Brand guide (optional)
        - Colors (optional, extracted from logo if not provided)

    [AI analyzes uploads in real-time]

    Q3: "How would you like us to use these?"
        [Use exactly as-is] -> Use Existing
        [Enhance slightly] -> Refine Existing (minor improvements)
        [Modernize significantly] -> Refresh Existing (major update)
        [Use as inspiration only] -> Rebrand (new brand inspired by old)

    Shows preview of what each option would produce
```

### 2.3 Brand Analysis (For Existing Assets)

```typescript
interface LogoAnalysis {
  dominantColors: string[];      // Extracted hex colors
  colorHarmony: string;          // complementary, analogous, etc.
  style: string;                 // detected style
  shapes: string[];              // geometric, organic, text-based
  complexity: 'simple' | 'medium' | 'complex';
  scalability: 'good' | 'fair' | 'poor';
  recommendations: string[];
}

async function analyzeExistingBrand(assets: ExistingBrandAssets): Promise<BrandAnalysis> {
  const analysis: BrandAnalysis = {
    logo: assets.logo ? await analyzeLogo(assets.logo.file) : null,
    colors: await extractAndAnalyzeColors(assets),
    typography: await detectTypography(assets),
    overallAssessment: '',
    modernizationScore: 0,  // 0-100, how modern the brand is
    consistencyScore: 0,     // 0-100, how consistent across assets
    suggestions: []
  };

  // Generate assessment
  analysis.overallAssessment = await generateBrandAssessment(analysis);

  return analysis;
}
```

### 2.4 Brand Preferences Quick Capture

```typescript
const brandPreferenceOptions = {
  style: [
    { id: 'modern', label: 'Modern', icon: '🔮', preview: '/previews/modern.png' },
    { id: 'classic', label: 'Classic', icon: '🏛️', preview: '/previews/classic.png' },
    { id: 'playful', label: 'Playful', icon: '🎨', preview: '/previews/playful.png' },
    { id: 'corporate', label: 'Corporate', icon: '💼', preview: '/previews/corporate.png' },
    { id: 'minimal', label: 'Minimal', icon: '◽', preview: '/previews/minimal.png' },
    { id: 'bold', label: 'Bold', icon: '⚡', preview: '/previews/bold.png' },
  ],

  suggestedKeywords: {
    'ai-ml': ['innovative', 'intelligent', 'future-forward', 'cutting-edge', 'smart'],
    'fintech': ['secure', 'trusted', 'fast', 'transparent', 'empowering'],
    'healthtech': ['caring', 'reliable', 'accessible', 'personalized', 'wellness'],
    'saas-b2b': ['efficient', 'scalable', 'professional', 'integrated', 'powerful'],
    // ... per industry
  }
};
```

---

## PHASE 3: PARALLEL EXECUTION PHASE (2-3 minutes)

### 3.1 Agent Swarm Architecture

```typescript
interface CompanyCreationPipeline {
  // Phase 1: Foundation (runs first, 30 seconds)
  foundation: {
    brandAgent: BrandAgent;      // Logo, colors, fonts, voice
    strategyAgent: StrategyAgent; // Business model canvas, positioning
  };

  // Phase 2: Parallel Execution (runs simultaneously, 90 seconds)
  parallel: {
    websiteAgent: WebsiteAgent;       // Full website + deployment
    legalAgent: LegalAgent;           // All legal documents
    financeAgent: FinanceAgent;       // Financial model + pricing
    marketingAgent: MarketingAgent;   // GTM strategy + content
    researchAgent: ResearchAgent;     // Competitive analysis + leads
    toolsAgent: ToolsAgent;           // Workspace setup
    socialAgent: SocialAgent;         // Social profile creation
  };

  // Phase 3: Integration (30 seconds)
  integration: {
    qualityAgent: QualityAgent;       // Cross-check all outputs
    dashboardAgent: DashboardAgent;   // Compile final dashboard
  };
}
```

### 3.2 Dependency Graph

```
                            ┌─────────────────┐
                            │   User Input    │
                            └────────┬────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                  │
              ┌─────▼─────┐                    ┌──────▼──────┐
              │  Brand    │                    │  Strategy   │
              │  Agent    │                    │  Agent      │
              └─────┬─────┘                    └──────┬──────┘
                    │                                  │
                    └────────────────┬─────────────────┘
                                     │
     ┌───────────────────────────────┼───────────────────────────────┐
     │                               │                               │
┌────▼────┐  ┌─────────┐  ┌─────────▼───────┐  ┌─────────┐  ┌───────▼───────┐
│ Website │  │  Legal  │  │   Marketing     │  │ Finance │  │   Research    │
│  Agent  │  │  Agent  │  │     Agent       │  │  Agent  │  │    Agent      │
└────┬────┘  └────┬────┘  └────────┬────────┘  └────┬────┘  └───────┬───────┘
     │            │               │                  │              │
     │            │     ┌─────────┴───────┐          │              │
     │            │     │                 │          │              │
     │            │  ┌──▼───┐        ┌────▼───┐      │              │
     │            │  │Social│        │ Tools  │      │              │
     │            │  │Agent │        │ Agent  │      │              │
     │            │  └──┬───┘        └────┬───┘      │              │
     │            │     │                 │          │              │
     └────────────┴─────┴─────────┬───────┴──────────┴──────────────┘
                                  │
                          ┌───────▼───────┐
                          │   Quality     │
                          │    Agent      │
                          └───────┬───────┘
                                  │
                          ┌───────▼───────┐
                          │   Dashboard   │
                          │    Agent      │
                          └───────────────┘
```

### 3.3 Agent Specifications

#### Brand Agent (Foundation - 30 seconds)

```typescript
interface BrandAgentOutput {
  logo: {
    primary: SVGFile;           // Main logo
    icon: SVGFile;              // Square icon version
    wordmark: SVGFile;          // Text-only version
    variations: {
      light: SVGFile;           // For dark backgrounds
      dark: SVGFile;            // For light backgrounds
      monochrome: SVGFile;      // Single color version
    };
    formats: {
      svg: string;
      png512: string;
      png256: string;
      png128: string;
      favicon: string;
    };
  };

  colors: {
    primary: string;            // Main brand color
    secondary: string;          // Accent color
    tertiary: string;           // Supporting color
    background: string;
    foreground: string;
    success: string;
    warning: string;
    error: string;
    neutrals: string[];         // Gray scale
  };

  typography: {
    headingFont: string;        // e.g., "Inter"
    bodyFont: string;           // e.g., "Inter"
    monoFont: string;           // e.g., "JetBrains Mono"
    scale: {                    // Type scale
      h1: string;
      h2: string;
      h3: string;
      body: string;
      small: string;
    };
  };

  voice: {
    personality: string[];      // e.g., ["professional", "friendly", "innovative"]
    toneGuidelines: string;
    doList: string[];
    dontList: string[];
    sampleMessages: {
      greeting: string;
      error: string;
      success: string;
      cta: string;
    };
  };

  brandGuide: PDFFile;          // Complete brand guidelines PDF
}

// Generation method
async function generateBrand(input: CompanyInput, preferences: BrandPreferences): Promise<BrandAgentOutput> {
  // 1. Generate logo concepts (LLM + DALL-E/Midjourney API)
  const logoPrompt = buildLogoPrompt(input, preferences);
  const logoVariations = await generateLogoVariations(logoPrompt, 3);

  // 2. Select best logo and create variations
  const selectedLogo = await selectBestLogo(logoVariations, input.industry);
  const logoPackage = await createLogoPackage(selectedLogo);

  // 3. Extract/generate color palette
  const colors = preferences.existingColors
    ? harmonizeColors(preferences.existingColors)
    : await generateColorPalette(input.industry, preferences.style);

  // 4. Select typography
  const typography = selectTypography(preferences.style, input.industry);

  // 5. Generate brand voice
  const voice = await generateBrandVoice(input, preferences);

  // 6. Compile brand guide
  const brandGuide = await compileBrandGuide({
    logo: logoPackage,
    colors,
    typography,
    voice
  });

  return { logo: logoPackage, colors, typography, voice, brandGuide };
}
```

#### Strategy Agent (Foundation - 30 seconds)

```typescript
interface StrategyAgentOutput {
  businessModelCanvas: {
    customerSegments: string[];
    valuePropositions: string[];
    channels: string[];
    customerRelationships: string[];
    revenueStreams: string[];
    keyResources: string[];
    keyActivities: string[];
    keyPartnerships: string[];
    costStructure: string[];
  };

  positioning: {
    statement: string;           // Positioning statement
    tagline: string;             // Catchy tagline
    elevator30: string;          // 30-second elevator pitch
    elevator60: string;          // 60-second elevator pitch
    uniqueValue: string[];       // Unique value propositions
  };

  targetCustomer: {
    primaryPersona: CustomerPersona;
    secondaryPersonas: CustomerPersona[];
    painPoints: string[];
    jobs: string[];              // Jobs-to-be-done
    gains: string[];
  };

  competitiveLandscape: {
    directCompetitors: Competitor[];
    indirectCompetitors: Competitor[];
    differentiators: string[];
    moat: string;                // Competitive advantage
  };
}

interface CustomerPersona {
  name: string;                  // "Startup Sarah"
  role: string;
  demographics: string;
  goals: string[];
  frustrations: string[];
  quote: string;
}
```

#### Website Agent (Parallel - 60 seconds)

```typescript
interface WebsiteAgentOutput {
  pages: {
    home: GeneratedPage;
    about: GeneratedPage;
    pricing: GeneratedPage;
    features: GeneratedPage;
    contact: GeneratedPage;
    blog: GeneratedPage;          // Empty blog structure
    legal: {
      terms: GeneratedPage;
      privacy: GeneratedPage;
    };
  };

  deployment: {
    url: string;                  // https://company.vercel.app
    customDomain?: string;        // If domain was purchased
    previewUrl: string;
    status: 'deployed' | 'pending' | 'failed';
  };

  seo: {
    sitemap: string;
    robotsTxt: string;
    metaTags: MetaTags[];
    structuredData: object;
  };

  analytics: {
    trackingId: string;           // Plausible or GA4
    eventsConfigured: string[];
  };

  sourceCode: {
    repository?: string;          // GitHub repo if created
    files: GeneratedFile[];
    framework: 'nextjs' | 'react';
  };
}

interface GeneratedPage {
  path: string;
  title: string;
  description: string;
  content: string;                // HTML/JSX content
  sections: PageSection[];
}

// Generation method
async function generateWebsite(
  input: CompanyInput,
  brand: BrandAgentOutput,
  strategy: StrategyAgentOutput
): Promise<WebsiteAgentOutput> {
  // 1. Generate page content using LLM
  const pageContent = await generatePageContent(input, strategy);

  // 2. Apply brand styling
  const styledPages = await applyBrandStyling(pageContent, brand);

  // 3. Generate React components using Bolt.diy integration
  const components = await boltDiyBuilder.generateApp({
    prompt: buildWebsitePrompt(input, styledPages),
    type: 'website',
    styling: {
      primaryColor: brand.colors.primary,
      fontFamily: brand.typography.headingFont
    }
  });

  // 4. Deploy to Vercel
  const deployment = await deployToVercel(components);

  // 5. Configure analytics
  const analytics = await setupAnalytics(deployment.url);

  return { pages: styledPages, deployment, seo, analytics, sourceCode: components };
}
```

#### Legal Agent (Parallel - 45 seconds)

```typescript
interface LegalAgentOutput {
  documents: {
    termsOfService: {
      content: string;
      html: string;
      pdf: string;
      lastUpdated: string;
    };
    privacyPolicy: {
      content: string;
      html: string;
      pdf: string;
      gdprCompliant: boolean;
      ccpaCompliant: boolean;
      lastUpdated: string;
    };
    cookiePolicy: {
      content: string;
      html: string;
    };
    acceptableUse?: {
      content: string;
      html: string;
    };
  };

  contracts: {
    ndaMutual: ContractTemplate;
    ndaOneway: ContractTemplate;
    contractorAgreement: ContractTemplate;
    advisorAgreement: ContractTemplate;
    customerAgreement?: ContractTemplate;
  };

  formation: {
    entityType: 'LLC' | 'C-Corp' | 'S-Corp';
    state: string;
    operatingAgreement?: string;
    incorporationGuide: string;
    ein_instructions: string;
  };

  compliance: {
    checklist: ComplianceItem[];
    recommendations: string[];
  };
}

interface ContractTemplate {
  name: string;
  content: string;
  pdf: string;
  fields: string[];              // Fields to be filled in
  instructions: string;
}

// Uses existing LEGAL_TEMPLATES from /src/templates/legal/index.ts
```

#### Finance Agent (Parallel - 45 seconds)

```typescript
interface FinanceAgentOutput {
  financialModel: {
    assumptions: {
      monthlyPrice: number;
      startingCustomers: number;
      monthlyGrowthRate: number;
      monthlyChurnRate: number;
      fixedMonthlyCosts: number;
      variableCostPerCustomer: number;
    };
    projections: YearlyProjection[];
    charts: {
      revenueChart: ChartData;
      customerChart: ChartData;
      cashFlowChart: ChartData;
    };
    spreadsheet: string;          // Excel/CSV export
    pdf: string;
  };

  pricing: {
    strategy: 'freemium' | 'free-trial' | 'paid-only' | 'usage-based';
    tiers: PricingTier[];
    comparison: string;           // Comparison with competitors
    recommendations: string[];
  };

  metrics: {
    targetMetrics: {
      arr: number;
      mrr: number;
      ltv: number;
      cac: number;
      ltvCacRatio: number;
    };
    benchmarks: IndustryBenchmark[];
  };

  taxDeductions: string;          // Tax deduction checklist
}

interface PricingTier {
  name: string;                   // "Starter", "Pro", "Enterprise"
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  limits: Record<string, number>;
  recommended: boolean;
}

// Uses existing FINANCE_TEMPLATES from /src/templates/finance/index.ts
```

#### Marketing Agent (Parallel - 60 seconds)

```typescript
interface MarketingAgentOutput {
  gtmStrategy: {
    overview: string;
    phases: GTMPhase[];
    channels: MarketingChannel[];
    budget: BudgetAllocation;
    timeline: string;
  };

  content: {
    taglines: string[];
    headlines: string[];
    adCopy: {
      google: AdVariation[];
      facebook: AdVariation[];
      linkedin: AdVariation[];
      twitter: AdVariation[];
    };
    emailSequence: {
      welcome: EmailTemplate[];
      nurture: EmailTemplate[];
    };
    blogTopics: BlogTopic[];
  };

  socialMedia: {
    strategy: string;
    contentCalendar: ContentCalendarItem[];
    hashtags: string[];
    postTemplates: SocialPostTemplate[];
  };

  pressRelease: {
    launchRelease: string;
    template: string;
  };
}

interface GTMPhase {
  name: string;
  duration: string;
  objectives: string[];
  tactics: string[];
  metrics: string[];
}

// Uses existing MARKETING_TEMPLATES from /src/templates/marketing/index.ts
```

#### Research Agent (Parallel - 60 seconds)

```typescript
interface ResearchAgentOutput {
  marketAnalysis: {
    marketSize: {
      tam: string;                // Total Addressable Market
      sam: string;                // Serviceable Addressable Market
      som: string;                // Serviceable Obtainable Market
    };
    trends: string[];
    opportunities: string[];
    threats: string[];
  };

  competitorAnalysis: {
    competitors: CompetitorProfile[];
    featureComparison: FeatureMatrix;
    pricingComparison: PricingMatrix;
    strengthsWeaknesses: SWOTMatrix;
  };

  leadList: {
    prospects: LeadProspect[];
    sources: string[];
    enrichmentStatus: 'complete' | 'partial' | 'pending';
  };

  industryInsights: {
    reports: string[];
    keyPlayers: string[];
    regulations: string[];
    conferences: Event[];
  };
}

interface LeadProspect {
  companyName: string;
  website: string;
  industry: string;
  size: string;
  location: string;
  linkedIn?: string;
  relevanceScore: number;        // 0-100
  reasoning: string;
}

interface CompetitorProfile {
  name: string;
  website: string;
  description: string;
  founded: string;
  funding: string;
  employees: string;
  pricing: string;
  features: string[];
  strengths: string[];
  weaknesses: string[];
}
```

#### Tools Agent (Parallel - 60 seconds)

```typescript
interface ToolsAgentOutput {
  workspace: {
    slack?: {
      workspaceUrl: string;
      channels: string[];
      inviteLink: string;
    };
    notion?: {
      workspaceUrl: string;
      templates: string[];
      inviteLink: string;
    };
    github?: {
      organization: string;
      repositories: Repository[];
      inviteLink: string;
    };
    email?: {
      domain: string;
      addresses: EmailAddress[];
      provider: 'google' | 'microsoft' | 'custom';
    };
  };

  integrations: {
    configured: string[];
    recommended: string[];
    guides: IntegrationGuide[];
  };

  automations: {
    workflows: WorkflowTemplate[];
    zapierTemplates?: string[];
  };
}

interface Repository {
  name: string;
  description: string;
  visibility: 'public' | 'private';
  url: string;
}

interface EmailAddress {
  address: string;
  purpose: string;                // "support", "info", "sales"
}
```

#### Social Agent (Parallel - 45 seconds)

```typescript
interface SocialAgentOutput {
  profiles: {
    twitter?: {
      handle: string;
      bio: string;
      profileImage: string;
      headerImage: string;
      firstTweets: string[];
      status: 'created' | 'reserved' | 'unavailable';
    };
    linkedin?: {
      companyPage: string;
      description: string;
      firstPosts: string[];
      status: 'created' | 'pending' | 'unavailable';
    };
    instagram?: {
      handle: string;
      bio: string;
      profileImage: string;
      firstPosts: PostContent[];
      status: 'created' | 'reserved' | 'unavailable';
    };
    github?: {
      organization: string;
      description: string;
      status: 'created' | 'unavailable';
    };
    productHunt?: {
      profile: string;
      upcomingPage: string;
      status: 'created' | 'pending';
    };
  };

  contentBank: {
    posts: SocialPost[];
    images: GeneratedImage[];
    videos: VideoIdea[];
  };

  handleRecommendations: {
    available: string[];
    unavailable: string[];
    alternatives: string[];
  };
}
```

### 3.4 Synchronization Points

```typescript
interface SyncPoints {
  // Sync Point 1: Brand + Strategy complete before parallel agents
  foundationComplete: {
    dependencies: ['BrandAgent', 'StrategyAgent'];
    triggers: ['WebsiteAgent', 'LegalAgent', 'FinanceAgent', 'MarketingAgent', 'ResearchAgent', 'ToolsAgent', 'SocialAgent'];
    timeout: 45000;  // 45 second max wait
  };

  // Sync Point 2: All parallel agents complete before quality check
  parallelComplete: {
    dependencies: ['WebsiteAgent', 'LegalAgent', 'FinanceAgent', 'MarketingAgent', 'ResearchAgent', 'ToolsAgent', 'SocialAgent'];
    triggers: ['QualityAgent'];
    timeout: 120000;  // 2 minute max wait
    partialSuccess: true;  // Continue with available outputs
  };

  // Sync Point 3: Quality check complete before dashboard
  qualityComplete: {
    dependencies: ['QualityAgent'];
    triggers: ['DashboardAgent'];
    timeout: 30000;
  };
}
```

### 3.5 Progress Reporting Format

```typescript
interface ProgressUpdate {
  timestamp: number;
  overallProgress: number;        // 0-100
  phase: 'foundation' | 'parallel' | 'integration';
  agents: AgentProgress[];
  estimatedTimeRemaining: number; // seconds
  currentAction: string;          // Human-readable current action
}

interface AgentProgress {
  agentId: string;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  progress: number;               // 0-100
  currentStep: string;
  steps: {
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    duration?: number;
  }[];
  output?: any;                   // Partial output if available
  error?: string;
}

// WebSocket event stream
interface ProgressEvent {
  type: 'progress' | 'agent-started' | 'agent-completed' | 'agent-failed' | 'phase-changed' | 'complete';
  data: ProgressUpdate | AgentProgress | CompanyOutput;
}
```

### 3.6 Progress UI Display

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Creating Your Company                            │
│                                                                      │
│  ████████████████████░░░░░░░░░░░░░░░░░░░░░░  52%                   │
│                                                                      │
│  Estimated time remaining: 1m 23s                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Phase 1: Foundation ✓                                              │
│    ✓ Brand Agent - Logo and colors generated                        │
│    ✓ Strategy Agent - Business model complete                       │
│                                                                      │
│  Phase 2: Building Your Company...                                   │
│    ⟳ Website Agent - Generating homepage content...                 │
│    ✓ Legal Agent - Terms and privacy policy ready                   │
│    ⟳ Finance Agent - Building financial projections...              │
│    ✓ Marketing Agent - GTM strategy complete                        │
│    ⟳ Research Agent - Finding initial leads...                      │
│    ⟳ Tools Agent - Setting up workspace...                          │
│    ○ Social Agent - Waiting...                                       │
│                                                                      │
│  Phase 3: Integration                                                │
│    ○ Quality Agent - Pending                                         │
│    ○ Dashboard Agent - Pending                                       │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  [Preview Available Assets]                          [Cancel]        │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.7 Error Handling and Recovery

```typescript
interface ErrorHandler {
  strategies: {
    retry: {
      maxAttempts: 3;
      backoffMs: [1000, 2000, 4000];
      retryableErrors: ['TIMEOUT', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE'];
    };

    fallback: {
      // If agent fails completely, use fallback
      'WebsiteAgent': 'TemplateWebsiteAgent',      // Use template instead of AI
      'LogoGeneration': 'TextLogoFallback',         // Text-based logo
      'SocialProfiles': 'ManualSetupGuide',         // Provide setup guide
    };

    partialSuccess: {
      // Continue with partial results
      minRequiredAgents: ['BrandAgent', 'StrategyAgent', 'WebsiteAgent', 'LegalAgent'];
      optionalAgents: ['SocialAgent', 'ToolsAgent', 'ResearchAgent'];
    };
  };

  recovery: {
    checkpoint: true;              // Save progress for resume
    notifyUser: true;              // Real-time error notifications
    autoRecover: true;             // Attempt auto-recovery
  };
}

async function handleAgentFailure(
  agent: string,
  error: Error,
  context: ExecutionContext
): Promise<RecoveryAction> {
  // 1. Log error
  await logError(agent, error, context);

  // 2. Check if retryable
  if (isRetryable(error) && context.retryCount < 3) {
    return { action: 'retry', delay: getBackoffDelay(context.retryCount) };
  }

  // 3. Check for fallback
  const fallback = errorHandler.strategies.fallback[agent];
  if (fallback) {
    return { action: 'fallback', fallbackAgent: fallback };
  }

  // 4. Check if optional
  if (errorHandler.strategies.partialSuccess.optionalAgents.includes(agent)) {
    return { action: 'skip', reason: 'Optional agent failed, continuing...' };
  }

  // 5. Critical failure
  return { action: 'fail', error: error.message };
}
```

---

## PHASE 4: OUTPUT GENERATION

### 4.1 Complete Output Structure

```typescript
interface CompanyOutput {
  id: string;                     // Unique company ID
  createdAt: Date;
  status: 'complete' | 'partial' | 'failed';

  // Core Information
  company: {
    name: string;
    description: string;
    industry: string;
    targetMarket: string;
    stage: string;
    geography: string;
  };

  // Agent Outputs
  brand: BrandAgentOutput;
  strategy: StrategyAgentOutput;
  website: WebsiteAgentOutput;
  legal: LegalAgentOutput;
  finance: FinanceAgentOutput;
  marketing: MarketingAgentOutput;
  research: ResearchAgentOutput;
  tools: ToolsAgentOutput;
  social: SocialAgentOutput;

  // Meta
  executionStats: {
    totalDuration: number;
    agentDurations: Record<string, number>;
    retries: number;
    fallbacksUsed: string[];
  };

  // Quality
  qualityScore: number;           // 0-100
  qualityIssues: QualityIssue[];
  recommendations: string[];
}
```

### 4.2 Output Format Specifications

| Output | Formats | Generation Method | Quality Checks |
|--------|---------|-------------------|----------------|
| Logo | SVG, PNG (512/256/128), ICO | LLM prompt -> Image API (DALL-E/Midjourney) + vectorization | Resolution check, color contrast, scalability |
| Colors | HEX, RGB, HSL, Tailwind config | LLM color theory + industry research | Contrast ratio (WCAG AA), harmony validation |
| Website | React/Next.js, deployed URL | Bolt.diy builder + Vercel deploy | Lighthouse score >80, mobile responsive |
| Terms of Service | Markdown, HTML, PDF | Template-based + LLM customization | Legal review checklist, completeness |
| Privacy Policy | Markdown, HTML, PDF | Template-based + GDPR/CCPA compliance | Compliance checklist, data mapping |
| Financial Model | Spreadsheet, PDF, interactive | Calculator + LLM analysis | Formula validation, industry benchmarks |
| Pricing | JSON, comparison table | Competitor research + LLM | Market positioning, margin analysis |
| GTM Strategy | Document, presentation | LLM strategic analysis | Feasibility score, budget alignment |
| Lead List | CSV, JSON, CRM-ready | Web scraping + enrichment APIs | Email validation, relevance scoring |
| Social Profiles | Live profiles or setup guides | API creation or manual guide | Handle availability, bio length |

### 4.3 Quality Checks Per Output

```typescript
interface QualityChecks {
  brand: {
    logo: ['resolution >= 512px', 'has_transparent_bg', 'scalable_svg', 'color_contrast >= 4.5:1'],
    colors: ['primary_secondary_contrast', 'accessible_combinations', 'consistent_palette'],
    typography: ['font_pairing_harmony', 'readable_sizes', 'web_safe_or_hosted'],
  };

  website: {
    performance: ['lighthouse_score >= 80', 'fcp < 2s', 'lcp < 2.5s', 'cls < 0.1'],
    seo: ['has_meta_tags', 'has_og_tags', 'has_sitemap', 'has_robots'],
    accessibility: ['wcag_aa_compliant', 'alt_texts_present', 'keyboard_navigable'],
    content: ['no_lorem_ipsum', 'company_name_consistent', 'cta_present'],
  };

  legal: {
    termsOfService: ['company_name_present', 'has_all_sections', 'jurisdiction_specified'],
    privacyPolicy: ['gdpr_compliant', 'ccpa_compliant', 'data_types_listed', 'contact_info'],
  };

  finance: {
    projections: ['formulas_valid', 'growth_rate_reasonable', 'industry_aligned'],
    pricing: ['competitive_positioning', 'margin_positive', 'tier_differentiation'],
  };

  marketing: {
    strategy: ['target_audience_defined', 'channels_specified', 'budget_allocated'],
    content: ['brand_voice_consistent', 'no_placeholders', 'cta_clear'],
  };

  research: {
    competitors: ['min_3_competitors', 'data_recent', 'pricing_verified'],
    leads: ['emails_valid', 'companies_exist', 'relevance_score >= 60'],
  };
}
```

### 4.4 User Review Points

```typescript
interface ReviewPoints {
  immediate: {
    // Shown during generation for quick feedback
    logo: {
      timing: 'after_brand_agent',
      options: 3,                  // Show 3 logo options
      action: 'select_or_regenerate'
    },
    domain: {
      timing: 'after_input',
      action: 'confirm_or_change'
    }
  };

  postGeneration: {
    // Review dashboard after completion
    website: {
      previewAvailable: true,
      editableInPlace: true,
      regeneratePages: true
    },
    legalDocuments: {
      reviewRequired: true,
      signatureRequired: false,    // Optional e-sign
      lawyerDisclaimer: true
    },
    financialModel: {
      assumptionsEditable: true,
      scenarioPlanning: true
    },
    socialProfiles: {
      confirmBeforePosting: true,
      scheduleFirstPosts: true
    }
  };
}
```

---

## PHASE 5: COMPLETION PHASE

### 5.1 Dashboard Presentation

```typescript
interface CompanyDashboard {
  header: {
    companyName: string;
    logo: string;
    tagline: string;
    createdAt: Date;
    overallScore: number;
  };

  sections: {
    quickActions: QuickAction[];
    assets: AssetSection[];
    agents: AgentIntroduction[];
    nextSteps: NextStep[];
    metrics: MetricCard[];
  };

  sidebar: {
    navigation: NavigationItem[];
    help: HelpResource[];
    upgrade: UpgradeCTA;
  };
}

interface QuickAction {
  icon: string;
  title: string;
  description: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
}

const defaultQuickActions: QuickAction[] = [
  {
    icon: '🌐',
    title: 'View Your Website',
    description: 'Your website is live! Preview and customize it.',
    action: 'open_website',
    priority: 'high'
  },
  {
    icon: '📄',
    title: 'Review Legal Documents',
    description: 'Terms of Service and Privacy Policy are ready.',
    action: 'review_legal',
    priority: 'high'
  },
  {
    icon: '💰',
    title: 'Explore Financial Model',
    description: 'See your 5-year projections and adjust assumptions.',
    action: 'open_finance',
    priority: 'medium'
  },
  {
    icon: '📧',
    title: 'Send First Email',
    description: 'Your email sequence is ready to launch.',
    action: 'open_email_campaign',
    priority: 'medium'
  },
  {
    icon: '🎯',
    title: 'Review Lead List',
    description: '50 qualified prospects waiting for outreach.',
    action: 'open_leads',
    priority: 'medium'
  }
];
```

### 5.2 Asset Organization

```typescript
interface AssetOrganization {
  categories: {
    brand: {
      title: 'Brand Assets';
      items: ['Logo Package', 'Color Palette', 'Typography', 'Brand Guidelines'];
      downloadAll: boolean;
    };
    website: {
      title: 'Website';
      items: ['Live Website', 'Source Code', 'Analytics Dashboard'];
      editable: boolean;
    };
    legal: {
      title: 'Legal Documents';
      items: ['Terms of Service', 'Privacy Policy', 'NDA Template', 'Contractor Agreement'];
      downloadAll: boolean;
    };
    finance: {
      title: 'Financial';
      items: ['Financial Model', 'Pricing Strategy', 'Tax Checklist'];
      editable: boolean;
    };
    marketing: {
      title: 'Marketing';
      items: ['GTM Strategy', 'Ad Copy Bank', 'Email Sequences', 'Social Calendar'];
      downloadAll: boolean;
    };
    research: {
      title: 'Research';
      items: ['Market Analysis', 'Competitor Report', 'Lead List'];
      exportable: boolean;
    };
    tools: {
      title: 'Workspace';
      items: ['Slack', 'Notion', 'GitHub', 'Email'];
      quickAccess: boolean;
    };
    social: {
      title: 'Social Profiles';
      items: ['Twitter', 'LinkedIn', 'Instagram', 'Product Hunt'];
      quickAccess: boolean;
    };
  };

  formats: {
    download: ['PDF', 'PNG', 'SVG', 'CSV', 'JSON', 'ZIP'];
    share: ['Public Link', 'Team Invite', 'Export to Notion'];
  };
}
```

### 5.3 Agent Introduction

```typescript
interface AgentIntroduction {
  agents: {
    wealthLabobai: {
      name: 'WealthLabobai';
      role: 'Financial Advisor';
      icon: '💰';
      introduction: 'I manage your financial strategy and can help with fundraising, pricing, and financial planning.';
      firstTask: 'Would you like me to prepare a pitch deck for investors?';
    };
    legalLabobai: {
      name: 'LegalLabobai';
      role: 'Legal Counsel';
      icon: '⚖️';
      introduction: 'I handle all your legal documents and can explain any terms or create new contracts.';
      firstTask: 'Want me to customize your terms of service for your specific use case?';
    };
    businessLabobai: {
      name: 'BusinessLabobai';
      role: 'Business Strategist';
      icon: '📈';
      introduction: 'I develop your business strategy and can help with growth planning.';
      firstTask: 'Should I create a 90-day launch plan?';
    };
    builderLabobai: {
      name: 'BuilderLabobai';
      role: 'Product Builder';
      icon: '🏗️';
      introduction: 'I build your digital products. Need a new landing page or feature?';
      firstTask: 'Would you like me to add a waitlist feature to your website?';
    };
    researchLabobai: {
      name: 'ResearchLabobai';
      role: 'Research Analyst';
      icon: '🔍';
      introduction: 'I gather intelligence on markets, competitors, and opportunities.';
      firstTask: 'Want me to find more leads in a specific industry segment?';
    };
    // ... other agents
  };

  unifiedChat: {
    enabled: true;
    welcomeMessage: 'Welcome to your company command center! I\'m here to help. You can ask me anything or start with one of the suggested actions below.';
    suggestedPrompts: [
      'Show me my financial projections',
      'Draft an email to my lead list',
      'Update my website pricing page',
      'Create a investor pitch deck',
      'Find 20 more leads in healthcare'
    ];
  };
}
```

### 5.4 First Action Prompts

```typescript
interface FirstActionPrompts {
  priority: [
    {
      action: 'connect_domain';
      title: 'Connect Your Domain';
      description: 'Your website is live on a temporary URL. Connect your custom domain.';
      time: '2 minutes';
      impact: 'high';
    },
    {
      action: 'review_legal';
      title: 'Review Legal Documents';
      description: 'Your terms and privacy policy are ready. Review before publishing.';
      time: '5 minutes';
      impact: 'high';
    },
    {
      action: 'invite_team';
      title: 'Invite Team Members';
      description: 'Add your co-founders and early team to the workspace.';
      time: '2 minutes';
      impact: 'medium';
    },
    {
      action: 'schedule_social';
      title: 'Schedule First Posts';
      description: 'Your social content is ready. Review and schedule the first week.';
      time: '10 minutes';
      impact: 'medium';
    },
    {
      action: 'reach_out';
      title: 'Start Outreach';
      description: 'Your lead list is ready. Send your first personalized emails.';
      time: '15 minutes';
      impact: 'high';
    }
  ];

  onboarding: {
    tour: boolean;
    tooltips: boolean;
    checklist: OnboardingItem[];
    videoWalkthrough: string;
  };
}

interface OnboardingItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action: string;
  reward?: string;
}

const onboardingChecklist: OnboardingItem[] = [
  { id: '1', title: 'View your website', description: 'Check out your live company website', completed: false, action: 'view_website', reward: '10 credits' },
  { id: '2', title: 'Download brand assets', description: 'Get your logo and brand guide', completed: false, action: 'download_brand' },
  { id: '3', title: 'Review financial model', description: 'Explore your projections', completed: false, action: 'view_finance' },
  { id: '4', title: 'Send first outreach', description: 'Email 5 leads from your list', completed: false, action: 'send_emails', reward: '50 credits' },
  { id: '5', title: 'Connect a custom domain', description: 'Use your own domain name', completed: false, action: 'connect_domain' },
  { id: '6', title: 'Invite a team member', description: 'Add a co-founder or advisor', completed: false, action: 'invite_member', reward: '25 credits' },
  { id: '7', title: 'Schedule social posts', description: 'Plan your first week of content', completed: false, action: 'schedule_social' },
  { id: '8', title: 'Chat with an agent', description: 'Ask your first question', completed: false, action: 'open_chat' },
];
```

### 5.5 Onboarding Guidance

```typescript
interface OnboardingGuidance {
  immediate: {
    modal: {
      title: 'Your Company is Ready!';
      subtitle: 'Here\'s what we created for you';
      summary: CompanySummary;
      primaryCTA: 'Explore Dashboard';
      secondaryCTA: 'Take a Tour';
    };

    tour: {
      steps: TourStep[];
      skipable: true;
      duration: '2 minutes';
    };
  };

  ongoing: {
    tips: ContextualTip[];
    achievements: Achievement[];
    weeklyDigest: boolean;
    officeHours: string;           // Link to founder office hours
  };
}

interface TourStep {
  target: string;                  // CSS selector
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const dashboardTour: TourStep[] = [
  {
    target: '#brand-section',
    title: 'Your Brand',
    content: 'All your brand assets are here. Download your logo, colors, and brand guide.',
    position: 'right'
  },
  {
    target: '#website-section',
    title: 'Your Website',
    content: 'Your website is live! Click to preview, edit content, or connect a custom domain.',
    position: 'right'
  },
  {
    target: '#agents-chat',
    title: 'Your AI Team',
    content: 'Chat with your agents here. Ask questions or give them tasks.',
    position: 'left'
  },
  {
    target: '#quick-actions',
    title: 'Quick Actions',
    content: 'These are your recommended next steps. Complete them to get your company running.',
    position: 'bottom'
  }
];
```

---

## PHASE 6: ERROR SCENARIOS

### 6.1 Domain Unavailable

```typescript
interface DomainUnavailableHandler {
  detection: {
    timing: 'during_input';        // Real-time check
    apis: ['whois', 'dns', 'registrar'];
  };

  response: {
    ui: {
      showUnavailableIndicator: true;
      showAlternatives: true;
      showBrokerOption: true;      // Offer to broker the domain
    };

    alternatives: {
      generate: async (companyName: string) => {
        return [
          `${companyName}.io`,
          `${companyName}.co`,
          `get${companyName}.com`,
          `${companyName}hq.com`,
          `${companyName}app.com`,
          `use${companyName}.com`,
          `try${companyName}.com`,
        ].filter(await isAvailable);
      };
    };

    fallback: {
      // If no .com available, use subdomain
      subdomain: `${companyName}.alabobai.app`;
      message: 'We\'ll set up your site on a temporary URL. You can connect a custom domain later.';
    };
  };
}
```

### 6.2 API Failures

```typescript
interface APIFailureHandler {
  types: {
    llm_failure: {
      detection: ['timeout', 'rate_limit', 'content_filter', 'server_error'];
      retry: {
        attempts: 3;
        backoff: 'exponential';
        fallbackProvider: 'openai' | 'anthropic';  // Switch provider
      };
      userMessage: 'We\'re experiencing high demand. Your request is queued...';
    };

    image_generation_failure: {
      detection: ['timeout', 'content_policy', 'server_error'];
      fallback: 'text_based_logo';
      retry: {
        attempts: 2;
        alternativePrompt: true;   // Try different prompt
      };
      userMessage: 'Logo generation is taking longer than usual. Using text-based design...';
    };

    deployment_failure: {
      detection: ['vercel_error', 'build_failure', 'timeout'];
      fallback: 'static_hosting';   // Use simpler hosting
      retry: {
        attempts: 2;
      };
      userMessage: 'Deployment is taking longer. Your site will be ready in a few minutes...';
    };

    third_party_failure: {
      // Slack, GitHub, social media APIs
      detection: ['oauth_error', 'rate_limit', 'service_unavailable'];
      fallback: 'manual_setup_guide';
      userMessage: 'We couldn\'t automatically set up [service]. Here\'s a guide to do it manually.';
    };
  };

  globalFallback: {
    maxRetries: 5;
    circuitBreaker: {
      threshold: 3;
      cooldown: 60000;  // 1 minute
    };
    gracefulDegradation: true;
    partialSuccess: true;
  };
}
```

### 6.3 Generation Quality Issues

```typescript
interface QualityIssueHandler {
  detection: {
    automated: {
      logo: ['resolution_check', 'color_contrast', 'scalability_test'];
      content: ['lorem_ipsum_detection', 'placeholder_detection', 'brand_consistency'];
      website: ['lighthouse_audit', 'accessibility_check', 'broken_link_check'];
      legal: ['completeness_check', 'company_name_present', 'jurisdiction_valid'];
    };

    aiReview: {
      enabled: true;
      reviewer: 'QualityAgent';
      threshold: 70;               // Minimum quality score
    };
  };

  resolution: {
    automatic: {
      regenerate: {
        condition: 'score < 60';
        maxAttempts: 2;
        modifyPrompt: true;
      };
      fix: {
        condition: 'score >= 60 && score < 80';
        fixableIssues: ['typos', 'placeholders', 'minor_inconsistencies'];
      };
    };

    userIntervention: {
      condition: 'score < 50 after regeneration';
      actions: ['manual_edit', 'regenerate_with_feedback', 'use_template'];
      message: 'We\'d like your input to improve this output. What changes would you like?';
    };
  };

  reporting: {
    showQualityScore: true;
    showIssues: true;
    showRecommendations: true;
  };
}
```

### 6.4 User Abandonment

```typescript
interface AbandonmentHandler {
  detection: {
    inputPhase: {
      trigger: 'inactivity > 60 seconds';
      action: 'save_draft';
    };
    progressPhase: {
      trigger: 'page_close | navigation_away';
      action: 'continue_in_background';
    };
  };

  recovery: {
    draft: {
      storage: 'localStorage + server';
      expiry: '7 days';
      resumePrompt: 'Welcome back! Would you like to continue creating [Company Name]?';
    };

    inProgress: {
      notification: {
        email: true;
        push: true;
        message: 'Your company [Name] is ready! Click here to see it.';
      };
      autoComplete: true;          // Continue generation in background
    };
  };

  reengagement: {
    email: {
      timing: [24, 72, 168];       // Hours after abandonment
      templates: ['reminder', 'value_prop', 'offer'];
    };
  };
}
```

### 6.5 Payment Failures

```typescript
interface PaymentFailureHandler {
  timing: 'pre_generation' | 'during_generation' | 'post_generation';

  scenarios: {
    card_declined: {
      action: 'show_retry_form';
      message: 'Your card was declined. Please try another payment method.';
      options: ['try_another_card', 'use_paypal', 'contact_support'];
    };

    insufficient_funds: {
      action: 'offer_downgrade';
      message: 'Payment failed. Would you like to try the free tier instead?';
      options: ['try_again', 'use_free_tier', 'contact_support'];
    };

    fraud_suspected: {
      action: 'manual_review';
      message: 'We need to verify this transaction. Our team will contact you shortly.';
      escalation: true;
    };

    subscription_expired: {
      action: 'grace_period';
      gracePeriod: '7 days';
      message: 'Your subscription has expired. Renew to continue using premium features.';
      degradation: 'read_only_mode';
    };
  };

  freeTierFallback: {
    enabled: true;
    limits: {
      generations: 1;
      agents: ['StrategyAgent', 'BasicWebsiteAgent'];
      storage: '100MB';
      support: 'community_only';
    };
  };
}
```

---

## TIMING BREAKDOWN

### Complete Timeline

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         TOTAL: 3-4 MINUTES                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  INPUT PHASE                                                               │
│  ├─ Form display & interaction     │████│ 15 seconds                      │
│  └─ Validation & domain check      │██│ 15 seconds                        │
│                                    └────┘                                  │
│                                    30 seconds                              │
│                                                                            │
│  BRAND DECISION PHASE                                                      │
│  ├─ Strategy selection             │██│ 10 seconds                        │
│  ├─ Preference capture             │███│ 15 seconds                       │
│  └─ Asset upload (if applicable)   │█│ 5 seconds                          │
│                                    └────┘                                  │
│                                    30 seconds                              │
│                                                                            │
│  PARALLEL EXECUTION PHASE                                                  │
│  ├─ Foundation (Brand + Strategy)  │██████████│ 30 seconds                │
│  │                                                                         │
│  │  ┌─ Website Agent              │████████████████████████│ 60s          │
│  │  ├─ Legal Agent                │██████████████████│ 45s                │
│  │  ├─ Finance Agent              │██████████████████│ 45s                │
│  │  ├─ Marketing Agent            │████████████████████████│ 60s          │
│  │  ├─ Research Agent             │████████████████████████│ 60s          │
│  │  ├─ Tools Agent                │████████████████████████│ 60s          │
│  │  └─ Social Agent               │██████████████████│ 45s                │
│  │                                                                         │
│  └─ Integration (Quality + Dashboard) │██████████│ 30 seconds             │
│                                    └────────────────────────────┘          │
│                                    120-180 seconds (2-3 minutes)           │
│                                                                            │
│  COMPLETION PHASE                                                          │
│  └─ Dashboard render               │██│ 5-10 seconds                      │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Parallel Agent Timeline (Detail)

```
Time (seconds) 0        30        60        90        120       150       180
               |---------|---------|---------|---------|---------|---------|

Foundation:    |=========|
Brand Agent    |====|
Strategy Agent |====|

Parallel:              |========================================|
Website Agent          |========================================|
Legal Agent            |=====================|
Finance Agent          |=====================|
Marketing Agent        |========================================|
Research Agent         |========================================|
Tools Agent            |========================================|
Social Agent           |=====================|

Integration:                                                     |=========|
Quality Agent                                                    |====|
Dashboard Agent                                                       |====|

Key:
═══ Active execution
─── Waiting/Dependency
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Input System
- [ ] Create input form component with validation
- [ ] Implement real-time domain checking API
- [ ] Build industry taxonomy and smart defaults
- [ ] Add AI-powered description enhancement

### Phase 2: Brand Decision System
- [ ] Build brand decision modal
- [ ] Implement logo upload and analysis
- [ ] Create brand preference capture UI
- [ ] Build brand strategy selection flow

### Phase 3: Agent Pipeline
- [ ] Implement foundation agents (Brand, Strategy)
- [ ] Build parallel execution orchestrator
- [ ] Implement each parallel agent
- [ ] Create synchronization point handlers
- [ ] Build progress reporting WebSocket

### Phase 4: Output Generation
- [ ] Implement output format converters
- [ ] Build quality check system
- [ ] Create user review interfaces
- [ ] Implement asset download system

### Phase 5: Completion System
- [ ] Build company dashboard
- [ ] Create asset organization system
- [ ] Implement agent introduction flow
- [ ] Build onboarding checklist

### Phase 6: Error Handling
- [ ] Implement retry logic with backoff
- [ ] Create fallback handlers for each agent
- [ ] Build graceful degradation system
- [ ] Implement abandonment recovery

---

*This document defines the complete "Create Company in Minutes" user flow for the Alabobai platform. Implementation should follow this specification to ensure a consistent, reliable, and delightful user experience.*
