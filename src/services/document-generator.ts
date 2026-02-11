/**
 * Alabobai Document Generation Engine
 * Professional document generator for all 12 departments
 */

import { LEGAL_TEMPLATES, LegalTemplateKey } from '../templates/legal/index.js';
import { FINANCE_TEMPLATES, FinanceTemplateKey } from '../templates/finance/index.js';
import { EXECUTIVE_TEMPLATES, ExecutiveTemplateKey } from '../templates/executive/index.js';
import { FUNDING_TEMPLATES, FundingTemplateKey } from '../templates/funding/index.js';
import { MARKETING_TEMPLATES, MarketingTemplateKey } from '../templates/marketing/index.js';
import { HR_TEMPLATES, HRTemplateKey } from '../templates/hr/index.js';

// ============================================================================
// BRAND CONFIGURATION
// ============================================================================

export const ALABOBAI_BRAND = {
  name: 'Alabobai',
  colors: {
    primary: '#6366F1',      // Indigo-500
    secondary: '#8B5CF6',    // Violet-500
    accent: '#EC4899',       // Pink-500
    dark: '#1E1B4B',         // Indigo-950
    light: '#E0E7FF',        // Indigo-100
    success: '#10B981',      // Emerald-500
    warning: '#F59E0B',      // Amber-500
    error: '#EF4444',        // Red-500
    text: '#1F2937',         // Gray-800
    muted: '#6B7280',        // Gray-500
    background: '#F9FAFB',   // Gray-50
  },
  fonts: {
    heading: 'Inter, system-ui, sans-serif',
    body: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
  logo: {
    text: 'ALABOBAI',
    tagline: 'AI-Powered Business Platform',
  },
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ExportFormat = 'pdf' | 'docx' | 'html' | 'txt' | 'markdown';

export type Department =
  | 'legal'
  | 'finance'
  | 'executive'
  | 'funding'
  | 'marketing'
  | 'hr'
  | 'engineering'
  | 'product'
  | 'sales'
  | 'support'
  | 'operations'
  | 'research';

export type TemplateKey =
  | LegalTemplateKey
  | FinanceTemplateKey
  | ExecutiveTemplateKey
  | FundingTemplateKey
  | MarketingTemplateKey
  | HRTemplateKey;

export interface DocumentMetadata {
  id: string;
  title: string;
  department: Department;
  templateKey: TemplateKey;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  author?: string;
  confidentiality?: 'public' | 'internal' | 'confidential' | 'restricted';
  tags?: string[];
}

export interface GeneratedDocument {
  metadata: DocumentMetadata;
  content: string;
  html?: string;
  styles?: DocumentStyles;
}

export interface DocumentStyles {
  headerColor: string;
  accentColor: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  margins: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}

export interface GenerateOptions {
  format?: ExportFormat;
  includeHeader?: boolean;
  includeFooter?: boolean;
  includeWatermark?: boolean;
  confidentiality?: 'public' | 'internal' | 'confidential' | 'restricted';
  customStyles?: Partial<DocumentStyles>;
}

// ============================================================================
// TEMPLATE REGISTRY
// ============================================================================

const TEMPLATE_REGISTRY: Record<Department, Record<string, any>> = {
  legal: LEGAL_TEMPLATES,
  finance: FINANCE_TEMPLATES,
  executive: EXECUTIVE_TEMPLATES,
  funding: FUNDING_TEMPLATES,
  marketing: MARKETING_TEMPLATES,
  hr: HR_TEMPLATES,
  // Placeholder departments - to be implemented
  engineering: {},
  product: {},
  sales: {},
  support: {},
  operations: {},
  research: {},
};

// ============================================================================
// DOCUMENT GENERATOR CLASS
// ============================================================================

export class DocumentGenerator {
  private defaultStyles: DocumentStyles = {
    headerColor: ALABOBAI_BRAND.colors.primary,
    accentColor: ALABOBAI_BRAND.colors.secondary,
    fontFamily: ALABOBAI_BRAND.fonts.body,
    fontSize: '12pt',
    lineHeight: '1.6',
    margins: {
      top: '1in',
      right: '1in',
      bottom: '1in',
      left: '1in',
    },
  };

  /**
   * Generate a document from a template
   */
  generate<T extends object>(
    department: Department,
    templateKey: string,
    data: T,
    options: GenerateOptions = {}
  ): GeneratedDocument {
    const templates = TEMPLATE_REGISTRY[department];
    if (!templates) {
      throw new Error(`Department not found: ${department}`);
    }

    const template = templates[templateKey];
    if (!template) {
      throw new Error(`Template not found: ${templateKey} in department ${department}`);
    }

    // Generate the raw content
    const content = template.generate(data);

    // Create document metadata
    const metadata: DocumentMetadata = {
      id: this.generateId(),
      title: template.name || templateKey,
      department,
      templateKey: templateKey as TemplateKey,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      confidentiality: options.confidentiality || 'internal',
    };

    // Apply styles
    const styles = {
      ...this.defaultStyles,
      ...options.customStyles,
    };

    // Generate HTML version if needed
    const html = this.contentToHtml(content, metadata, styles, options);

    return {
      metadata,
      content,
      html,
      styles,
    };
  }

  /**
   * Convert plain text content to styled HTML
   */
  private contentToHtml(
    content: string,
    metadata: DocumentMetadata,
    styles: DocumentStyles,
    options: GenerateOptions
  ): string {
    const escapedContent = this.escapeHtml(content);
    const formattedContent = this.formatContent(escapedContent);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${metadata.title} - Alabobai</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    :root {
      --primary: ${ALABOBAI_BRAND.colors.primary};
      --secondary: ${ALABOBAI_BRAND.colors.secondary};
      --accent: ${ALABOBAI_BRAND.colors.accent};
      --dark: ${ALABOBAI_BRAND.colors.dark};
      --light: ${ALABOBAI_BRAND.colors.light};
      --text: ${ALABOBAI_BRAND.colors.text};
      --muted: ${ALABOBAI_BRAND.colors.muted};
      --background: ${ALABOBAI_BRAND.colors.background};
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: ${styles.fontFamily};
      font-size: ${styles.fontSize};
      line-height: ${styles.lineHeight};
      color: var(--text);
      background: white;
      padding: ${styles.margins.top} ${styles.margins.right} ${styles.margins.bottom} ${styles.margins.left};
    }

    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }

    .document-header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      color: white;
      padding: 2rem;
      margin: -1in -1in 2rem -1in;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .document-header .logo {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.1em;
    }

    .document-header .meta {
      text-align: right;
      font-size: 0.875rem;
      opacity: 0.9;
    }

    .document-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--dark);
      margin-bottom: 1.5rem;
      padding-bottom: 0.75rem;
      border-bottom: 3px solid var(--primary);
    }

    .document-content {
      white-space: pre-wrap;
      font-family: ${ALABOBAI_BRAND.fonts.mono};
      font-size: 11pt;
      line-height: 1.5;
    }

    .document-footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--light);
      color: var(--muted);
      font-size: 0.75rem;
      display: flex;
      justify-content: space-between;
    }

    .confidentiality-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .confidentiality-public { background: #D1FAE5; color: #065F46; }
    .confidentiality-internal { background: #DBEAFE; color: #1E40AF; }
    .confidentiality-confidential { background: #FEF3C7; color: #92400E; }
    .confidentiality-restricted { background: #FEE2E2; color: #991B1B; }

    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 6rem;
      font-weight: 700;
      color: rgba(99, 102, 241, 0.05);
      pointer-events: none;
      z-index: -1;
    }
  </style>
</head>
<body>
  ${options.includeWatermark ? `<div class="watermark">${ALABOBAI_BRAND.logo.text}</div>` : ''}

  ${options.includeHeader !== false ? `
  <header class="document-header">
    <div class="logo">${ALABOBAI_BRAND.logo.text}</div>
    <div class="meta">
      <div>${metadata.department.toUpperCase()} DEPARTMENT</div>
      <div>${metadata.createdAt.toLocaleDateString()}</div>
      <div class="confidentiality-badge confidentiality-${metadata.confidentiality}">
        ${metadata.confidentiality}
      </div>
    </div>
  </header>
  ` : ''}

  <h1 class="document-title">${metadata.title}</h1>

  <div class="document-content">${formattedContent}</div>

  ${options.includeFooter !== false ? `
  <footer class="document-footer">
    <div>Document ID: ${metadata.id}</div>
    <div>Generated by Alabobai | Version ${metadata.version}</div>
    <div>Page 1 of 1</div>
  </footer>
  ` : ''}
</body>
</html>`;
  }

  /**
   * Format content with basic styling
   */
  private formatContent(content: string): string {
    // Convert horizontal rules
    let formatted = content.replace(/={3,}/g, '<hr style="border: none; border-top: 2px solid var(--primary); margin: 1.5rem 0;">');
    formatted = formatted.replace(/-{3,}/g, '<hr style="border: none; border-top: 1px solid var(--light); margin: 1rem 0;">');

    // Bold text between ** markers
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    return formatted;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Generate a unique document ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `DOC-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * List all available templates
   */
  listTemplates(department?: Department): Array<{
    department: Department;
    key: string;
    name: string;
    description: string;
    fields: string[];
  }> {
    const templates: Array<{
      department: Department;
      key: string;
      name: string;
      description: string;
      fields: string[];
    }> = [];

    const departments = department ? [department] : Object.keys(TEMPLATE_REGISTRY) as Department[];

    for (const dept of departments) {
      const deptTemplates = TEMPLATE_REGISTRY[dept];
      for (const [key, template] of Object.entries(deptTemplates)) {
        templates.push({
          department: dept,
          key,
          name: (template as any).name || key,
          description: (template as any).description || '',
          fields: (template as any).fields || [],
        });
      }
    }

    return templates;
  }

  /**
   * Get template info
   */
  getTemplateInfo(department: Department, templateKey: string): {
    name: string;
    description: string;
    fields: string[];
  } | null {
    const templates = TEMPLATE_REGISTRY[department];
    if (!templates) return null;

    const template = templates[templateKey];
    if (!template) return null;

    return {
      name: template.name || templateKey,
      description: template.description || '',
      fields: template.fields || [],
    };
  }

  /**
   * Validate data against template requirements
   */
  validateData(department: Department, templateKey: string, data: object): {
    valid: boolean;
    missing: string[];
    extra: string[];
  } {
    const info = this.getTemplateInfo(department, templateKey);
    if (!info) {
      return { valid: false, missing: ['Template not found'], extra: [] };
    }

    const dataKeys = Object.keys(data);
    const missing = info.fields.filter((f) => !dataKeys.includes(f));
    const extra = dataKeys.filter((k) => !info.fields.includes(k));

    return {
      valid: missing.length === 0,
      missing,
      extra,
    };
  }
}

// ============================================================================
// BATCH DOCUMENT GENERATOR
// ============================================================================

export class BatchDocumentGenerator {
  private generator: DocumentGenerator;

  constructor() {
    this.generator = new DocumentGenerator();
  }

  /**
   * Generate multiple documents in batch
   */
  async generateBatch<T extends object>(
    items: Array<{
      department: Department;
      templateKey: string;
      data: T;
      options?: GenerateOptions;
    }>
  ): Promise<GeneratedDocument[]> {
    const results: GeneratedDocument[] = [];

    for (const item of items) {
      try {
        const doc = this.generator.generate(
          item.department,
          item.templateKey,
          item.data,
          item.options
        );
        results.push(doc);
      } catch (error) {
        console.error(`Failed to generate document: ${item.templateKey}`, error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Generate documents from a template with multiple data sets
   */
  async generateFromDataSet<T extends object>(
    department: Department,
    templateKey: string,
    dataSet: T[],
    options?: GenerateOptions
  ): Promise<GeneratedDocument[]> {
    return this.generateBatch(
      dataSet.map((data) => ({
        department,
        templateKey,
        data,
        options,
      }))
    );
  }
}

// ============================================================================
// DOCUMENT TEMPLATE BUILDER
// ============================================================================

export class TemplateBuilder<T extends object> {
  private name: string;
  private description: string;
  private fields: string[];
  private generator: (data: T) => string;

  constructor(name: string) {
    this.name = name;
    this.description = '';
    this.fields = [];
    this.generator = () => '';
  }

  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  setFields(fields: string[]): this {
    this.fields = fields;
    return this;
  }

  setGenerator(generator: (data: T) => string): this {
    this.generator = generator;
    return this;
  }

  build(): {
    name: string;
    description: string;
    fields: string[];
    generate: (data: T) => string;
  } {
    return {
      name: this.name,
      description: this.description,
      fields: this.fields,
      generate: this.generator,
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new document generator instance
 */
export function createDocumentGenerator(): DocumentGenerator {
  return new DocumentGenerator();
}

/**
 * Create a batch document generator instance
 */
export function createBatchGenerator(): BatchDocumentGenerator {
  return new BatchDocumentGenerator();
}

/**
 * Create a new template builder
 */
export function createTemplateBuilder<T extends object>(name: string): TemplateBuilder<T> {
  return new TemplateBuilder<T>(name);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick document generation
 */
export function generateDocument<T extends object>(
  department: Department,
  templateKey: string,
  data: T,
  options?: GenerateOptions
): GeneratedDocument {
  const generator = new DocumentGenerator();
  return generator.generate(department, templateKey, data, options);
}

/**
 * List all available templates across all departments
 */
export function listAllTemplates(): Array<{
  department: Department;
  key: string;
  name: string;
  description: string;
  fields: string[];
}> {
  const generator = new DocumentGenerator();
  return generator.listTemplates();
}

/**
 * Get department-specific templates
 */
export function listDepartmentTemplates(department: Department): Array<{
  key: string;
  name: string;
  description: string;
  fields: string[];
}> {
  const generator = new DocumentGenerator();
  return generator.listTemplates(department).map(({ key, name, description, fields }) => ({
    key,
    name,
    description,
    fields,
  }));
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default DocumentGenerator;
