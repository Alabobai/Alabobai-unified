/**
 * Alabobai Sandbox Store
 * State management for code execution
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import codeSandbox, {
  type SupportedLanguage,
  type ExecutionOutput,
  type ExecutionResult
} from '@/services/codeSandbox';

// ============================================================================
// TYPES
// ============================================================================

export interface CodeExecution {
  id: string;
  language: SupportedLanguage;
  code: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  outputs: ExecutionOutput[];
  result?: ExecutionResult;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface SandboxState {
  // Executions
  executions: Map<string, CodeExecution>;
  activeExecutionId: string | null;

  // Service state
  isAvailable: boolean;
  isChecking: boolean;

  // UI state
  isPanelOpen: boolean;
  defaultLanguage: SupportedLanguage;

  // Actions
  checkAvailability: () => Promise<boolean>;
  startExecution: (code: string, language: SupportedLanguage, packages?: string[]) => Promise<string>;
  cancelExecution: (executionId: string) => Promise<void>;
  clearExecution: (executionId: string) => void;
  clearAllExecutions: () => void;
  setActiveExecution: (executionId: string | null) => void;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setDefaultLanguage: (language: SupportedLanguage) => void;
  getExecution: (executionId: string) => CodeExecution | undefined;
  getActiveExecution: () => CodeExecution | undefined;
}

// ============================================================================
// STORE
// ============================================================================

export const useSandboxStore = create<SandboxState>()(
  immer((set, get) => ({
    // Initial state
    executions: new Map(),
    activeExecutionId: null,
    isAvailable: false,
    isChecking: false,
    isPanelOpen: false,
    defaultLanguage: 'python',

    // Check if sandbox service is available
    checkAvailability: async () => {
      set(state => { state.isChecking = true; });

      try {
        const available = await codeSandbox.isAvailable();
        set(state => {
          state.isAvailable = available;
          state.isChecking = false;
        });
        return available;
      } catch {
        set(state => {
          state.isAvailable = false;
          state.isChecking = false;
        });
        return false;
      }
    },

    // Start a new code execution
    startExecution: async (code: string, language: SupportedLanguage, packages?: string[]) => {
      const executionId = crypto.randomUUID();

      // Create execution record
      const execution: CodeExecution = {
        id: executionId,
        language,
        code,
        status: 'pending',
        outputs: [],
        startedAt: new Date()
      };

      set(state => {
        state.executions.set(executionId, execution);
        state.activeExecutionId = executionId;
      });

      // Run execution
      try {
        set(state => {
          const exec = state.executions.get(executionId);
          if (exec) exec.status = 'running';
        });

        await codeSandbox.executeWithStream(
          {
            language,
            code,
            packages,
            networkEnabled: packages && packages.length > 0
          },
          {
            onStart: () => {
              set(state => {
                const exec = state.executions.get(executionId);
                if (exec) {
                  exec.outputs.push({
                    type: 'system',
                    content: 'Starting execution...',
                    timestamp: new Date().toISOString()
                  });
                }
              });
            },
            onOutput: (output) => {
              set(state => {
                const exec = state.executions.get(executionId);
                if (exec) {
                  exec.outputs.push(output);
                }
              });
            },
            onComplete: (result) => {
              set(state => {
                const exec = state.executions.get(executionId);
                if (exec) {
                  exec.status = result.success ? 'completed' : 'failed';
                  exec.completedAt = new Date();
                  exec.result = {
                    executionId,
                    success: result.success,
                    exitCode: result.exitCode,
                    stdout: '',
                    stderr: '',
                    duration: result.duration,
                    timedOut: result.timedOut,
                    filesCreated: result.filesCreated,
                    error: result.error,
                    status: result.success ? 'completed' : 'failed'
                  };
                }
              });
            },
            onError: (error) => {
              set(state => {
                const exec = state.executions.get(executionId);
                if (exec) {
                  exec.status = 'failed';
                  exec.error = error;
                  exec.completedAt = new Date();
                }
              });
            }
          }
        );
      } catch (error) {
        set(state => {
          const exec = state.executions.get(executionId);
          if (exec) {
            exec.status = 'failed';
            exec.error = error instanceof Error ? error.message : 'Unknown error';
            exec.completedAt = new Date();
          }
        });
      }

      return executionId;
    },

    // Cancel an ongoing execution
    cancelExecution: async (executionId: string) => {
      await codeSandbox.cancelExecution(executionId);

      set(state => {
        const exec = state.executions.get(executionId);
        if (exec) {
          exec.status = 'cancelled';
          exec.completedAt = new Date();
        }
      });
    },

    // Clear a specific execution
    clearExecution: (executionId: string) => {
      set(state => {
        state.executions.delete(executionId);
        if (state.activeExecutionId === executionId) {
          state.activeExecutionId = null;
        }
      });
    },

    // Clear all executions
    clearAllExecutions: () => {
      set(state => {
        state.executions.clear();
        state.activeExecutionId = null;
      });
    },

    // Set active execution
    setActiveExecution: (executionId: string | null) => {
      set(state => {
        state.activeExecutionId = executionId;
      });
    },

    // Toggle panel visibility
    togglePanel: () => {
      set(state => { state.isPanelOpen = !state.isPanelOpen; });
    },

    openPanel: () => {
      set(state => { state.isPanelOpen = true; });
    },

    closePanel: () => {
      set(state => { state.isPanelOpen = false; });
    },

    // Set default language
    setDefaultLanguage: (language: SupportedLanguage) => {
      set(state => { state.defaultLanguage = language; });
    },

    // Get a specific execution
    getExecution: (executionId: string) => {
      return get().executions.get(executionId);
    },

    // Get the active execution
    getActiveExecution: () => {
      const { activeExecutionId, executions } = get();
      if (!activeExecutionId) return undefined;
      return executions.get(activeExecutionId);
    }
  }))
);

export default useSandboxStore;
