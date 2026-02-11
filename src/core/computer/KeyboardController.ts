/**
 * Alabobai Computer Control - Keyboard Controller Module
 * Production-ready virtual keyboard control with safety features
 *
 * Features:
 * - Cross-platform support (macOS, Windows, Linux)
 * - Text typing with proper escaping
 * - Key combinations (Ctrl+C, Cmd+V, etc.)
 * - Special keys (Enter, Tab, Escape, Arrow keys)
 * - Typing speed control
 * - Input validation
 * - Rate limiting
 */

import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type ModifierKey = 'ctrl' | 'cmd' | 'command' | 'alt' | 'option' | 'shift' | 'meta' | 'win';
export type SpecialKey =
  | 'enter' | 'return'
  | 'tab'
  | 'escape' | 'esc'
  | 'backspace' | 'delete'
  | 'up' | 'down' | 'left' | 'right'
  | 'home' | 'end'
  | 'pageup' | 'pagedown'
  | 'space'
  | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8' | 'f9' | 'f10' | 'f11' | 'f12'
  | 'insert'
  | 'capslock'
  | 'numlock'
  | 'printscreen';

export interface KeyboardAction {
  id: string;
  type: 'type' | 'key' | 'combo' | 'hold' | 'release';
  timestamp: Date;
  text?: string;
  key?: string;
  modifiers?: ModifierKey[];
  duration?: number;
}

export interface KeyboardControllerConfig {
  enabled?: boolean;
  typingDelayMs?: number; // Delay between keystrokes
  rateLimitMs?: number; // Minimum ms between actions
  maxTextLength?: number; // Safety limit for text input
  blockedPatterns?: RegExp[]; // Patterns to block (e.g., passwords)
  allowedKeys?: string[]; // Whitelist of allowed keys (optional)
}

export type KeyboardEvents = {
  'type': (action: KeyboardAction) => void;
  'key': (action: KeyboardAction) => void;
  'combo': (action: KeyboardAction) => void;
  'error': (error: Error) => void;
  'disabled': () => void;
  'enabled': () => void;
  'blocked': (reason: string) => void;
};

// Key code mappings for macOS
const MAC_KEY_CODES: Record<string, number> = {
  'return': 36, 'enter': 36,
  'tab': 48,
  'space': 49,
  'delete': 51, 'backspace': 51,
  'escape': 53, 'esc': 53,
  'capslock': 57,
  'f1': 122, 'f2': 120, 'f3': 99, 'f4': 118,
  'f5': 96, 'f6': 97, 'f7': 98, 'f8': 100,
  'f9': 101, 'f10': 109, 'f11': 103, 'f12': 111,
  'home': 115, 'end': 119,
  'pageup': 116, 'pagedown': 121,
  'left': 123, 'right': 124, 'down': 125, 'up': 126,
  'insert': 114,
};

// Key mappings for Windows SendKeys
const WINDOWS_SPECIAL_KEYS: Record<string, string> = {
  'return': '{ENTER}', 'enter': '{ENTER}',
  'tab': '{TAB}',
  'space': ' ',
  'delete': '{DELETE}', 'backspace': '{BACKSPACE}',
  'escape': '{ESC}', 'esc': '{ESC}',
  'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}',
  'f5': '{F5}', 'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}',
  'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}',
  'home': '{HOME}', 'end': '{END}',
  'pageup': '{PGUP}', 'pagedown': '{PGDN}',
  'left': '{LEFT}', 'right': '{RIGHT}', 'up': '{UP}', 'down': '{DOWN}',
  'insert': '{INSERT}',
  'capslock': '{CAPSLOCK}',
  'numlock': '{NUMLOCK}',
  'printscreen': '{PRTSC}',
};

// ============================================================================
// KEYBOARD CONTROLLER CLASS
// ============================================================================

export class KeyboardController extends EventEmitter {
  private config: Required<KeyboardControllerConfig>;
  private platform: NodeJS.Platform;
  private lastActionTime: number = 0;
  private actionHistory: KeyboardAction[] = [];
  private maxHistorySize: number = 1000;
  private heldKeys: Set<string> = new Set();

  constructor(config: KeyboardControllerConfig = {}) {
    super();
    this.platform = process.platform;
    this.config = {
      enabled: config.enabled ?? true,
      typingDelayMs: config.typingDelayMs ?? 20,
      rateLimitMs: config.rateLimitMs ?? 10,
      maxTextLength: config.maxTextLength ?? 10000,
      blockedPatterns: config.blockedPatterns ?? [],
      allowedKeys: config.allowedKeys ?? [],
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Enable keyboard control
   */
  enable(): void {
    this.config.enabled = true;
    this.emit('enabled');
  }

  /**
   * Disable keyboard control
   */
  disable(): void {
    this.config.enabled = false;
    this.releaseAllKeys();
    this.emit('disabled');
  }

  /**
   * Check if keyboard control is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Type text string
   */
  async type(text: string, options: { delay?: number } = {}): Promise<void> {
    this.validateEnabled();
    this.validateText(text);
    await this.enforceRateLimit();

    const delay = options.delay ?? this.config.typingDelayMs;

    const action: KeyboardAction = {
      id: uuid(),
      type: 'type',
      timestamp: new Date(),
      text,
    };

    await this.executeType(text, delay);

    this.recordAction(action);
    this.emit('type', action);
  }

  /**
   * Type text character by character (for visibility)
   */
  async typeSlowly(text: string, delayMs: number = 100): Promise<void> {
    this.validateEnabled();
    this.validateText(text);

    for (const char of text) {
      await this.type(char, { delay: 0 });
      await this.sleep(delayMs);
    }
  }

  /**
   * Press a single key
   */
  async pressKey(key: string | SpecialKey, modifiers: ModifierKey[] = []): Promise<void> {
    this.validateEnabled();
    this.validateKey(key);
    await this.enforceRateLimit();

    const action: KeyboardAction = {
      id: uuid(),
      type: modifiers.length > 0 ? 'combo' : 'key',
      timestamp: new Date(),
      key,
      modifiers,
    };

    await this.executeKeyPress(key, modifiers);

    this.recordAction(action);
    this.emit(modifiers.length > 0 ? 'combo' : 'key', action);
  }

  /**
   * Press Enter
   */
  async enter(): Promise<void> {
    await this.pressKey('enter');
  }

  /**
   * Press Tab
   */
  async tab(): Promise<void> {
    await this.pressKey('tab');
  }

  /**
   * Press Escape
   */
  async escape(): Promise<void> {
    await this.pressKey('escape');
  }

  /**
   * Press Backspace
   */
  async backspace(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.pressKey('backspace');
    }
  }

  /**
   * Press Delete
   */
  async delete(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.pressKey('delete');
    }
  }

  /**
   * Arrow key presses
   */
  async arrowUp(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) await this.pressKey('up');
  }

  async arrowDown(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) await this.pressKey('down');
  }

  async arrowLeft(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) await this.pressKey('left');
  }

  async arrowRight(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) await this.pressKey('right');
  }

  /**
   * Common keyboard shortcuts
   */
  async copy(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('c', [mod]);
  }

  async paste(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('v', [mod]);
  }

  async cut(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('x', [mod]);
  }

  async selectAll(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('a', [mod]);
  }

  async undo(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('z', [mod]);
  }

  async redo(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('z', [mod, 'shift']);
  }

  async save(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('s', [mod]);
  }

  async find(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('f', [mod]);
  }

  async newTab(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('t', [mod]);
  }

  async closeTab(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('w', [mod]);
  }

  async refresh(): Promise<void> {
    const mod = this.platform === 'darwin' ? 'cmd' : 'ctrl';
    await this.pressKey('r', [mod]);
  }

  /**
   * Hold a key down
   */
  async holdKey(key: string | SpecialKey): Promise<void> {
    this.validateEnabled();
    await this.enforceRateLimit();

    if (this.heldKeys.has(key)) {
      return; // Already held
    }

    await this.executeKeyDown(key);
    this.heldKeys.add(key);

    const action: KeyboardAction = {
      id: uuid(),
      type: 'hold',
      timestamp: new Date(),
      key,
    };

    this.recordAction(action);
  }

  /**
   * Release a held key
   */
  async releaseKey(key: string | SpecialKey): Promise<void> {
    this.validateEnabled();

    if (!this.heldKeys.has(key)) {
      return; // Not held
    }

    await this.executeKeyUp(key);
    this.heldKeys.delete(key);

    const action: KeyboardAction = {
      id: uuid(),
      type: 'release',
      timestamp: new Date(),
      key,
    };

    this.recordAction(action);
  }

  /**
   * Release all held keys
   */
  async releaseAllKeys(): Promise<void> {
    for (const key of this.heldKeys) {
      await this.executeKeyUp(key);
    }
    this.heldKeys.clear();
  }

  /**
   * Execute a key combination (e.g., Ctrl+Shift+P)
   */
  async combo(keys: string[], modifiers: ModifierKey[] = []): Promise<void> {
    this.validateEnabled();

    for (const key of keys) {
      await this.pressKey(key, modifiers);
    }
  }

  /**
   * Get action history
   */
  getHistory(): KeyboardAction[] {
    return [...this.actionHistory];
  }

  /**
   * Clear action history
   */
  clearHistory(): void {
    this.actionHistory = [];
  }

  /**
   * Add a blocked pattern
   */
  addBlockedPattern(pattern: RegExp): void {
    this.config.blockedPatterns.push(pattern);
  }

  /**
   * Remove a blocked pattern
   */
  removeBlockedPattern(pattern: RegExp): void {
    const index = this.config.blockedPatterns.indexOf(pattern);
    if (index > -1) {
      this.config.blockedPatterns.splice(index, 1);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private validateEnabled(): void {
    if (!this.config.enabled) {
      throw new Error('Keyboard control is disabled');
    }
  }

  private validateText(text: string): void {
    if (text.length > this.config.maxTextLength) {
      throw new Error(`Text length ${text.length} exceeds maximum ${this.config.maxTextLength}`);
    }

    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(text)) {
        const reason = `Text matches blocked pattern: ${pattern}`;
        this.emit('blocked', reason);
        throw new Error(reason);
      }
    }
  }

  private validateKey(key: string): void {
    if (this.config.allowedKeys.length > 0 && !this.config.allowedKeys.includes(key.toLowerCase())) {
      throw new Error(`Key '${key}' is not in the allowed keys list`);
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastActionTime;

    if (elapsed < this.config.rateLimitMs) {
      await this.sleep(this.config.rateLimitMs - elapsed);
    }

    this.lastActionTime = Date.now();
  }

  private async executeType(text: string, delay: number): Promise<void> {
    try {
      if (this.platform === 'darwin') {
        // Escape special characters for AppleScript
        const escaped = text
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/'/g, "'\"'\"'");

        if (delay > 0) {
          // Type character by character with delay
          for (const char of text) {
            const charEscaped = char
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"');
            execSync(`osascript -e 'tell application "System Events" to keystroke "${charEscaped}"'`);
            await this.sleep(delay);
          }
        } else {
          execSync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`);
        }
      } else if (this.platform === 'win32') {
        // Escape special SendKeys characters: +, ^, %, ~, (, ), [, ], {, }
        const escaped = text.replace(/([+^%~()[\]{}])/g, '{$1}');
        execSync(
          `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`
        );
      } else {
        // Linux: xdotool
        execSync(`xdotool type --delay ${delay} "${text.replace(/"/g, '\\"')}"`);
      }
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async executeKeyPress(key: string, modifiers: ModifierKey[]): Promise<void> {
    try {
      if (this.platform === 'darwin') {
        await this.executeMacKeyPress(key, modifiers);
      } else if (this.platform === 'win32') {
        await this.executeWindowsKeyPress(key, modifiers);
      } else {
        await this.executeLinuxKeyPress(key, modifiers);
      }
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async executeMacKeyPress(key: string, modifiers: ModifierKey[]): Promise<void> {
    const keyLower = key.toLowerCase();
    const keyCode = MAC_KEY_CODES[keyLower];

    let usingClause = '';
    const usingParts: string[] = [];

    for (const mod of modifiers) {
      switch (mod) {
        case 'cmd':
        case 'command':
          usingParts.push('command down');
          break;
        case 'ctrl':
          usingParts.push('control down');
          break;
        case 'alt':
        case 'option':
          usingParts.push('option down');
          break;
        case 'shift':
          usingParts.push('shift down');
          break;
      }
    }

    if (usingParts.length > 0) {
      usingClause = ` using {${usingParts.join(', ')}}`;
    }

    if (keyCode !== undefined) {
      // Use key code for special keys
      execSync(`osascript -e 'tell application "System Events" to key code ${keyCode}${usingClause}'`);
    } else if (key.length === 1) {
      // Single character
      execSync(`osascript -e 'tell application "System Events" to keystroke "${key}"${usingClause}'`);
    } else {
      throw new Error(`Unknown key: ${key}`);
    }
  }

  private async executeWindowsKeyPress(key: string, modifiers: ModifierKey[]): Promise<void> {
    const keyLower = key.toLowerCase();
    let sendKey = WINDOWS_SPECIAL_KEYS[keyLower] || key;

    // Add modifiers
    let prefix = '';
    for (const mod of modifiers) {
      switch (mod) {
        case 'ctrl':
          prefix += '^';
          break;
        case 'alt':
          prefix += '%';
          break;
        case 'shift':
          prefix += '+';
          break;
        case 'cmd':
        case 'command':
        case 'meta':
        case 'win':
          // Windows key - need special handling
          sendKey = `{LWIN}${sendKey}`;
          break;
      }
    }

    const fullKey = `${prefix}${sendKey}`;
    execSync(
      `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${fullKey}')"`
    );
  }

  private async executeLinuxKeyPress(key: string, modifiers: ModifierKey[]): Promise<void> {
    const keyLower = key.toLowerCase();

    // Map special keys to xdotool names
    const xdoKeyMap: Record<string, string> = {
      'enter': 'Return', 'return': 'Return',
      'tab': 'Tab',
      'escape': 'Escape', 'esc': 'Escape',
      'backspace': 'BackSpace', 'delete': 'Delete',
      'up': 'Up', 'down': 'Down', 'left': 'Left', 'right': 'Right',
      'home': 'Home', 'end': 'End',
      'pageup': 'Page_Up', 'pagedown': 'Page_Down',
      'space': 'space',
      'f1': 'F1', 'f2': 'F2', 'f3': 'F3', 'f4': 'F4',
      'f5': 'F5', 'f6': 'F6', 'f7': 'F7', 'f8': 'F8',
      'f9': 'F9', 'f10': 'F10', 'f11': 'F11', 'f12': 'F12',
    };

    const xdoKey = xdoKeyMap[keyLower] || key;

    const modifierPrefix = modifiers
      .map(mod => {
        switch (mod) {
          case 'ctrl': return 'ctrl';
          case 'alt':
          case 'option': return 'alt';
          case 'shift': return 'shift';
          case 'cmd':
          case 'command':
          case 'meta':
          case 'win': return 'super';
          default: return mod;
        }
      })
      .join('+');

    const fullKey = modifierPrefix ? `${modifierPrefix}+${xdoKey}` : xdoKey;
    execSync(`xdotool key ${fullKey}`);
  }

  private async executeKeyDown(key: string): Promise<void> {
    if (this.platform === 'darwin') {
      // AppleScript doesn't have a direct key down, use Python/Quartz
      const keyCode = MAC_KEY_CODES[key.toLowerCase()] || 0;
      execSync(`python3 -c "from Quartz import *; e = CGEventCreateKeyboardEvent(None, ${keyCode}, True); CGEventPost(kCGHIDEventTap, e)"`);
    } else if (this.platform === 'win32') {
      // Use keybd_event for key down
      execSync(`powershell -command "
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class Keyboard {
    [DllImport(\"user32.dll\")]
    public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
}
'
[Keyboard]::keybd_event(0x${this.getWindowsVK(key)}, 0, 0, 0)
"`);
    } else {
      execSync(`xdotool keydown ${key}`);
    }
  }

  private async executeKeyUp(key: string): Promise<void> {
    if (this.platform === 'darwin') {
      const keyCode = MAC_KEY_CODES[key.toLowerCase()] || 0;
      execSync(`python3 -c "from Quartz import *; e = CGEventCreateKeyboardEvent(None, ${keyCode}, False); CGEventPost(kCGHIDEventTap, e)"`);
    } else if (this.platform === 'win32') {
      execSync(`powershell -command "
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class Keyboard {
    [DllImport(\"user32.dll\")]
    public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
}
'
[Keyboard]::keybd_event(0x${this.getWindowsVK(key)}, 0, 0x0002, 0)
"`);
    } else {
      execSync(`xdotool keyup ${key}`);
    }
  }

  private getWindowsVK(key: string): string {
    // Virtual key codes for Windows
    const vkCodes: Record<string, string> = {
      'enter': '0D', 'return': '0D',
      'tab': '09',
      'escape': '1B', 'esc': '1B',
      'backspace': '08',
      'delete': '2E',
      'space': '20',
      'up': '26', 'down': '28', 'left': '25', 'right': '27',
      'shift': '10', 'ctrl': '11', 'alt': '12',
    };
    return vkCodes[key.toLowerCase()] || '00';
  }

  private recordAction(action: KeyboardAction): void {
    this.actionHistory.push(action);
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.releaseAllKeys();
    this.disable();
    this.removeAllListeners();
    this.actionHistory = [];
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createKeyboardController(config?: KeyboardControllerConfig): KeyboardController {
  return new KeyboardController(config);
}

export default KeyboardController;
