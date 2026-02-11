/**
 * Alabobai Executive Agents - Part 2
 * CMO, General Counsel, Head of Sales Specifications
 */

import { ExecutiveAgentSpec } from './index.js';

// ============================================================================
// 4. CHIEF MARKETING OFFICER (CMO)
// ============================================================================

export const CMOSpec: ExecutiveAgentSpec = {
  identity: {
    name: 'MarketingLabobai',
    role: 'cmo',
    title: 'Chief Marketing Officer',
    personality: [
      'Creative and brand-conscious',
      'Data-informed storyteller',
      'Customer-obsessed',
      'Agile and experiment-driven',
      'Cross-channel thinker'
    ],
    communicationStyle: `Energetic and inspiring. Uses customer stories and data.
      Thinks in campaigns and narratives. Balances creativity with metrics.
      Always connects marketing to business outcomes.`,
    expertise: [
      'Brand strategy and positioning',
      'Digital marketing (SEO, SEM, Social)',
      'Content marketing and copywriting',
      'Growth marketing and experimentation',
      'Marketing analytics and attribution',
      'Product marketing and launches',
      'Community building'
    ]
  },

  capabilities: [
    {
      name: 'createMarketingStrategy',
      description: 'Develop comprehensive marketing strategy',
      inputSchema: {
        product: 'string',
        targetAudience: 'AudienceProfile',
        goals: 'MarketingGoals',
        budget: 'number',
        timeline: 'string'
      },
      outputSchema: {
        strategy: 'MarketingStrategy',
        channelMix: 'ChannelAllocation',
        contentCalendar: 'ContentCalendar',
        campaigns: 'Campaign[]',
        kpis: 'MarketingKPI[]',
        budget: 'BudgetAllocation'
      },
      requiredTools: ['DeepResearchEngine', 'DocumentGenerator', 'SpreadsheetGenerator'],
      approvalRequired: true,
      estimatedDuration: '4-8 hours'
    },
    {
      name: 'buildLandingPage',
      description: 'Design and deploy conversion-optimized landing page',
      inputSchema: {
        product: 'string',
        valueProposition: 'string',
        targetAction: 'string',
        style: 'DesignStyle',
        integrations: 'string[]'
      },
      outputSchema: {
        landingPage: 'GeneratedApp',
        deploymentUrl: 'string',
        trackingSetup: 'TrackingConfig',
        abVariants: 'Variant[]',
        copyAssets: 'CopyAsset[]'
      },
      requiredTools: ['BuilderEngine', 'DeploymentPipeline', 'CopyGenerator', 'AnalyticsSetup'],
      approvalRequired: true,
      estimatedDuration: '2-6 hours'
    },
    {
      name: 'generateContent',
      description: 'Create marketing content (blog, social, email)',
      inputSchema: {
        contentType: '"blog" | "social" | "email" | "ad" | "landing"',
        topic: 'string',
        audience: 'string',
        tone: 'string',
        keywords: 'string[]',
        length: 'string'
      },
      outputSchema: {
        content: 'string',
        headline: 'string',
        metaDescription: 'string',
        socialVariants: 'SocialPost[]',
        images: 'ImageSuggestion[]',
        seoAnalysis: 'SEOAnalysis'
      },
      requiredTools: ['ContentGenerator', 'SEOAnalyzer', 'ImageGenerator'],
      approvalRequired: false,
      estimatedDuration: '15-60 minutes'
    },
    {
      name: 'runAdCampaign',
      description: 'Create, launch, and optimize advertising campaigns',
      inputSchema: {
        platform: '"google" | "facebook" | "linkedin" | "twitter"',
        objective: 'string',
        budget: 'number',
        audience: 'AudienceTargeting',
        creatives: 'Creative[]'
      },
      outputSchema: {
        campaignId: 'string',
        adSets: 'AdSet[]',
        creatives: 'AdCreative[]',
        trackingPixels: 'Pixel[]',
        dashboardUrl: 'string',
        optimizationSchedule: 'Schedule'
      },
      requiredTools: ['GoogleAdsAPI', 'MetaAdsAPI', 'LinkedInAdsAPI', 'CreativeGenerator'],
      approvalRequired: true,
      estimatedDuration: '2-4 hours'
    },
    {
      name: 'setupEmailAutomation',
      description: 'Create email sequences and automation workflows',
      inputSchema: {
        objective: '"onboarding" | "nurture" | "reactivation" | "promotional"',
        segments: 'Segment[]',
        emailCount: 'number',
        triggers: 'Trigger[]'
      },
      outputSchema: {
        emails: 'Email[]',
        workflow: 'AutomationWorkflow',
        segments: 'SegmentDefinition[]',
        templates: 'EmailTemplate[]',
        analyticsSetup: 'AnalyticsConfig'
      },
      requiredTools: ['EmailPlatformAPI', 'ContentGenerator', 'TemplateBuilder'],
      approvalRequired: true,
      estimatedDuration: '3-6 hours'
    },
    {
      name: 'conductSEOAudit',
      description: 'Comprehensive SEO analysis with recommendations',
      inputSchema: {
        website: 'string',
        competitors: 'string[]',
        targetKeywords: 'string[]'
      },
      outputSchema: {
        technicalIssues: 'SEOIssue[]',
        contentGaps: 'ContentGap[]',
        keywordOpportunities: 'KeywordOpp[]',
        backlinks: 'BacklinkAnalysis',
        competitorComparison: 'SEOComparison',
        actionPlan: 'SEOAction[]'
      },
      requiredTools: ['SEOAnalyzer', 'BrowserAutomation', 'WebScraper', 'DeepResearchEngine'],
      approvalRequired: false,
      estimatedDuration: '2-4 hours'
    },
    {
      name: 'launchProductMarketing',
      description: 'Execute complete product launch campaign',
      inputSchema: {
        product: 'ProductInfo',
        launchDate: 'string',
        channels: 'string[]',
        budget: 'number'
      },
      outputSchema: {
        launchPlan: 'LaunchPlan',
        pressRelease: 'string',
        socialAssets: 'SocialAsset[]',
        emailSequence: 'Email[]',
        landingPage: 'string',
        mediaKit: 'MediaKit',
        analyticsSetup: 'AnalyticsConfig'
      },
      requiredTools: ['ContentGenerator', 'BuilderEngine', 'EmailPlatformAPI', 'SocialMediaAPI', 'PRDistributionAPI'],
      approvalRequired: true,
      estimatedDuration: '1-2 days'
    },
    {
      name: 'analyzeCampaignPerformance',
      description: 'Deep analysis of marketing campaign results',
      inputSchema: {
        campaignIds: 'string[]',
        dateRange: 'DateRange',
        comparisonPeriod: 'string'
      },
      outputSchema: {
        performance: 'PerformanceMetrics',
        attribution: 'AttributionModel',
        cohortAnalysis: 'CohortData',
        recommendations: 'Recommendation[]',
        report: 'AnalyticsReport',
        nextActions: 'Action[]'
      },
      requiredTools: ['AnalyticsPlatformAPI', 'DataAnalyzer', 'ReportGenerator', 'ChartGenerator'],
      approvalRequired: false,
      estimatedDuration: '1-3 hours'
    },
    {
      name: 'manageSocialMedia',
      description: 'Create, schedule, and manage social media content',
      inputSchema: {
        platforms: 'string[]',
        contentThemes: 'string[]',
        postFrequency: 'FrequencyConfig',
        brand: 'BrandGuidelines'
      },
      outputSchema: {
        contentCalendar: 'ContentCalendar',
        scheduledPosts: 'ScheduledPost[]',
        hashtags: 'HashtagStrategy',
        engagementPlan: 'EngagementPlan',
        analyticsSetup: 'SocialAnalytics'
      },
      requiredTools: ['SocialMediaAPI', 'ContentGenerator', 'ImageGenerator', 'SchedulingTool'],
      approvalRequired: true,
      estimatedDuration: '2-4 hours per week'
    }
  ],

  tools: {
    browserAutomation: [
      'Navigate to competitor sites for research',
      'Capture screenshots of competitor marketing',
      'Monitor social media feeds',
      'Test landing page user flows',
      'Audit website for SEO issues'
    ],
    terminalCommands: [
      'curl - API integrations',
      'node - Marketing automation scripts',
      'python - Data analysis and visualization',
      'ffmpeg - Video/image processing',
      'imagemagick - Image optimization'
    ],
    apis: [
      'Google Ads API - Campaign management',
      'Meta Marketing API - Facebook/Instagram ads',
      'LinkedIn Marketing API - B2B advertising',
      'Twitter Ads API - Twitter campaigns',
      'Mailchimp/SendGrid API - Email marketing',
      'HubSpot API - Marketing automation',
      'Google Analytics API - Web analytics',
      'Mixpanel/Amplitude API - Product analytics',
      'Buffer/Hootsuite API - Social scheduling',
      'Canva API - Design generation',
      'Semrush/Ahrefs API - SEO tools',
      'Clearbit API - Data enrichment'
    ],
    fileOperations: [
      'Create marketing copy documents',
      'Generate image assets',
      'Create video scripts',
      'Produce social media content',
      'Build presentation decks',
      'Create brand guidelines'
    ],
    externalServices: [
      'Google Ads - Search/Display advertising',
      'Meta Ads - Social advertising',
      'Mailchimp/Klaviyo - Email marketing',
      'HubSpot - Marketing automation',
      'Figma - Design collaboration',
      'Canva - Design creation',
      'Semrush/Ahrefs - SEO tools',
      'Hootsuite/Buffer - Social management'
    ]
  },

  outputs: {
    documents: [
      { type: 'Marketing Strategy', format: 'PDF/PPT', structure: 'Goals, Audience, Channels, Calendar, Budget' },
      { type: 'Content Calendar', format: 'Excel/Notion', structure: 'Date, Channel, Content, Status, Metrics' },
      { type: 'Brand Guidelines', format: 'PDF', structure: 'Voice, Visual, Usage, Examples' },
      { type: 'Campaign Report', format: 'PDF', structure: 'Summary, Metrics, Analysis, Recommendations' },
      { type: 'Press Release', format: 'Word/PDF', structure: 'Headline, Body, Quotes, Boilerplate' }
    ],
    deployments: [
      { type: 'Landing Page', platform: 'Vercel/Netlify with analytics' },
      { type: 'Ad Campaigns', platform: 'Google/Meta/LinkedIn Ads' },
      { type: 'Email Sequences', platform: 'Mailchimp/SendGrid' },
      { type: 'Social Campaigns', platform: 'Native + Buffer/Hootsuite' }
    ],
    data: [
      { type: 'Marketing Analytics', format: 'Dashboard JSON' },
      { type: 'A/B Test Results', format: 'JSON with statistical analysis' },
      { type: 'Audience Segments', format: 'Platform-specific exports' },
      { type: 'Campaign Assets', format: 'Images, Videos, Copy' }
    ],
    decisions: [
      { type: 'Channel Allocation', format: 'Budget recommendation with expected ROI' },
      { type: 'Content Strategy', format: 'Prioritized topics with rationale' },
      { type: 'Campaign Optimization', format: 'Specific changes with expected impact' }
    ]
  },

  collaboration: [
    {
      partnerAgent: 'CSO',
      triggerConditions: [
        'Market positioning alignment',
        'Go-to-market strategy',
        'Competitive response',
        'Brand strategy'
      ],
      sharedContext: ['marketPosition', 'competitiveLandscape', 'targetSegments', 'valueProposition'],
      handoffFormat: 'Marketing strategy aligned with business objectives'
    },
    {
      partnerAgent: 'HeadOfSales',
      triggerConditions: [
        'Lead generation campaigns',
        'Sales enablement content',
        'Pipeline marketing',
        'Event marketing'
      ],
      sharedContext: ['leadCriteria', 'buyerPersonas', 'salesCycle', 'contentNeeds'],
      handoffFormat: 'Lead handoff with qualification criteria and content'
    },
    {
      partnerAgent: 'CTO',
      triggerConditions: [
        'Product launch marketing',
        'Technical content creation',
        'Developer marketing',
        'Feature announcements'
      ],
      sharedContext: ['productCapabilities', 'technicalDifferentiators', 'roadmap', 'integrations'],
      handoffFormat: 'Technical brief for marketing translation'
    },
    {
      partnerAgent: 'HeadOfCustomerSuccess',
      triggerConditions: [
        'Customer testimonials',
        'Case study creation',
        'Retention marketing',
        'Upsell campaigns'
      ],
      sharedContext: ['customerStories', 'successMetrics', 'retentionData', 'upsellOpportunities'],
      handoffFormat: 'Customer insights for marketing content'
    }
  ],

  selfAnnealing: [
    {
      feedbackType: 'Campaign performance',
      learningPattern: 'Track conversion rates across channels',
      adaptationMechanism: 'Shift budget to higher-performing channels'
    },
    {
      feedbackType: 'Content engagement',
      learningPattern: 'Monitor engagement metrics by content type',
      adaptationMechanism: 'Adjust content mix based on performance'
    },
    {
      feedbackType: 'A/B test results',
      learningPattern: 'Aggregate winning variants patterns',
      adaptationMechanism: 'Apply winning patterns to new content'
    },
    {
      feedbackType: 'Lead quality feedback',
      learningPattern: 'Track lead-to-customer conversion by source',
      adaptationMechanism: 'Optimize targeting for quality over quantity'
    }
  ]
};

// ============================================================================
// 5. GENERAL COUNSEL (LEGAL)
// ============================================================================

export const GeneralCounselSpec: ExecutiveAgentSpec = {
  identity: {
    name: 'LegalLabobai',
    role: 'general_counsel',
    title: 'General Counsel',
    personality: [
      'Thorough and meticulous',
      'Risk-aware but business-minded',
      'Clear explainer of legal concepts',
      'Proactive about compliance',
      'Protective of company interests'
    ],
    communicationStyle: `Precise but accessible. Explains legal risks in business terms.
      Provides options with trade-offs. Always includes appropriate disclaimers.
      Focuses on risk mitigation while enabling business.`,
    expertise: [
      'Contract drafting and negotiation',
      'Corporate governance',
      'Intellectual property',
      'Employment law',
      'Privacy and data protection (GDPR, CCPA)',
      'Regulatory compliance',
      'Litigation risk management'
    ]
  },

  capabilities: [
    {
      name: 'draftContract',
      description: 'Generate legally sound contract documents',
      inputSchema: {
        contractType: '"nda" | "sla" | "msa" | "employment" | "vendor" | "customer"',
        parties: 'Party[]',
        terms: 'ContractTerms',
        jurisdiction: 'string'
      },
      outputSchema: {
        contract: 'LegalDocument',
        summary: 'ContractSummary',
        riskHighlights: 'RiskItem[]',
        negotiationPoints: 'NegotiationPoint[]',
        alternatives: 'AlternativeClause[]'
      },
      requiredTools: ['ContractTemplateEngine', 'LegalResearch', 'DocumentGenerator'],
      approvalRequired: true,
      estimatedDuration: '1-4 hours'
    },
    {
      name: 'reviewContract',
      description: 'Analyze contract for risks and issues',
      inputSchema: {
        document: 'string',
        reviewFocus: 'string[]',
        companyPosition: '"seller" | "buyer" | "partner"'
      },
      outputSchema: {
        summary: 'ContractSummary',
        keyTerms: 'KeyTerm[]',
        risks: 'RiskAssessment[]',
        recommendations: 'Recommendation[]',
        redlines: 'RedlineChange[]',
        comparisonToStandard: 'Comparison'
      },
      requiredTools: ['ContractAnalyzer', 'LegalResearch', 'DocumentComparison'],
      approvalRequired: false,
      estimatedDuration: '30 minutes - 2 hours'
    },
    {
      name: 'createPrivacyPolicy',
      description: 'Generate compliant privacy policy',
      inputSchema: {
        businessType: 'string',
        dataCollected: 'DataType[]',
        jurisdictions: 'string[]',
        thirdParties: 'ThirdParty[]'
      },
      outputSchema: {
        privacyPolicy: 'LegalDocument',
        cookiePolicy: 'LegalDocument',
        dataProcessingAgreement: 'LegalDocument',
        complianceChecklist: 'ComplianceItem[]',
        implementationGuide: 'ImplementationGuide'
      },
      requiredTools: ['PolicyGenerator', 'ComplianceChecker', 'DocumentGenerator'],
      approvalRequired: true,
      estimatedDuration: '2-4 hours'
    },
    {
      name: 'conductComplianceAudit',
      description: 'Audit operations for regulatory compliance',
      inputSchema: {
        frameworks: 'string[]',
        scope: 'string[]',
        currentPolicies: 'Policy[]'
      },
      outputSchema: {
        auditReport: 'ComplianceReport',
        gaps: 'ComplianceGap[]',
        riskScore: 'number',
        remediationPlan: 'RemediationItem[]',
        prioritizedActions: 'Action[]'
      },
      requiredTools: ['ComplianceChecker', 'PolicyAnalyzer', 'DocumentScanner', 'ReportGenerator'],
      approvalRequired: false,
      estimatedDuration: '4-8 hours'
    },
    {
      name: 'formCorporateEntity',
      description: 'Execute corporate formation process',
      inputSchema: {
        entityType: '"llc" | "c_corp" | "s_corp" | "delaware_c_corp"',
        state: 'string',
        founders: 'Founder[]',
        initialEquity: 'EquitySplit'
      },
      outputSchema: {
        articlesOfIncorporation: 'LegalDocument',
        bylaws: 'LegalDocument',
        operatingAgreement: 'LegalDocument',
        initialResolutions: 'LegalDocument',
        equityAgreements: 'LegalDocument[]',
        filingInstructions: 'FilingGuide',
        einApplication: 'Form'
      },
      requiredTools: ['FormationTemplates', 'StateFilingAPI', 'DocumentGenerator', 'EINApplication'],
      approvalRequired: true,
      estimatedDuration: '4-8 hours'
    },
    {
      name: 'protectIntellectualProperty',
      description: 'File and manage IP protection',
      inputSchema: {
        ipType: '"trademark" | "patent" | "copyright"',
        description: 'string',
        scope: 'string[]',
        priority: 'string'
      },
      outputSchema: {
        searchResults: 'IPSearchResult[]',
        applicationDraft: 'IPApplication',
        filingStrategy: 'FilingStrategy',
        estimatedCosts: 'CostEstimate',
        timeline: 'Timeline',
        protectionRecommendations: 'Recommendation[]'
      },
      requiredTools: ['USPTOSearchAPI', 'TMSearchAPI', 'IPFilingSystem', 'LegalResearch'],
      approvalRequired: true,
      estimatedDuration: '2-6 hours'
    },
    {
      name: 'handleEmploymentMatter',
      description: 'Manage employment legal issues',
      inputSchema: {
        matterType: '"offer" | "termination" | "dispute" | "policy"',
        details: 'EmploymentDetails',
        jurisdiction: 'string'
      },
      outputSchema: {
        documents: 'LegalDocument[]',
        process: 'ProcessGuide',
        riskAssessment: 'RiskAssessment',
        recommendations: 'Recommendation[]',
        timeline: 'Timeline'
      },
      requiredTools: ['EmploymentTemplates', 'LegalResearch', 'ComplianceChecker', 'DocumentGenerator'],
      approvalRequired: true,
      estimatedDuration: '1-4 hours'
    },
    {
      name: 'negotiateTerms',
      description: 'Analyze and counter-propose contract terms',
      inputSchema: {
        originalTerms: 'ContractTerms',
        objectives: 'NegotiationObjective[]',
        walkAwayPoints: 'WalkAwayPoint[]'
      },
      outputSchema: {
        counterProposal: 'ContractTerms',
        negotiationScript: 'NegotiationGuide',
        fallbackPositions: 'FallbackPosition[]',
        riskComparison: 'RiskComparison',
        recommendedApproach: 'NegotiationStrategy'
      },
      requiredTools: ['ContractAnalyzer', 'NegotiationFramework', 'RiskCalculator'],
      approvalRequired: true,
      estimatedDuration: '2-4 hours'
    }
  ],

  tools: {
    browserAutomation: [
      'Access state business filing portals',
      'Search USPTO for trademark/patent conflicts',
      'Monitor regulatory updates',
      'Access court records and filings',
      'Navigate corporate registration sites'
    ],
    terminalCommands: [
      'curl - API calls to legal databases',
      'pdf-tools - Process legal documents',
      'pandoc - Convert between document formats',
      'git - Version control legal documents'
    ],
    apis: [
      'USPTO API - Patent and trademark search',
      'SEC EDGAR API - Corporate filings',
      'State Business Filing APIs - Entity formation',
      'CourtListener API - Case law research',
      'LexisNexis/Westlaw API - Legal research',
      'DocuSign API - Contract execution',
      'Stripe Atlas API - Delaware C-Corp formation'
    ],
    fileOperations: [
      'Create legal documents (contracts, policies)',
      'Generate term sheets and agreements',
      'Produce compliance reports',
      'Create corporate governance documents',
      'Manage document versioning and redlines'
    ],
    externalServices: [
      'DocuSign - E-signatures',
      'Stripe Atlas - Incorporation',
      'Clerky - Startup legal docs',
      'LegalZoom - Basic filings',
      'USPTO - IP filings',
      'State SOS - Business filings'
    ]
  },

  outputs: {
    documents: [
      { type: 'Contract', format: 'Word/PDF', structure: 'Recitals, Definitions, Terms, Signatures' },
      { type: 'Privacy Policy', format: 'HTML/PDF', structure: 'Collection, Use, Sharing, Rights' },
      { type: 'Terms of Service', format: 'HTML/PDF', structure: 'Acceptance, License, Restrictions, Liability' },
      { type: 'Corporate Formation', format: 'PDF', structure: 'Articles, Bylaws, Resolutions' },
      { type: 'Compliance Report', format: 'PDF', structure: 'Scope, Findings, Gaps, Remediation' }
    ],
    deployments: [
      { type: 'Legal Document Portal', platform: 'Secure internal web app' },
      { type: 'Compliance Dashboard', platform: 'Internal monitoring tool' }
    ],
    data: [
      { type: 'Contract Repository', format: 'Organized document store with metadata' },
      { type: 'Compliance Status', format: 'JSON dashboard data' },
      { type: 'IP Portfolio', format: 'Structured database' },
      { type: 'Risk Register', format: 'JSON/Excel' }
    ],
    decisions: [
      { type: 'Risk Assessment', format: 'Risk level with mitigation recommendations' },
      { type: 'Contract Approval', format: 'Approval with conditions or rejection with rationale' },
      { type: 'Compliance Determination', format: 'Compliant/Non-compliant with explanation' }
    ]
  },

  collaboration: [
    {
      partnerAgent: 'CSO',
      triggerConditions: [
        'M&A due diligence',
        'Partnership agreements',
        'Regulatory strategy',
        'Risk management'
      ],
      sharedContext: ['dealTerms', 'strategicRationale', 'riskTolerance', 'regulatoryLandscape'],
      handoffFormat: 'Legal analysis with business implications'
    },
    {
      partnerAgent: 'CFO',
      triggerConditions: [
        'Financial contract terms',
        'Equity agreements',
        'Vendor contracts',
        'Tax implications'
      ],
      sharedContext: ['financialTerms', 'equityStructure', 'paymentTerms', 'liabilityExposure'],
      handoffFormat: 'Legal framework with financial impact analysis'
    },
    {
      partnerAgent: 'CTO',
      triggerConditions: [
        'Open source licensing',
        'Data privacy compliance',
        'IP protection',
        'Vendor agreements'
      ],
      sharedContext: ['technicalRequirements', 'dataFlows', 'licenseDependencies', 'ipAssets'],
      handoffFormat: 'Legal requirements for technical implementation'
    },
    {
      partnerAgent: 'HeadOfOperations',
      triggerConditions: [
        'Vendor contract negotiation',
        'Employment matters',
        'Insurance review',
        'Operational compliance'
      ],
      sharedContext: ['operationalNeeds', 'vendorRelationships', 'employeeMatters', 'riskExposure'],
      handoffFormat: 'Legal guidance for operational decisions'
    }
  ],

  selfAnnealing: [
    {
      feedbackType: 'Contract negotiation outcomes',
      learningPattern: 'Track which terms are accepted/rejected',
      adaptationMechanism: 'Adjust initial positions based on success rates'
    },
    {
      feedbackType: 'Compliance audit findings',
      learningPattern: 'Monitor recurring compliance gaps',
      adaptationMechanism: 'Proactively address common issues in new policies'
    },
    {
      feedbackType: 'Legal cost efficiency',
      learningPattern: 'Track time spent vs value delivered',
      adaptationMechanism: 'Optimize document templates for faster completion'
    },
    {
      feedbackType: 'Regulatory updates',
      learningPattern: 'Monitor legal landscape changes',
      adaptationMechanism: 'Update templates and policies proactively'
    }
  ]
};

// ============================================================================
// 6. HEAD OF SALES
// ============================================================================

export const HeadOfSalesSpec: ExecutiveAgentSpec = {
  identity: {
    name: 'SalesLabobai',
    role: 'head_of_sales',
    title: 'Head of Sales',
    personality: [
      'Results-driven and goal-oriented',
      'Relationship-focused',
      'Competitive but collaborative',
      'Resilient and persistent',
      'Coaching mindset'
    ],
    communicationStyle: `Energetic and persuasive. Uses data to tell stories.
      Focuses on customer pain points and value. Clear about next steps.
      Balances optimism with realism in forecasting.`,
    expertise: [
      'Sales process design',
      'Pipeline management',
      'Deal negotiation and closing',
      'Sales forecasting',
      'CRM management',
      'Territory planning',
      'Sales compensation design'
    ]
  },

  capabilities: [
    {
      name: 'buildSalesProcess',
      description: 'Design and implement complete sales process',
      inputSchema: {
        productType: 'string',
        averageDealSize: 'number',
        salesCycle: 'number',
        teamSize: 'number'
      },
      outputSchema: {
        salesProcess: 'SalesProcess',
        stages: 'PipelineStage[]',
        activities: 'SalesActivity[]',
        playbooks: 'Playbook[]',
        metrics: 'SalesMetric[]',
        crmConfiguration: 'CRMConfig'
      },
      requiredTools: ['CRMIntegration', 'ProcessDesigner', 'DocumentGenerator'],
      approvalRequired: true,
      estimatedDuration: '4-8 hours'
    },
    {
      name: 'qualifyLead',
      description: 'Research and qualify inbound/outbound leads',
      inputSchema: {
        lead: 'LeadInfo',
        qualificationCriteria: 'QualificationCriteria',
        researchDepth: '"quick" | "standard" | "deep"'
      },
      outputSchema: {
        qualificationScore: 'number',
        companyProfile: 'CompanyProfile',
        contacts: 'Contact[]',
        painPoints: 'PainPoint[]',
        buyingSignals: 'BuyingSignal[]',
        recommendedApproach: 'OutreachStrategy',
        nextSteps: 'Action[]'
      },
      requiredTools: ['DeepResearchEngine', 'BrowserAutomation', 'LinkedInAPI', 'CRMIntegration'],
      approvalRequired: false,
      estimatedDuration: '15-60 minutes'
    },
    {
      name: 'createProposal',
      description: 'Generate customized sales proposal',
      inputSchema: {
        opportunity: 'Opportunity',
        customerNeeds: 'Need[]',
        competitorContext: 'string',
        pricing: 'PricingConfig'
      },
      outputSchema: {
        proposal: 'SalesProposal',
        executiveSummary: 'string',
        solutionDesign: 'SolutionDesign',
        pricing: 'PricingTable',
        roi: 'ROIAnalysis',
        timeline: 'ImplementationTimeline',
        terms: 'ProposalTerms'
      },
      requiredTools: ['ProposalGenerator', 'PricingCalculator', 'DocumentGenerator', 'ROICalculator'],
      approvalRequired: true,
      estimatedDuration: '2-4 hours'
    },
    {
      name: 'forecastPipeline',
      description: 'Generate accurate sales forecast',
      inputSchema: {
        pipeline: 'PipelineData',
        historicalData: 'HistoricalSales',
        period: 'string',
        method: '"weighted" | "ai_predicted" | "commit"'
      },
      outputSchema: {
        forecast: 'SalesForecast',
        byStage: 'StageBreakdown',
        byRep: 'RepBreakdown',
        confidence: 'number',
        risks: 'ForecastRisk[]',
        recommendations: 'ForecastAction[]'
      },
      requiredTools: ['CRMIntegration', 'ForecastingModel', 'DataAnalyzer', 'ReportGenerator'],
      approvalRequired: false,
      estimatedDuration: '1-2 hours'
    },
    {
      name: 'conductOutreach',
      description: 'Execute personalized outbound campaigns',
      inputSchema: {
        prospects: 'Prospect[]',
        campaign: 'CampaignConfig',
        personalization: 'PersonalizationLevel',
        channels: 'string[]'
      },
      outputSchema: {
        emails: 'PersonalizedEmail[]',
        linkedInMessages: 'LinkedInMessage[]',
        callScripts: 'CallScript[]',
        sequences: 'OutreachSequence[]',
        tracking: 'TrackingSetup'
      },
      requiredTools: ['EmailPlatformAPI', 'LinkedInAPI', 'ContentGenerator', 'CRMIntegration'],
      approvalRequired: true,
      estimatedDuration: '1-3 hours per batch'
    },
    {
      name: 'manageDeal',
      description: 'Guide deal through pipeline to close',
      inputSchema: {
        opportunity: 'Opportunity',
        currentStage: 'string',
        blockers: 'Blocker[]',
        stakeholders: 'Stakeholder[]'
      },
      outputSchema: {
        dealStrategy: 'DealStrategy',
        stakeholderMap: 'StakeholderMap',
        actionPlan: 'Action[]',
        riskMitigation: 'RiskMitigation[]',
        nextMeeting: 'MeetingAgenda',
        competitiveResponse: 'CompetitiveStrategy'
      },
      requiredTools: ['CRMIntegration', 'DeepResearchEngine', 'MeetingScheduler', 'DocumentGenerator'],
      approvalRequired: false,
      estimatedDuration: '30-60 minutes per deal'
    },
    {
      name: 'onboardSalesRep',
      description: 'Create complete sales rep onboarding program',
      inputSchema: {
        role: 'SalesRole',
        territory: 'Territory',
        existingMaterials: 'Material[]',
        rampExpectation: 'number'
      },
      outputSchema: {
        onboardingPlan: 'OnboardingPlan',
        trainingModules: 'TrainingModule[]',
        playbooks: 'Playbook[]',
        certifications: 'Certification[]',
        rampMilestones: 'Milestone[]',
        resources: 'Resource[]'
      },
      requiredTools: ['ContentGenerator', 'LMSIntegration', 'DocumentGenerator', 'VideoCreator'],
      approvalRequired: true,
      estimatedDuration: '4-8 hours'
    },
    {
      name: 'analyzeWinLoss',
      description: 'Conduct win/loss analysis on closed deals',
      inputSchema: {
        deals: 'ClosedDeal[]',
        period: 'string',
        analysisDepth: '"summary" | "detailed"'
      },
      outputSchema: {
        winRate: 'number',
        patterns: 'WinLossPattern[]',
        competitorAnalysis: 'CompetitorWinLoss',
        recommendations: 'Recommendation[]',
        report: 'WinLossReport',
        trainingNeeds: 'TrainingNeed[]'
      },
      requiredTools: ['CRMIntegration', 'DataAnalyzer', 'ReportGenerator', 'DeepResearchEngine'],
      approvalRequired: false,
      estimatedDuration: '2-4 hours'
    }
  ],

  tools: {
    browserAutomation: [
      'Research prospects on LinkedIn and company sites',
      'Navigate to prospect websites',
      'Capture competitor pricing pages',
      'Monitor deal-related news',
      'Access CRM web interfaces'
    ],
    terminalCommands: [
      'curl - CRM and sales tool API calls',
      'node - Sales automation scripts',
      'python - Sales data analysis',
      'jq - Process CRM data exports'
    ],
    apis: [
      'Salesforce API - CRM operations',
      'HubSpot API - Alternative CRM',
      'LinkedIn Sales Navigator API - Prospecting',
      'Clearbit API - Lead enrichment',
      'ZoomInfo API - Contact data',
      'Outreach/SalesLoft API - Sequencing',
      'Gong/Chorus API - Call analytics',
      'Calendly API - Meeting scheduling',
      'PandaDoc/DocuSign API - Proposals',
      'Slack API - Team communication'
    ],
    fileOperations: [
      'Create sales proposals and decks',
      'Generate personalized emails',
      'Create call scripts and playbooks',
      'Produce sales reports',
      'Generate quote documents'
    ],
    externalServices: [
      'Salesforce/HubSpot - CRM',
      'LinkedIn Sales Navigator - Prospecting',
      'Outreach/SalesLoft - Sequences',
      'Gong/Chorus - Conversation intelligence',
      'ZoomInfo/Clearbit - Data enrichment',
      'PandaDoc - Proposals',
      'Calendly - Scheduling'
    ]
  },

  outputs: {
    documents: [
      { type: 'Sales Proposal', format: 'PDF/PPT', structure: 'Executive Summary, Solution, Pricing, ROI, Timeline' },
      { type: 'Sales Playbook', format: 'PDF/Notion', structure: 'Process, Scripts, Objections, Competitive' },
      { type: 'Forecast Report', format: 'Excel/PDF', structure: 'Pipeline, Weighted, Commit, Risk' },
      { type: 'Territory Plan', format: 'PDF/Excel', structure: 'Accounts, Strategy, Goals, Activities' },
      { type: 'Win/Loss Report', format: 'PDF', structure: 'Summary, Patterns, Recommendations' }
    ],
    deployments: [
      { type: 'Sales Dashboard', platform: 'CRM embedded or standalone' },
      { type: 'Email Sequences', platform: 'Outreach/SalesLoft' },
      { type: 'Proposal Portal', platform: 'PandaDoc/internal' }
    ],
    data: [
      { type: 'Pipeline Data', format: 'CRM records' },
      { type: 'Forecast Model', format: 'JSON/Excel' },
      { type: 'Lead Scores', format: 'CRM integration' },
      { type: 'Activity Metrics', format: 'Dashboard JSON' }
    ],
    decisions: [
      { type: 'Deal Prioritization', format: 'Ranked list with rationale' },
      { type: 'Pricing Recommendation', format: 'Suggested price with competitive analysis' },
      { type: 'Forecast Commit', format: 'Commit vs best case with confidence' }
    ]
  },

  collaboration: [
    {
      partnerAgent: 'CMO',
      triggerConditions: [
        'Lead generation needs',
        'Content for sales enablement',
        'Event marketing',
        'Product messaging alignment'
      ],
      sharedContext: ['leadQuality', 'contentEffectiveness', 'messagingNeeds', 'eventROI'],
      handoffFormat: 'Sales requirements for marketing support'
    },
    {
      partnerAgent: 'CFO',
      triggerConditions: [
        'Deal pricing approval',
        'Revenue forecasting',
        'Commission calculations',
        'Contract terms'
      ],
      sharedContext: ['dealValue', 'discountLevel', 'paymentTerms', 'revenueTimeline'],
      handoffFormat: 'Deal economics for approval'
    },
    {
      partnerAgent: 'HeadOfCustomerSuccess',
      triggerConditions: [
        'Deal handoff',
        'Expansion opportunities',
        'Reference customers',
        'Renewal risks'
      ],
      sharedContext: ['dealContext', 'customerExpectations', 'successCriteria', 'relationshipHistory'],
      handoffFormat: 'Complete deal context for smooth transition'
    },
    {
      partnerAgent: 'GeneralCounsel',
      triggerConditions: [
        'Contract negotiation',
        'Non-standard terms',
        'Legal review needed',
        'MSA amendments'
      ],
      sharedContext: ['contractTerms', 'negotiationPosition', 'dealRisk', 'customerRequirements'],
      handoffFormat: 'Contract for legal review with business context'
    }
  ],

  selfAnnealing: [
    {
      feedbackType: 'Win rate trends',
      learningPattern: 'Track win rates by segment, deal size, and rep',
      adaptationMechanism: 'Adjust qualification criteria and deal coaching'
    },
    {
      feedbackType: 'Forecast accuracy',
      learningPattern: 'Compare committed to actual monthly/quarterly',
      adaptationMechanism: 'Refine probability weights and commit criteria'
    },
    {
      feedbackType: 'Email response rates',
      learningPattern: 'Track opens and replies by template and persona',
      adaptationMechanism: 'Optimize messaging and personalization'
    },
    {
      feedbackType: 'Sales cycle length',
      learningPattern: 'Monitor days in each stage by deal type',
      adaptationMechanism: 'Identify and address bottlenecks'
    }
  ]
};
