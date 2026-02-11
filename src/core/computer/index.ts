/**
 * Alabobai Computer Control System
 *
 * A production-ready computer control system that's better than Manus.
 *
 * Features:
 * - Full visibility: See exactly what the agent is doing in real-time
 * - User intervention: Pause, take over, or stop at ANY point
 * - Complete recording: Every action is recorded for playback and audit
 * - AI-driven: Uses vision models to understand screens and decide actions
 * - Cross-platform: Works on macOS, Windows, and Linux
 * - Browser automation: Full Puppeteer integration for web tasks
 *
 * Usage:
 * ```typescript
 * import { createComputerController } from './core/computer';
 * import { getDefaultLLMClient } from './core/llm-client';
 *
 * const controller = createComputerController({
 *   llm: getDefaultLLMClient(),
 *   streamToUI: true,
 *   recordActions: true,
 * });
 *
 * // Subscribe to live updates
 * controller.subscribeLiveUpdates((update) => {
 *   console.log('Live update:', update.type, update.data);
 * });
 *
 * // Execute a task
 * const result = await controller.executeTask(
 *   'Open Chrome and search for "Alabobai AI"',
 *   { useBrowser: true }
 * );
 *
 * // User can pause at any time
 * await controller.pauseCurrentTask();
 *
 * // Or take over control
 * const intervention = controller.getInterventionHandler();
 * await intervention.takeover('User wants to do this manually');
 *
 * // Hand back to agent
 * await intervention.handback();
 * ```
 */

// Main controller
export {
  ComputerController,
  createComputerController,
  type ComputerControllerConfig,
  type TaskExecution,
  type ExecutionStep,
  type AIAnalysis,
  type TaskResult,
  type LiveUpdate,
  type ComputerControllerEvents,
} from './ComputerController.js';

// Screen capture
export {
  ScreenCapture,
  createScreenCapture,
  type ScreenCaptureResult,
  type CaptureRegion,
  type ScreenMetadata,
  type DisplayInfo,
  type ScreenCaptureConfig,
  type ContinuousCaptureConfig,
  type ScreenCaptureEvents,
} from './ScreenCapture.js';

// Mouse controller
export {
  MouseController,
  createMouseController,
  type MousePosition,
  type MouseBounds,
  type MouseButton,
  type MouseAction,
  type MouseControllerConfig,
  type MouseEvents,
} from './MouseController.js';

// Keyboard controller
export {
  KeyboardController,
  createKeyboardController,
  type ModifierKey,
  type SpecialKey,
  type KeyboardAction,
  type KeyboardControllerConfig,
  type KeyboardEvents,
} from './KeyboardController.js';

// Browser automation
export {
  BrowserAutomation,
  createBrowserAutomation,
  type BrowserAction,
  type ElementInfo,
  type PageInfo,
  type BrowserAutomationConfig,
  type NavigationOptions,
  type BrowserEvents,
} from './BrowserAutomation.js';

// Action recorder
export {
  ActionRecorder,
  createActionRecorder,
  type RecordedActionType,
  type RecordedAction,
  type SystemAction,
  type AIDecision,
  type ActionMetadata,
  type RecordingSession,
  type SessionMetadata,
  type ActionRecorderConfig,
  type PlaybackOptions,
  type ActionRecorderEvents,
} from './ActionRecorder.js';

// Intervention handler
export {
  InterventionHandler,
  createInterventionHandler,
  type InterventionType,
  type InterventionReason,
  type Intervention,
  type ApprovalRequest,
  type ControlState,
  type InterventionHandlerConfig,
  type SafetyCheck,
  type InterventionEvents,
  type StatusUpdate,
} from './InterventionHandler.js';
