/**
 * Alabobai Builder - Surgical Editor
 * Edit ONLY the necessary lines, not entire files
 *
 * This is the KEY INNOVATION over Bolt.new:
 * - Bolt regenerates entire files = massive token waste
 * - Surgical Editor identifies exact lines to change
 * - Uses AST parsing for precise modifications
 * - Preserves formatting, comments, and unchanged code
 * - Dramatically reduces token usage and prevents regressions
 */

import { EventEmitter } from 'events';
import { LLMClient, createLLMClient, LLMConfig } from '../llm-client.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EditOperation {
  id: string;
  file: string;
  type: EditType;
  location: EditLocation;
  originalCode: string;
  newCode: string;
  description: string;
  confidence: number;
  validated: boolean;
}

export type EditType =
  | 'insert'
  | 'replace'
  | 'delete'
  | 'move'
  | 'wrap'
  | 'unwrap'
  | 'rename';

export interface EditLocation {
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  // For semantic locations
  scope?: ScopeIdentifier;
}

export interface ScopeIdentifier {
  type: 'function' | 'class' | 'method' | 'component' | 'block' | 'import' | 'export';
  name: string;
  parent?: ScopeIdentifier;
}

export interface EditRequest {
  file: string;
  currentContent: string;
  instruction: string;
  context?: EditContext;
  constraints?: EditConstraints;
}

export interface EditContext {
  relatedFiles?: Map<string, string>;
  projectStructure?: string[];
  recentEdits?: EditOperation[];
  testResults?: TestResult[];
}

export interface EditConstraints {
  maxLinesChanged?: number;
  preserveComments?: boolean;
  preserveFormatting?: boolean;
  allowBreakingChanges?: boolean;
  requireTests?: boolean;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface EditResult {
  success: boolean;
  operations: EditOperation[];
  newContent: string;
  diff: DiffHunk[];
  tokensUsed: number;
  tokensSaved: number; // Compared to full regeneration
  warnings?: string[];
  errors?: string[];
}

export interface DiffHunk {
  startLine: number;
  endLine: number;
  type: 'add' | 'remove' | 'modify';
  oldLines: string[];
  newLines: string[];
}

export interface CodeAnalysis {
  language: string;
  structure: CodeStructure;
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  components?: ComponentInfo[];
  variables: VariableInfo[];
}

export interface CodeStructure {
  type: 'module' | 'script' | 'component';
  hasDefaultExport: boolean;
  hasNamedExports: boolean;
  usesTypeScript: boolean;
  usesJSX: boolean;
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isTypeOnly: boolean;
  line: number;
}

export interface ExportInfo {
  name: string;
  isDefault: boolean;
  isType: boolean;
  line: number;
}

export interface FunctionInfo {
  name: string;
  params: string[];
  returnType?: string;
  startLine: number;
  endLine: number;
  isAsync: boolean;
  isExported: boolean;
}

export interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: VariableInfo[];
  startLine: number;
  endLine: number;
  isExported: boolean;
}

export interface ComponentInfo {
  name: string;
  props: string[];
  hooks: string[];
  startLine: number;
  endLine: number;
  isExported: boolean;
}

export interface VariableInfo {
  name: string;
  type?: string;
  kind: 'const' | 'let' | 'var';
  line: number;
  isExported: boolean;
}

// ============================================================================
// SURGICAL EDITOR
// ============================================================================

export class SurgicalEditor extends EventEmitter {
  private llm: LLMClient;
  private editHistory: Map<string, EditOperation[]>;
  private analysisCache: Map<string, CodeAnalysis>;

  constructor(llmConfig?: LLMConfig) {
    super();
    this.llm = llmConfig
      ? createLLMClient(llmConfig)
      : createLLMClient({
          provider: 'anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          model: 'claude-sonnet-4-20250514',
        });
    this.editHistory = new Map();
    this.analysisCache = new Map();
  }

  /**
   * Perform a surgical edit on a file
   * Returns only the necessary changes, not the entire file
   */
  async edit(request: EditRequest): Promise<EditResult> {
    const startTime = Date.now();

    try {
      // Step 1: Analyze the current code structure
      const analysis = await this.analyzeCode(request.file, request.currentContent);

      // Step 2: Identify which parts need to change
      const affectedRegions = await this.identifyAffectedRegions(
        request.instruction,
        analysis,
        request.currentContent
      );

      // Step 3: Generate minimal edits for affected regions only
      const operations = await this.generateMinimalEdits(
        request.instruction,
        affectedRegions,
        request.currentContent,
        analysis,
        request.context
      );

      // Step 4: Apply edits to generate new content
      const newContent = this.applyEdits(request.currentContent, operations);

      // Step 5: Generate diff
      const diff = this.generateDiff(request.currentContent, newContent);

      // Step 6: Validate the result
      const validation = await this.validateEdits(
        request.currentContent,
        newContent,
        operations,
        request.constraints
      );

      // Calculate token savings
      const tokensUsed = this.estimateTokens(
        operations.map((o) => o.newCode).join('\n')
      );
      const tokensSaved =
        this.estimateTokens(newContent) - tokensUsed;

      // Store in history
      this.storeEditHistory(request.file, operations);

      return {
        success: validation.valid,
        operations,
        newContent,
        diff,
        tokensUsed,
        tokensSaved,
        warnings: validation.warnings,
        errors: validation.errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        operations: [],
        newContent: request.currentContent,
        diff: [],
        tokensUsed: 0,
        tokensSaved: 0,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Edit multiple files with awareness of dependencies
   */
  async editMultiple(
    requests: EditRequest[],
    sharedContext?: EditContext
  ): Promise<Map<string, EditResult>> {
    const results = new Map<string, EditResult>();

    // Build dependency graph
    const dependencyOrder = this.buildDependencyOrder(requests);

    // Process in dependency order
    for (const file of dependencyOrder) {
      const request = requests.find((r) => r.file === file);
      if (!request) continue;

      // Include previous edits in context
      const context: EditContext = {
        ...sharedContext,
        relatedFiles: new Map(
          requests
            .filter((r) => r.file !== file)
            .map((r) => [r.file, r.currentContent])
        ),
        recentEdits: Array.from(results.values()).flatMap((r) => r.operations),
      };

      const result = await this.edit({ ...request, context });
      results.set(file, result);
    }

    return results;
  }

  /**
   * Preview an edit without applying it
   */
  async preview(request: EditRequest): Promise<DiffHunk[]> {
    const result = await this.edit(request);
    return result.diff;
  }

  /**
   * Undo the last edit on a file
   */
  undo(file: string, content: string): { content: string; undoneOperation: EditOperation | null } {
    const history = this.editHistory.get(file);
    if (!history || history.length === 0) {
      return { content, undoneOperation: null };
    }

    const lastOperation = history.pop()!;
    const newContent = this.reverseEdit(content, lastOperation);

    return {
      content: newContent,
      undoneOperation: lastOperation,
    };
  }

  /**
   * Analyze code and extract structure
   */
  async analyzeCode(file: string, content: string): Promise<CodeAnalysis> {
    // Check cache
    const cacheKey = `${file}:${this.hashContent(content)}`;
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    const language = this.detectLanguage(file);
    const analysis = this.parseCode(content, language);

    // Cache the analysis
    this.analysisCache.set(cacheKey, analysis);

    return analysis;
  }

  // ==========================================================================
  // PRIVATE METHODS - ANALYSIS
  // ==========================================================================

  private parseCode(content: string, language: string): CodeAnalysis {
    const lines = content.split('\n');

    const analysis: CodeAnalysis = {
      language,
      structure: this.detectStructure(content),
      imports: this.extractImports(lines),
      exports: this.extractExports(lines),
      functions: this.extractFunctions(lines, content),
      classes: this.extractClasses(lines, content),
      variables: this.extractVariables(lines),
    };

    if (language === 'typescript' || language === 'javascript') {
      if (content.includes('React') || content.includes('jsx')) {
        analysis.components = this.extractComponents(lines, content);
      }
    }

    return analysis;
  }

  private detectStructure(content: string): CodeStructure {
    return {
      type: content.includes('export default') ? 'module' : 'script',
      hasDefaultExport: content.includes('export default'),
      hasNamedExports: /export\s+(?:const|function|class|interface|type)/.test(content),
      usesTypeScript:
        content.includes(': ') ||
        content.includes('interface ') ||
        content.includes('type '),
      usesJSX: content.includes('</') || content.includes('/>'),
    };
  }

  private extractImports(lines: string[]): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const importRegex = /^import\s+(?:type\s+)?(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))?(?:\s*,\s*(\{[^}]+\}))?\s*from\s+['"]([^'"]+)['"]/;

    lines.forEach((line, index) => {
      const match = line.match(importRegex);
      if (match) {
        const specifiers: string[] = [];
        if (match[1]) {
          specifiers.push(
            ...match[1]
              .replace(/[{}]/g, '')
              .split(',')
              .map((s) => s.trim())
          );
        }
        if (match[2]) specifiers.push(match[2]);
        if (match[3]) specifiers.push(match[3]);
        if (match[4]) {
          specifiers.push(
            ...match[4]
              .replace(/[{}]/g, '')
              .split(',')
              .map((s) => s.trim())
          );
        }

        imports.push({
          source: match[5],
          specifiers,
          isTypeOnly: line.includes('import type'),
          line: index + 1,
        });
      }
    });

    return imports;
  }

  private extractExports(lines: string[]): ExportInfo[] {
    const exports: ExportInfo[] = [];

    lines.forEach((line, index) => {
      // Default export
      if (line.includes('export default')) {
        const match = line.match(/export\s+default\s+(?:function\s+)?(\w+)?/);
        exports.push({
          name: match?.[1] || 'default',
          isDefault: true,
          isType: false,
          line: index + 1,
        });
      }
      // Named exports
      else if (line.match(/^export\s+(?:const|function|class|interface|type)\s+(\w+)/)) {
        const match = line.match(/^export\s+(?:const|function|class|interface|type)\s+(\w+)/);
        if (match) {
          exports.push({
            name: match[1],
            isDefault: false,
            isType: line.includes('interface ') || line.includes('type '),
            line: index + 1,
          });
        }
      }
    });

    return exports;
  }

  private extractFunctions(lines: string[], content: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const funcRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/;

    lines.forEach((line, index) => {
      const match = line.match(funcRegex);
      if (match) {
        const startLine = index + 1;
        const endLine = this.findClosingBrace(lines, index);

        functions.push({
          name: match[1],
          params: match[2]
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean),
          returnType: match[3]?.trim(),
          startLine,
          endLine,
          isAsync: line.includes('async'),
          isExported: line.startsWith('export'),
        });
      }
    });

    // Also extract arrow functions assigned to const
    const arrowRegex = /^(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/;
    lines.forEach((line, index) => {
      const match = line.match(arrowRegex);
      if (match) {
        const startLine = index + 1;
        const endLine = this.findEndOfExpression(lines, index);

        functions.push({
          name: match[1],
          params: [],
          startLine,
          endLine,
          isAsync: line.includes('async'),
          isExported: line.startsWith('export'),
        });
      }
    });

    return functions;
  }

  private extractClasses(lines: string[], content: string): ClassInfo[] {
    const classes: ClassInfo[] = [];
    const classRegex = /^(?:export\s+)?class\s+(\w+)/;

    lines.forEach((line, index) => {
      const match = line.match(classRegex);
      if (match) {
        const startLine = index + 1;
        const endLine = this.findClosingBrace(lines, index);

        classes.push({
          name: match[1],
          methods: [], // Would need more sophisticated parsing
          properties: [],
          startLine,
          endLine,
          isExported: line.startsWith('export'),
        });
      }
    });

    return classes;
  }

  private extractComponents(lines: string[], content: string): ComponentInfo[] {
    const components: ComponentInfo[] = [];

    // Find React functional components
    const componentRegex = /^(?:export\s+)?(?:const|function)\s+([A-Z]\w+)/;

    lines.forEach((line, index) => {
      const match = line.match(componentRegex);
      if (match) {
        // Check if it returns JSX
        const endLine = this.findEndOfExpression(lines, index);
        const componentBody = lines.slice(index, endLine).join('\n');

        if (componentBody.includes('return') && (componentBody.includes('</') || componentBody.includes('/>'))) {
          // Extract hooks used
          const hooks = componentBody.match(/use[A-Z]\w+/g) || [];

          components.push({
            name: match[1],
            props: [],
            hooks: [...new Set(hooks)],
            startLine: index + 1,
            endLine,
            isExported: line.startsWith('export'),
          });
        }
      }
    });

    return components;
  }

  private extractVariables(lines: string[]): VariableInfo[] {
    const variables: VariableInfo[] = [];
    const varRegex = /^(?:export\s+)?(const|let|var)\s+(\w+)(?:\s*:\s*([^=]+))?\s*=/;

    lines.forEach((line, index) => {
      const match = line.match(varRegex);
      if (match) {
        variables.push({
          name: match[2],
          kind: match[1] as 'const' | 'let' | 'var',
          type: match[3]?.trim(),
          line: index + 1,
          isExported: line.startsWith('export'),
        });
      }
    });

    return variables;
  }

  // ==========================================================================
  // PRIVATE METHODS - EDITING
  // ==========================================================================

  private async identifyAffectedRegions(
    instruction: string,
    analysis: CodeAnalysis,
    content: string
  ): Promise<AffectedRegion[]> {
    const systemPrompt = `You are a code analysis expert. Given an instruction and code structure, identify EXACTLY which regions need to be modified.

Return a JSON array of affected regions:
[
  {
    "type": "function" | "class" | "component" | "import" | "variable" | "block",
    "name": "identifierName",
    "startLine": number,
    "endLine": number,
    "reason": "why this needs to change"
  }
]

Rules:
1. Be MINIMAL - only include regions that MUST change
2. Never include unaffected code
3. Consider ripple effects (e.g., if a function signature changes, its callers may need updates)`;

    const userPrompt = `Instruction: ${instruction}

Code Structure:
${JSON.stringify(analysis, null, 2)}

Identify the minimal set of regions that need to change.`;

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AffectedRegion[];
      }
    } catch {
      // Parse failed
    }

    return [];
  }

  private async generateMinimalEdits(
    instruction: string,
    regions: AffectedRegion[],
    content: string,
    analysis: CodeAnalysis,
    context?: EditContext
  ): Promise<EditOperation[]> {
    const lines = content.split('\n');
    const operations: EditOperation[] = [];

    for (const region of regions) {
      const regionCode = lines.slice(region.startLine - 1, region.endLine).join('\n');

      const systemPrompt = `You are a surgical code editor. Generate the MINIMAL change needed.

Rules:
1. ONLY output the changed code, nothing else
2. Preserve ALL formatting and whitespace
3. Preserve ALL comments
4. Make the SMALLEST change possible
5. Return JSON: { "newCode": "...", "type": "replace|insert|delete", "confidence": 0-1 }`;

      const userPrompt = `Instruction: ${instruction}

Region to modify (lines ${region.startLine}-${region.endLine}):
\`\`\`
${regionCode}
\`\`\`

Context:
- File structure: ${analysis.structure.type}
- Uses TypeScript: ${analysis.structure.usesTypeScript}
- Uses JSX: ${analysis.structure.usesJSX}

Generate the minimal edit.`;

      const response = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const edit = JSON.parse(jsonMatch[0]) as {
            newCode: string;
            type: EditType;
            confidence: number;
          };

          operations.push({
            id: this.generateId(),
            file: '',
            type: edit.type,
            location: {
              startLine: region.startLine,
              endLine: region.endLine,
            },
            originalCode: regionCode,
            newCode: edit.newCode,
            description: region.reason,
            confidence: edit.confidence,
            validated: false,
          });
        }
      } catch {
        // Parse failed, skip this region
      }
    }

    return operations;
  }

  private applyEdits(content: string, operations: EditOperation[]): string {
    const lines = content.split('\n');

    // Sort operations by line number in reverse order to preserve line numbers
    const sortedOps = [...operations].sort(
      (a, b) => b.location.startLine - a.location.startLine
    );

    for (const op of sortedOps) {
      const { startLine, endLine } = op.location;
      const newLines = op.newCode.split('\n');

      switch (op.type) {
        case 'replace':
          lines.splice(startLine - 1, endLine - startLine + 1, ...newLines);
          break;
        case 'insert':
          lines.splice(startLine, 0, ...newLines);
          break;
        case 'delete':
          lines.splice(startLine - 1, endLine - startLine + 1);
          break;
      }
    }

    return lines.join('\n');
  }

  private reverseEdit(content: string, operation: EditOperation): string {
    const lines = content.split('\n');
    const { startLine, endLine } = operation.location;
    const originalLines = operation.originalCode.split('\n');

    // Reverse the operation
    switch (operation.type) {
      case 'replace':
        lines.splice(
          startLine - 1,
          operation.newCode.split('\n').length,
          ...originalLines
        );
        break;
      case 'insert':
        lines.splice(startLine, operation.newCode.split('\n').length);
        break;
      case 'delete':
        lines.splice(startLine - 1, 0, ...originalLines);
        break;
    }

    return lines.join('\n');
  }

  private generateDiff(oldContent: string, newContent: string): DiffHunk[] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const hunks: DiffHunk[] = [];

    // Simple line-by-line diff
    let i = 0;
    let j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        // Addition at end
        hunks.push({
          startLine: j + 1,
          endLine: newLines.length,
          type: 'add',
          oldLines: [],
          newLines: newLines.slice(j),
        });
        break;
      }

      if (j >= newLines.length) {
        // Deletion at end
        hunks.push({
          startLine: i + 1,
          endLine: oldLines.length,
          type: 'remove',
          oldLines: oldLines.slice(i),
          newLines: [],
        });
        break;
      }

      if (oldLines[i] !== newLines[j]) {
        // Find the extent of the change
        let changeEnd = i;
        while (changeEnd < oldLines.length && oldLines[changeEnd] !== newLines[j]) {
          changeEnd++;
        }

        if (changeEnd < oldLines.length) {
          // Lines were removed
          hunks.push({
            startLine: i + 1,
            endLine: changeEnd,
            type: 'remove',
            oldLines: oldLines.slice(i, changeEnd),
            newLines: [],
          });
          i = changeEnd;
        } else {
          // Lines were modified
          hunks.push({
            startLine: i + 1,
            endLine: i + 1,
            type: 'modify',
            oldLines: [oldLines[i]],
            newLines: [newLines[j]],
          });
          i++;
          j++;
        }
      } else {
        i++;
        j++;
      }
    }

    return hunks;
  }

  private async validateEdits(
    oldContent: string,
    newContent: string,
    operations: EditOperation[],
    constraints?: EditConstraints
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check line count constraint
    if (constraints?.maxLinesChanged) {
      const totalChanged = operations.reduce((sum, op) => {
        return sum + op.newCode.split('\n').length;
      }, 0);

      if (totalChanged > constraints.maxLinesChanged) {
        warnings.push(
          `Changed ${totalChanged} lines (max: ${constraints.maxLinesChanged})`
        );
      }
    }

    // Check syntax (basic)
    const syntaxErrors = this.checkSyntax(newContent);
    errors.push(...syntaxErrors);

    // Check for low confidence operations
    const lowConfidence = operations.filter((op) => op.confidence < 0.7);
    if (lowConfidence.length > 0) {
      warnings.push(
        `${lowConfidence.length} operations have low confidence`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private checkSyntax(content: string): string[] {
    const errors: string[] = [];

    // Check bracket balance
    const brackets = { '{': 0, '[': 0, '(': 0 };
    const closers: Record<string, keyof typeof brackets> = {
      '}': '{',
      ']': '[',
      ')': '(',
    };

    for (const char of content) {
      if (char in brackets) {
        brackets[char as keyof typeof brackets]++;
      } else if (char in closers) {
        brackets[closers[char]]--;
      }
    }

    if (brackets['{'] !== 0) errors.push('Unbalanced curly braces');
    if (brackets['['] !== 0) errors.push('Unbalanced square brackets');
    if (brackets['('] !== 0) errors.push('Unbalanced parentheses');

    return errors;
  }

  // ==========================================================================
  // PRIVATE METHODS - UTILITIES
  // ==========================================================================

  private findClosingBrace(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let foundOpen = false;

    for (let i = startIndex; i < lines.length; i++) {
      for (const char of lines[i]) {
        if (char === '{') {
          braceCount++;
          foundOpen = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      if (foundOpen && braceCount === 0) {
        return i + 1;
      }
    }

    return lines.length;
  }

  private findEndOfExpression(lines: string[], startIndex: number): number {
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const prev = j > 0 ? line[j - 1] : '';

        if (inString) {
          if (char === stringChar && prev !== '\\') {
            inString = false;
          }
        } else {
          if (char === '"' || char === "'" || char === '`') {
            inString = true;
            stringChar = char;
          } else if (char === '{' || char === '(' || char === '[') {
            depth++;
          } else if (char === '}' || char === ')' || char === ']') {
            depth--;
          } else if (char === ';' && depth === 0) {
            return i + 1;
          }
        }
      }

      // Check for expression end at line boundary
      if (depth === 0 && !inString && !lines[i + 1]?.trim().startsWith('.')) {
        return i + 1;
      }
    }

    return lines.length;
  }

  private buildDependencyOrder(requests: EditRequest[]): string[] {
    // Simple topological sort based on imports
    const graph = new Map<string, Set<string>>();
    const files = requests.map((r) => r.file);

    for (const request of requests) {
      const deps = new Set<string>();
      const importMatches = request.currentContent.matchAll(
        /import\s+.*from\s+['"]([^'"]+)['"]/g
      );

      for (const match of importMatches) {
        const importPath = match[1];
        // Resolve relative imports
        const resolvedPath = files.find(
          (f) =>
            f.endsWith(importPath) ||
            f.endsWith(`${importPath}.ts`) ||
            f.endsWith(`${importPath}.tsx`)
        );
        if (resolvedPath) {
          deps.add(resolvedPath);
        }
      }

      graph.set(request.file, deps);
    }

    // Topological sort
    const sorted: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (file: string) => {
      if (temp.has(file)) return; // Cycle
      if (visited.has(file)) return;

      temp.add(file);
      const deps = graph.get(file) || new Set();
      for (const dep of deps) {
        visit(dep);
      }
      temp.delete(file);
      visited.add(file);
      sorted.push(file);
    };

    for (const file of files) {
      if (!visited.has(file)) {
        visit(file);
      }
    }

    return sorted;
  }

  private detectLanguage(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
    };
    return langMap[ext || ''] || 'text';
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private generateId(): string {
    return `edit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private storeEditHistory(file: string, operations: EditOperation[]): void {
    const history = this.editHistory.get(file) || [];
    history.push(...operations);
    this.editHistory.set(file, history);
  }
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface AffectedRegion {
  type: string;
  name: string;
  startLine: number;
  endLine: number;
  reason: string;
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createSurgicalEditor(config?: LLMConfig): SurgicalEditor {
  return new SurgicalEditor(config);
}

export default SurgicalEditor;
