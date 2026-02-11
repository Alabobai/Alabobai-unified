/**
 * Alabobai Executive Agents
 * Complete Capability Specifications for AI Company Builder
 *
 * These agents EXECUTE tasks, not just advise. Each agent has full access
 * to tools, APIs, and automation capabilities to accomplish real work.
 */

import { EventEmitter } from 'events';
import { BaseAgent, BaseAgentConfig } from '../base-agent.js';
import { LLMClient } from '../../core/llm-client.js';
import { Task, TaskResult } from '../../core/types.js';

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface ExecutiveCapability {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredTools: string[];
  approvalRequired: boolean;
  estimatedDuration: string;
}

export interface ExecutiveOutput {
  type: 'document' | 'deployment' | 'data' | 'decision' | 'action';
  format: string;
  content: unknown;
  artifacts?: string[];
  metrics?: Record<string, number>;
}

export interface CollaborationProtocol {
  partnerAgent: string;
  triggerConditions: string[];
  sharedContext: string[];
  handoffFormat: string;
}

export interface SelfAnnealingTrigger {
  feedbackType: string;
  learningPattern: string;
  adaptationMechanism: string;
}

export interface ExecutiveAgentSpec {
  identity: {
    name: string;
    role: string;
    title: string;
    personality: string[];
    communicationStyle: string;
    expertise: string[];
  };
  capabilities: ExecutiveCapability[];
  tools: {
    browserAutomation: string[];
    terminalCommands: string[];
    apis: string[];
    fileOperations: string[];
    externalServices: string[];
  };
  outputs: {
    documents: { type: string; format: string; structure: string }[];
    deployments: { type: string; platform: string }[];
    data: { type: string; format: string }[];
    decisions: { type: string; format: string }[];
  };
  collaboration: CollaborationProtocol[];
  selfAnnealing: SelfAnnealingTrigger[];
}

// ============================================================================
// 1. CHIEF STRATEGY OFFICER (CSO)
// ============================================================================

export const CSOSpec: ExecutiveAgentSpec = {
  identity: {
    name: 'StrategyLabobai',
    role: 'cso',
    title: 'Chief Strategy Officer',
    personality: [
      'Visionary and forward-thinking',
      'Data-driven decision maker',
      'Systems thinker who sees interconnections',
      'Calm under pressure with long-term focus',
      'Diplomatically assertive'
    ],
    communicationStyle: `Speaks with authority and clarity. Uses frameworks and structured thinking.
      Balances big-picture vision with actionable specifics. Asks probing questions.
      Summarizes complex situations into clear strategic options.`,
    expertise: [
      'Market analysis and competitive intelligence',
      'Business model design and optimization',
      'Strategic planning and roadmap creation',
      'Mergers, acquisitions, and partnerships',
      'Resource allocation and prioritization',
      'Risk assessment and mitigation',
      'OKR and goal-setting frameworks'
    ]
  },

  capabilities: [
    {
      name: 'conductMarketResearch',
      description: 'Execute comprehensive market research with real data',
      inputSchema: {
        industry: 'string',
        competitors: 'string[]',
        targetMarket: 'string',
        researchDepth: '"quick" | "standard" | "deep"'
      },
      outputSchema: {
        marketSize: 'number',
        growthRate: 'number',
        keyPlayers: 'CompetitorProfile[]',
        opportunities: 'Opportunity[]',
        threats: 'Threat[]',
        citations: 'Citation[]'
      },
      requiredTools: ['DeepResearchEngine', 'BrowserAutomation', 'WebSearch'],
      approvalRequired: false,
      estimatedDuration: '15-60 minutes'
    },
    {
      name: 'createBusinessPlan',
      description: 'Generate complete business plan with financial projections',
      inputSchema: {
        businessIdea: 'string',
        targetMarket: 'string',
        fundingGoal: 'number',
        timeHorizon: 'number'
      },
      outputSchema: {
        executiveSummary: 'string',
        marketAnalysis: 'MarketAnalysis',
        businessModel: 'BusinessModelCanvas',
        financialProjections: 'FinancialModel',
        goToMarketStrategy: 'GTMStrategy',
        riskAnalysis: 'RiskMatrix'
      },
      requiredTools: ['DeepResearchEngine', 'DocumentGenerator', 'FinancialModeler'],
      approvalRequired: false,
      estimatedDuration: '2-4 hours'
    },
    {
      name: 'analyzeCompetitors',
      description: 'Deep competitive analysis with real-time data scraping',
      inputSchema: {
        competitors: 'string[]',
        analysisType: '"pricing" | "features" | "positioning" | "comprehensive"'
      },
      outputSchema: {
        competitorProfiles: 'CompetitorProfile[]',
        featureComparison: 'FeatureMatrix',
        pricingAnalysis: 'PricingComparison',
        swotAnalysis: 'SWOT',
        strategicRecommendations: 'string[]'
      },
      requiredTools: ['BrowserAutomation', 'WebScraper', 'DeepResearchEngine'],
      approvalRequired: false,
      estimatedDuration: '1-3 hours'
    },
    {
      name: 'createStrategicRoadmap',
      description: 'Build executable strategic roadmap with milestones',
      inputSchema: {
        objectives: 'string[]',
        timeframe: 'string',
        resources: 'ResourceConstraints',
        dependencies: 'string[]'
      },
      outputSchema: {
        roadmap: 'RoadmapPhase[]',
        milestones: 'Milestone[]',
        okrs: 'OKR[]',
        resourcePlan: 'ResourceAllocation',
        riskMitigation: 'RiskPlan'
      },
      requiredTools: ['DocumentGenerator', 'ProjectPlanner', 'GanttGenerator'],
      approvalRequired: true,
      estimatedDuration: '3-6 hours'
    },
    {
      name: 'conductSwotAnalysis',
      description: 'Execute SWOT analysis with market validation',
      inputSchema: {
        company: 'string',
        industry: 'string',
        includeMarketData: 'boolean'
      },
      outputSchema: {
        strengths: 'StrengthItem[]',
        weaknesses: 'WeaknessItem[]',
        opportunities: 'OpportunityItem[]',
        threats: 'ThreatItem[]',
        strategicImplications: 'string[]',
        prioritizedActions: 'Action[]'
      },
      requiredTools: ['DeepResearchEngine', 'AnalyticsEngine'],
      approvalRequired: false,
      estimatedDuration: '1-2 hours'
    },
    {
      name: 'evaluatePartnership',
      description: 'Assess potential partnership or acquisition opportunity',
      inputSchema: {
        targetCompany: 'string',
        dealType: '"partnership" | "acquisition" | "merger" | "investment"',
        strategicRationale: 'string'
      },
      outputSchema: {
        companyProfile: 'CompanyProfile',
        synergies: 'Synergy[]',
        risks: 'Risk[]',
        valuationRange: 'ValuationEstimate',
        recommendation: 'DealRecommendation',
        dueDiligenceChecklist: 'ChecklistItem[]'
      },
      requiredTools: ['DeepResearchEngine', 'FinancialModeler', 'BrowserAutomation'],
      approvalRequired: true,
      estimatedDuration: '4-8 hours'
    }
  ],

  tools: {
    browserAutomation: [
      'Navigate to competitor websites and extract pricing/features',
      'Scrape job postings to understand hiring priorities',
      'Monitor social media for brand sentiment',
      'Extract SEC filings and financial data',
      'Capture competitor marketing materials'
    ],
    terminalCommands: [
      'curl - API calls to market data services',
      'jq - Process JSON market data',
      'git - Version control strategy documents',
      'pandoc - Convert strategy docs to multiple formats'
    ],
    apis: [
      'Crunchbase API - Company and funding data',
      'LinkedIn API - Company insights and hiring trends',
      'Google Trends API - Market trend analysis',
      'SimilarWeb API - Traffic and engagement data',
      'SEC EDGAR API - Financial filings',
      'News API - Industry news aggregation'
    ],
    fileOperations: [
      'Create/edit Markdown strategy documents',
      'Generate PowerPoint presentations',
      'Create Excel financial models',
      'Produce PDF reports',
      'Manage strategy document repository'
    ],
    externalServices: [
      'Statista - Market statistics',
      'IBISWorld - Industry reports',
      'PitchBook - Private company data',
      'Glassdoor - Company insights',
      'G2/Capterra - Software market data'
    ]
  },

  outputs: {
    documents: [
      { type: 'Business Plan', format: 'PDF/Word', structure: 'Executive Summary, Market Analysis, Business Model, Financials, GTM, Risk Analysis' },
      { type: 'Strategic Roadmap', format: 'PDF/PPT', structure: 'Vision, Phases, Milestones, Dependencies, Resources' },
      { type: 'Competitive Analysis', format: 'PDF/Excel', structure: 'Overview, Feature Matrix, Pricing, SWOT, Recommendations' },
      { type: 'Market Research Report', format: 'PDF', structure: 'Market Size, Trends, Segments, Opportunities, Threats' },
      { type: 'OKR Document', format: 'Markdown/PDF', structure: 'Objectives, Key Results, Initiatives, Metrics' }
    ],
    deployments: [
      { type: 'Strategy Dashboard', platform: 'Internal web app with live metrics' }
    ],
    data: [
      { type: 'Market Size Model', format: 'Excel/JSON' },
      { type: 'Competitor Database', format: 'JSON/SQL' },
      { type: 'Financial Projections', format: 'Excel' },
      { type: 'Risk Register', format: 'JSON/Excel' }
    ],
    decisions: [
      { type: 'Go/No-Go Recommendation', format: 'Structured decision with rationale, confidence score, and alternatives' },
      { type: 'Resource Allocation', format: 'Prioritized list with ROI estimates' },
      { type: 'Partnership Evaluation', format: 'Recommendation with synergy analysis' }
    ]
  },

  collaboration: [
    {
      partnerAgent: 'CFO',
      triggerConditions: [
        'Financial projections needed',
        'Valuation required',
        'Budget allocation decisions',
        'Investment analysis'
      ],
      sharedContext: ['marketSize', 'revenueProjections', 'costEstimates', 'fundingRequirements'],
      handoffFormat: 'JSON with financial assumptions and strategic rationale'
    },
    {
      partnerAgent: 'CMO',
      triggerConditions: [
        'Go-to-market strategy needed',
        'Brand positioning required',
        'Market entry planning',
        'Competitive positioning'
      ],
      sharedContext: ['targetMarket', 'competitorPositioning', 'valueProposition', 'messagingFramework'],
      handoffFormat: 'Strategic brief with market context and positioning guidelines'
    },
    {
      partnerAgent: 'CTO',
      triggerConditions: [
        'Technology strategy alignment',
        'Build vs buy decisions',
        'Technical due diligence',
        'Product roadmap planning'
      ],
      sharedContext: ['strategicPriorities', 'resourceConstraints', 'timelineExpectations', 'competitorTechnology'],
      handoffFormat: 'Strategic requirements with business context and priority ranking'
    },
    {
      partnerAgent: 'GeneralCounsel',
      triggerConditions: [
        'Partnership agreements',
        'M&A activities',
        'Regulatory considerations',
        'IP strategy'
      ],
      sharedContext: ['dealTerms', 'riskAssessment', 'regulatoryLandscape', 'ipConsiderations'],
      handoffFormat: 'Deal summary with legal review requirements'
    }
  ],

  selfAnnealing: [
    {
      feedbackType: 'Strategy outcome tracking',
      learningPattern: 'Compare predicted outcomes to actual results',
      adaptationMechanism: 'Adjust confidence weights for similar market conditions'
    },
    {
      feedbackType: 'Market prediction accuracy',
      learningPattern: 'Track forecast accuracy over time',
      adaptationMechanism: 'Refine market sizing and growth rate models'
    },
    {
      feedbackType: 'Competitive intelligence freshness',
      learningPattern: 'Monitor data staleness and update frequency',
      adaptationMechanism: 'Increase monitoring frequency for fast-moving competitors'
    },
    {
      feedbackType: 'User decision adoption',
      learningPattern: 'Track which recommendations are implemented',
      adaptationMechanism: 'Weight factors that correlate with adoption higher'
    }
  ]
};

// ============================================================================
// 2. CHIEF TECHNOLOGY OFFICER (CTO)
// ============================================================================

export const CTOSpec: ExecutiveAgentSpec = {
  identity: {
    name: 'TechLabobai',
    role: 'cto',
    title: 'Chief Technology Officer',
    personality: [
      'Pragmatic problem solver',
      'Innovation-focused but grounded',
      'Strong advocate for engineering excellence',
      'Balances technical debt with velocity',
      'Mentor mindset for team growth'
    ],
    communicationStyle: `Technical but accessible. Explains complex concepts clearly.
      Uses diagrams and code examples when helpful. Direct about trade-offs.
      Focuses on outcomes over technology for its own sake.`,
    expertise: [
      'Full-stack architecture design',
      'Cloud infrastructure (AWS, GCP, Azure)',
      'DevOps and CI/CD pipelines',
      'Security and compliance',
      'Scalability and performance',
      'Technical team building',
      'Technology evaluation and selection'
    ]
  },

  capabilities: [
    {
      name: 'buildFullStackApp',
      description: 'Generate and deploy complete full-stack application',
      inputSchema: {
        appDescription: 'string',
        features: 'string[]',
        stack: 'StackPreferences',
        deploymentTarget: 'string'
      },
      outputSchema: {
        generatedFiles: 'GeneratedFile[]',
        deploymentUrl: 'string',
        documentation: 'Documentation',
        testResults: 'TestResult[]',
        architecture: 'ArchitectureDiagram'
      },
      requiredTools: ['BuilderEngine', 'DeploymentPipeline', 'GitManager', 'RegressionTester'],
      approvalRequired: true,
      estimatedDuration: '30 minutes - 4 hours'
    },
    {
      name: 'designSystemArchitecture',
      description: 'Create detailed system architecture with diagrams',
      inputSchema: {
        requirements: 'string[]',
        constraints: 'TechnicalConstraints',
        scalabilityTargets: 'ScaleMetrics',
        existingStack: 'string[]'
      },
      outputSchema: {
        architectureDiagram: 'MermaidDiagram',
        componentSpecs: 'ComponentSpec[]',
        dataFlowDiagram: 'DataFlowDiagram',
        technologyChoices: 'TechDecision[]',
        implementationPlan: 'ImplementationPhase[]'
      },
      requiredTools: ['DiagramGenerator', 'DocumentGenerator', 'ArchitectureAnalyzer'],
      approvalRequired: false,
      estimatedDuration: '2-6 hours'
    },
    {
      name: 'setupCICD',
      description: 'Configure complete CI/CD pipeline with testing',
      inputSchema: {
        repository: 'string',
        deploymentTargets: 'string[]',
        testingRequirements: 'TestingConfig',
        secrets: 'SecretConfig'
      },
      outputSchema: {
        pipelineConfig: 'PipelineYAML',
        workflowFiles: 'GitHubActions[]',
        dockerfiles: 'Dockerfile[]',
        helmCharts: 'HelmChart[]',
        documentation: 'SetupGuide'
      },
      requiredTools: ['GitManager', 'DockerBuilder', 'KubernetesManager', 'SecretsManager'],
      approvalRequired: true,
      estimatedDuration: '2-4 hours'
    },
    {
      name: 'conductSecurityAudit',
      description: 'Perform comprehensive security analysis',
      inputSchema: {
        codebaseUrl: 'string',
        scanType: '"quick" | "standard" | "deep"',
        complianceFrameworks: 'string[]'
      },
      outputSchema: {
        vulnerabilities: 'Vulnerability[]',
        riskScore: 'number',
        remediationPlan: 'RemediationItem[]',
        complianceGaps: 'ComplianceGap[]',
        securityReport: 'SecurityReport'
      },
      requiredTools: ['SecurityScanner', 'DependencyAuditor', 'CodeAnalyzer'],
      approvalRequired: false,
      estimatedDuration: '1-4 hours'
    },
    {
      name: 'optimizePerformance',
      description: 'Analyze and optimize application performance',
      inputSchema: {
        applicationUrl: 'string',
        performanceTargets: 'PerformanceMetrics',
        budget: 'OptimizationBudget'
      },
      outputSchema: {
        currentMetrics: 'PerformanceBaseline',
        bottlenecks: 'Bottleneck[]',
        optimizations: 'Optimization[]',
        implementedChanges: 'Change[]',
        projectedImprovements: 'MetricsDelta'
      },
      requiredTools: ['PerformanceProfiler', 'BrowserAutomation', 'CodeOptimizer', 'BuilderEngine'],
      approvalRequired: true,
      estimatedDuration: '2-8 hours'
    },
    {
      name: 'setupInfrastructure',
      description: 'Provision and configure cloud infrastructure',
      inputSchema: {
        cloudProvider: '"aws" | "gcp" | "azure"',
        architecture: 'InfraArchitecture',
        environment: '"development" | "staging" | "production"',
        budget: 'MonthlyBudget'
      },
      outputSchema: {
        terraformConfig: 'TerraformModule[]',
        provisionedResources: 'Resource[]',
        networkDiagram: 'NetworkDiagram',
        costEstimate: 'CostBreakdown',
        accessCredentials: 'EncryptedCredentials'
      },
      requiredTools: ['TerraformExecutor', 'CloudProviderSDK', 'SecretsManager', 'CostCalculator'],
      approvalRequired: true,
      estimatedDuration: '1-6 hours'
    },
    {
      name: 'reviewCode',
      description: 'Perform thorough code review with suggestions',
      inputSchema: {
        pullRequestUrl: 'string',
        reviewFocus: 'string[]',
        codeStandards: 'string'
      },
      outputSchema: {
        reviewComments: 'ReviewComment[]',
        suggestedChanges: 'CodeChange[]',
        securityIssues: 'SecurityIssue[]',
        qualityScore: 'number',
        approvalStatus: '"approved" | "changes_requested" | "needs_discussion"'
      },
      requiredTools: ['GitHubConnector', 'CodeAnalyzer', 'SecurityScanner'],
      approvalRequired: false,
      estimatedDuration: '15-60 minutes'
    },
    {
      name: 'debugIssue',
      description: 'Investigate and fix production issues',
      inputSchema: {
        issueDescription: 'string',
        errorLogs: 'string',
        reproductionSteps: 'string[]',
        codebaseUrl: 'string'
      },
      outputSchema: {
        rootCause: 'string',
        fix: 'CodeFix',
        pullRequest: 'PullRequest',
        preventionMeasures: 'Prevention[]',
        postmortem: 'PostmortemReport'
      },
      requiredTools: ['LogAnalyzer', 'CodeAnalyzer', 'GitManager', 'BuilderEngine'],
      approvalRequired: true,
      estimatedDuration: '30 minutes - 4 hours'
    }
  ],

  tools: {
    browserAutomation: [
      'Navigate to web apps for testing and debugging',
      'Capture performance metrics via DevTools',
      'Execute automated E2E test scenarios',
      'Monitor deployed applications',
      'Interact with cloud provider consoles'
    ],
    terminalCommands: [
      'git - Full version control operations',
      'npm/yarn/pnpm - Package management',
      'docker - Container operations',
      'kubectl - Kubernetes management',
      'terraform - Infrastructure provisioning',
      'aws/gcloud/az - Cloud CLI tools',
      'ssh - Remote server access',
      'curl/httpie - API testing',
      'jq - JSON processing',
      'grep/ripgrep - Code search',
      'node - Script execution',
      'python - Automation scripts'
    ],
    apis: [
      'GitHub API - Repository management, PR operations',
      'GitLab API - CI/CD pipeline management',
      'AWS SDK - Full AWS resource management',
      'GCP SDK - Google Cloud operations',
      'Azure SDK - Azure resource management',
      'Docker Hub API - Image management',
      'Vercel/Netlify API - Deployment management',
      'Datadog/New Relic API - Monitoring',
      'PagerDuty API - Incident management',
      'Sentry API - Error tracking'
    ],
    fileOperations: [
      'Create/edit source code files (any language)',
      'Generate configuration files (YAML, JSON, TOML)',
      'Create Dockerfiles and docker-compose.yml',
      'Generate Terraform/Pulumi infrastructure code',
      'Create CI/CD workflow files',
      'Generate API documentation',
      'Create architecture diagrams (Mermaid, PlantUML)'
    ],
    externalServices: [
      'GitHub/GitLab - Code hosting',
      'Vercel/Netlify/Railway - Deployment platforms',
      'AWS/GCP/Azure - Cloud infrastructure',
      'Datadog/New Relic - Monitoring',
      'Sentry - Error tracking',
      'Snyk/Dependabot - Security scanning',
      'SonarQube - Code quality'
    ]
  },

  outputs: {
    documents: [
      { type: 'Architecture Document', format: 'Markdown/PDF', structure: 'Overview, Components, Data Flow, Decisions, Diagrams' },
      { type: 'Technical Specification', format: 'Markdown', structure: 'Requirements, Design, API Specs, Data Models' },
      { type: 'Security Audit Report', format: 'PDF', structure: 'Executive Summary, Vulnerabilities, Risk Score, Remediation' },
      { type: 'Infrastructure Documentation', format: 'Markdown', structure: 'Architecture, Resources, Access, Runbooks' },
      { type: 'Postmortem Report', format: 'Markdown', structure: 'Timeline, Root Cause, Impact, Prevention' }
    ],
    deployments: [
      { type: 'Full-stack Application', platform: 'Vercel/Netlify/Railway/AWS' },
      { type: 'API Service', platform: 'AWS Lambda/GCP Cloud Run/Railway' },
      { type: 'Infrastructure', platform: 'AWS/GCP/Azure via Terraform' },
      { type: 'CI/CD Pipeline', platform: 'GitHub Actions/GitLab CI' }
    ],
    data: [
      { type: 'Generated Code', format: 'Source files in appropriate languages' },
      { type: 'Infrastructure State', format: 'Terraform state' },
      { type: 'Performance Metrics', format: 'JSON time series' },
      { type: 'Security Scan Results', format: 'SARIF/JSON' }
    ],
    decisions: [
      { type: 'Technology Selection', format: 'Decision record with trade-offs and rationale' },
      { type: 'Architecture Decision Record', format: 'ADR format with context, decision, consequences' },
      { type: 'Build vs Buy', format: 'Analysis with TCO comparison' }
    ]
  },

  collaboration: [
    {
      partnerAgent: 'CSO',
      triggerConditions: [
        'Technology roadmap alignment needed',
        'Build vs buy decisions',
        'Technical feasibility assessment',
        'Resource planning'
      ],
      sharedContext: ['technicalConstraints', 'implementationTimeline', 'resourceRequirements', 'technicalRisks'],
      handoffFormat: 'Technical assessment with feasibility analysis and resource estimates'
    },
    {
      partnerAgent: 'CFO',
      triggerConditions: [
        'Infrastructure cost estimation',
        'Build vs buy cost analysis',
        'Technical resource budgeting',
        'Vendor cost comparison'
      ],
      sharedContext: ['infrastructureCosts', 'licensingCosts', 'developmentEffort', 'maintenanceCosts'],
      handoffFormat: 'Cost breakdown with technical justification'
    },
    {
      partnerAgent: 'HeadOfOperations',
      triggerConditions: [
        'Deployment coordination',
        'System availability requirements',
        'Incident response',
        'Capacity planning'
      ],
      sharedContext: ['deploymentSchedule', 'systemDependencies', 'rollbackProcedures', 'slaRequirements'],
      handoffFormat: 'Operations runbook with technical details'
    },
    {
      partnerAgent: 'GeneralCounsel',
      triggerConditions: [
        'Open source license review',
        'Data handling compliance',
        'Security certifications',
        'Vendor contracts'
      ],
      sharedContext: ['licenseDependencies', 'dataFlows', 'securityMeasures', 'vendorAgreements'],
      handoffFormat: 'Technical compliance documentation'
    }
  ],

  selfAnnealing: [
    {
      feedbackType: 'Deployment success rate',
      learningPattern: 'Track deployment failures and their causes',
      adaptationMechanism: 'Add pre-deployment checks for common failure patterns'
    },
    {
      feedbackType: 'Code quality metrics',
      learningPattern: 'Monitor code review feedback and bug rates',
      adaptationMechanism: 'Adjust code generation templates and patterns'
    },
    {
      feedbackType: 'Performance optimization impact',
      learningPattern: 'Measure before/after metrics for optimizations',
      adaptationMechanism: 'Prioritize optimization strategies with proven impact'
    },
    {
      feedbackType: 'Security vulnerability recurrence',
      learningPattern: 'Track repeated security issues',
      adaptationMechanism: 'Add proactive scanning for known vulnerability patterns'
    }
  ]
};

// ============================================================================
// 3. CHIEF FINANCIAL OFFICER (CFO)
// ============================================================================

export const CFOSpec: ExecutiveAgentSpec = {
  identity: {
    name: 'FinanceLabobai',
    role: 'cfo',
    title: 'Chief Financial Officer',
    personality: [
      'Meticulous and detail-oriented',
      'Conservative risk manager',
      'Clear communicator of complex financials',
      'Strategic thinker with financial lens',
      'Proactive about financial health'
    ],
    communicationStyle: `Precise and data-driven. Uses charts and visualizations.
      Explains financial concepts in accessible terms. Always quantifies risk.
      Provides context for numbers and trends.`,
    expertise: [
      'Financial modeling and forecasting',
      'Budgeting and cost management',
      'Fundraising and investor relations',
      'Cash flow management',
      'Financial reporting and compliance',
      'Unit economics analysis',
      'Valuation and cap table management'
    ]
  },

  capabilities: [
    {
      name: 'createFinancialModel',
      description: 'Build comprehensive financial model with scenarios',
      inputSchema: {
        businessType: 'string',
        revenueStreams: 'RevenueStream[]',
        costStructure: 'CostItem[]',
        timeHorizon: 'number',
        scenarios: 'string[]'
      },
      outputSchema: {
        incomeStatement: 'IncomeStatement',
        balanceSheet: 'BalanceSheet',
        cashFlowStatement: 'CashFlowStatement',
        scenarioAnalysis: 'ScenarioComparison',
        unitEconomics: 'UnitEconomicsAnalysis',
        spreadsheet: 'ExcelFile'
      },
      requiredTools: ['FinancialModeler', 'SpreadsheetGenerator', 'ChartGenerator'],
      approvalRequired: false,
      estimatedDuration: '2-6 hours'
    },
    {
      name: 'manageBudget',
      description: 'Create and track budget with variance analysis',
      inputSchema: {
        period: 'string',
        departments: 'Department[]',
        targets: 'BudgetTargets',
        existingData: 'HistoricalFinancials'
      },
      outputSchema: {
        budget: 'BudgetDocument',
        allocationBreakdown: 'Allocation[]',
        varianceReport: 'VarianceAnalysis',
        recommendations: 'BudgetRecommendation[]',
        dashboardData: 'DashboardMetrics'
      },
      requiredTools: ['FinancialModeler', 'SpreadsheetGenerator', 'DashboardBuilder'],
      approvalRequired: true,
      estimatedDuration: '3-8 hours'
    },
    {
      name: 'prepareFundraisingMaterials',
      description: 'Create investor deck and financial due diligence package',
      inputSchema: {
        fundingRound: 'string',
        targetAmount: 'number',
        companyMetrics: 'CompanyMetrics',
        useOfFunds: 'UseOfFunds'
      },
      outputSchema: {
        pitchDeck: 'PowerPointFile',
        financialModel: 'ExcelFile',
        dataRoom: 'DataRoomContents',
        capTable: 'CapTableModel',
        termSheetAnalysis: 'TermSheetComparison'
      },
      requiredTools: ['PresentationGenerator', 'FinancialModeler', 'DocumentGenerator', 'CapTableManager'],
      approvalRequired: true,
      estimatedDuration: '1-3 days'
    },
    {
      name: 'analyzeUnitEconomics',
      description: 'Deep analysis of unit economics and profitability',
      inputSchema: {
        revenueData: 'RevenueData',
        costData: 'CostData',
        customerData: 'CustomerMetrics',
        period: 'string'
      },
      outputSchema: {
        ltv: 'number',
        cac: 'number',
        ltvCacRatio: 'number',
        paybackPeriod: 'number',
        grossMargin: 'number',
        contributionMargin: 'number',
        cohortAnalysis: 'CohortData',
        recommendations: 'string[]'
      },
      requiredTools: ['FinancialModeler', 'DataAnalyzer', 'ChartGenerator'],
      approvalRequired: false,
      estimatedDuration: '2-4 hours'
    },
    {
      name: 'manageCashFlow',
      description: 'Forecast and optimize cash flow',
      inputSchema: {
        currentCash: 'number',
        projectedRevenue: 'number[]',
        projectedExpenses: 'number[]',
        receivables: 'Receivable[]',
        payables: 'Payable[]'
      },
      outputSchema: {
        cashFlowForecast: 'CashFlowProjection[]',
        runway: 'number',
        criticalDates: 'CriticalDate[]',
        optimizationSuggestions: 'Optimization[]',
        scenarioAnalysis: 'CashScenario[]'
      },
      requiredTools: ['FinancialModeler', 'SpreadsheetGenerator', 'AlertSystem'],
      approvalRequired: false,
      estimatedDuration: '1-3 hours'
    },
    {
      name: 'processPayroll',
      description: 'Calculate and process payroll with compliance',
      inputSchema: {
        employees: 'Employee[]',
        payPeriod: 'PayPeriod',
        deductions: 'Deduction[]',
        benefits: 'Benefit[]'
      },
      outputSchema: {
        payrollSummary: 'PayrollSummary',
        individualPaystubs: 'Paystub[]',
        taxWithholdings: 'TaxWithholding[]',
        paymentInstructions: 'PaymentInstruction[]',
        complianceReport: 'ComplianceReport'
      },
      requiredTools: ['PayrollCalculator', 'TaxCalculator', 'PaymentProcessor', 'DocumentGenerator'],
      approvalRequired: true,
      estimatedDuration: '1-2 hours'
    },
    {
      name: 'processInvoice',
      description: 'Create and send invoice, track payment',
      inputSchema: {
        customer: 'Customer',
        items: 'InvoiceItem[]',
        terms: 'PaymentTerms',
        autoRemind: 'boolean'
      },
      outputSchema: {
        invoice: 'Invoice',
        paymentLink: 'string',
        trackingId: 'string',
        reminderSchedule: 'ReminderSchedule'
      },
      requiredTools: ['InvoiceGenerator', 'PaymentGateway', 'EmailSender', 'ReminderScheduler'],
      approvalRequired: false,
      estimatedDuration: '5-15 minutes'
    },
    {
      name: 'generateFinancialReport',
      description: 'Create comprehensive financial report',
      inputSchema: {
        reportType: '"monthly" | "quarterly" | "annual"',
        period: 'string',
        includeNarrative: 'boolean',
        audience: '"board" | "investors" | "internal"'
      },
      outputSchema: {
        report: 'FinancialReport',
        highlights: 'Highlight[]',
        kpis: 'KPI[]',
        charts: 'Chart[]',
        executiveNarrative: 'string'
      },
      requiredTools: ['FinancialModeler', 'ReportGenerator', 'ChartGenerator', 'DocumentGenerator'],
      approvalRequired: false,
      estimatedDuration: '2-6 hours'
    }
  ],

  tools: {
    browserAutomation: [
      'Access banking portals for transaction data',
      'Navigate accounting software interfaces',
      'Extract financial data from partner portals',
      'Monitor stock/crypto prices for treasury',
      'Access government tax portals'
    ],
    terminalCommands: [
      'python - Financial calculations and modeling',
      'node - API integrations',
      'curl - Banking API calls',
      'jq - Process financial JSON data',
      'pandoc - Convert financial reports'
    ],
    apis: [
      'Plaid API - Bank account aggregation',
      'Stripe API - Payment processing and reporting',
      'QuickBooks API - Accounting integration',
      'Xero API - Alternative accounting',
      'Gusto API - Payroll processing',
      'Carta API - Cap table management',
      'Mercury/Brex API - Banking',
      'Ramp API - Expense management'
    ],
    fileOperations: [
      'Create Excel financial models with formulas',
      'Generate PDF financial reports',
      'Create PowerPoint investor decks',
      'Produce CSV exports for accounting',
      'Generate invoices and receipts',
      'Create payroll documents'
    ],
    externalServices: [
      'QuickBooks/Xero - Accounting',
      'Stripe/Square - Payments',
      'Gusto/Rippling - Payroll',
      'Carta - Cap table',
      'Plaid - Banking aggregation',
      'Mercury/Brex - Banking',
      'Ramp - Expense management',
      'Bill.com - AP/AR'
    ]
  },

  outputs: {
    documents: [
      { type: 'Financial Model', format: 'Excel', structure: 'Assumptions, P&L, Balance Sheet, Cash Flow, Scenarios' },
      { type: 'Investor Deck', format: 'PowerPoint/PDF', structure: 'Problem, Solution, Market, Traction, Financials, Ask' },
      { type: 'Budget', format: 'Excel', structure: 'By Department, Monthly, Variance, Forecast' },
      { type: 'Financial Report', format: 'PDF', structure: 'Summary, Statements, KPIs, Analysis' },
      { type: 'Invoice', format: 'PDF', structure: 'Header, Items, Terms, Payment' }
    ],
    deployments: [
      { type: 'Financial Dashboard', platform: 'Internal web app with live data' },
      { type: 'Investor Portal', platform: 'Secure web portal for investors' }
    ],
    data: [
      { type: 'Financial Model', format: 'Excel with live formulas' },
      { type: 'Cap Table', format: 'Excel/Carta export' },
      { type: 'Transaction Data', format: 'CSV/JSON' },
      { type: 'KPI Dashboard Data', format: 'JSON' }
    ],
    decisions: [
      { type: 'Budget Allocation', format: 'Recommendation with ROI analysis' },
      { type: 'Investment Decision', format: 'NPV/IRR analysis with recommendation' },
      { type: 'Pricing Decision', format: 'Unit economics analysis with scenarios' }
    ]
  },

  collaboration: [
    {
      partnerAgent: 'CSO',
      triggerConditions: [
        'Strategic initiative costing',
        'M&A valuation',
        'Resource allocation',
        'Fundraising strategy'
      ],
      sharedContext: ['financialProjections', 'valuationModels', 'budgetConstraints', 'fundingTimeline'],
      handoffFormat: 'Financial analysis with strategic implications'
    },
    {
      partnerAgent: 'CTO',
      triggerConditions: [
        'Technology investment decisions',
        'Infrastructure cost planning',
        'Build vs buy analysis',
        'Vendor evaluation'
      ],
      sharedContext: ['techBudget', 'costProjections', 'investmentTimeline', 'expectedROI'],
      handoffFormat: 'Financial framework for technical decisions'
    },
    {
      partnerAgent: 'HeadOfSales',
      triggerConditions: [
        'Sales compensation planning',
        'Revenue forecasting',
        'Deal structuring',
        'Commission calculations'
      ],
      sharedContext: ['revenueTargets', 'compensationStructure', 'dealEconomics', 'forecastData'],
      handoffFormat: 'Financial targets and compensation models'
    },
    {
      partnerAgent: 'HeadOfOperations',
      triggerConditions: [
        'Operational cost optimization',
        'Vendor contract negotiations',
        'Expense management',
        'Budget tracking'
      ],
      sharedContext: ['operationalBudget', 'vendorCosts', 'expenseCategories', 'savingsTargets'],
      handoffFormat: 'Budget guidelines with spending authority'
    }
  ],

  selfAnnealing: [
    {
      feedbackType: 'Forecast accuracy',
      learningPattern: 'Compare projections to actuals monthly',
      adaptationMechanism: 'Adjust growth rates and seasonality factors'
    },
    {
      feedbackType: 'Budget variance',
      learningPattern: 'Track over/under spending patterns',
      adaptationMechanism: 'Refine budget allocation algorithms'
    },
    {
      feedbackType: 'Cash flow prediction',
      learningPattern: 'Monitor payment timing accuracy',
      adaptationMechanism: 'Update payment probability models'
    },
    {
      feedbackType: 'Collection effectiveness',
      learningPattern: 'Track AR aging and collection rates',
      adaptationMechanism: 'Optimize reminder timing and messaging'
    }
  ]
};

// Export continues in next file...
