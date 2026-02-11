/**
 * Alabobai Browser Automation - Vision Analyzer
 *
 * Uses Claude's vision capabilities to understand screenshots when DOM fails.
 * Provides visual element detection, OCR, and semantic understanding.
 *
 * Features:
 * - Screenshot analysis with Claude Vision
 * - Visual element detection and bounding boxes
 * - OCR for text extraction from images
 * - Semantic understanding of UI components
 * - Fallback detection when DOM selectors fail
 * - Visual diffing for change detection
 */

import Anthropic from '@anthropic-ai/sdk';
import { Page } from 'playwright';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface VisionConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface VisualElement {
  id: string;
  type: VisualElementType;
  label: string;
  description: string;
  bounds: VisualBounds;
  confidence: number;
  text?: string;
  color?: string;
  state?: 'enabled' | 'disabled' | 'focused' | 'selected' | 'loading';
  metadata?: Record<string, unknown>;
}

export type VisualElementType =
  | 'button'
  | 'link'
  | 'input'
  | 'dropdown'
  | 'checkbox'
  | 'radio'
  | 'toggle'
  | 'slider'
  | 'tab'
  | 'menu'
  | 'menuitem'
  | 'dialog'
  | 'modal'
  | 'tooltip'
  | 'card'
  | 'image'
  | 'icon'
  | 'text'
  | 'heading'
  | 'form'
  | 'table'
  | 'list'
  | 'navigation'
  | 'footer'
  | 'header'
  | 'sidebar'
  | 'unknown';

export interface VisualBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  relativeX: number; // 0-1 percentage
  relativeY: number; // 0-1 percentage
}

export interface PageAnalysis {
  id: string;
  timestamp: Date;
  screenshot: string;
  viewport: { width: number; height: number };
  elements: VisualElement[];
  layout: PageLayout;
  content: PageContent;
  suggestions: ActionSuggestion[];
}

export interface PageLayout {
  hasHeader: boolean;
  hasFooter: boolean;
  hasSidebar: boolean;
  hasNavigation: boolean;
  mainContentArea?: VisualBounds;
  columns: number;
  scrollable: boolean;
  theme: 'light' | 'dark' | 'mixed';
}

export interface PageContent {
  title?: string;
  mainHeading?: string;
  description?: string;
  textContent: string[];
  links: { text: string; description?: string }[];
  forms: { purpose: string; fields: string[] }[];
  images: { description: string; alt?: string }[];
}

export interface ActionSuggestion {
  action: string;
  target: VisualElement | string;
  reason: string;
  confidence: number;
}

export interface FindElementRequest {
  description: string;
  type?: VisualElementType;
  nearText?: string;
  inRegion?: VisualBounds;
}

export interface VisualDiff {
  hasChanges: boolean;
  changedRegions: VisualBounds[];
  addedElements: VisualElement[];
  removedElements: VisualElement[];
  modifiedElements: { before: VisualElement; after: VisualElement }[];
  summary: string;
}

// ============================================================================
// VISION ANALYZER CLASS
// ============================================================================

export class VisionAnalyzer {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private page?: Page;

  constructor(config: VisionConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.3;
  }

  /**
   * Set the Playwright page for screenshot capture
   */
  setPage(page: Page): void {
    this.page = page;
  }

  // ============================================================================
  // MAIN ANALYSIS METHODS
  // ============================================================================

  /**
   * Analyze a screenshot and extract all visual elements
   */
  async analyzeScreenshot(
    screenshotBase64: string,
    viewport: { width: number; height: number }
  ): Promise<PageAnalysis> {
    const prompt = `Analyze this screenshot of a web page. Provide a detailed JSON response with the following structure:

{
  "elements": [
    {
      "type": "button|link|input|dropdown|checkbox|radio|toggle|slider|tab|menu|menuitem|dialog|modal|tooltip|card|image|icon|text|heading|form|table|list|navigation|footer|header|sidebar|unknown",
      "label": "Human-readable label for the element",
      "description": "Brief description of what this element does",
      "bounds": {
        "x": number (pixels from left),
        "y": number (pixels from top),
        "width": number (pixels),
        "height": number (pixels)
      },
      "confidence": number (0-1),
      "text": "Text content if applicable",
      "state": "enabled|disabled|focused|selected|loading"
    }
  ],
  "layout": {
    "hasHeader": boolean,
    "hasFooter": boolean,
    "hasSidebar": boolean,
    "hasNavigation": boolean,
    "mainContentArea": { "x": number, "y": number, "width": number, "height": number } or null,
    "columns": number,
    "scrollable": boolean,
    "theme": "light|dark|mixed"
  },
  "content": {
    "title": "Page title if visible",
    "mainHeading": "Main heading text",
    "description": "Brief description of what this page is for",
    "textContent": ["Array of significant text blocks"],
    "links": [{ "text": "Link text", "description": "What clicking this might do" }],
    "forms": [{ "purpose": "Form purpose", "fields": ["Field names"] }],
    "images": [{ "description": "Image description", "alt": "Alt text if visible" }]
  },
  "suggestions": [
    {
      "action": "click|type|scroll|hover",
      "targetDescription": "Description of what to interact with",
      "reason": "Why this might be a useful action",
      "confidence": number (0-1)
    }
  ]
}

Be precise with element bounds. Estimate pixel positions based on the image dimensions (${viewport.width}x${viewport.height}).
Focus on interactive elements that a user would typically interact with.
Return ONLY valid JSON, no markdown formatting.`;

    const response = await this.callVision(screenshotBase64, prompt);
    const parsed = this.parseVisionResponse(response, viewport);

    return {
      id: uuid(),
      timestamp: new Date(),
      screenshot: screenshotBase64,
      viewport,
      elements: parsed.elements,
      layout: parsed.layout,
      content: parsed.content,
      suggestions: parsed.suggestions,
    };
  }

  /**
   * Find a specific element by description
   */
  async findElement(
    screenshotBase64: string,
    request: FindElementRequest,
    viewport: { width: number; height: number }
  ): Promise<VisualElement | null> {
    const typeHint = request.type ? `The element is a ${request.type}.` : '';
    const nearHint = request.nearText ? `It should be near text that says "${request.nearText}".` : '';
    const regionHint = request.inRegion
      ? `Look in the region from (${request.inRegion.x}, ${request.inRegion.y}) to (${request.inRegion.x + request.inRegion.width}, ${request.inRegion.y + request.inRegion.height}).`
      : '';

    const prompt = `Find this element on the page: "${request.description}"
${typeHint}
${nearHint}
${regionHint}

The image dimensions are ${viewport.width}x${viewport.height} pixels.

If you find the element, respond with JSON:
{
  "found": true,
  "type": "element type",
  "label": "element label",
  "description": "what the element is",
  "bounds": {
    "x": number,
    "y": number,
    "width": number,
    "height": number
  },
  "confidence": number (0-1),
  "text": "visible text if any",
  "state": "enabled|disabled|focused|selected|loading"
}

If not found:
{
  "found": false,
  "reason": "Why the element couldn't be found",
  "suggestions": ["Alternative elements that might be what you're looking for"]
}

Return ONLY valid JSON, no markdown formatting.`;

    const response = await this.callVision(screenshotBase64, prompt);

    try {
      const parsed = JSON.parse(response);
      if (!parsed.found) {
        console.warn('Element not found:', parsed.reason);
        return null;
      }

      return {
        id: uuid(),
        type: parsed.type as VisualElementType,
        label: parsed.label,
        description: parsed.description,
        bounds: {
          x: parsed.bounds.x,
          y: parsed.bounds.y,
          width: parsed.bounds.width,
          height: parsed.bounds.height,
          centerX: parsed.bounds.x + parsed.bounds.width / 2,
          centerY: parsed.bounds.y + parsed.bounds.height / 2,
          relativeX: parsed.bounds.x / viewport.width,
          relativeY: parsed.bounds.y / viewport.height,
        },
        confidence: parsed.confidence,
        text: parsed.text,
        state: parsed.state,
      };
    } catch (error) {
      console.error('Failed to parse vision response:', error);
      return null;
    }
  }

  /**
   * Get click coordinates for a described element
   */
  async getClickTarget(
    screenshotBase64: string,
    description: string,
    viewport: { width: number; height: number }
  ): Promise<{ x: number; y: number; confidence: number } | null> {
    const prompt = `I need to click on: "${description}"

Look at this screenshot (${viewport.width}x${viewport.height} pixels) and tell me the exact pixel coordinates where I should click.

Respond with JSON:
{
  "found": true,
  "x": number (pixel x coordinate),
  "y": number (pixel y coordinate),
  "confidence": number (0-1),
  "elementDescription": "What element is at this location"
}

Or if not found:
{
  "found": false,
  "reason": "Why it couldn't be found"
}

Return ONLY valid JSON, no markdown formatting.`;

    const response = await this.callVision(screenshotBase64, prompt);

    try {
      const parsed = JSON.parse(response);
      if (!parsed.found) {
        return null;
      }
      return {
        x: parsed.x,
        y: parsed.y,
        confidence: parsed.confidence,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract text from a specific region of the screenshot
   */
  async extractTextFromRegion(
    screenshotBase64: string,
    region: VisualBounds,
    viewport: { width: number; height: number }
  ): Promise<string[]> {
    const prompt = `Extract all text visible in this region of the screenshot:
- Region: from (${region.x}, ${region.y}) to (${region.x + region.width}, ${region.y + region.height})
- Image size: ${viewport.width}x${viewport.height} pixels

Respond with a JSON array of text strings found in this region, in reading order:
["text 1", "text 2", "text 3"]

Return ONLY valid JSON, no markdown formatting.`;

    const response = await this.callVision(screenshotBase64, prompt);

    try {
      return JSON.parse(response);
    } catch {
      return [];
    }
  }

  /**
   * Compare two screenshots and detect changes
   */
  async compareScreenshots(
    before: string,
    after: string,
    viewport: { width: number; height: number }
  ): Promise<VisualDiff> {
    // Analyze both screenshots
    const [beforeAnalysis, afterAnalysis] = await Promise.all([
      this.analyzeScreenshot(before, viewport),
      this.analyzeScreenshot(after, viewport),
    ]);

    // Compare the analyses
    const prompt = `Compare these two page analyses and describe the differences.

BEFORE:
${JSON.stringify(beforeAnalysis.elements.slice(0, 20), null, 2)}

AFTER:
${JSON.stringify(afterAnalysis.elements.slice(0, 20), null, 2)}

Respond with JSON:
{
  "hasChanges": boolean,
  "changedRegions": [{ "x": number, "y": number, "width": number, "height": number }],
  "addedElements": ["Description of added elements"],
  "removedElements": ["Description of removed elements"],
  "modifiedElements": ["Description of modified elements"],
  "summary": "Brief summary of changes"
}

Return ONLY valid JSON, no markdown formatting.`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const text = textContent?.type === 'text' ? textContent.text : '';

    try {
      const parsed = JSON.parse(text);
      return {
        hasChanges: parsed.hasChanges,
        changedRegions: parsed.changedRegions.map((r: { x: number; y: number; width: number; height: number }) => ({
          ...r,
          centerX: r.x + r.width / 2,
          centerY: r.y + r.height / 2,
          relativeX: r.x / viewport.width,
          relativeY: r.y / viewport.height,
        })),
        addedElements: [],
        removedElements: [],
        modifiedElements: [],
        summary: parsed.summary,
      };
    } catch {
      return {
        hasChanges: false,
        changedRegions: [],
        addedElements: [],
        removedElements: [],
        modifiedElements: [],
        summary: 'Unable to analyze differences',
      };
    }
  }

  // ============================================================================
  // SPECIFIC DETECTION METHODS
  // ============================================================================

  /**
   * Detect all buttons on the page
   */
  async detectButtons(
    screenshotBase64: string,
    viewport: { width: number; height: number }
  ): Promise<VisualElement[]> {
    const analysis = await this.analyzeScreenshot(screenshotBase64, viewport);
    return analysis.elements.filter(e => e.type === 'button');
  }

  /**
   * Detect all input fields on the page
   */
  async detectInputFields(
    screenshotBase64: string,
    viewport: { width: number; height: number }
  ): Promise<VisualElement[]> {
    const analysis = await this.analyzeScreenshot(screenshotBase64, viewport);
    return analysis.elements.filter(e =>
      ['input', 'dropdown', 'checkbox', 'radio', 'toggle', 'slider'].includes(e.type)
    );
  }

  /**
   * Detect navigation elements
   */
  async detectNavigation(
    screenshotBase64: string,
    viewport: { width: number; height: number }
  ): Promise<VisualElement[]> {
    const analysis = await this.analyzeScreenshot(screenshotBase64, viewport);
    return analysis.elements.filter(e =>
      ['navigation', 'menu', 'menuitem', 'tab', 'link'].includes(e.type)
    );
  }

  /**
   * Detect dialogs and modals
   */
  async detectDialogs(
    screenshotBase64: string,
    viewport: { width: number; height: number }
  ): Promise<VisualElement[]> {
    const analysis = await this.analyzeScreenshot(screenshotBase64, viewport);
    return analysis.elements.filter(e =>
      ['dialog', 'modal', 'tooltip'].includes(e.type)
    );
  }

  /**
   * Check if a loading indicator is present
   */
  async isLoading(
    screenshotBase64: string,
    viewport: { width: number; height: number }
  ): Promise<{ loading: boolean; indicators: string[] }> {
    const prompt = `Is this page currently loading? Look for:
- Spinner/loading animations
- Progress bars
- Skeleton screens
- "Loading..." text
- Disabled/grayed out content

Image size: ${viewport.width}x${viewport.height} pixels

Respond with JSON:
{
  "loading": boolean,
  "indicators": ["Array of loading indicators found"],
  "confidence": number (0-1)
}

Return ONLY valid JSON, no markdown formatting.`;

    const response = await this.callVision(screenshotBase64, prompt);

    try {
      const parsed = JSON.parse(response);
      return {
        loading: parsed.loading,
        indicators: parsed.indicators,
      };
    } catch {
      return { loading: false, indicators: [] };
    }
  }

  /**
   * Detect error messages on the page
   */
  async detectErrors(
    screenshotBase64: string,
    viewport: { width: number; height: number }
  ): Promise<{ hasErrors: boolean; errors: string[] }> {
    const prompt = `Are there any error messages visible on this page? Look for:
- Red text or borders
- Error icons
- "Error", "Failed", "Invalid" messages
- Form validation errors
- 404, 500 error pages

Image size: ${viewport.width}x${viewport.height} pixels

Respond with JSON:
{
  "hasErrors": boolean,
  "errors": ["Array of error messages found"],
  "severity": "none|minor|major|critical"
}

Return ONLY valid JSON, no markdown formatting.`;

    const response = await this.callVision(screenshotBase64, prompt);

    try {
      const parsed = JSON.parse(response);
      return {
        hasErrors: parsed.hasErrors,
        errors: parsed.errors,
      };
    } catch {
      return { hasErrors: false, errors: [] };
    }
  }

  // ============================================================================
  // ACTION SUGGESTION
  // ============================================================================

  /**
   * Suggest the next action to achieve a goal
   */
  async suggestNextAction(
    screenshotBase64: string,
    goal: string,
    previousActions: string[],
    viewport: { width: number; height: number }
  ): Promise<ActionSuggestion | null> {
    const historyContext = previousActions.length > 0
      ? `\nPrevious actions taken:\n${previousActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
      : '';

    const prompt = `Goal: ${goal}
${historyContext}

Looking at this screenshot (${viewport.width}x${viewport.height} pixels), what should be the next action to achieve the goal?

Respond with JSON:
{
  "action": "click|type|scroll|hover|wait",
  "target": {
    "description": "What to interact with",
    "x": number (click x coordinate if applicable),
    "y": number (click y coordinate if applicable)
  },
  "value": "Text to type if action is 'type'",
  "reason": "Why this action should be taken",
  "confidence": number (0-1),
  "goalProgress": "How this advances toward the goal"
}

Or if the goal appears complete:
{
  "action": "complete",
  "reason": "Goal appears to be achieved because...",
  "confidence": number (0-1)
}

Return ONLY valid JSON, no markdown formatting.`;

    const response = await this.callVision(screenshotBase64, prompt);

    try {
      const parsed = JSON.parse(response);
      if (parsed.action === 'complete') {
        return null;
      }

      return {
        action: parsed.action,
        target: parsed.target.description,
        reason: parsed.reason,
        confidence: parsed.confidence,
      };
    } catch {
      return null;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Call Claude Vision API with an image
   */
  private async callVision(imageBase64: string, prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.type === 'text' ? textContent.text : '';
  }

  /**
   * Parse vision response into structured format
   */
  private parseVisionResponse(
    response: string,
    viewport: { width: number; height: number }
  ): {
    elements: VisualElement[];
    layout: PageLayout;
    content: PageContent;
    suggestions: ActionSuggestion[];
  } {
    try {
      // Clean up response (remove markdown code blocks if present)
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse
          .replace(/^```json?\n?/, '')
          .replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleanResponse);

      const elements: VisualElement[] = (parsed.elements || []).map((el: {
        type: VisualElementType;
        label: string;
        description: string;
        bounds: { x: number; y: number; width: number; height: number };
        confidence: number;
        text?: string;
        color?: string;
        state?: string;
      }) => ({
        id: uuid(),
        type: el.type as VisualElementType,
        label: el.label || '',
        description: el.description || '',
        bounds: {
          x: el.bounds?.x || 0,
          y: el.bounds?.y || 0,
          width: el.bounds?.width || 0,
          height: el.bounds?.height || 0,
          centerX: (el.bounds?.x || 0) + (el.bounds?.width || 0) / 2,
          centerY: (el.bounds?.y || 0) + (el.bounds?.height || 0) / 2,
          relativeX: (el.bounds?.x || 0) / viewport.width,
          relativeY: (el.bounds?.y || 0) / viewport.height,
        },
        confidence: el.confidence || 0.5,
        text: el.text,
        color: el.color,
        state: el.state as VisualElement['state'],
      }));

      const layout: PageLayout = {
        hasHeader: parsed.layout?.hasHeader ?? false,
        hasFooter: parsed.layout?.hasFooter ?? false,
        hasSidebar: parsed.layout?.hasSidebar ?? false,
        hasNavigation: parsed.layout?.hasNavigation ?? false,
        mainContentArea: parsed.layout?.mainContentArea
          ? {
              ...parsed.layout.mainContentArea,
              centerX: parsed.layout.mainContentArea.x + parsed.layout.mainContentArea.width / 2,
              centerY: parsed.layout.mainContentArea.y + parsed.layout.mainContentArea.height / 2,
              relativeX: parsed.layout.mainContentArea.x / viewport.width,
              relativeY: parsed.layout.mainContentArea.y / viewport.height,
            }
          : undefined,
        columns: parsed.layout?.columns ?? 1,
        scrollable: parsed.layout?.scrollable ?? true,
        theme: parsed.layout?.theme ?? 'light',
      };

      const content: PageContent = {
        title: parsed.content?.title,
        mainHeading: parsed.content?.mainHeading,
        description: parsed.content?.description,
        textContent: parsed.content?.textContent || [],
        links: parsed.content?.links || [],
        forms: parsed.content?.forms || [],
        images: parsed.content?.images || [],
      };

      const suggestions: ActionSuggestion[] = (parsed.suggestions || []).map((s: {
        action: string;
        targetDescription: string;
        reason: string;
        confidence: number;
      }) => ({
        action: s.action,
        target: s.targetDescription,
        reason: s.reason,
        confidence: s.confidence || 0.5,
      }));

      return { elements, layout, content, suggestions };
    } catch (error) {
      console.error('Failed to parse vision response:', error);
      return {
        elements: [],
        layout: {
          hasHeader: false,
          hasFooter: false,
          hasSidebar: false,
          hasNavigation: false,
          columns: 1,
          scrollable: true,
          theme: 'light',
        },
        content: {
          textContent: [],
          links: [],
          forms: [],
          images: [],
        },
        suggestions: [],
      };
    }
  }

  /**
   * Capture screenshot from current page
   */
  async captureScreenshot(): Promise<{ base64: string; viewport: { width: number; height: number } }> {
    if (!this.page) {
      throw new Error('No page set. Call setPage() first.');
    }

    const viewport = await this.page.viewportSize();
    const buffer = await this.page.screenshot({ type: 'png' });
    const base64 = buffer.toString('base64');

    return {
      base64,
      viewport: viewport || { width: 1920, height: 1080 },
    };
  }

  /**
   * Analyze current page
   */
  async analyzePage(): Promise<PageAnalysis> {
    const { base64, viewport } = await this.captureScreenshot();
    return this.analyzeScreenshot(base64, viewport);
  }

  /**
   * Find element on current page
   */
  async findElementOnPage(request: FindElementRequest): Promise<VisualElement | null> {
    const { base64, viewport } = await this.captureScreenshot();
    return this.findElement(base64, request, viewport);
  }

  /**
   * Get click coordinates for element on current page
   */
  async getClickTargetOnPage(
    description: string
  ): Promise<{ x: number; y: number; confidence: number } | null> {
    const { base64, viewport } = await this.captureScreenshot();
    return this.getClickTarget(base64, description, viewport);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createVisionAnalyzer(config?: VisionConfig): VisionAnalyzer {
  return new VisionAnalyzer(config);
}

export default VisionAnalyzer;
