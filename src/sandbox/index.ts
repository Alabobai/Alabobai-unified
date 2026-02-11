/**
 * Alabobai Sandbox Module
 * Docker-based sandbox system for secure task execution
 *
 * Features:
 * - Isolated Docker containers for each task
 * - Memory limits (2GB), CPU limits, network isolation
 * - Execute shell commands, Python code, Node.js code
 * - Timeout protection (max 5 minutes per execution)
 * - Auto-cleanup after task completion
 * - File system mounting for task workspace
 * - Capture stdout/stderr and return results
 */

// Export Sandbox class and types
export {
  Sandbox,
  type ExecutionLanguage,
  type ExecutionRequest,
  type ExecutionResult,
  type SandboxConfig,
  type SandboxStatus,
} from './Sandbox.js';

// Export SandboxManager class, factory functions, and types
export {
  SandboxManager,
  createSandboxManager,
  getSandboxManager,
  resetSandboxManager,
  type SandboxManagerConfig,
  type CreateSandboxOptions,
  type SandboxManagerStatus,
  type BatchExecutionRequest,
  type BatchExecutionResult,
} from './SandboxManager.js';

// Re-export default
import { SandboxManager } from './SandboxManager.js';
export default SandboxManager;

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import { getSandboxManager } from './SandboxManager.js';
import type { BatchExecutionResult, SandboxManagerConfig } from './SandboxManager.js';

/**
 * Execute shell command in a sandbox
 */
export async function executeInSandbox(
  taskId: string,
  command: string,
  config?: SandboxManagerConfig
): Promise<BatchExecutionResult> {
  const manager = getSandboxManager(config);
  await manager.initialize();
  return manager.executeShell(taskId, command);
}

/**
 * Execute Python code in a sandbox
 */
export async function executePythonInSandbox(
  taskId: string,
  code: string,
  config?: SandboxManagerConfig
): Promise<BatchExecutionResult> {
  const manager = getSandboxManager(config);
  await manager.initialize();
  return manager.executePython(taskId, code);
}

/**
 * Execute Node.js code in a sandbox
 */
export async function executeNodeInSandbox(
  taskId: string,
  code: string,
  config?: SandboxManagerConfig
): Promise<BatchExecutionResult> {
  const manager = getSandboxManager(config);
  await manager.initialize();
  return manager.executeNode(taskId, code);
}

/**
 * Execute arbitrary code in a sandbox
 */
export async function executeCodeInSandbox(
  taskId: string,
  language: 'shell' | 'python' | 'node',
  code: string,
  options?: {
    timeout?: number;
    workDir?: string;
    env?: Record<string, string>;
    files?: Record<string, string | Buffer>;
    config?: SandboxManagerConfig;
  }
): Promise<BatchExecutionResult> {
  const manager = getSandboxManager(options?.config);
  await manager.initialize();

  return manager.execute({
    taskId,
    language,
    code,
    timeout: options?.timeout,
    workDir: options?.workDir,
    env: options?.env,
    files: options?.files,
  });
}

/**
 * Cleanup sandbox for a task
 */
export async function cleanupSandbox(
  taskId: string,
  config?: SandboxManagerConfig
): Promise<void> {
  const manager = getSandboxManager(config);
  await manager.destroySandboxByTask(taskId);
}
