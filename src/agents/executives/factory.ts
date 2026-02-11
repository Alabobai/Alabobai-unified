/**
 * Alabobai Executive Agents Factory
 * Creates and manages all 8 executive agents
 */

import { LLMClient } from '../../core/llm-client.js';
import { BrowserAutomation } from '../../core/computer/BrowserAutomation.js';
import { BuilderEngine } from '../../core/builder/BuilderEngine.js';
import { DeepResearchEngine } from '../../core/research/DeepResearchEngine.js';
import { IntegrationHub } from '../../integrations/IntegrationHub.js';

import { ExecutiveAgent, createExecutiveAgent } from './ExecutiveAgent.js';
import { CSOSpec, CTOSpec, CFOSpec, ExecutiveAgentSpec } from './index.js';
import { CMOSpec, GeneralCounselSpec, HeadOfSalesSpec } from './marketing-legal-sales.js';
import { HeadOfOperationsSpec, HeadOfCustomerSuccessSpec } from './operations-customer-success.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutiveTeamConfig {
  llm: LLMClient;
  browserAutomation?: BrowserAutomation;
  builderEngine?: BuilderEngine;
  researchEngine?: DeepResearchEngine;
  integrationHub?: IntegrationHub;
}

export interface ExecutiveTeam {
  cso: ExecutiveAgent;
  cto: ExecutiveAgent;
  cfo: ExecutiveAgent;
  cmo: ExecutiveAgent;
  generalCounsel: ExecutiveAgent;
  headOfSales: ExecutiveAgent;
  headOfOperations: ExecutiveAgent;
  headOfCustomerSuccess: ExecutiveAgent;
}

export type ExecutiveRole = keyof ExecutiveTeam;

// ============================================================================
// ALL SPECS
// ============================================================================

export const ExecutiveSpecs: Record<ExecutiveRole, ExecutiveAgentSpec> = {
  cso: CSOSpec,
  cto: CTOSpec,
  cfo: CFOSpec,
  cmo: CMOSpec,
  generalCounsel: GeneralCounselSpec,
  headOfSales: HeadOfSalesSpec,
  headOfOperations: HeadOfOperationsSpec,
  headOfCustomerSuccess: HeadOfCustomerSuccessSpec
};

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a single executive agent by role
 */
export function createExecutive(
  role: ExecutiveRole,
  config: ExecutiveTeamConfig
): ExecutiveAgent {
  const spec = ExecutiveSpecs[role];
  if (!spec) {
    throw new Error(`Unknown executive role: ${role}`);
  }

  return createExecutiveAgent({
    spec,
    llm: config.llm,
    browserAutomation: config.browserAutomation,
    builderEngine: config.builderEngine,
    researchEngine: config.researchEngine,
    integrationHub: config.integrationHub
  });
}

/**
 * Create the complete executive team
 */
export function createExecutiveTeam(config: ExecutiveTeamConfig): ExecutiveTeam {
  return {
    cso: createExecutive('cso', config),
    cto: createExecutive('cto', config),
    cfo: createExecutive('cfo', config),
    cmo: createExecutive('cmo', config),
    generalCounsel: createExecutive('generalCounsel', config),
    headOfSales: createExecutive('headOfSales', config),
    headOfOperations: createExecutive('headOfOperations', config),
    headOfCustomerSuccess: createExecutive('headOfCustomerSuccess', config)
  };
}

/**
 * Get all executive specs for reference
 */
export function getAllExecutiveSpecs(): ExecutiveAgentSpec[] {
  return Object.values(ExecutiveSpecs);
}

/**
 * Get spec by role
 */
export function getExecutiveSpec(role: ExecutiveRole): ExecutiveAgentSpec {
  return ExecutiveSpecs[role];
}

/**
 * Find which executive should handle a task based on keywords
 */
export function findBestExecutive(
  taskDescription: string,
  team: ExecutiveTeam
): ExecutiveAgent {
  const keywords = taskDescription.toLowerCase();

  // Strategy, market, business planning -> CSO
  if (keywords.match(/strateg|market|compet|roadmap|vision|plan|swot|business model/)) {
    return team.cso;
  }

  // Technology, development, infrastructure -> CTO
  if (keywords.match(/build|code|deploy|infrastructure|api|architecture|security|performance/)) {
    return team.cto;
  }

  // Financial, budget, funding -> CFO
  if (keywords.match(/financ|budget|forecast|revenue|cost|invest|payroll|invoice/)) {
    return team.cfo;
  }

  // Marketing, content, advertising -> CMO
  if (keywords.match(/market|campaign|content|seo|social|brand|advertis|landing page/)) {
    return team.cmo;
  }

  // Legal, contracts, compliance -> General Counsel
  if (keywords.match(/legal|contract|compliance|privacy|trademark|patent|incorporat/)) {
    return team.generalCounsel;
  }

  // Sales, deals, pipeline -> Head of Sales
  if (keywords.match(/sales|deal|pipeline|proposal|lead|prospect|close|quota/)) {
    return team.headOfSales;
  }

  // Operations, process, vendor -> Head of Operations
  if (keywords.match(/operat|process|vendor|project|automat|incident|quality/)) {
    return team.headOfOperations;
  }

  // Customer success, onboarding, retention -> Head of Customer Success
  if (keywords.match(/customer|onboard|churn|retention|success|nps|adopt/)) {
    return team.headOfCustomerSuccess;
  }

  // Default to CSO for general business questions
  return team.cso;
}

// ============================================================================
// EXECUTIVE TEAM MANAGER
// ============================================================================

export class ExecutiveTeamManager {
  private team: ExecutiveTeam;
  private config: ExecutiveTeamConfig;

  constructor(config: ExecutiveTeamConfig) {
    this.config = config;
    this.team = createExecutiveTeam(config);
    this.setupCollaborationNetwork();
  }

  /**
   * Get the full executive team
   */
  getTeam(): ExecutiveTeam {
    return this.team;
  }

  /**
   * Get a specific executive by role
   */
  getExecutive(role: ExecutiveRole): ExecutiveAgent {
    return this.team[role];
  }

  /**
   * Find the best executive for a task
   */
  routeTask(taskDescription: string): ExecutiveAgent {
    return findBestExecutive(taskDescription, this.team);
  }

  /**
   * Execute a capability on the appropriate executive
   */
  async executeTask(
    taskDescription: string,
    input: Record<string, unknown>,
    context: {
      sessionId: string;
      userId: string;
      companyId: string;
    }
  ) {
    const executive = this.routeTask(taskDescription);

    // Find matching capability
    const capability = this.findMatchingCapability(executive, taskDescription);

    if (!capability) {
      throw new Error(`No matching capability found for task: ${taskDescription}`);
    }

    return executive.executeCapability(capability.name, input, context);
  }

  /**
   * Get all team performance metrics
   */
  getTeamMetrics(): Record<ExecutiveRole, ReturnType<ExecutiveAgent['getPerformanceMetrics']>> {
    return {
      cso: this.team.cso.getPerformanceMetrics(),
      cto: this.team.cto.getPerformanceMetrics(),
      cfo: this.team.cfo.getPerformanceMetrics(),
      cmo: this.team.cmo.getPerformanceMetrics(),
      generalCounsel: this.team.generalCounsel.getPerformanceMetrics(),
      headOfSales: this.team.headOfSales.getPerformanceMetrics(),
      headOfOperations: this.team.headOfOperations.getPerformanceMetrics(),
      headOfCustomerSuccess: this.team.headOfCustomerSuccess.getPerformanceMetrics()
    };
  }

  /**
   * Get all capabilities across the team
   */
  getAllCapabilities(): Array<{
    role: ExecutiveRole;
    agent: string;
    capabilities: string[];
  }> {
    return (Object.entries(this.team) as [ExecutiveRole, ExecutiveAgent][]).map(([role, agent]) => ({
      role,
      agent: agent.name,
      capabilities: agent.capabilities.map(c => c.name)
    }));
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private setupCollaborationNetwork(): void {
    // Wire up collaboration event handlers
    const agents = Object.values(this.team);

    for (const agent of agents) {
      agent.on('collaboration-requested', async (event: {
        requestingAgent: string;
        partnerAgent: string;
        protocol: unknown;
        request: { sharedContext: Record<string, unknown> };
      }) => {
        const partnerRole = event.partnerAgent as ExecutiveRole;
        const partner = this.team[partnerRole];

        if (partner) {
          const response = await partner.handleCollaborationRequest(
            agent.id,
            event.request.sharedContext,
            {
              sessionId: 'collaboration',
              userId: 'system',
              companyId: 'internal'
            }
          );

          agent.emit('collaboration-response', {
            from: partner.id,
            response
          });
        }
      });
    }
  }

  private findMatchingCapability(
    executive: ExecutiveAgent,
    taskDescription: string
  ): { name: string } | null {
    const keywords = taskDescription.toLowerCase();

    for (const capability of executive.capabilities) {
      const capKeywords = capability.name.toLowerCase() + ' ' + capability.description.toLowerCase();

      // Simple keyword matching
      const capWords = capKeywords.split(/\s+/);
      const taskWords = keywords.split(/\s+/);

      const matchCount = taskWords.filter(tw =>
        capWords.some(cw => cw.includes(tw) || tw.includes(cw))
      ).length;

      if (matchCount >= 2) {
        return { name: capability.name };
      }
    }

    // Return first capability as fallback
    return executive.capabilities[0] ? { name: executive.capabilities[0].name } : null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ExecutiveAgent,
  CSOSpec,
  CTOSpec,
  CFOSpec,
  CMOSpec,
  GeneralCounselSpec,
  HeadOfSalesSpec,
  HeadOfOperationsSpec,
  HeadOfCustomerSuccessSpec
};

export default ExecutiveTeamManager;
