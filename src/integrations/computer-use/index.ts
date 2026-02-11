/**
 * Computer Control Integration
 * Screen capture, mouse, keyboard automation
 * Inspired by Bytebot, CUA, and Anthropic Computer Use
 */

import { EventEmitter } from 'events';
import { execSync, exec } from 'child_process';
import { ScreenCapture, UIElement, ComputerAction } from '../../core/types.js';
import { LLMClient } from '../../core/llm-client.js';
import { v4 as uuid } from 'uuid';

// ============================================================================
// COMPUTER CONTROLLER
// ============================================================================

export interface ComputerControlConfig {
  screenshotInterval?: number;
  enableMouse?: boolean;
  enableKeyboard?: boolean;
  llm: LLMClient;
}

export class ComputerController extends EventEmitter {
  private config: ComputerControlConfig;
  private llm: LLMClient;
  private isRunning: boolean = false;
  private lastScreenshot: ScreenCapture | null = null;

  constructor(config: ComputerControlConfig) {
    super();
    this.config = config;
    this.llm = config.llm;
  }

  // ============================================================================
  // SCREEN CAPTURE
  // ============================================================================

  async captureScreen(): Promise<ScreenCapture> {
    const platform = process.platform;
    let imageData: string;
    let width = 1920;
    let height = 1080;

    try {
      if (platform === 'darwin') {
        // macOS: Use screencapture command
        const tmpPath = `/tmp/screenshot-${Date.now()}.png`;
        execSync(`screencapture -x ${tmpPath}`);
        const buffer = require('fs').readFileSync(tmpPath);
        imageData = buffer.toString('base64');
        require('fs').unlinkSync(tmpPath);

        // Get screen dimensions
        const sizeOutput = execSync("system_profiler SPDisplaysDataType | grep Resolution").toString();
        const match = sizeOutput.match(/(\d+) x (\d+)/);
        if (match) {
          width = parseInt(match[1], 10);
          height = parseInt(match[2], 10);
        }
      } else if (platform === 'win32') {
        // Windows: Use PowerShell
        const tmpPath = `${process.env.TEMP}\\screenshot-${Date.now()}.png`;
        execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bitmap = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bitmap.Save('${tmpPath}'); }"`);
        const buffer = require('fs').readFileSync(tmpPath);
        imageData = buffer.toString('base64');
        require('fs').unlinkSync(tmpPath);
      } else {
        // Linux: Use scrot or import
        const tmpPath = `/tmp/screenshot-${Date.now()}.png`;
        try {
          execSync(`scrot ${tmpPath}`);
        } catch {
          execSync(`import -window root ${tmpPath}`);
        }
        const buffer = require('fs').readFileSync(tmpPath);
        imageData = buffer.toString('base64');
        require('fs').unlinkSync(tmpPath);
      }

      const capture: ScreenCapture = {
        id: uuid(),
        timestamp: new Date(),
        width,
        height,
        imageData,
      };

      this.lastScreenshot = capture;
      this.emit('screen-captured', capture);

      return capture;
    } catch (error) {
      console.error('[ComputerControl] Screenshot failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // VISION ANALYSIS
  // ============================================================================

  async analyzeScreen(screenshot: ScreenCapture, task: string): Promise<{
    elements: UIElement[];
    suggestion: string;
    nextAction?: ComputerAction;
  }> {
    const systemPrompt = `You are a computer vision AI that analyzes screenshots and helps users accomplish tasks.

Given a screenshot and a task, you should:
1. Identify relevant UI elements (buttons, text fields, links, etc.)
2. Determine the next action needed to accomplish the task
3. Provide specific coordinates for any click actions

Respond in JSON format:
{
  "elements": [
    {
      "type": "button|input|link|text|image|form",
      "text": "element text",
      "bounds": { "x": number, "y": number, "width": number, "height": number },
      "interactable": boolean
    }
  ],
  "suggestion": "what to do next",
  "nextAction": {
    "type": "click|type|scroll|key|wait",
    "x": number (for click),
    "y": number (for click),
    "text": "string (for type)",
    "key": "string (for key)"
  }
}`;

    const response = await this.llm.chatWithVision(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Task: ${task}\n\nAnalyze this screenshot and tell me what to do next.` },
      ],
      screenshot.imageData
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('[ComputerControl] Failed to parse analysis:', e);
    }

    return {
      elements: [],
      suggestion: response,
    };
  }

  // ============================================================================
  // MOUSE CONTROL
  // ============================================================================

  async moveMouse(x: number, y: number): Promise<void> {
    if (!this.config.enableMouse) {
      throw new Error('Mouse control is disabled');
    }

    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS: Use cliclick (brew install cliclick) or AppleScript
      try {
        execSync(`cliclick m:${x},${y}`);
      } catch {
        // Fallback to AppleScript
        execSync(`osascript -e 'tell application "System Events" to set position of mouse to {${x}, ${y}}'`);
      }
    } else if (platform === 'win32') {
      // Windows: Use PowerShell with Windows.Forms
      execSync(`powershell -command "[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})"`);
    } else {
      // Linux: Use xdotool
      execSync(`xdotool mousemove ${x} ${y}`);
    }

    this.emit('mouse-moved', { x, y });
  }

  async click(x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
    if (!this.config.enableMouse) {
      throw new Error('Mouse control is disabled');
    }

    await this.moveMouse(x, y);
    const platform = process.platform;

    if (platform === 'darwin') {
      const btn = button === 'right' ? 'rc' : 'c';
      try {
        execSync(`cliclick ${btn}:${x},${y}`);
      } catch {
        execSync(`osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`);
      }
    } else if (platform === 'win32') {
      const btn = button === 'right' ? 'RightClick' : 'Click';
      execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y}); [System.Windows.Forms.SendKeys]::SendWait('{${btn}}')" `);
    } else {
      const btn = button === 'right' ? '3' : '1';
      execSync(`xdotool mousemove ${x} ${y} click ${btn}`);
    }

    this.emit('mouse-clicked', { x, y, button });
  }

  async doubleClick(x: number, y: number): Promise<void> {
    await this.click(x, y);
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.click(x, y);
  }

  // ============================================================================
  // KEYBOARD CONTROL
  // ============================================================================

  async type(text: string): Promise<void> {
    if (!this.config.enableKeyboard) {
      throw new Error('Keyboard control is disabled');
    }

    const platform = process.platform;

    if (platform === 'darwin') {
      // Escape special characters for AppleScript
      const escaped = text.replace(/"/g, '\\"').replace(/'/g, "\\'");
      execSync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`);
    } else if (platform === 'win32') {
      const escaped = text.replace(/"/g, '`"');
      execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`);
    } else {
      execSync(`xdotool type "${text}"`);
    }

    this.emit('key-typed', { text });
  }

  async pressKey(key: string, modifiers: string[] = []): Promise<void> {
    if (!this.config.enableKeyboard) {
      throw new Error('Keyboard control is disabled');
    }

    const platform = process.platform;

    if (platform === 'darwin') {
      let modStr = '';
      if (modifiers.includes('command') || modifiers.includes('cmd')) modStr += ' using command down';
      if (modifiers.includes('shift')) modStr += ' using shift down';
      if (modifiers.includes('option') || modifiers.includes('alt')) modStr += ' using option down';
      if (modifiers.includes('control') || modifiers.includes('ctrl')) modStr += ' using control down';

      execSync(`osascript -e 'tell application "System Events" to key code ${this.getKeyCode(key)}${modStr}'`);
    } else if (platform === 'win32') {
      let keyStr = key;
      if (modifiers.includes('ctrl')) keyStr = `^${keyStr}`;
      if (modifiers.includes('shift')) keyStr = `+${keyStr}`;
      if (modifiers.includes('alt')) keyStr = `%${keyStr}`;
      execSync(`powershell -command "[System.Windows.Forms.SendKeys]::SendWait('{${keyStr}}')"`);
    } else {
      const modStr = modifiers.join('+');
      const fullKey = modStr ? `${modStr}+${key}` : key;
      execSync(`xdotool key ${fullKey}`);
    }

    this.emit('key-pressed', { key, modifiers });
  }

  private getKeyCode(key: string): number {
    // macOS key codes
    const keyCodes: Record<string, number> = {
      'return': 36, 'enter': 36,
      'tab': 48,
      'space': 49,
      'delete': 51, 'backspace': 51,
      'escape': 53, 'esc': 53,
      'up': 126, 'down': 125, 'left': 123, 'right': 124,
    };
    return keyCodes[key.toLowerCase()] || 0;
  }

  // ============================================================================
  // ACTION EXECUTION
  // ============================================================================

  async executeAction(action: ComputerAction): Promise<void> {
    switch (action.type) {
      case 'click':
        await this.click(action.x, action.y, action.button);
        break;
      case 'double-click':
        await this.doubleClick(action.x, action.y);
        break;
      case 'type':
        await this.type(action.text);
        break;
      case 'key':
        await this.pressKey(action.key, action.modifiers);
        break;
      case 'scroll':
        // Implement scroll
        break;
      case 'screenshot':
        await this.captureScreen();
        break;
      case 'wait':
        await new Promise(resolve => setTimeout(resolve, action.ms));
        break;
    }
  }

  // ============================================================================
  // AUTONOMOUS TASK EXECUTION
  // ============================================================================

  async executeTask(task: string, maxSteps: number = 20): Promise<{
    success: boolean;
    steps: Array<{ action: ComputerAction; screenshot: string }>;
    message: string;
  }> {
    const steps: Array<{ action: ComputerAction; screenshot: string }> = [];

    for (let i = 0; i < maxSteps; i++) {
      // Capture current screen
      const screenshot = await this.captureScreen();

      // Analyze and get next action
      const analysis = await this.analyzeScreen(screenshot, task);

      if (!analysis.nextAction) {
        return {
          success: true,
          steps,
          message: `Task completed: ${analysis.suggestion}`,
        };
      }

      // Execute the action
      await this.executeAction(analysis.nextAction);
      steps.push({
        action: analysis.nextAction,
        screenshot: screenshot.imageData.substring(0, 100) + '...', // Truncated for logging
      });

      // Small delay between actions
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      success: false,
      steps,
      message: 'Max steps reached without completing task',
    };
  }
}

// Factory function
export function createComputerController(config: ComputerControlConfig): ComputerController {
  return new ComputerController(config);
}
