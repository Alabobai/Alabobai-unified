/**
 * Alabobai Departments API Routes
 * Provides information about AI departments and their capabilities
 */

import { Router, Request, Response } from 'express';
import {
  OrchestratorService,
  getOrchestratorService,
  DEPARTMENTS
} from '../../services/orchestrator.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DepartmentsRouterConfig {
  orchestrator?: OrchestratorService;
}

interface DepartmentStats {
  totalRequests: number;
  avgResponseTime: number;
  successRate: number;
  lastUsed: Date | null;
}

// Simple in-memory stats tracking
const departmentStats: Map<string, DepartmentStats> = new Map();

// Initialize stats for all departments
Object.keys(DEPARTMENTS).forEach(id => {
  departmentStats.set(id, {
    totalRequests: 0,
    avgResponseTime: 0,
    successRate: 1.0,
    lastUsed: null
  });
});

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createDepartmentsRouter(config: DepartmentsRouterConfig = {}): Router {
  const router = Router();
  const orchestrator = config.orchestrator || getOrchestratorService();

  // ============================================================================
  // GET /api/departments - List all departments
  // ============================================================================

  router.get('/', (req: Request, res: Response) => {
    const departments = orchestrator.getDepartments();

    res.json({
      count: departments.length,
      departments: departments.map(d => ({
        id: d.id,
        name: d.name,
        category: d.category,
        description: d.description,
        icon: d.icon,
        skills: d.skills,
        stats: departmentStats.get(d.id) || null
      }))
    });
  });

  // ============================================================================
  // GET /api/departments/:id - Get specific department details
  // ============================================================================

  router.get('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const department = orchestrator.getDepartment(id);

    if (!department) {
      return res.status(404).json({
        error: 'Department not found',
        availableDepartments: Object.keys(DEPARTMENTS)
      });
    }

    const stats = departmentStats.get(id);

    res.json({
      id: department.id,
      name: department.name,
      category: department.category,
      description: department.description,
      icon: department.icon,
      skills: department.skills,
      stats,
      capabilities: department.skills.map(skill => ({
        name: skill,
        description: `Handles ${skill} related tasks`
      })),
      examples: getExamplesForDepartment(id)
    });
  });

  // ============================================================================
  // GET /api/departments/:id/skills - Get department skills
  // ============================================================================

  router.get('/:id/skills', (req: Request, res: Response) => {
    const { id } = req.params;
    const department = orchestrator.getDepartment(id);

    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({
      departmentId: id,
      departmentName: department.name,
      skills: department.skills.map(skill => ({
        name: skill,
        category: categorizeSkill(skill),
        description: `Expertise in ${skill}`
      }))
    });
  });

  // ============================================================================
  // GET /api/departments/categories - List department categories
  // ============================================================================

  router.get('/meta/categories', (req: Request, res: Response) => {
    const departments = orchestrator.getDepartments();

    // Group by category
    const categories: Record<string, typeof departments> = {};

    for (const dept of departments) {
      if (!categories[dept.category]) {
        categories[dept.category] = [];
      }
      categories[dept.category].push(dept);
    }

    res.json({
      categories: Object.entries(categories).map(([name, depts]) => ({
        name,
        description: getCategoryDescription(name),
        departmentCount: depts.length,
        departments: depts.map(d => ({
          id: d.id,
          name: d.name,
          icon: d.icon
        }))
      }))
    });
  });

  // ============================================================================
  // POST /api/departments/suggest - Suggest department for a task
  // ============================================================================

  router.post('/suggest', async (req: Request, res: Response) => {
    try {
      const { query, topN = 3 } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
      }

      const suggestions = suggestDepartments(query, topN);

      res.json({
        query,
        suggestions: suggestions.map(s => ({
          department: {
            id: s.department.id,
            name: s.department.name,
            description: s.department.description,
            icon: s.department.icon
          },
          confidence: s.confidence,
          matchedSkills: s.matchedSkills,
          reasoning: s.reasoning
        }))
      });
    } catch (error) {
      console.error('[Departments API] Suggest error:', error);
      res.status(500).json({
        error: 'Failed to suggest departments',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/departments/stats - Get aggregate statistics
  // ============================================================================

  router.get('/meta/stats', (req: Request, res: Response) => {
    const allStats = Array.from(departmentStats.entries());

    const totalRequests = allStats.reduce((sum, [, stats]) => sum + stats.totalRequests, 0);
    const avgResponseTime = allStats.reduce((sum, [, stats]) => sum + stats.avgResponseTime, 0) / allStats.length;

    // Find most/least used
    const sortedByUsage = allStats.sort((a, b) => b[1].totalRequests - a[1].totalRequests);

    res.json({
      totalDepartments: allStats.length,
      totalRequests,
      averageResponseTime: Math.round(avgResponseTime),
      mostUsed: sortedByUsage.slice(0, 3).map(([id, stats]) => ({
        id,
        name: DEPARTMENTS[id]?.name || id,
        requests: stats.totalRequests
      })),
      leastUsed: sortedByUsage.slice(-3).reverse().map(([id, stats]) => ({
        id,
        name: DEPARTMENTS[id]?.name || id,
        requests: stats.totalRequests
      }))
    });
  });

  return router;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getExamplesForDepartment(id: string): string[] {
  const examples: Record<string, string[]> = {
    executive: [
      'Create a 90-day business plan for my startup',
      'Help me set OKRs for Q1',
      'Analyze my competitive landscape',
      'Review my company\'s strategic priorities'
    ],
    legal: [
      'Draft terms of service for my SaaS',
      'Create an NDA template',
      'Help me form an LLC',
      'Review this contract for red flags'
    ],
    finance: [
      'Create a financial projection for 12 months',
      'Help me understand my tax obligations',
      'Build a budget template for my startup',
      'Analyze my cash flow'
    ],
    credit: [
      'How can I improve my credit score?',
      'Help me build business credit',
      'What funding options do I have?',
      'Create a credit repair plan'
    ],
    development: [
      'Build a landing page with React',
      'Create a REST API for user authentication',
      'Help me design a database schema',
      'Review my code for best practices'
    ],
    marketing: [
      'Write a social media content calendar',
      'Create email sequences for onboarding',
      'Help me with SEO strategy',
      'Write copy for my landing page'
    ],
    sales: [
      'Create a cold outreach sequence',
      'Write a proposal template',
      'Help me build a sales playbook',
      'Script for handling objections'
    ],
    hr: [
      'Write a job description for a developer',
      'Create an employee handbook section',
      'Help me with interview questions',
      'Build a performance review template'
    ],
    operations: [
      'Create an SOP for customer onboarding',
      'Help me document my processes',
      'Build a project management workflow',
      'Optimize my vendor management'
    ],
    research: [
      'Research market trends in AI',
      'Analyze my competitors',
      'Find data on customer behavior',
      'Create a market research report'
    ],
    computer: [
      'Help me automate this repetitive task',
      'Fill out this form automatically',
      'Extract data from this website',
      'Navigate through this multi-step process'
    ]
  };

  return examples[id] || ['Ask me anything related to ' + (DEPARTMENTS[id]?.name || id)];
}

function categorizeSkill(skill: string): string {
  const categories: Record<string, string[]> = {
    'strategic': ['strategy', 'planning', 'decisions', 'vision', 'goals'],
    'legal': ['contracts', 'compliance', 'trademark', 'nda', 'terms'],
    'financial': ['tax', 'accounting', 'budget', 'projection', 'cash flow'],
    'technical': ['code', 'app', 'api', 'database', 'programming'],
    'marketing': ['content', 'social media', 'email', 'seo', 'brand'],
    'operational': ['process', 'sop', 'workflow', 'efficiency', 'automation']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => skill.toLowerCase().includes(kw))) {
      return category;
    }
  }

  return 'general';
}

function getCategoryDescription(category: string): string {
  const descriptions: Record<string, string> = {
    advisory: 'Departments that provide strategic advice, planning, and consultation',
    builder: 'Departments that create, develop, and build things',
    research: 'Departments focused on research, analysis, and data gathering',
    'computer-control': 'Departments that interact with computers and automate tasks'
  };

  return descriptions[category] || 'General purpose departments';
}

interface DepartmentSuggestion {
  department: typeof DEPARTMENTS[keyof typeof DEPARTMENTS];
  confidence: number;
  matchedSkills: string[];
  reasoning: string;
}

function suggestDepartments(query: string, topN: number): DepartmentSuggestion[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);
  const suggestions: DepartmentSuggestion[] = [];

  for (const [id, dept] of Object.entries(DEPARTMENTS)) {
    let score = 0;
    const matchedSkills: string[] = [];

    // Check skill matches
    for (const skill of dept.skills) {
      const skillLower = skill.toLowerCase();
      for (const word of queryWords) {
        if (skillLower.includes(word) || word.includes(skillLower)) {
          score += 2;
          if (!matchedSkills.includes(skill)) {
            matchedSkills.push(skill);
          }
        }
      }
    }

    // Check description match
    const descLower = dept.description.toLowerCase();
    for (const word of queryWords) {
      if (word.length > 3 && descLower.includes(word)) {
        score += 1;
      }
    }

    // Check name match
    if (dept.name.toLowerCase().includes(queryLower) ||
        queryLower.includes(dept.name.toLowerCase())) {
      score += 3;
    }

    if (score > 0) {
      suggestions.push({
        department: dept,
        confidence: Math.min(score / 10, 1.0),
        matchedSkills,
        reasoning: matchedSkills.length > 0
          ? `Matches skills: ${matchedSkills.join(', ')}`
          : `Relevant to ${dept.name}`
      });
    }
  }

  // Sort by confidence and return top N
  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topN);
}

// ============================================================================
// STATS TRACKING (exported for use by other modules)
// ============================================================================

export function recordDepartmentUsage(
  departmentId: string,
  responseTimeMs: number,
  success: boolean
): void {
  const stats = departmentStats.get(departmentId);
  if (!stats) return;

  // Update stats
  const oldTotal = stats.totalRequests;
  stats.totalRequests++;
  stats.avgResponseTime = (stats.avgResponseTime * oldTotal + responseTimeMs) / stats.totalRequests;
  stats.successRate = (stats.successRate * oldTotal + (success ? 1 : 0)) / stats.totalRequests;
  stats.lastUsed = new Date();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createDepartmentsRouter;
