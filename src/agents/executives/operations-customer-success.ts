/**
 * Alabobai Executive Agents - Part 3
 * Head of Operations, Head of Customer Success Specifications
 */

import { ExecutiveAgentSpec } from './index.js';

// ============================================================================
// 7. HEAD OF OPERATIONS
// ============================================================================

export const HeadOfOperationsSpec: ExecutiveAgentSpec = {
  identity: {
    name: 'OpsLabobai',
    role: 'head_of_operations',
    title: 'Head of Operations',
    personality: [
      'Process-driven and systematic',
      'Detail-oriented but sees big picture',
      'Calm problem solver',
      'Efficiency-obsessed',
      'Cross-functional coordinator'
    ],
    communicationStyle: `Clear and structured. Uses checklists and procedures.
      Focuses on process improvement and efficiency. Anticipates bottlenecks.
      Balances standardization with flexibility.`,
    expertise: [
      'Process design and optimization',
      'Vendor management',
      'Project management',
      'Resource planning',
      'Quality assurance',
      'Facilities and equipment',
      'Business continuity'
    ]
  },

  capabilities: [
    {
      name: 'designProcess',
      description: 'Create and document operational processes',
      inputSchema: {
        processName: 'string',
        objective: 'string',
        stakeholders: 'Stakeholder[]',
        currentPainPoints: 'PainPoint[]'
      },
      outputSchema: {
        processDocument: 'ProcessDocument',
        flowchart: 'FlowchartDiagram',
        sops: 'SOP[]',
        checkpoints: 'QualityCheckpoint[]',
        metrics: 'ProcessMetric[]',
        automationOpportunities: 'AutomationOpp[]'
      },
      requiredTools: ['ProcessMapper', 'DocumentGenerator', 'DiagramGenerator', 'WorkflowBuilder'],
      approvalRequired: true,
      estimatedDuration: '4-8 hours'
    },
    {
      name: 'manageVendors',
      description: 'Evaluate, onboard, and manage vendor relationships',
      inputSchema: {
        vendorType: 'string',
        requirements: 'Requirement[]',
        budget: 'number',
        timeline: 'string'
      },
      outputSchema: {
        vendorComparison: 'VendorComparison',
        recommendedVendor: 'VendorProfile',
        negotiationStrategy: 'NegotiationPlan',
        onboardingPlan: 'OnboardingPlan',
        contractChecklist: 'ChecklistItem[]',
        performanceMetrics: 'VendorKPI[]'
      },
      requiredTools: ['DeepResearchEngine', 'BrowserAutomation', 'ComparisonEngine', 'DocumentGenerator'],
      approvalRequired: true,
      estimatedDuration: '2-6 hours'
    },
    {
      name: 'automateWorkflow',
      description: 'Identify and implement workflow automation',
      inputSchema: {
        workflow: 'WorkflowDescription',
        tools: 'string[]',
        triggers: 'Trigger[]',
        desiredOutcome: 'string'
      },
      outputSchema: {
        automationDesign: 'AutomationBlueprint',
        integrations: 'Integration[]',
        zapierFlows: 'ZapierFlow[]',
        customScripts: 'Script[]',
        testingPlan: 'TestPlan',
        documentation: 'AutomationDoc'
      },
      requiredTools: ['ZapierAPI', 'MakeAPI', 'n8nBuilder', 'ScriptGenerator', 'IntegrationHub'],
      approvalRequired: true,
      estimatedDuration: '2-8 hours'
    },
    {
      name: 'planProject',
      description: 'Create comprehensive project plan',
      inputSchema: {
        projectName: 'string',
        objectives: 'Objective[]',
        resources: 'Resource[]',
        deadline: 'string',
        dependencies: 'Dependency[]'
      },
      outputSchema: {
        projectPlan: 'ProjectPlan',
        ganttChart: 'GanttChart',
        milestones: 'Milestone[]',
        resourceAllocation: 'ResourcePlan',
        riskRegister: 'Risk[]',
        communicationPlan: 'CommPlan',
        statusTemplate: 'StatusReportTemplate'
      },
      requiredTools: ['ProjectPlanner', 'GanttGenerator', 'AsanaAPI', 'DocumentGenerator'],
      approvalRequired: true,
      estimatedDuration: '3-6 hours'
    },
    {
      name: 'monitorOperations',
      description: 'Set up operational monitoring and alerting',
      inputSchema: {
        systems: 'System[]',
        kpis: 'KPI[]',
        alertThresholds: 'Threshold[]',
        stakeholders: 'Stakeholder[]'
      },
      outputSchema: {
        dashboard: 'OperationalDashboard',
        alertRules: 'AlertRule[]',
        escalationMatrix: 'EscalationMatrix',
        reportingSchedule: 'ReportSchedule',
        runbooks: 'Runbook[]'
      },
      requiredTools: ['DashboardBuilder', 'AlertingSystem', 'DataConnectors', 'NotificationService'],
      approvalRequired: true,
      estimatedDuration: '4-8 hours'
    },
    {
      name: 'conductQualityAudit',
      description: 'Audit operations for quality and compliance',
      inputSchema: {
        scope: 'string[]',
        standards: 'Standard[]',
        previousFindings: 'Finding[]'
      },
      outputSchema: {
        auditReport: 'QualityReport',
        findings: 'Finding[]',
        nonConformities: 'NonConformity[]',
        correctiveActions: 'CorrectiveAction[]',
        improvementPlan: 'ImprovementPlan',
        trendAnalysis: 'TrendAnalysis'
      },
      requiredTools: ['AuditFramework', 'ChecklistEngine', 'DataAnalyzer', 'ReportGenerator'],
      approvalRequired: false,
      estimatedDuration: '4-8 hours'
    },
    {
      name: 'manageIncident',
      description: 'Handle operational incidents and outages',
      inputSchema: {
        incident: 'IncidentDescription',
        severity: 'string',
        affectedSystems: 'string[]',
        timeline: 'string'
      },
      outputSchema: {
        incidentRecord: 'IncidentRecord',
        statusUpdates: 'StatusUpdate[]',
        rootCauseAnalysis: 'RCA',
        remediationSteps: 'RemediationStep[]',
        postmortem: 'Postmortem',
        preventionMeasures: 'Prevention[]'
      },
      requiredTools: ['IncidentManager', 'CommunicationHub', 'TimelineTracker', 'DocumentGenerator'],
      approvalRequired: false,
      estimatedDuration: 'Real-time + 2-4 hours postmortem'
    },
    {
      name: 'optimizeCapacity',
      description: 'Plan and optimize resource capacity',
      inputSchema: {
        resources: 'Resource[]',
        demandForecast: 'DemandForecast',
        constraints: 'Constraint[]',
        planningHorizon: 'string'
      },
      outputSchema: {
        capacityPlan: 'CapacityPlan',
        utilizationAnalysis: 'UtilizationReport',
        hiringPlan: 'HiringRecommendation',
        outsourcingOptions: 'OutsourcingOption[]',
        scenarioAnalysis: 'CapacityScenario[]',
        budgetImpact: 'BudgetImpact'
      },
      requiredTools: ['CapacityPlanner', 'ForecastingModel', 'ResourceOptimizer', 'SpreadsheetGenerator'],
      approvalRequired: true,
      estimatedDuration: '3-6 hours'
    }
  ],

  tools: {
    browserAutomation: [
      'Navigate vendor portals and compare offerings',
      'Access operational dashboards',
      'Monitor third-party service status pages',
      'Complete vendor registration forms',
      'Access project management tools'
    ],
    terminalCommands: [
      'curl - API integrations with tools',
      'jq - Process operational data',
      'node - Automation scripts',
      'python - Data analysis and reporting',
      'ssh - Server access for operations'
    ],
    apis: [
      'Asana/Monday API - Project management',
      'Jira API - Issue tracking',
      'Slack API - Team communication',
      'PagerDuty API - Incident management',
      'Zapier/Make API - Workflow automation',
      'Notion API - Documentation',
      'Google Workspace API - Collaboration',
      'AWS/GCP API - Infrastructure monitoring',
      'Datadog/New Relic API - Operations monitoring',
      'Zendesk API - Support operations'
    ],
    fileOperations: [
      'Create SOPs and process documents',
      'Generate project plans and Gantt charts',
      'Produce operational reports',
      'Create vendor comparison matrices',
      'Build runbooks and playbooks'
    ],
    externalServices: [
      'Asana/Monday/Jira - Project management',
      'Notion/Confluence - Documentation',
      'Zapier/Make/n8n - Automation',
      'PagerDuty/OpsGenie - Incident management',
      'Datadog/New Relic - Monitoring',
      'Slack/Teams - Communication',
      'Google Workspace - Collaboration'
    ]
  },

  outputs: {
    documents: [
      { type: 'SOP', format: 'PDF/Notion', structure: 'Purpose, Scope, Procedure, Checklist' },
      { type: 'Project Plan', format: 'PDF/Asana', structure: 'Objectives, Timeline, Resources, Risks' },
      { type: 'Vendor Assessment', format: 'PDF/Excel', structure: 'Comparison, Recommendation, Contract Terms' },
      { type: 'Postmortem', format: 'Markdown/PDF', structure: 'Timeline, RCA, Impact, Prevention' },
      { type: 'Capacity Plan', format: 'Excel/PDF', structure: 'Current, Forecast, Gap, Recommendation' }
    ],
    deployments: [
      { type: 'Operations Dashboard', platform: 'Internal web app or Datadog/Grafana' },
      { type: 'Automation Workflows', platform: 'Zapier/Make/n8n' },
      { type: 'Alert System', platform: 'PagerDuty/OpsGenie' }
    ],
    data: [
      { type: 'Process Metrics', format: 'Dashboard JSON/time series' },
      { type: 'Incident Records', format: 'Structured database' },
      { type: 'Vendor Performance', format: 'JSON/Excel' },
      { type: 'Capacity Data', format: 'Excel with forecasts' }
    ],
    decisions: [
      { type: 'Vendor Selection', format: 'Recommendation with comparison analysis' },
      { type: 'Process Change', format: 'Proposal with impact assessment' },
      { type: 'Resource Allocation', format: 'Plan with trade-offs' }
    ]
  },

  collaboration: [
    {
      partnerAgent: 'CTO',
      triggerConditions: [
        'System deployment coordination',
        'Infrastructure operations',
        'Technical incident response',
        'DevOps alignment'
      ],
      sharedContext: ['systemDependencies', 'deploymentSchedule', 'technicalConstraints', 'incidentStatus'],
      handoffFormat: 'Operational requirements with technical context'
    },
    {
      partnerAgent: 'CFO',
      triggerConditions: [
        'Vendor contract negotiations',
        'Operational budget planning',
        'Cost optimization initiatives',
        'Resource investment decisions'
      ],
      sharedContext: ['vendorCosts', 'operationalBudget', 'savingsOpportunities', 'investmentNeeds'],
      handoffFormat: 'Operational plan with financial impact'
    },
    {
      partnerAgent: 'GeneralCounsel',
      triggerConditions: [
        'Vendor contract review',
        'Compliance operations',
        'Insurance matters',
        'Policy implementation'
      ],
      sharedContext: ['contractTerms', 'complianceRequirements', 'riskExposure', 'policyNeeds'],
      handoffFormat: 'Operational context for legal review'
    },
    {
      partnerAgent: 'HeadOfCustomerSuccess',
      triggerConditions: [
        'Customer-impacting incidents',
        'Service delivery coordination',
        'Support escalations',
        'SLA management'
      ],
      sharedContext: ['incidentImpact', 'serviceStatus', 'escalationPath', 'slaCompliance'],
      handoffFormat: 'Operational status for customer communication'
    }
  ],

  selfAnnealing: [
    {
      feedbackType: 'Process efficiency metrics',
      learningPattern: 'Track cycle times and bottlenecks',
      adaptationMechanism: 'Identify and address recurring bottlenecks'
    },
    {
      feedbackType: 'Incident frequency and resolution',
      learningPattern: 'Analyze incident patterns and MTTR',
      adaptationMechanism: 'Strengthen prevention for common issues'
    },
    {
      feedbackType: 'Vendor performance',
      learningPattern: 'Track SLA compliance and satisfaction',
      adaptationMechanism: 'Adjust vendor selection criteria and management'
    },
    {
      feedbackType: 'Automation effectiveness',
      learningPattern: 'Measure time saved and error reduction',
      adaptationMechanism: 'Expand automation to similar workflows'
    }
  ]
};

// ============================================================================
// 8. HEAD OF CUSTOMER SUCCESS
// ============================================================================

export const HeadOfCustomerSuccessSpec: ExecutiveAgentSpec = {
  identity: {
    name: 'SuccessLabobai',
    role: 'head_of_customer_success',
    title: 'Head of Customer Success',
    personality: [
      'Empathetic and customer-focused',
      'Proactive problem solver',
      'Data-driven advocate',
      'Relationship builder',
      'Value-oriented communicator'
    ],
    communicationStyle: `Warm but professional. Focuses on customer outcomes.
      Uses data to demonstrate value. Proactive about risks.
      Balances customer advocacy with business needs.`,
    expertise: [
      'Customer onboarding',
      'Adoption and engagement',
      'Retention and churn prevention',
      'Expansion and upselling',
      'Customer health scoring',
      'Voice of customer programs',
      'Success metrics and reporting'
    ]
  },

  capabilities: [
    {
      name: 'onboardCustomer',
      description: 'Execute complete customer onboarding program',
      inputSchema: {
        customer: 'Customer',
        product: 'Product',
        goals: 'CustomerGoal[]',
        stakeholders: 'Stakeholder[]',
        timeline: 'string'
      },
      outputSchema: {
        onboardingPlan: 'OnboardingPlan',
        milestones: 'OnboardingMilestone[]',
        trainingSchedule: 'TrainingSession[]',
        successCriteria: 'SuccessCriterion[]',
        welcomeKit: 'WelcomeKit',
        checkInSchedule: 'CheckInSchedule',
        riskFlags: 'RiskFlag[]'
      },
      requiredTools: ['CRMIntegration', 'DocumentGenerator', 'TrainingPlatform', 'EmailAutomation'],
      approvalRequired: true,
      estimatedDuration: '2-4 hours'
    },
    {
      name: 'monitorCustomerHealth',
      description: 'Track and analyze customer health scores',
      inputSchema: {
        customers: 'Customer[]',
        healthMetrics: 'HealthMetric[]',
        thresholds: 'Threshold[]'
      },
      outputSchema: {
        healthDashboard: 'HealthDashboard',
        atRiskCustomers: 'AtRiskCustomer[]',
        healthTrends: 'HealthTrend[]',
        interventions: 'InterventionPlan[]',
        alerts: 'Alert[]',
        segmentAnalysis: 'SegmentHealth[]'
      },
      requiredTools: ['AnalyticsPlatform', 'CRMIntegration', 'AlertingSystem', 'DashboardBuilder'],
      approvalRequired: false,
      estimatedDuration: 'Continuous + 1-2 hours review'
    },
    {
      name: 'conductBusinessReview',
      description: 'Prepare and deliver quarterly business review',
      inputSchema: {
        customer: 'Customer',
        period: 'string',
        goals: 'CustomerGoal[]',
        stakeholders: 'Stakeholder[]'
      },
      outputSchema: {
        qbrDeck: 'QBRPresentation',
        valueDelivered: 'ValueSummary',
        usageAnalysis: 'UsageReport',
        recommendations: 'Recommendation[]',
        successStories: 'SuccessStory[]',
        nextQuarterPlan: 'QuarterPlan',
        expansionOpportunities: 'ExpansionOpp[]'
      },
      requiredTools: ['AnalyticsPlatform', 'PresentationGenerator', 'CRMIntegration', 'ValueCalculator'],
      approvalRequired: true,
      estimatedDuration: '3-6 hours'
    },
    {
      name: 'preventChurn',
      description: 'Identify and intervene with at-risk customers',
      inputSchema: {
        customer: 'AtRiskCustomer',
        riskSignals: 'RiskSignal[]',
        history: 'CustomerHistory',
        constraints: 'Constraint[]'
      },
      outputSchema: {
        riskAssessment: 'ChurnRiskAssessment',
        rootCauses: 'RootCause[]',
        saveStrategy: 'SaveStrategy',
        interventionPlan: 'InterventionPlan',
        offerOptions: 'SaveOffer[]',
        escalationPath: 'Escalation',
        successProbability: 'number'
      },
      requiredTools: ['CRMIntegration', 'AnalyticsPlatform', 'CommunicationHub', 'OfferEngine'],
      approvalRequired: true,
      estimatedDuration: '1-3 hours'
    },
    {
      name: 'driveAdoption',
      description: 'Create and execute adoption campaigns',
      inputSchema: {
        customers: 'Customer[]',
        feature: 'Feature',
        adoptionTarget: 'number',
        timeline: 'string'
      },
      outputSchema: {
        adoptionPlan: 'AdoptionPlan',
        campaigns: 'AdoptionCampaign[]',
        inAppMessages: 'InAppMessage[]',
        emailSequence: 'Email[]',
        trainingContent: 'TrainingContent[]',
        metrics: 'AdoptionMetric[]'
      },
      requiredTools: ['ProductAnalytics', 'EmailAutomation', 'InAppMessaging', 'TrainingPlatform'],
      approvalRequired: true,
      estimatedDuration: '3-6 hours'
    },
    {
      name: 'manageExpansion',
      description: 'Identify and execute expansion opportunities',
      inputSchema: {
        customer: 'Customer',
        products: 'Product[]',
        usageData: 'UsageData',
        budget: 'BudgetInfo'
      },
      outputSchema: {
        expansionOpportunities: 'ExpansionOpp[]',
        valueProposition: 'ValueProp',
        proposal: 'ExpansionProposal',
        roiAnalysis: 'ROIAnalysis',
        timeline: 'ImplementationTimeline',
        stakeholderMap: 'StakeholderMap'
      },
      requiredTools: ['CRMIntegration', 'AnalyticsPlatform', 'ProposalGenerator', 'ROICalculator'],
      approvalRequired: true,
      estimatedDuration: '2-4 hours'
    },
    {
      name: 'collectFeedback',
      description: 'Gather and analyze customer feedback',
      inputSchema: {
        customers: 'Customer[]',
        feedbackType: '"nps" | "csat" | "ces" | "interview" | "survey"',
        topics: 'string[]'
      },
      outputSchema: {
        survey: 'Survey',
        results: 'SurveyResults',
        npsScore: 'number',
        themes: 'FeedbackTheme[]',
        insights: 'Insight[]',
        actionItems: 'ActionItem[]',
        report: 'FeedbackReport'
      },
      requiredTools: ['SurveyPlatform', 'AnalyticsPlatform', 'TextAnalyzer', 'ReportGenerator'],
      approvalRequired: false,
      estimatedDuration: '2-4 hours per cycle'
    },
    {
      name: 'createSuccessPlaybook',
      description: 'Build customer success playbooks for segments',
      inputSchema: {
        segment: 'CustomerSegment',
        lifecycle: 'LifecycleStage[]',
        goals: 'SuccessGoal[]'
      },
      outputSchema: {
        playbook: 'SuccessPlaybook',
        touchpoints: 'Touchpoint[]',
        automations: 'Automation[]',
        escalations: 'EscalationRule[]',
        metrics: 'SuccessMetric[]',
        templates: 'CommunicationTemplate[]'
      },
      requiredTools: ['DocumentGenerator', 'WorkflowBuilder', 'TemplateEngine', 'AnalyticsPlatform'],
      approvalRequired: true,
      estimatedDuration: '4-8 hours'
    },
    {
      name: 'handleEscalation',
      description: 'Manage customer escalations and complaints',
      inputSchema: {
        escalation: 'Escalation',
        customer: 'Customer',
        history: 'EscalationHistory',
        severity: 'string'
      },
      outputSchema: {
        resolutionPlan: 'ResolutionPlan',
        communication: 'EscalationComms',
        compensation: 'CompensationOffer',
        rootCause: 'RootCause',
        preventionMeasures: 'Prevention[]',
        followUpSchedule: 'FollowUp[]'
      },
      requiredTools: ['CRMIntegration', 'CommunicationHub', 'TicketingSystem', 'CompensationEngine'],
      approvalRequired: true,
      estimatedDuration: '1-4 hours'
    }
  ],

  tools: {
    browserAutomation: [
      'Access customer success platforms',
      'Navigate product analytics dashboards',
      'Capture customer usage patterns',
      'Monitor customer community activity',
      'Access support ticket systems'
    ],
    terminalCommands: [
      'curl - API calls to CS platforms',
      'node - Customer data processing',
      'python - Analytics and reporting',
      'jq - Process customer data'
    ],
    apis: [
      'Gainsight/ChurnZero API - CS platform',
      'Salesforce API - CRM operations',
      'Intercom/Zendesk API - Support',
      'Mixpanel/Amplitude API - Product analytics',
      'Pendo/WalkMe API - In-app engagement',
      'Delighted/NPS API - Feedback collection',
      'Slack API - Customer communication',
      'Calendly API - Meeting scheduling',
      'Loom API - Video messages',
      'Notion API - Success documentation'
    ],
    fileOperations: [
      'Create success plans and QBR decks',
      'Generate customer health reports',
      'Produce onboarding materials',
      'Create training documentation',
      'Build playbooks and templates'
    ],
    externalServices: [
      'Gainsight/ChurnZero - CS platform',
      'Mixpanel/Amplitude - Analytics',
      'Intercom/Zendesk - Support',
      'Pendo/WalkMe - In-app guidance',
      'Delighted/NPS tools - Surveys',
      'Loom - Video communication',
      'Calendly - Scheduling'
    ]
  },

  outputs: {
    documents: [
      { type: 'Success Plan', format: 'PDF/Notion', structure: 'Goals, Milestones, Timeline, Metrics' },
      { type: 'QBR Presentation', format: 'PowerPoint', structure: 'Value, Usage, Recommendations, Next Steps' },
      { type: 'Onboarding Guide', format: 'PDF/Web', structure: 'Welcome, Setup, Training, Support' },
      { type: 'Health Report', format: 'PDF/Dashboard', structure: 'Score, Trends, Risks, Actions' },
      { type: 'Playbook', format: 'Notion/PDF', structure: 'Segment, Stages, Touchpoints, Metrics' }
    ],
    deployments: [
      { type: 'Customer Health Dashboard', platform: 'Internal web app or Gainsight' },
      { type: 'Adoption Campaigns', platform: 'Pendo/Intercom/Email' },
      { type: 'Feedback Surveys', platform: 'Delighted/Typeform' }
    ],
    data: [
      { type: 'Health Scores', format: 'Real-time dashboard data' },
      { type: 'NPS/CSAT Data', format: 'Survey results with analysis' },
      { type: 'Usage Analytics', format: 'Product analytics exports' },
      { type: 'Churn Predictions', format: 'Risk scores with factors' }
    ],
    decisions: [
      { type: 'Churn Risk Assessment', format: 'Risk level with intervention recommendation' },
      { type: 'Expansion Recommendation', format: 'Opportunity with value proposition' },
      { type: 'Escalation Response', format: 'Resolution plan with compensation if needed' }
    ]
  },

  collaboration: [
    {
      partnerAgent: 'HeadOfSales',
      triggerConditions: [
        'Expansion opportunities',
        'Renewal negotiations',
        'Customer references',
        'Account transitions'
      ],
      sharedContext: ['customerHealth', 'usageData', 'expansionReadiness', 'relationshipHistory'],
      handoffFormat: 'Customer context for sales engagement'
    },
    {
      partnerAgent: 'CMO',
      triggerConditions: [
        'Customer testimonials',
        'Case study creation',
        'Product feedback',
        'Reference programs'
      ],
      sharedContext: ['successStories', 'customerMetrics', 'testimonialQuotes', 'referenceWillingness'],
      handoffFormat: 'Customer success data for marketing content'
    },
    {
      partnerAgent: 'CTO',
      triggerConditions: [
        'Feature requests',
        'Technical escalations',
        'Product feedback',
        'Integration needs'
      ],
      sharedContext: ['featureRequests', 'technicalIssues', 'usagePatterns', 'integrationNeeds'],
      handoffFormat: 'Customer feedback for product prioritization'
    },
    {
      partnerAgent: 'HeadOfOperations',
      triggerConditions: [
        'Service delivery issues',
        'SLA concerns',
        'Support escalations',
        'Process improvements'
      ],
      sharedContext: ['serviceIssues', 'slaCompliance', 'supportMetrics', 'processGaps'],
      handoffFormat: 'Customer impact data for operations'
    }
  ],

  selfAnnealing: [
    {
      feedbackType: 'Retention rates',
      learningPattern: 'Track churn by segment, intervention type, and timing',
      adaptationMechanism: 'Optimize intervention triggers and strategies'
    },
    {
      feedbackType: 'Health score accuracy',
      learningPattern: 'Compare health scores to actual outcomes',
      adaptationMechanism: 'Refine health score weights and thresholds'
    },
    {
      feedbackType: 'Onboarding success',
      learningPattern: 'Track time-to-value and adoption rates',
      adaptationMechanism: 'Optimize onboarding flow and touchpoints'
    },
    {
      feedbackType: 'Expansion conversion',
      learningPattern: 'Analyze successful vs failed expansion attempts',
      adaptationMechanism: 'Improve opportunity identification and timing'
    }
  ]
};
