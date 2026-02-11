/**
 * Alabobai PDF Export Service
 * Professional PDF generation with brand styling
 */

import { GeneratedDocument, ALABOBAI_BRAND, DocumentStyles, ExportFormat } from './document-generator.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PDFExportOptions {
  format?: 'letter' | 'a4' | 'legal';
  orientation?: 'portrait' | 'landscape';
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  includePageNumbers?: boolean;
  includeTableOfContents?: boolean;
  headerOnEveryPage?: boolean;
  footerOnEveryPage?: boolean;
  compressImages?: boolean;
  quality?: 'draft' | 'standard' | 'high' | 'print';
}

export interface DOCXExportOptions {
  includeStyles?: boolean;
  compatibilityMode?: 'word2016' | 'word2019' | 'word365';
}

export interface ExportResult {
  format: ExportFormat;
  filename: string;
  mimeType: string;
  size: number;
  content: string | Buffer;
  base64?: string;
}

export interface PageLayout {
  width: number;
  height: number;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

// ============================================================================
// PAGE FORMATS
// ============================================================================

const PAGE_FORMATS: Record<string, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },    // 8.5" x 11" in points
  a4: { width: 595, height: 842 },        // 210mm x 297mm in points
  legal: { width: 612, height: 1008 },    // 8.5" x 14" in points
};

const QUALITY_SETTINGS: Record<string, { dpi: number; compression: number }> = {
  draft: { dpi: 72, compression: 0.5 },
  standard: { dpi: 150, compression: 0.7 },
  high: { dpi: 300, compression: 0.9 },
  print: { dpi: 600, compression: 1.0 },
};

// ============================================================================
// PDF GENERATOR CLASS
// ============================================================================

export class PDFExporter {
  private defaultOptions: PDFExportOptions = {
    format: 'letter',
    orientation: 'portrait',
    margins: { top: 72, right: 72, bottom: 72, left: 72 }, // 1 inch in points
    includePageNumbers: true,
    includeTableOfContents: false,
    headerOnEveryPage: true,
    footerOnEveryPage: true,
    compressImages: true,
    quality: 'standard',
  };

  /**
   * Export document to PDF format
   * Returns HTML with print-optimized styles (for browser-based PDF generation)
   */
  async exportToPDF(
    document: GeneratedDocument,
    options: PDFExportOptions = {}
  ): Promise<ExportResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const format = PAGE_FORMATS[mergedOptions.format || 'letter'];
    const quality = QUALITY_SETTINGS[mergedOptions.quality || 'standard'];

    // Generate print-optimized HTML
    const printHtml = this.generatePrintHTML(document, mergedOptions, format);

    const filename = this.generateFilename(document, 'pdf');

    return {
      format: 'pdf',
      filename,
      mimeType: 'application/pdf',
      size: printHtml.length,
      content: printHtml,
      base64: Buffer.from(printHtml).toString('base64'),
    };
  }

  /**
   * Export document to DOCX format
   * Returns XML-based DOCX content
   */
  async exportToDOCX(
    document: GeneratedDocument,
    options: DOCXExportOptions = {}
  ): Promise<ExportResult> {
    const docxContent = this.generateDOCXContent(document, options);
    const filename = this.generateFilename(document, 'docx');

    return {
      format: 'docx',
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: docxContent.length,
      content: docxContent,
      base64: Buffer.from(docxContent).toString('base64'),
    };
  }

  /**
   * Export document to HTML format
   */
  async exportToHTML(document: GeneratedDocument): Promise<ExportResult> {
    const html = document.html || this.generateBasicHTML(document);
    const filename = this.generateFilename(document, 'html');

    return {
      format: 'html',
      filename,
      mimeType: 'text/html',
      size: html.length,
      content: html,
    };
  }

  /**
   * Export document to plain text
   */
  async exportToTXT(document: GeneratedDocument): Promise<ExportResult> {
    const filename = this.generateFilename(document, 'txt');

    return {
      format: 'txt',
      filename,
      mimeType: 'text/plain',
      size: document.content.length,
      content: document.content,
    };
  }

  /**
   * Export document to Markdown
   */
  async exportToMarkdown(document: GeneratedDocument): Promise<ExportResult> {
    const markdown = this.generateMarkdown(document);
    const filename = this.generateFilename(document, 'md');

    return {
      format: 'markdown',
      filename,
      mimeType: 'text/markdown',
      size: markdown.length,
      content: markdown,
    };
  }

  /**
   * Export to any supported format
   */
  async export(
    document: GeneratedDocument,
    format: ExportFormat,
    options?: PDFExportOptions | DOCXExportOptions
  ): Promise<ExportResult> {
    switch (format) {
      case 'pdf':
        return this.exportToPDF(document, options as PDFExportOptions);
      case 'docx':
        return this.exportToDOCX(document, options as DOCXExportOptions);
      case 'html':
        return this.exportToHTML(document);
      case 'txt':
        return this.exportToTXT(document);
      case 'markdown':
        return this.exportToMarkdown(document);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate print-optimized HTML for PDF conversion
   */
  private generatePrintHTML(
    document: GeneratedDocument,
    options: PDFExportOptions,
    format: { width: number; height: number }
  ): string {
    const { width, height } = options.orientation === 'landscape'
      ? { width: format.height, height: format.width }
      : format;

    const margins = options.margins || this.defaultOptions.margins!;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${document.metadata.title} - Alabobai</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

    @page {
      size: ${width}pt ${height}pt;
      margin: ${margins.top}pt ${margins.right}pt ${margins.bottom}pt ${margins.left}pt;

      @top-center {
        content: "${options.headerOnEveryPage ? document.metadata.title : ''}";
        font-family: Inter, sans-serif;
        font-size: 9pt;
        color: ${ALABOBAI_BRAND.colors.muted};
      }

      @bottom-center {
        content: ${options.includePageNumbers ? '"Page " counter(page) " of " counter(pages)' : '""'};
        font-family: Inter, sans-serif;
        font-size: 9pt;
        color: ${ALABOBAI_BRAND.colors.muted};
      }

      @bottom-right {
        content: "${options.footerOnEveryPage ? 'Generated by Alabobai' : ''}";
        font-family: Inter, sans-serif;
        font-size: 8pt;
        color: ${ALABOBAI_BRAND.colors.muted};
      }
    }

    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }

      body {
        margin: 0;
        padding: 0;
      }

      .page-break {
        page-break-after: always;
      }

      .no-break {
        page-break-inside: avoid;
      }
    }

    :root {
      --primary: ${ALABOBAI_BRAND.colors.primary};
      --secondary: ${ALABOBAI_BRAND.colors.secondary};
      --accent: ${ALABOBAI_BRAND.colors.accent};
      --dark: ${ALABOBAI_BRAND.colors.dark};
      --light: ${ALABOBAI_BRAND.colors.light};
      --text: ${ALABOBAI_BRAND.colors.text};
      --muted: ${ALABOBAI_BRAND.colors.muted};
    }

    body {
      font-family: Inter, system-ui, -apple-system, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: var(--text);
      background: white;
    }

    .document-header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      color: white;
      padding: 24pt 30pt;
      margin: -${margins.top}pt -${margins.right}pt 30pt -${margins.left}pt;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .logo-section {
      display: flex;
      flex-direction: column;
    }

    .logo {
      font-size: 18pt;
      font-weight: 700;
      letter-spacing: 0.15em;
      margin-bottom: 4pt;
    }

    .tagline {
      font-size: 9pt;
      opacity: 0.85;
      letter-spacing: 0.05em;
    }

    .meta-section {
      text-align: right;
      font-size: 9pt;
    }

    .meta-section div {
      margin-bottom: 3pt;
    }

    .department-badge {
      display: inline-block;
      background: rgba(255, 255, 255, 0.2);
      padding: 4pt 12pt;
      border-radius: 12pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 8pt;
      margin-top: 6pt;
    }

    .confidentiality-badge {
      display: inline-block;
      padding: 3pt 10pt;
      border-radius: 10pt;
      font-size: 7pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 6pt;
    }

    .confidentiality-public { background: #D1FAE5; color: #065F46; }
    .confidentiality-internal { background: #DBEAFE; color: #1E40AF; }
    .confidentiality-confidential { background: #FEF3C7; color: #92400E; }
    .confidentiality-restricted { background: #FEE2E2; color: #991B1B; }

    .document-title {
      font-size: 20pt;
      font-weight: 700;
      color: var(--dark);
      margin-bottom: 18pt;
      padding-bottom: 12pt;
      border-bottom: 3pt solid var(--primary);
    }

    .document-content {
      white-space: pre-wrap;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10pt;
      line-height: 1.6;
    }

    .document-footer {
      margin-top: 36pt;
      padding-top: 12pt;
      border-top: 1pt solid var(--light);
      color: var(--muted);
      font-size: 8pt;
      display: flex;
      justify-content: space-between;
    }

    hr {
      border: none;
      margin: 18pt 0;
    }

    hr.primary {
      border-top: 2pt solid var(--primary);
    }

    hr.light {
      border-top: 1pt solid var(--light);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0;
    }

    th, td {
      padding: 8pt 12pt;
      text-align: left;
      border-bottom: 1pt solid var(--light);
    }

    th {
      background: var(--light);
      font-weight: 600;
      color: var(--dark);
    }

    .highlight {
      background: var(--light);
      padding: 2pt 6pt;
      border-radius: 3pt;
    }

    .signature-block {
      margin-top: 36pt;
      page-break-inside: avoid;
    }

    .signature-line {
      border-bottom: 1pt solid var(--text);
      width: 250pt;
      margin-bottom: 6pt;
    }
  </style>
</head>
<body>
  <header class="document-header">
    <div class="logo-section">
      <div class="logo">${ALABOBAI_BRAND.logo.text}</div>
      <div class="tagline">${ALABOBAI_BRAND.logo.tagline}</div>
    </div>
    <div class="meta-section">
      <div>Document ID: ${document.metadata.id}</div>
      <div>Date: ${document.metadata.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}</div>
      <div class="department-badge">${document.metadata.department}</div>
      <div class="confidentiality-badge confidentiality-${document.metadata.confidentiality}">
        ${document.metadata.confidentiality}
      </div>
    </div>
  </header>

  <h1 class="document-title">${document.metadata.title}</h1>

  <div class="document-content">${this.formatContentForPrint(document.content)}</div>

  <footer class="document-footer">
    <div>Alabobai AI-Powered Business Platform</div>
    <div>Version ${document.metadata.version}</div>
    <div>${new Date().toISOString().split('T')[0]}</div>
  </footer>
</body>
</html>`;
  }

  /**
   * Format content for print output
   */
  private formatContentForPrint(content: string): string {
    let formatted = this.escapeHtml(content);

    // Convert horizontal rules
    formatted = formatted.replace(/={4,}/g, '<hr class="primary">');
    formatted = formatted.replace(/-{4,}/g, '<hr class="light">');

    // Bold text
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic text
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    return formatted;
  }

  /**
   * Generate DOCX content (simplified XML format)
   */
  private generateDOCXContent(document: GeneratedDocument, options: DOCXExportOptions): string {
    // This generates a Word-compatible XML document
    // In production, you would use a library like docx or officegen

    const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml"
                xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Title"/>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="48"/>
          <w:color w:val="${ALABOBAI_BRAND.colors.primary.replace('#', '')}"/>
        </w:rPr>
        <w:t>${ALABOBAI_BRAND.logo.text}</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="32"/>
        </w:rPr>
        <w:t>${this.escapeXml(document.metadata.title)}</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr>
        <w:pStyle w:val="Subtitle"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:i/>
          <w:color w:val="${ALABOBAI_BRAND.colors.muted.replace('#', '')}"/>
        </w:rPr>
        <w:t>${document.metadata.department.toUpperCase()} DEPARTMENT | ${document.metadata.createdAt.toLocaleDateString()}</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:r>
        <w:t></w:t>
      </w:r>
    </w:p>

    ${this.contentToDocxParagraphs(document.content)}

    <w:p>
      <w:pPr>
        <w:pBdr>
          <w:top w:val="single" w:sz="6" w:space="1" w:color="${ALABOBAI_BRAND.colors.light.replace('#', '')}"/>
        </w:pBdr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:sz w:val="16"/>
          <w:color w:val="${ALABOBAI_BRAND.colors.muted.replace('#', '')}"/>
        </w:rPr>
        <w:t>Document ID: ${document.metadata.id} | Generated by Alabobai | Version ${document.metadata.version}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:wordDocument>`;

    return docxXml;
  }

  /**
   * Convert content to DOCX paragraphs
   */
  private contentToDocxParagraphs(content: string): string {
    const lines = content.split('\n');

    return lines.map(line => {
      const escapedLine = this.escapeXml(line);
      const isHeading = line.match(/^[A-Z][A-Z\s]+$/);
      const isBold = line.includes('**');

      return `
    <w:p>
      <w:pPr>
        ${isHeading ? '<w:pStyle w:val="Heading2"/>' : ''}
      </w:pPr>
      <w:r>
        <w:rPr>
          ${isHeading || isBold ? '<w:b/>' : ''}
        </w:rPr>
        <w:t xml:space="preserve">${escapedLine.replace(/\*\*/g, '')}</w:t>
      </w:r>
    </w:p>`;
    }).join('\n');
  }

  /**
   * Generate basic HTML
   */
  private generateBasicHTML(document: GeneratedDocument): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${document.metadata.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: ${ALABOBAI_BRAND.colors.primary}; }
    pre { white-space: pre-wrap; font-family: monospace; }
  </style>
</head>
<body>
  <h1>${document.metadata.title}</h1>
  <pre>${this.escapeHtml(document.content)}</pre>
</body>
</html>`;
  }

  /**
   * Generate Markdown
   */
  private generateMarkdown(document: GeneratedDocument): string {
    const md = `# ${document.metadata.title}

**Department:** ${document.metadata.department}
**Document ID:** ${document.metadata.id}
**Generated:** ${document.metadata.createdAt.toISOString()}
**Confidentiality:** ${document.metadata.confidentiality}

---

\`\`\`
${document.content}
\`\`\`

---

*Generated by [Alabobai](https://alabobai.com) - AI-Powered Business Platform*
`;
    return md;
  }

  /**
   * Generate filename
   */
  private generateFilename(document: GeneratedDocument, extension: string): string {
    const title = document.metadata.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const date = document.metadata.createdAt.toISOString().split('T')[0];
    return `${title}-${date}.${extension}`;
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
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

// ============================================================================
// DOCUMENT CONVERTER
// ============================================================================

export class DocumentConverter {
  private exporter: PDFExporter;

  constructor() {
    this.exporter = new PDFExporter();
  }

  /**
   * Convert document between formats
   */
  async convert(
    document: GeneratedDocument,
    fromFormat: ExportFormat,
    toFormat: ExportFormat
  ): Promise<ExportResult> {
    // For now, we just export to the target format
    // In a full implementation, you might parse the source format first
    return this.exporter.export(document, toFormat);
  }

  /**
   * Batch convert multiple documents
   */
  async batchConvert(
    documents: GeneratedDocument[],
    toFormat: ExportFormat
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = [];

    for (const doc of documents) {
      const result = await this.exporter.export(doc, toFormat);
      results.push(result);
    }

    return results;
  }
}

// ============================================================================
// PRINT SERVICE
// ============================================================================

export class PrintService {
  private exporter: PDFExporter;

  constructor() {
    this.exporter = new PDFExporter();
  }

  /**
   * Generate print-ready document
   */
  async preparePrint(
    document: GeneratedDocument,
    options: PDFExportOptions = {}
  ): Promise<{ html: string; filename: string }> {
    const result = await this.exporter.exportToPDF(document, {
      ...options,
      quality: 'print',
    });

    return {
      html: result.content as string,
      filename: result.filename,
    };
  }

  /**
   * Generate print preview
   */
  async preview(document: GeneratedDocument): Promise<string> {
    const result = await this.exporter.exportToPDF(document, {
      quality: 'draft',
      includePageNumbers: true,
    });

    return result.content as string;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new PDF exporter instance
 */
export function createPDFExporter(): PDFExporter {
  return new PDFExporter();
}

/**
 * Create a new document converter instance
 */
export function createDocumentConverter(): DocumentConverter {
  return new DocumentConverter();
}

/**
 * Create a new print service instance
 */
export function createPrintService(): PrintService {
  return new PrintService();
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick export to PDF
 */
export async function exportToPDF(
  document: GeneratedDocument,
  options?: PDFExportOptions
): Promise<ExportResult> {
  const exporter = new PDFExporter();
  return exporter.exportToPDF(document, options);
}

/**
 * Quick export to DOCX
 */
export async function exportToDOCX(
  document: GeneratedDocument,
  options?: DOCXExportOptions
): Promise<ExportResult> {
  const exporter = new PDFExporter();
  return exporter.exportToDOCX(document, options);
}

/**
 * Quick export to any format
 */
export async function exportDocument(
  document: GeneratedDocument,
  format: ExportFormat,
  options?: PDFExportOptions | DOCXExportOptions
): Promise<ExportResult> {
  const exporter = new PDFExporter();
  return exporter.export(document, format, options);
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default PDFExporter;
