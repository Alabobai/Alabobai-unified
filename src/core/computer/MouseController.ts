/**
 * Alabobai Computer Control - Mouse Controller Module
 * Production-ready virtual mouse control with safety features
 *
 * Features:
 * - Cross-platform support (macOS, Windows, Linux)
 * - Smooth movement animations
 * - Click, double-click, right-click, drag
 * - Scroll support
 * - Safety boundaries
 * - Rate limiting
 * - Action validation
 */

import { EventEmitter } from 'events';
import { execSync, exec } from 'child_process';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface MousePosition {
  x: number;
  y: number;
}

export interface MouseBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export type MouseButton = 'left' | 'right' | 'middle';

export interface MouseAction {
  id: string;
  type: 'move' | 'click' | 'double-click' | 'right-click' | 'drag' | 'scroll';
  timestamp: Date;
  position: MousePosition;
  endPosition?: MousePosition; // For drag
  button?: MouseButton;
  scrollDelta?: { x: number; y: number };
  duration?: number; // For smooth movements
}

export interface MouseControllerConfig {
  enabled?: boolean;
  smoothMovement?: boolean;
  movementDuration?: number; // ms for smooth movement
  clickDelay?: number; // ms between click down and up
  doubleClickDelay?: number; // ms between clicks
  rateLimitMs?: number; // minimum ms between actions
  bounds?: MouseBounds; // safety bounds
  validateActions?: boolean;
}

export type MouseEvents = {
  'move': (position: MousePosition) => void;
  'click': (action: MouseAction) => void;
  'drag': (action: MouseAction) => void;
  'scroll': (action: MouseAction) => void;
  'error': (error: Error) => void;
  'disabled': () => void;
  'enabled': () => void;
};

// ============================================================================
// MOUSE CONTROLLER CLASS
// ============================================================================

export class MouseController extends EventEmitter {
  private config: Required<MouseControllerConfig>;
  private platform: NodeJS.Platform;
  private lastActionTime: number = 0;
  private currentPosition: MousePosition = { x: 0, y: 0 };
  private actionHistory: MouseAction[] = [];
  private maxHistorySize: number = 1000;

  constructor(config: MouseControllerConfig = {}) {
    super();
    this.platform = process.platform;
    this.config = {
      enabled: config.enabled ?? true,
      smoothMovement: config.smoothMovement ?? true,
      movementDuration: config.movementDuration ?? 200,
      clickDelay: config.clickDelay ?? 50,
      doubleClickDelay: config.doubleClickDelay ?? 100,
      rateLimitMs: config.rateLimitMs ?? 50,
      bounds: config.bounds ?? this.getDefaultBounds(),
      validateActions: config.validateActions ?? true,
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Enable mouse control
   */
  enable(): void {
    this.config.enabled = true;
    this.emit('enabled');
  }

  /**
   * Disable mouse control
   */
  disable(): void {
    this.config.enabled = false;
    this.emit('disabled');
  }

  /**
   * Check if mouse control is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current mouse position
   */
  async getPosition(): Promise<MousePosition> {
    try {
      if (this.platform === 'darwin') {
        // Use cliclick or AppleScript
        try {
          const output = execSync('cliclick p', { encoding: 'utf-8' });
          const match = output.match(/(\d+),(\d+)/);
          if (match) {
            this.currentPosition = { x: parseInt(match[1]), y: parseInt(match[2]) };
          }
        } catch {
          // Fallback to AppleScript - get position using Python
          const script = `python3 -c "from Quartz import CGEventCreate, CGEventGetLocation; loc = CGEventGetLocation(CGEventCreate(None)); print(f'{int(loc.x)},{int(loc.y)}')"`;
          const output = execSync(script, { encoding: 'utf-8' }).trim();
          const [x, y] = output.split(',').map(Number);
          this.currentPosition = { x, y };
        }
      } else if (this.platform === 'win32') {
        const output = execSync(
          'powershell -command "[System.Windows.Forms.Cursor]::Position.X,[System.Windows.Forms.Cursor]::Position.Y"',
          { encoding: 'utf-8' }
        );
        const [x, y] = output.trim().split('\n').map(Number);
        this.currentPosition = { x, y };
      } else {
        const output = execSync('xdotool getmouselocation', { encoding: 'utf-8' });
        const xMatch = output.match(/x:(\d+)/);
        const yMatch = output.match(/y:(\d+)/);
        this.currentPosition = {
          x: xMatch ? parseInt(xMatch[1]) : 0,
          y: yMatch ? parseInt(yMatch[1]) : 0,
        };
      }
    } catch (error) {
      this.emit('error', error as Error);
    }

    return this.currentPosition;
  }

  /**
   * Move mouse to absolute position
   */
  async moveTo(x: number, y: number, smooth?: boolean): Promise<void> {
    this.validateEnabled();
    this.validatePosition({ x, y });
    await this.enforceRateLimit();

    const action: MouseAction = {
      id: uuid(),
      type: 'move',
      timestamp: new Date(),
      position: { x, y },
    };

    const useSmooth = smooth ?? this.config.smoothMovement;

    if (useSmooth) {
      await this.smoothMove(this.currentPosition, { x, y });
    } else {
      await this.instantMove(x, y);
    }

    this.currentPosition = { x, y };
    this.recordAction(action);
    this.emit('move', this.currentPosition);
  }

  /**
   * Move mouse relative to current position
   */
  async moveBy(deltaX: number, deltaY: number, smooth?: boolean): Promise<void> {
    const current = await this.getPosition();
    await this.moveTo(current.x + deltaX, current.y + deltaY, smooth);
  }

  /**
   * Click at current position or specified position
   */
  async click(x?: number, y?: number, button: MouseButton = 'left'): Promise<void> {
    this.validateEnabled();
    await this.enforceRateLimit();

    const position = x !== undefined && y !== undefined
      ? { x, y }
      : await this.getPosition();

    this.validatePosition(position);

    const action: MouseAction = {
      id: uuid(),
      type: 'click',
      timestamp: new Date(),
      position,
      button,
    };

    if (x !== undefined && y !== undefined) {
      await this.instantMove(x, y);
    }

    await this.executeClick(position.x, position.y, button);

    this.currentPosition = position;
    this.recordAction(action);
    this.emit('click', action);
  }

  /**
   * Double-click at current position or specified position
   */
  async doubleClick(x?: number, y?: number): Promise<void> {
    this.validateEnabled();
    await this.enforceRateLimit();

    const position = x !== undefined && y !== undefined
      ? { x, y }
      : await this.getPosition();

    this.validatePosition(position);

    const action: MouseAction = {
      id: uuid(),
      type: 'double-click',
      timestamp: new Date(),
      position,
      button: 'left',
    };

    if (x !== undefined && y !== undefined) {
      await this.instantMove(x, y);
    }

    await this.executeDoubleClick(position.x, position.y);

    this.currentPosition = position;
    this.recordAction(action);
    this.emit('click', action);
  }

  /**
   * Right-click at current position or specified position
   */
  async rightClick(x?: number, y?: number): Promise<void> {
    await this.click(x, y, 'right');
  }

  /**
   * Middle-click at current position or specified position
   */
  async middleClick(x?: number, y?: number): Promise<void> {
    await this.click(x, y, 'middle');
  }

  /**
   * Drag from one position to another
   */
  async drag(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    button: MouseButton = 'left'
  ): Promise<void> {
    this.validateEnabled();
    this.validatePosition({ x: fromX, y: fromY });
    this.validatePosition({ x: toX, y: toY });
    await this.enforceRateLimit();

    const action: MouseAction = {
      id: uuid(),
      type: 'drag',
      timestamp: new Date(),
      position: { x: fromX, y: fromY },
      endPosition: { x: toX, y: toY },
      button,
    };

    await this.executeDrag(fromX, fromY, toX, toY, button);

    this.currentPosition = { x: toX, y: toY };
    this.recordAction(action);
    this.emit('drag', action);
  }

  /**
   * Scroll at current position
   */
  async scroll(deltaX: number, deltaY: number, x?: number, y?: number): Promise<void> {
    this.validateEnabled();
    await this.enforceRateLimit();

    const position = x !== undefined && y !== undefined
      ? { x, y }
      : await this.getPosition();

    if (x !== undefined && y !== undefined) {
      await this.instantMove(x, y);
    }

    const action: MouseAction = {
      id: uuid(),
      type: 'scroll',
      timestamp: new Date(),
      position,
      scrollDelta: { x: deltaX, y: deltaY },
    };

    await this.executeScroll(deltaX, deltaY);

    this.recordAction(action);
    this.emit('scroll', action);
  }

  /**
   * Scroll down
   */
  async scrollDown(amount: number = 3): Promise<void> {
    await this.scroll(0, -amount);
  }

  /**
   * Scroll up
   */
  async scrollUp(amount: number = 3): Promise<void> {
    await this.scroll(0, amount);
  }

  /**
   * Scroll left
   */
  async scrollLeft(amount: number = 3): Promise<void> {
    await this.scroll(-amount, 0);
  }

  /**
   * Scroll right
   */
  async scrollRight(amount: number = 3): Promise<void> {
    await this.scroll(amount, 0);
  }

  /**
   * Get action history
   */
  getHistory(): MouseAction[] {
    return [...this.actionHistory];
  }

  /**
   * Clear action history
   */
  clearHistory(): void {
    this.actionHistory = [];
  }

  /**
   * Set safety bounds
   */
  setBounds(bounds: MouseBounds): void {
    this.config.bounds = bounds;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private validateEnabled(): void {
    if (!this.config.enabled) {
      throw new Error('Mouse control is disabled');
    }
  }

  private validatePosition(position: MousePosition): void {
    if (!this.config.validateActions) return;

    const { bounds } = this.config;
    if (
      position.x < bounds.minX ||
      position.x > bounds.maxX ||
      position.y < bounds.minY ||
      position.y > bounds.maxY
    ) {
      throw new Error(
        `Position (${position.x}, ${position.y}) is outside safety bounds ` +
        `(${bounds.minX}-${bounds.maxX}, ${bounds.minY}-${bounds.maxY})`
      );
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

  private async smoothMove(from: MousePosition, to: MousePosition): Promise<void> {
    const steps = Math.ceil(this.config.movementDuration / 16); // ~60fps
    const stepDelay = this.config.movementDuration / steps;

    for (let i = 1; i <= steps; i++) {
      const progress = this.easeInOutQuad(i / steps);
      const x = Math.round(from.x + (to.x - from.x) * progress);
      const y = Math.round(from.y + (to.y - from.y) * progress);
      await this.instantMove(x, y);
      await this.sleep(stepDelay);
    }
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  private async instantMove(x: number, y: number): Promise<void> {
    try {
      if (this.platform === 'darwin') {
        try {
          execSync(`cliclick m:${x},${y}`);
        } catch {
          // Fallback to Python/Quartz
          const script = `python3 -c "from Quartz import CGEventCreateMouseEvent, CGEventPost, kCGEventMouseMoved, kCGMouseButtonLeft, kCGHIDEventTap; e = CGEventCreateMouseEvent(None, kCGEventMouseMoved, (${x}, ${y}), kCGMouseButtonLeft); CGEventPost(kCGHIDEventTap, e)"`;
          execSync(script);
        }
      } else if (this.platform === 'win32') {
        execSync(
          `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})"`
        );
      } else {
        execSync(`xdotool mousemove ${x} ${y}`);
      }
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async executeClick(x: number, y: number, button: MouseButton): Promise<void> {
    try {
      if (this.platform === 'darwin') {
        const btnCode = button === 'right' ? 'rc' : button === 'middle' ? 'mc' : 'c';
        try {
          execSync(`cliclick ${btnCode}:${x},${y}`);
        } catch {
          // Fallback to Python/Quartz
          const eventType = button === 'right' ? 'kCGEventRightMouseDown' : 'kCGEventLeftMouseDown';
          const eventTypeUp = button === 'right' ? 'kCGEventRightMouseUp' : 'kCGEventLeftMouseUp';
          const buttonType = button === 'right' ? 'kCGMouseButtonRight' : 'kCGMouseButtonLeft';

          const script = `python3 -c "
from Quartz import *
import time
e = CGEventCreateMouseEvent(None, ${eventType}, (${x}, ${y}), ${buttonType})
CGEventPost(kCGHIDEventTap, e)
time.sleep(0.05)
e = CGEventCreateMouseEvent(None, ${eventTypeUp}, (${x}, ${y}), ${buttonType})
CGEventPost(kCGHIDEventTap, e)
"`;
          execSync(script);
        }
      } else if (this.platform === 'win32') {
        const downEvent = button === 'right' ? '0x0008' : '0x0002'; // MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN
        const upEvent = button === 'right' ? '0x0010' : '0x0004'; // MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP

        execSync(`powershell -command "
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport(\"user32.dll\")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
'
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
[Mouse]::mouse_event(${downEvent}, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[Mouse]::mouse_event(${upEvent}, 0, 0, 0, 0)
"`);
      } else {
        const btnNum = button === 'right' ? '3' : button === 'middle' ? '2' : '1';
        execSync(`xdotool mousemove ${x} ${y} click ${btnNum}`);
      }
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async executeDoubleClick(x: number, y: number): Promise<void> {
    try {
      if (this.platform === 'darwin') {
        try {
          execSync(`cliclick dc:${x},${y}`);
        } catch {
          await this.executeClick(x, y, 'left');
          await this.sleep(this.config.doubleClickDelay);
          await this.executeClick(x, y, 'left');
        }
      } else if (this.platform === 'win32') {
        await this.executeClick(x, y, 'left');
        await this.sleep(this.config.doubleClickDelay);
        await this.executeClick(x, y, 'left');
      } else {
        execSync(`xdotool mousemove ${x} ${y} click --repeat 2 --delay ${this.config.doubleClickDelay} 1`);
      }
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async executeDrag(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    button: MouseButton
  ): Promise<void> {
    try {
      if (this.platform === 'darwin') {
        try {
          const btnCode = button === 'right' ? 'rdd' : 'dd';
          execSync(`cliclick ${btnCode}:${fromX},${toX} du:${toX},${toY}`);
        } catch {
          // Fallback: move, mouse down, smooth move, mouse up
          await this.instantMove(fromX, fromY);
          // Mouse down
          const script = `python3 -c "from Quartz import *; e = CGEventCreateMouseEvent(None, kCGEventLeftMouseDown, (${fromX}, ${fromY}), kCGMouseButtonLeft); CGEventPost(kCGHIDEventTap, e)"`;
          execSync(script);
          await this.smoothMove({ x: fromX, y: fromY }, { x: toX, y: toY });
          // Mouse up
          const scriptUp = `python3 -c "from Quartz import *; e = CGEventCreateMouseEvent(None, kCGEventLeftMouseUp, (${toX}, ${toY}), kCGMouseButtonLeft); CGEventPost(kCGHIDEventTap, e)"`;
          execSync(scriptUp);
        }
      } else if (this.platform === 'win32') {
        execSync(`powershell -command "
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport(\"user32.dll\")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
'
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${fromX}, ${fromY})
[Mouse]::mouse_event(0x0002, 0, 0, 0, 0)
Start-Sleep -Milliseconds 100
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${toX}, ${toY})
[Mouse]::mouse_event(0x0004, 0, 0, 0, 0)
"`);
      } else {
        const btnNum = button === 'right' ? '3' : '1';
        execSync(`xdotool mousemove ${fromX} ${fromY} mousedown ${btnNum} mousemove ${toX} ${toY} mouseup ${btnNum}`);
      }
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async executeScroll(deltaX: number, deltaY: number): Promise<void> {
    try {
      if (this.platform === 'darwin') {
        // Negative deltaY = scroll down, positive = scroll up (natural scrolling inverted)
        const script = `python3 -c "from Quartz import CGEventCreateScrollWheelEvent, CGEventPost, kCGScrollEventUnitLine, kCGHIDEventTap; e = CGEventCreateScrollWheelEvent(None, kCGScrollEventUnitLine, 2, ${Math.round(deltaY)}, ${Math.round(deltaX)}); CGEventPost(kCGHIDEventTap, e)"`;
        execSync(script);
      } else if (this.platform === 'win32') {
        // Windows: WHEEL_DELTA is 120 per notch
        const wheelDelta = Math.round(deltaY * 120);
        execSync(`powershell -command "
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport(\"user32.dll\")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
'
[Mouse]::mouse_event(0x0800, 0, 0, ${wheelDelta}, 0)
"`);
      } else {
        if (deltaY !== 0) {
          const direction = deltaY > 0 ? '4' : '5'; // 4 = up, 5 = down
          execSync(`xdotool click --repeat ${Math.abs(Math.round(deltaY))} ${direction}`);
        }
        if (deltaX !== 0) {
          const direction = deltaX > 0 ? '7' : '6'; // 7 = right, 6 = left
          execSync(`xdotool click --repeat ${Math.abs(Math.round(deltaX))} ${direction}`);
        }
      }
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  private getDefaultBounds(): MouseBounds {
    // Default to a reasonable screen size
    return {
      minX: 0,
      maxX: 3840,
      minY: 0,
      maxY: 2160,
    };
  }

  private recordAction(action: MouseAction): void {
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
  dispose(): void {
    this.disable();
    this.removeAllListeners();
    this.actionHistory = [];
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createMouseController(config?: MouseControllerConfig): MouseController {
  return new MouseController(config);
}

export default MouseController;
