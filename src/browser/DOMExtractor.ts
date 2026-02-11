/**
 * Alabobai Browser Automation - DOM Extractor
 *
 * Extracts interactive elements, forms, links, buttons with semantic labels
 * from web pages using Playwright's accessibility tree and DOM inspection.
 *
 * Features:
 * - Accessibility tree extraction for robust element identification
 * - Semantic labeling for buttons, links, inputs, and forms
 * - Interactive element detection with visibility checks
 * - ARIA attribute parsing for enhanced accessibility
 * - Element uniqueness scoring for selector generation
 */

import { Page, ElementHandle, Locator } from 'playwright';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Playwright accessibility snapshot type
 */
interface AccessibilitySnapshot {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  focused?: boolean;
  disabled?: boolean;
  children?: AccessibilitySnapshot[];
}

export interface ExtractedElement {
  id: string;
  tagName: string;
  type: ElementType;
  role?: string;
  label: string;
  text?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  src?: string;
  name?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  bounds: ElementBounds;
  selector: string;
  xpath: string;
  isVisible: boolean;
  isInteractable: boolean;
  isDisabled: boolean;
  isFocusable: boolean;
  attributes: Record<string, string>;
  children?: ExtractedElement[];
  confidence: number;
}

export type ElementType =
  | 'button'
  | 'link'
  | 'input'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'form'
  | 'image'
  | 'heading'
  | 'text'
  | 'list'
  | 'listitem'
  | 'table'
  | 'navigation'
  | 'dialog'
  | 'menu'
  | 'menuitem'
  | 'tab'
  | 'tabpanel'
  | 'unknown';

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface FormData {
  id: string;
  action?: string;
  method?: string;
  name?: string;
  fields: FormField[];
  submitButton?: ExtractedElement;
}

export interface FormField {
  element: ExtractedElement;
  fieldType: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'date' | 'file' | 'hidden' | 'select' | 'checkbox' | 'radio' | 'textarea' | 'other';
  isRequired: boolean;
  options?: string[];
  validation?: string;
}

export interface AccessibilityNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  children?: AccessibilityNode[];
  focused?: boolean;
  disabled?: boolean;
}

export interface ExtractionOptions {
  includeHidden?: boolean;
  maxDepth?: number;
  interactableOnly?: boolean;
  includeText?: boolean;
  viewport?: { width: number; height: number };
}

export interface ExtractionResult {
  url: string;
  title: string;
  timestamp: Date;
  viewport: { width: number; height: number };
  elements: ExtractedElement[];
  forms: FormData[];
  accessibilityTree?: AccessibilityNode;
  stats: ExtractionStats;
}

export interface ExtractionStats {
  totalElements: number;
  interactableElements: number;
  visibleElements: number;
  formsCount: number;
  linksCount: number;
  buttonsCount: number;
  inputsCount: number;
  extractionTimeMs: number;
}

// ============================================================================
// DOM EXTRACTOR CLASS
// ============================================================================

export class DOMExtractor {
  private page: Page;
  private defaultOptions: ExtractionOptions = {
    includeHidden: false,
    maxDepth: 10,
    interactableOnly: false,
    includeText: true,
  };

  constructor(page: Page) {
    this.page = page;
  }

  // ============================================================================
  // MAIN EXTRACTION METHODS
  // ============================================================================

  /**
   * Extract all interactive elements from the page
   */
  async extractAll(options: ExtractionOptions = {}): Promise<ExtractionResult> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    const [url, title, viewport] = await Promise.all([
      this.page.url(),
      this.page.title(),
      this.page.viewportSize(),
    ]);

    // Extract elements in parallel
    const [elements, forms, accessibilityTree] = await Promise.all([
      this.extractInteractiveElements(opts),
      this.extractForms(opts),
      this.extractAccessibilityTree(),
    ]);

    const stats = this.calculateStats(elements, forms, Date.now() - startTime);

    return {
      url,
      title,
      timestamp: new Date(),
      viewport: viewport || { width: 1920, height: 1080 },
      elements,
      forms,
      accessibilityTree,
      stats,
    };
  }

  /**
   * Extract all interactive elements (buttons, links, inputs, etc.)
   */
  async extractInteractiveElements(options: ExtractionOptions = {}): Promise<ExtractedElement[]> {
    const opts = { ...this.defaultOptions, ...options };

    const selectors = [
      'button',
      'a[href]',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[role="listbox"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[onclick]',
      '[tabindex]:not([tabindex="-1"])',
    ];

    const elements: ExtractedElement[] = [];

    for (const selector of selectors) {
      try {
        const extracted = await this.extractElementsBySelector(selector, opts);
        elements.push(...extracted);
      } catch (error) {
        // Continue with other selectors if one fails
        console.warn(`Failed to extract elements for selector "${selector}":`, error);
      }
    }

    // Deduplicate by position/content
    return this.deduplicateElements(elements);
  }

  /**
   * Extract elements by CSS selector
   */
  async extractElementsBySelector(
    selector: string,
    options: ExtractionOptions = {}
  ): Promise<ExtractedElement[]> {
    const opts = { ...this.defaultOptions, ...options };
    const elements: ExtractedElement[] = [];

    try {
      const locators = await this.page.locator(selector).all();

      for (const locator of locators) {
        try {
          const element = await this.extractElementFromLocator(locator, opts);
          if (element && (opts.includeHidden || element.isVisible)) {
            if (!opts.interactableOnly || element.isInteractable) {
              elements.push(element);
            }
          }
        } catch {
          // Skip elements that can't be processed
        }
      }
    } catch (error) {
      console.warn(`Failed to extract elements for selector "${selector}":`, error);
    }

    return elements;
  }

  /**
   * Extract a single element from a Playwright Locator
   */
  async extractElementFromLocator(
    locator: Locator,
    options: ExtractionOptions = {}
  ): Promise<ExtractedElement | null> {
    try {
      const handle = await locator.elementHandle();
      if (!handle) return null;

      return this.extractElementFromHandle(handle, options);
    } catch {
      return null;
    }
  }

  /**
   * Extract a single element from an ElementHandle
   */
  async extractElementFromHandle(
    handle: ElementHandle,
    options: ExtractionOptions = {}
  ): Promise<ExtractedElement | null> {
    try {
      const elementData = await handle.evaluate((el: Element) => {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);
        const htmlEl = el as HTMLElement;
        const inputEl = el as HTMLInputElement;
        const anchorEl = el as HTMLAnchorElement;
        const imgEl = el as HTMLImageElement;

        // Get all attributes
        const attributes: Record<string, string> = {};
        for (const attr of el.attributes) {
          attributes[attr.name] = attr.value;
        }

        // Determine visibility
        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          computed.visibility !== 'hidden' &&
          computed.display !== 'none' &&
          computed.opacity !== '0';

        // Check if element is interactable
        const tagName = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const isInteractable =
          ['button', 'a', 'input', 'textarea', 'select'].includes(tagName) ||
          ['button', 'link', 'textbox', 'checkbox', 'radio', 'menuitem', 'tab'].includes(role || '') ||
          htmlEl.onclick !== null ||
          el.hasAttribute('tabindex');

        // Check if disabled
        const isDisabled =
          inputEl.disabled === true ||
          el.hasAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true';

        // Check if focusable
        const isFocusable =
          !isDisabled &&
          (isInteractable || parseInt(el.getAttribute('tabindex') || '-1') >= 0);

        // Get text content
        let text = '';
        if (tagName === 'input' || tagName === 'textarea') {
          text = inputEl.value || inputEl.placeholder || '';
        } else {
          text = el.textContent?.trim().substring(0, 500) || '';
        }

        // Determine semantic label
        let label =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.getAttribute('alt') ||
          inputEl.placeholder ||
          '';

        // Try to find associated label
        if (!label && inputEl.id) {
          const labelEl = document.querySelector(`label[for="${inputEl.id}"]`);
          if (labelEl) {
            label = labelEl.textContent?.trim() || '';
          }
        }

        // Fallback to text content for buttons/links
        if (!label && ['button', 'a'].includes(tagName)) {
          label = text.substring(0, 100);
        }

        // Generate unique selector
        let selector = '';
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(' ').filter(c => c.length > 0);
          if (classes.length > 0) {
            selector = `${tagName}.${classes.slice(0, 2).join('.')}`;
          }
        }
        if (!selector) {
          selector = tagName;
          if (inputEl.name) {
            selector += `[name="${inputEl.name}"]`;
          } else if (inputEl.type) {
            selector += `[type="${inputEl.type}"]`;
          }
        }

        // Generate XPath
        const getXPath = (element: Element): string => {
          if (element.id) {
            return `//*[@id="${element.id}"]`;
          }
          if (element === document.body) {
            return '/html/body';
          }
          let index = 1;
          const siblings = element.parentElement?.children || [];
          for (const sibling of siblings) {
            if (sibling === element) break;
            if (sibling.tagName === element.tagName) index++;
          }
          const parentPath = element.parentElement ? getXPath(element.parentElement) : '';
          return `${parentPath}/${element.tagName.toLowerCase()}[${index}]`;
        };

        return {
          tagName,
          role: role || undefined,
          text,
          label,
          value: inputEl.value,
          placeholder: inputEl.placeholder,
          href: anchorEl.href,
          src: imgEl.src,
          name: inputEl.name,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          ariaDescribedBy: el.getAttribute('aria-describedby') || undefined,
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            centerX: rect.x + rect.width / 2,
            centerY: rect.y + rect.height / 2,
          },
          selector,
          xpath: getXPath(el),
          isVisible,
          isInteractable,
          isDisabled,
          isFocusable,
          attributes,
          inputType: inputEl.type || undefined,
        };
      });

      if (!elementData) return null;

      // Determine element type
      const type = this.determineElementType(
        elementData.tagName,
        elementData.role,
        elementData.inputType,
        elementData.attributes
      );

      // Calculate confidence score
      const confidence = this.calculateConfidence(elementData);

      return {
        id: uuid(),
        tagName: elementData.tagName,
        type,
        role: elementData.role,
        label: elementData.label,
        text: elementData.text,
        value: elementData.value,
        placeholder: elementData.placeholder,
        href: elementData.href,
        src: elementData.src,
        name: elementData.name,
        ariaLabel: elementData.ariaLabel,
        ariaDescribedBy: elementData.ariaDescribedBy,
        bounds: elementData.bounds,
        selector: elementData.selector,
        xpath: elementData.xpath,
        isVisible: elementData.isVisible,
        isInteractable: elementData.isInteractable,
        isDisabled: elementData.isDisabled,
        isFocusable: elementData.isFocusable,
        attributes: elementData.attributes,
        confidence,
      };
    } catch {
      return null;
    }
  }

  // ============================================================================
  // FORM EXTRACTION
  // ============================================================================

  /**
   * Extract all forms from the page
   */
  async extractForms(options: ExtractionOptions = {}): Promise<FormData[]> {
    const forms: FormData[] = [];

    try {
      const formLocators = await this.page.locator('form').all();

      for (const formLocator of formLocators) {
        try {
          const form = await this.extractFormData(formLocator, options);
          if (form) {
            forms.push(form);
          }
        } catch {
          // Skip forms that can't be processed
        }
      }
    } catch (error) {
      console.warn('Failed to extract forms:', error);
    }

    return forms;
  }

  /**
   * Extract form data including all fields
   */
  private async extractFormData(
    formLocator: Locator,
    options: ExtractionOptions = {}
  ): Promise<FormData | null> {
    try {
      const formHandle = await formLocator.elementHandle();
      if (!formHandle) return null;

      const formAttrs = await formHandle.evaluate((form: HTMLFormElement) => ({
        action: form.action,
        method: form.method,
        name: form.name,
        id: form.id,
      }));

      // Extract form fields
      const fieldSelectors = ['input', 'textarea', 'select'];
      const fields: FormField[] = [];

      for (const selector of fieldSelectors) {
        const fieldLocators = await formLocator.locator(selector).all();
        for (const fieldLocator of fieldLocators) {
          const field = await this.extractFormField(fieldLocator, options);
          if (field) {
            fields.push(field);
          }
        }
      }

      // Find submit button
      let submitButton: ExtractedElement | undefined;
      const submitLocator = formLocator.locator('button[type="submit"], input[type="submit"], button:not([type])').first();
      if (await submitLocator.count() > 0) {
        submitButton = await this.extractElementFromLocator(submitLocator, options) || undefined;
      }

      return {
        id: formAttrs.id || uuid(),
        action: formAttrs.action,
        method: formAttrs.method,
        name: formAttrs.name,
        fields,
        submitButton,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract a single form field
   */
  private async extractFormField(
    locator: Locator,
    options: ExtractionOptions = {}
  ): Promise<FormField | null> {
    try {
      const element = await this.extractElementFromLocator(locator, options);
      if (!element) return null;

      const fieldData = await locator.evaluate((el: Element) => {
        const input = el as HTMLInputElement;
        const select = el as HTMLSelectElement;

        let options: string[] | undefined;
        if (el.tagName.toLowerCase() === 'select') {
          options = Array.from(select.options).map(opt => opt.value);
        }

        return {
          type: input.type || el.tagName.toLowerCase(),
          required: input.required || el.hasAttribute('required'),
          pattern: input.pattern || undefined,
          options,
        };
      });

      const fieldType = this.determineFieldType(fieldData.type);

      return {
        element,
        fieldType,
        isRequired: fieldData.required,
        options: fieldData.options,
        validation: fieldData.pattern,
      };
    } catch {
      return null;
    }
  }

  // ============================================================================
  // ACCESSIBILITY TREE
  // ============================================================================

  /**
   * Extract the accessibility tree
   */
  async extractAccessibilityTree(): Promise<AccessibilityNode | undefined> {
    try {
      // Playwright's accessibility API - cast page to access accessibility property
      const pageWithAccessibility = this.page as Page & {
        accessibility: { snapshot(): Promise<AccessibilitySnapshot | null> };
      };
      const snapshot = await pageWithAccessibility.accessibility.snapshot();
      if (!snapshot) return undefined;

      return this.convertAccessibilitySnapshot(snapshot);
    } catch (error) {
      console.warn('Failed to extract accessibility tree:', error);
      return undefined;
    }
  }

  /**
   * Convert Playwright accessibility snapshot to our format
   */
  private convertAccessibilitySnapshot(
    snapshot: AccessibilitySnapshot
  ): AccessibilityNode | undefined {
    if (!snapshot) return undefined;

    return {
      role: snapshot.role,
      name: snapshot.name || '',
      value: snapshot.value,
      description: snapshot.description,
      focused: snapshot.focused,
      disabled: snapshot.disabled,
      children: snapshot.children?.map(child =>
        this.convertAccessibilitySnapshot(child)
      ).filter((n): n is AccessibilityNode => n !== undefined),
    };
  }

  /**
   * Find element in accessibility tree by name or role
   */
  async findInAccessibilityTree(
    name?: string,
    role?: string
  ): Promise<AccessibilityNode[]> {
    const tree = await this.extractAccessibilityTree();
    if (!tree) return [];

    const results: AccessibilityNode[] = [];

    const search = (node: AccessibilityNode): void => {
      const nameMatch = !name || node.name.toLowerCase().includes(name.toLowerCase());
      const roleMatch = !role || node.role === role;

      if (nameMatch && roleMatch) {
        results.push(node);
      }

      node.children?.forEach(search);
    };

    search(tree);
    return results;
  }

  // ============================================================================
  // ELEMENT SEARCH
  // ============================================================================

  /**
   * Find element by semantic description (using label, text, or aria attributes)
   */
  async findByDescription(description: string): Promise<ExtractedElement[]> {
    const elements = await this.extractInteractiveElements({ interactableOnly: true });
    const descLower = description.toLowerCase();

    return elements
      .filter(el => {
        const searchFields = [
          el.label,
          el.text,
          el.ariaLabel,
          el.placeholder,
          el.name,
          el.attributes['title'],
          el.attributes['alt'],
        ].filter(Boolean).map(s => s!.toLowerCase());

        return searchFields.some(field => field.includes(descLower));
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find clickable elements near a specific position
   */
  async findClickableNear(
    x: number,
    y: number,
    radius: number = 50
  ): Promise<ExtractedElement[]> {
    const elements = await this.extractInteractiveElements({ interactableOnly: true });

    return elements
      .filter(el => {
        const distance = Math.sqrt(
          Math.pow(el.bounds.centerX - x, 2) +
          Math.pow(el.bounds.centerY - y, 2)
        );
        return distance <= radius && el.isVisible;
      })
      .sort((a, b) => {
        const distA = Math.sqrt(
          Math.pow(a.bounds.centerX - x, 2) +
          Math.pow(a.bounds.centerY - y, 2)
        );
        const distB = Math.sqrt(
          Math.pow(b.bounds.centerX - x, 2) +
          Math.pow(b.bounds.centerY - y, 2)
        );
        return distA - distB;
      });
  }

  /**
   * Find element by role and accessible name
   */
  async findByRole(role: string, name?: string): Promise<ExtractedElement[]> {
    const roleSelector = `[role="${role}"]`;
    let elements = await this.extractElementsBySelector(roleSelector);

    if (name) {
      const nameLower = name.toLowerCase();
      elements = elements.filter(el =>
        el.label?.toLowerCase().includes(nameLower) ||
        el.text?.toLowerCase().includes(nameLower) ||
        el.ariaLabel?.toLowerCase().includes(nameLower)
      );
    }

    return elements;
  }

  // ============================================================================
  // HIGHLIGHTING
  // ============================================================================

  /**
   * Highlight an element on the page for debugging
   */
  async highlightElement(
    element: ExtractedElement,
    color: string = 'red',
    duration: number = 2000
  ): Promise<void> {
    await this.page.evaluate(
      ({ selector, color, duration }) => {
        const el = document.querySelector(selector);
        if (!el) return;

        const htmlEl = el as HTMLElement;
        const originalOutline = htmlEl.style.outline;
        const originalBackground = htmlEl.style.backgroundColor;

        htmlEl.style.outline = `3px solid ${color}`;
        htmlEl.style.backgroundColor = `${color}20`;

        setTimeout(() => {
          htmlEl.style.outline = originalOutline;
          htmlEl.style.backgroundColor = originalBackground;
        }, duration);
      },
      { selector: element.selector, color, duration }
    );
  }

  /**
   * Highlight multiple elements
   */
  async highlightElements(
    elements: ExtractedElement[],
    colors?: string[]
  ): Promise<void> {
    const defaultColors = ['red', 'blue', 'green', 'orange', 'purple', 'cyan'];

    for (let i = 0; i < elements.length; i++) {
      const color = colors?.[i] || defaultColors[i % defaultColors.length];
      await this.highlightElement(elements[i], color);
    }
  }

  /**
   * Add visible labels to all interactive elements
   */
  async addElementLabels(): Promise<() => Promise<void>> {
    const elements = await this.extractInteractiveElements({
      interactableOnly: true
    });

    await this.page.evaluate((elements) => {
      const container = document.createElement('div');
      container.id = 'alabobai-element-labels';
      container.style.cssText = 'position: fixed; top: 0; left: 0; pointer-events: none; z-index: 999999;';
      document.body.appendChild(container);

      elements.forEach((el, index) => {
        const label = document.createElement('div');
        label.style.cssText = `
          position: absolute;
          left: ${el.bounds.x}px;
          top: ${el.bounds.y}px;
          background: rgba(255, 0, 0, 0.8);
          color: white;
          font-size: 10px;
          padding: 2px 4px;
          border-radius: 2px;
          font-family: monospace;
        `;
        label.textContent = `[${index}]`;
        container.appendChild(label);
      });
    }, elements);

    // Return cleanup function
    return async () => {
      await this.page.evaluate(() => {
        const container = document.getElementById('alabobai-element-labels');
        container?.remove();
      });
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Determine element type from tag, role, and attributes
   */
  private determineElementType(
    tagName: string,
    role?: string,
    inputType?: string,
    attributes?: Record<string, string>
  ): ElementType {
    // Check role first
    if (role) {
      const roleMap: Record<string, ElementType> = {
        button: 'button',
        link: 'link',
        textbox: 'input',
        checkbox: 'checkbox',
        radio: 'radio',
        combobox: 'select',
        listbox: 'select',
        menu: 'menu',
        menuitem: 'menuitem',
        tab: 'tab',
        tabpanel: 'tabpanel',
        dialog: 'dialog',
        navigation: 'navigation',
        list: 'list',
        listitem: 'listitem',
        img: 'image',
        heading: 'heading',
        table: 'table',
      };
      if (roleMap[role]) return roleMap[role];
    }

    // Check tag name
    switch (tagName) {
      case 'button':
        return 'button';
      case 'a':
        return 'link';
      case 'input':
        switch (inputType) {
          case 'checkbox':
            return 'checkbox';
          case 'radio':
            return 'radio';
          case 'submit':
          case 'button':
            return 'button';
          default:
            return 'input';
        }
      case 'textarea':
        return 'textarea';
      case 'select':
        return 'select';
      case 'form':
        return 'form';
      case 'img':
        return 'image';
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return 'heading';
      case 'ul':
      case 'ol':
        return 'list';
      case 'li':
        return 'listitem';
      case 'table':
        return 'table';
      case 'nav':
        return 'navigation';
      default:
        // Check for onclick or other interactive attributes
        if (attributes?.['onclick'] || attributes?.['tabindex']) {
          return 'button';
        }
        return 'unknown';
    }
  }

  /**
   * Determine form field type
   */
  private determineFieldType(inputType: string): FormField['fieldType'] {
    const typeMap: Record<string, FormField['fieldType']> = {
      text: 'text',
      email: 'email',
      password: 'password',
      number: 'number',
      tel: 'tel',
      url: 'url',
      date: 'date',
      file: 'file',
      hidden: 'hidden',
      checkbox: 'checkbox',
      radio: 'radio',
      select: 'select',
      textarea: 'textarea',
    };
    return typeMap[inputType] || 'other';
  }

  /**
   * Calculate confidence score for element identification
   */
  private calculateConfidence(elementData: {
    selector: string;
    label: string;
    isVisible: boolean;
    isInteractable: boolean;
    attributes: Record<string, string>;
  }): number {
    let confidence = 0.5;

    // ID selector is very reliable
    if (elementData.selector.startsWith('#')) {
      confidence += 0.3;
    }

    // Has a good label
    if (elementData.label && elementData.label.length > 2) {
      confidence += 0.1;
    }

    // ARIA attributes present
    if (elementData.attributes['aria-label'] || elementData.attributes['aria-labelledby']) {
      confidence += 0.05;
    }

    // Data test attributes
    if (elementData.attributes['data-testid'] || elementData.attributes['data-test']) {
      confidence += 0.05;
    }

    // Visible and interactable
    if (elementData.isVisible) confidence += 0.05;
    if (elementData.isInteractable) confidence += 0.05;

    return Math.min(confidence, 1);
  }

  /**
   * Deduplicate elements by position and content
   */
  private deduplicateElements(elements: ExtractedElement[]): ExtractedElement[] {
    const seen = new Set<string>();
    return elements.filter(el => {
      const key = `${el.bounds.x}-${el.bounds.y}-${el.bounds.width}-${el.bounds.height}-${el.text?.substring(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Calculate extraction statistics
   */
  private calculateStats(
    elements: ExtractedElement[],
    forms: FormData[],
    extractionTimeMs: number
  ): ExtractionStats {
    return {
      totalElements: elements.length,
      interactableElements: elements.filter(e => e.isInteractable).length,
      visibleElements: elements.filter(e => e.isVisible).length,
      formsCount: forms.length,
      linksCount: elements.filter(e => e.type === 'link').length,
      buttonsCount: elements.filter(e => e.type === 'button').length,
      inputsCount: elements.filter(e => ['input', 'textarea', 'select'].includes(e.type)).length,
      extractionTimeMs,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createDOMExtractor(page: Page): DOMExtractor {
  return new DOMExtractor(page);
}

export default DOMExtractor;
