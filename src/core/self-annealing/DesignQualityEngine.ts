/**
 * Self-Annealing Design Quality Engine
 *
 * This system learns from design feedback and automatically improves
 * the prompts and guidelines to prevent recurring issues.
 */

export interface DesignIssue {
  id: string;
  timestamp: Date;
  category: DesignIssueCategory;
  description: string;
  solution: string;
  promptAddition: string;
}

export type DesignIssueCategory =
  | 'typography_mismatch'
  | 'visual_bleeding'
  | 'basic_design'
  | 'color_clash'
  | 'missing_effects'
  | 'layout_issues'
  | 'logo_handling'
  | 'animation_missing'
  | 'responsive_issues';

// Known design issues and their fixes
const DESIGN_KNOWLEDGE_BASE: DesignIssue[] = [
  {
    id: 'typography-001',
    timestamp: new Date('2026-02-09'),
    category: 'typography_mismatch',
    description: 'Typography does not match elegant cursive logo',
    solution: 'Use serif/script fonts (Cormorant Garamond, Playfair Display) for headings when logo is cursive',
    promptAddition: 'CRITICAL: When logo is cursive/script style, ALL headings must use complementary serif fonts like Cormorant Garamond with font-weight: 300 and letter-spacing: 0.1em'
  },
  {
    id: 'bleeding-001',
    timestamp: new Date('2026-02-09'),
    category: 'visual_bleeding',
    description: 'Visual bleeding/gaps at top of page',
    solution: 'Set body/html margin/padding to 0, use overflow-x: hidden',
    promptAddition: 'ALWAYS set: html, body { margin: 0; padding: 0; overflow-x: hidden; } and ensure first section has proper padding-top for fixed headers'
  },
  {
    id: 'basic-001',
    timestamp: new Date('2026-02-09'),
    category: 'basic_design',
    description: 'Design looks basic/template-like instead of Framer-level',
    solution: 'Add layered depth, glow effects, gradient meshes, floating elements, micro-interactions',
    promptAddition: 'NEVER use flat colors - always gradients. EVERY element needs: glow effects, glass morphism, hover animations, layered shadows. Design should look like Awwwards winner, not Bootstrap template.'
  },
  {
    id: 'effects-001',
    timestamp: new Date('2026-02-09'),
    category: 'missing_effects',
    description: 'Missing premium effects like glass morphism and glows',
    solution: 'Include backdrop-filter blur, ambient glows, noise texture overlay',
    promptAddition: 'REQUIRED effects: backdrop-filter: blur(20px), box-shadow glows, noise texture overlay (opacity: 0.03), animated gradient backgrounds'
  },
  {
    id: 'logo-001',
    timestamp: new Date('2026-02-09'),
    category: 'logo_handling',
    description: 'Logo recreated as text instead of using image file',
    solution: 'Always use <img src="/logo.png"> never text recreation',
    promptAddition: 'LOGO RULE: ALWAYS use <img src="/logo.png"> for logos. NEVER recreate logos as text. Add subtle glow behind logo.'
  }
];

export class DesignQualityEngine {
  private knowledgeBase: DesignIssue[] = [...DESIGN_KNOWLEDGE_BASE];
  private feedbackHistory: DesignFeedback[] = [];

  constructor() {
    this.loadKnowledgeBase();
  }

  private loadKnowledgeBase(): void {
    // In production, this would load from persistent storage
    console.log('[DesignQualityEngine] Loaded', this.knowledgeBase.length, 'design rules');
  }

  /**
   * Record user feedback about design quality
   */
  recordFeedback(feedback: DesignFeedback): void {
    this.feedbackHistory.push({
      ...feedback,
      timestamp: new Date()
    });

    // Analyze if this is a recurring issue
    this.analyzeAndLearn(feedback);
  }

  /**
   * Analyze feedback and update knowledge base
   */
  private analyzeAndLearn(feedback: DesignFeedback): void {
    // Check if similar feedback exists
    const similarIssues = this.knowledgeBase.filter(issue =>
      feedback.description.toLowerCase().includes(issue.category.replace('_', ' '))
    );

    if (similarIssues.length === 0) {
      // New issue type - add to knowledge base
      const newIssue: DesignIssue = {
        id: `learned-${Date.now()}`,
        timestamp: new Date(),
        category: this.categorizeIssue(feedback.description),
        description: feedback.description,
        solution: feedback.suggestedFix || 'Pending analysis',
        promptAddition: this.generatePromptAddition(feedback)
      };
      this.knowledgeBase.push(newIssue);
      console.log('[DesignQualityEngine] Learned new design rule:', newIssue.id);
    }
  }

  private categorizeIssue(description: string): DesignIssueCategory {
    const lower = description.toLowerCase();
    if (lower.includes('typography') || lower.includes('font')) return 'typography_mismatch';
    if (lower.includes('bleeding') || lower.includes('gap')) return 'visual_bleeding';
    if (lower.includes('basic') || lower.includes('template')) return 'basic_design';
    if (lower.includes('color')) return 'color_clash';
    if (lower.includes('effect') || lower.includes('glow')) return 'missing_effects';
    if (lower.includes('layout')) return 'layout_issues';
    if (lower.includes('logo')) return 'logo_handling';
    if (lower.includes('animation') || lower.includes('hover')) return 'animation_missing';
    if (lower.includes('responsive') || lower.includes('mobile')) return 'responsive_issues';
    return 'basic_design';
  }

  private generatePromptAddition(feedback: DesignFeedback): string {
    // Generate a prompt addition based on the feedback
    const category = this.categorizeIssue(feedback.description);
    const prefixes: Record<DesignIssueCategory, string> = {
      typography_mismatch: 'TYPOGRAPHY RULE:',
      visual_bleeding: 'LAYOUT RULE:',
      basic_design: 'DESIGN QUALITY RULE:',
      color_clash: 'COLOR RULE:',
      missing_effects: 'EFFECTS RULE:',
      layout_issues: 'LAYOUT RULE:',
      logo_handling: 'LOGO RULE:',
      animation_missing: 'ANIMATION RULE:',
      responsive_issues: 'RESPONSIVE RULE:'
    };

    return `${prefixes[category]} ${feedback.suggestedFix || feedback.description}. This has been flagged as a quality issue - DO NOT repeat.`;
  }

  /**
   * Get enhanced prompt additions based on learned rules
   */
  getEnhancedPromptRules(): string {
    const rules = this.knowledgeBase.map(issue => issue.promptAddition);
    return `
## SELF-ANNEALING DESIGN RULES (Learned from feedback):
${rules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')}

## QUALITY VERIFICATION CHECKLIST:
Before generating ANY design, verify:
□ Typography matches logo style (script logo = script headings)
□ No visual bleeding or gaps (margin/padding: 0 on body)
□ Glass morphism effects present (backdrop-filter: blur)
□ Glow effects on key elements (box-shadow with spread)
□ Gradient backgrounds, NOT flat colors
□ Hover animations on ALL interactive elements
□ Noise texture overlay for premium feel
□ Logo uses <img> tag, never text recreation
□ Design is Awwwards-worthy, not Bootstrap-basic

If ANY item fails, FIX IT before outputting code.
`;
  }

  /**
   * Get current design quality score
   */
  getQualityScore(): number {
    const recentFeedback = this.feedbackHistory.slice(-10);
    if (recentFeedback.length === 0) return 100;

    const positiveCount = recentFeedback.filter(f => f.isPositive).length;
    return Math.round((positiveCount / recentFeedback.length) * 100);
  }
}

export interface DesignFeedback {
  timestamp?: Date;
  description: string;
  isPositive: boolean;
  suggestedFix?: string;
  screenshotPath?: string;
}

// Singleton instance
export const designQualityEngine = new DesignQualityEngine();

// Export the enhanced rules for use in prompts
export function getDesignQualityRules(): string {
  return designQualityEngine.getEnhancedPromptRules();
}
