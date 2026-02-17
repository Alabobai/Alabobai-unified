/**
 * Memory Extractor - Extract and Process Information for Memory Storage
 *
 * Automatically extracts:
 * - Facts from conversations
 * - User preferences from behavior
 * - Summarizes long conversations
 * - Detects important information to remember
 */

import { getMemoryService, MemoryService, MemoryType, Memory } from './memoryService.js';

// ============================================================================
// Types
// ============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ExtractedFact {
  content: string;
  type: MemoryType;
  importance: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface PreferenceDetection {
  key: string;
  value: unknown;
  category: string;
  confidence: number;
  source: string;
}

export interface ExtractionResult {
  facts: ExtractedFact[];
  preferences: PreferenceDetection[];
  summary?: string;
  shouldRemember: boolean;
}

// ============================================================================
// Pattern Matchers
// ============================================================================

// Patterns for explicit memory commands
const REMEMBER_PATTERNS = [
  /(?:please\s+)?remember\s+(?:that\s+)?(.+)/i,
  /(?:please\s+)?note\s+(?:that\s+)?(.+)/i,
  /(?:please\s+)?save\s+(?:this|that)?\s*[:\-]?\s*(.+)/i,
  /keep\s+(?:in\s+)?mind\s+(?:that\s+)?(.+)/i,
  /don'?t\s+forget\s+(?:that\s+)?(.+)/i,
  /make\s+a\s+note\s+(?:that\s+)?(.+)/i,
];

const FORGET_PATTERNS = [
  /(?:please\s+)?forget\s+(?:that\s+)?(.+)/i,
  /(?:please\s+)?don'?t\s+remember\s+(.+)/i,
  /(?:please\s+)?remove\s+(?:from\s+memory\s+)?(.+)/i,
  /(?:please\s+)?delete\s+(?:the\s+)?(?:memory\s+)?(?:about\s+)?(.+)/i,
];

// Patterns for facts
const FACT_PATTERNS = [
  // Personal information
  { pattern: /(?:my|i)\s+(?:name|am|'m)\s+(?:is\s+)?(\w+(?:\s+\w+)?)/i, type: 'fact' as MemoryType, importance: 80, category: 'personal' },
  { pattern: /(?:i\s+)?(?:live|work)\s+(?:in|at)\s+(.+)/i, type: 'fact' as MemoryType, importance: 70, category: 'location' },
  { pattern: /(?:my|i)\s+(?:email|phone|number)\s+(?:is\s+)?(.+)/i, type: 'user_preference' as MemoryType, importance: 75, category: 'contact' },
  { pattern: /(?:i\s+)?prefer\s+(.+)/i, type: 'user_preference' as MemoryType, importance: 65, category: 'preference' },
  { pattern: /(?:i\s+)?always\s+(?:use|like|want)\s+(.+)/i, type: 'user_preference' as MemoryType, importance: 60, category: 'preference' },
  { pattern: /(?:i\s+)?never\s+(?:use|like|want)\s+(.+)/i, type: 'user_preference' as MemoryType, importance: 60, category: 'preference' },

  // Technical preferences
  { pattern: /(?:i\s+)?(?:use|prefer|like)\s+(?:to\s+use\s+)?(\w+)\s+(?:for|as|when)/i, type: 'user_preference' as MemoryType, importance: 55, category: 'tech' },
  { pattern: /(?:my\s+)?(?:favorite|preferred)\s+(?:\w+\s+)?(?:is|are)\s+(.+)/i, type: 'user_preference' as MemoryType, importance: 55, category: 'preference' },
  { pattern: /(?:i\s+)?(?:work|develop)\s+(?:with|in|using)\s+(.+)/i, type: 'fact' as MemoryType, importance: 50, category: 'work' },

  // Project context
  { pattern: /(?:this|the)\s+project\s+(?:is|uses)\s+(.+)/i, type: 'project_context' as MemoryType, importance: 70, category: 'project' },
  { pattern: /(?:we|i)\s+(?:are|'re)\s+(?:building|creating|making)\s+(.+)/i, type: 'project_context' as MemoryType, importance: 65, category: 'project' },

  // Decisions
  { pattern: /(?:we|i)\s+(?:decided|chose)\s+(?:to\s+)?(.+)/i, type: 'decision' as MemoryType, importance: 75, category: 'decision' },
  { pattern: /(?:let'?s|we\s+should)\s+(?:go\s+with|use)\s+(.+)/i, type: 'decision' as MemoryType, importance: 70, category: 'decision' },
];

// Solution patterns
const SOLUTION_PATTERNS = [
  /(?:here'?s?\s+)?(?:how\s+)?(?:to\s+)?(?:fix|solve|resolve)\s*[:\-]?\s*(.+)/i,
  /(?:the\s+)?solution\s+(?:is|was)\s*[:\-]?\s*(.+)/i,
  /(?:you\s+)?(?:can|should)\s+(?:fix|solve)\s+(?:this|it)\s+by\s+(.+)/i,
  /(?:try|use)\s+(?:this|the\s+following)\s*[:\-]?\s*(.+)/i,
];

// Error patterns
const ERROR_PATTERNS = [
  /error\s*[:\-]?\s*(.+)/i,
  /exception\s*[:\-]?\s*(.+)/i,
  /failed\s+(?:to|with)\s+(.+)/i,
  /(?:bug|issue)\s+(?:with|in)\s+(.+)/i,
];

// ============================================================================
// Memory Extractor Class
// ============================================================================

export class MemoryExtractor {
  private memoryService: MemoryService;

  constructor(memoryService?: MemoryService) {
    this.memoryService = memoryService || getMemoryService();
  }

  /**
   * Check if message contains explicit remember command
   */
  detectRememberCommand(message: string): { isCommand: boolean; content: string | null } {
    for (const pattern of REMEMBER_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        return { isCommand: true, content: match[1].trim() };
      }
    }
    return { isCommand: false, content: null };
  }

  /**
   * Check if message contains explicit forget command
   */
  detectForgetCommand(message: string): { isCommand: boolean; content: string | null } {
    for (const pattern of FORGET_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        return { isCommand: true, content: match[1].trim() };
      }
    }
    return { isCommand: false, content: null };
  }

  /**
   * Extract facts from a message
   */
  extractFacts(message: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];

    for (const { pattern, type, importance, category } of FACT_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        const content = match[1]?.trim();
        if (content && content.length > 2) {
          facts.push({
            content: `${category}: ${content}`,
            type,
            importance,
            tags: [category, type],
            metadata: { category, extractedFrom: 'pattern' },
          });
        }
      }
    }

    return facts;
  }

  /**
   * Detect user preferences from behavior and messages
   */
  detectPreferences(messages: ConversationMessage[]): PreferenceDetection[] {
    const preferences: PreferenceDetection[] = [];
    const userMessages = messages.filter(m => m.role === 'user');

    // Analyze word frequencies
    const wordFreq = new Map<string, number>();
    for (const msg of userMessages) {
      const words = msg.content.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3) {
          wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }
      }
    }

    // Detect language preferences
    const codePatterns = [
      { pattern: /typescript|\.ts\b/i, lang: 'TypeScript' },
      { pattern: /javascript|\.js\b/i, lang: 'JavaScript' },
      { pattern: /python|\.py\b/i, lang: 'Python' },
      { pattern: /react|jsx|tsx/i, lang: 'React' },
      { pattern: /vue|\.vue\b/i, lang: 'Vue' },
      { pattern: /angular/i, lang: 'Angular' },
      { pattern: /tailwind/i, lang: 'Tailwind CSS' },
    ];

    const langMentions = new Map<string, number>();
    for (const msg of userMessages) {
      for (const { pattern, lang } of codePatterns) {
        if (pattern.test(msg.content)) {
          langMentions.set(lang, (langMentions.get(lang) || 0) + 1);
        }
      }
    }

    // Add detected preferences
    for (const [lang, count] of langMentions) {
      if (count >= 2) {
        preferences.push({
          key: `preferred_language_${lang.toLowerCase().replace(/\s+/g, '_')}`,
          value: lang,
          category: 'coding_style',
          confidence: Math.min(0.9, 0.3 + count * 0.1),
          source: 'usage_pattern',
        });
      }
    }

    // Detect communication style preferences
    const avgLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / (userMessages.length || 1);
    if (avgLength > 200) {
      preferences.push({
        key: 'prefers_detailed_responses',
        value: true,
        category: 'communication',
        confidence: 0.6,
        source: 'message_length',
      });
    } else if (avgLength < 50) {
      preferences.push({
        key: 'prefers_concise_responses',
        value: true,
        category: 'communication',
        confidence: 0.6,
        source: 'message_length',
      });
    }

    return preferences;
  }

  /**
   * Summarize a conversation
   */
  summarizeConversation(messages: ConversationMessage[]): string {
    if (messages.length === 0) return '';

    // Extract key topics
    const topics = new Set<string>();
    const actions: string[] = [];

    for (const msg of messages) {
      // Extract code-related topics
      const codeMatches = msg.content.match(/`([^`]+)`/g);
      if (codeMatches) {
        for (const match of codeMatches.slice(0, 5)) {
          topics.add(match.replace(/`/g, ''));
        }
      }

      // Extract action items
      if (msg.role === 'assistant') {
        const actionMatches = msg.content.match(/(?:created|updated|modified|added|removed|fixed|implemented)\s+[^.!?]+/gi);
        if (actionMatches) {
          actions.push(...actionMatches.slice(0, 3));
        }
      }
    }

    // Build summary
    const parts: string[] = [];

    if (topics.size > 0) {
      parts.push(`Topics: ${Array.from(topics).slice(0, 10).join(', ')}`);
    }

    if (actions.length > 0) {
      parts.push(`Actions: ${actions.slice(0, 5).join('; ')}`);
    }

    // Add first user message as context
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser) {
      const truncated = firstUser.content.length > 200
        ? firstUser.content.substring(0, 200) + '...'
        : firstUser.content;
      parts.push(`Started with: "${truncated}"`);
    }

    return parts.join('\n');
  }

  /**
   * Extract error resolution from conversation
   */
  extractErrorResolution(messages: ConversationMessage[]): ExtractedFact | null {
    let errorContent: string | null = null;
    let solutionContent: string | null = null;

    for (const msg of messages) {
      if (msg.role === 'user') {
        for (const pattern of ERROR_PATTERNS) {
          const match = msg.content.match(pattern);
          if (match) {
            errorContent = match[1]?.trim() || msg.content.substring(0, 500);
            break;
          }
        }
      }

      if (msg.role === 'assistant' && errorContent) {
        for (const pattern of SOLUTION_PATTERNS) {
          const match = msg.content.match(pattern);
          if (match) {
            solutionContent = match[1]?.trim() || msg.content.substring(0, 500);
            break;
          }
        }
      }
    }

    if (errorContent && solutionContent) {
      return {
        content: `Error: ${errorContent}\n\nSolution: ${solutionContent}`,
        type: 'error_resolution',
        importance: 70,
        tags: ['error', 'solution', 'troubleshooting'],
        metadata: {
          error: errorContent,
          solution: solutionContent,
        },
      };
    }

    return null;
  }

  /**
   * Extract code patterns from messages
   */
  extractCodePatterns(messages: ConversationMessage[]): ExtractedFact[] {
    const patterns: ExtractedFact[] = [];

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;

      // Extract code blocks
      const codeBlocks = msg.content.match(/```[\s\S]*?```/g);
      if (!codeBlocks) continue;

      for (const block of codeBlocks.slice(0, 3)) {
        // Detect language
        const langMatch = block.match(/```(\w+)/);
        const lang = langMatch?.[1] || 'unknown';

        // Extract meaningful code patterns
        const code = block.replace(/```\w*\n?/g, '').trim();
        if (code.length < 50 || code.length > 2000) continue;

        // Check if it's a reusable pattern
        const isReusable =
          code.includes('function') ||
          code.includes('class') ||
          code.includes('const') ||
          code.includes('export') ||
          code.includes('import');

        if (isReusable) {
          patterns.push({
            content: code,
            type: 'code_pattern',
            importance: 55,
            tags: [lang, 'code', 'pattern'],
            metadata: { language: lang, codeType: 'snippet' },
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Full extraction from conversation
   */
  async extractFromConversation(
    userId: string,
    messages: ConversationMessage[],
    options: {
      extractFacts?: boolean;
      extractPreferences?: boolean;
      extractSummary?: boolean;
      extractPatterns?: boolean;
    } = {}
  ): Promise<ExtractionResult> {
    const {
      extractFacts = true,
      extractPreferences = true,
      extractSummary = true,
      extractPatterns = true,
    } = options;

    const result: ExtractionResult = {
      facts: [],
      preferences: [],
      shouldRemember: false,
    };

    // Check for explicit commands in user messages
    for (const msg of messages) {
      if (msg.role !== 'user') continue;

      const rememberCmd = this.detectRememberCommand(msg.content);
      if (rememberCmd.isCommand && rememberCmd.content) {
        result.facts.push({
          content: rememberCmd.content,
          type: 'fact',
          importance: 90,
          tags: ['explicit', 'user-requested'],
          metadata: { source: 'explicit_command' },
        });
        result.shouldRemember = true;
      }
    }

    // Extract facts
    if (extractFacts) {
      for (const msg of messages) {
        if (msg.role === 'user') {
          const facts = this.extractFacts(msg.content);
          result.facts.push(...facts);
        }
      }

      // Extract error resolutions
      const errorResolution = this.extractErrorResolution(messages);
      if (errorResolution) {
        result.facts.push(errorResolution);
        result.shouldRemember = true;
      }
    }

    // Detect preferences
    if (extractPreferences) {
      result.preferences = this.detectPreferences(messages);
    }

    // Generate summary
    if (extractSummary && messages.length >= 4) {
      result.summary = this.summarizeConversation(messages);
    }

    // Extract code patterns
    if (extractPatterns) {
      const patterns = this.extractCodePatterns(messages);
      result.facts.push(...patterns);
    }

    // Determine if we should remember
    result.shouldRemember = result.shouldRemember ||
      result.facts.length > 0 ||
      result.preferences.length > 0 ||
      !!result.summary;

    return result;
  }

  /**
   * Store extracted information
   */
  async storeExtraction(
    userId: string,
    extraction: ExtractionResult
  ): Promise<Memory[]> {
    const storedMemories: Memory[] = [];

    // Store facts
    for (const fact of extraction.facts) {
      try {
        const memory = await this.memoryService.store({
          userId,
          type: fact.type,
          content: fact.content,
          importance: fact.importance,
          tags: fact.tags,
          metadata: fact.metadata,
        });
        storedMemories.push(memory);
      } catch (err) {
        console.error('[MemoryExtractor] Failed to store fact:', err);
      }
    }

    // Store summary
    if (extraction.summary) {
      try {
        const memory = await this.memoryService.store({
          userId,
          type: 'conversation_summary',
          content: extraction.summary,
          importance: 50,
          tags: ['summary', 'conversation'],
          metadata: { source: 'auto_summary' },
        });
        storedMemories.push(memory);
      } catch (err) {
        console.error('[MemoryExtractor] Failed to store summary:', err);
      }
    }

    return storedMemories;
  }

  /**
   * Get relevant context for a query
   */
  async getRelevantContext(
    userId: string,
    query: string,
    limit: number = 5
  ): Promise<{
    memories: Memory[];
    contextPrompt: string;
  }> {
    const searchResults = await this.memoryService.search({
      query,
      userId,
      minRelevance: 0.3,
      limit,
    });

    const memories = searchResults.map(r => r.memory);

    // Build context prompt
    const contextParts: string[] = [];

    if (memories.length > 0) {
      contextParts.push('I remember some relevant information:');

      for (const memory of memories) {
        const truncated = memory.content.length > 300
          ? memory.content.substring(0, 300) + '...'
          : memory.content;
        contextParts.push(`- [${memory.type}] ${truncated}`);
      }

      contextParts.push('');
    }

    return {
      memories,
      contextPrompt: contextParts.join('\n'),
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let extractorInstance: MemoryExtractor | null = null;

export function getMemoryExtractor(memoryService?: MemoryService): MemoryExtractor {
  if (!extractorInstance) {
    extractorInstance = new MemoryExtractor(memoryService);
  }
  return extractorInstance;
}

export function createMemoryExtractor(memoryService?: MemoryService): MemoryExtractor {
  return new MemoryExtractor(memoryService);
}

export default { MemoryExtractor, getMemoryExtractor, createMemoryExtractor };
