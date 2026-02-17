/**
 * Alabobai Code Execution Hook
 * React hook for executing code in the sandbox
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import codeSandbox, {
  type SupportedLanguage,
  type ExecutionOutput,
  type ExecutionResult,
  normalizeLanguage,
  isExecutableLanguage
} from '@/services/codeSandbox';

// ============================================================================
// TYPES
// ============================================================================

export interface UseCodeExecutionOptions {
  onStart?: (executionId: string) => void;
  onOutput?: (output: ExecutionOutput) => void;
  onComplete?: (result: ExecutionResult) => void;
  onError?: (error: string) => void;
}

export interface CodeExecutionState {
  isRunning: boolean;
  executionId: string | null;
  outputs: ExecutionOutput[];
  result: ExecutionResult | null;
  error: string | null;
  duration: number | null;
}

export interface UseCodeExecutionReturn {
  state: CodeExecutionState;
  execute: (code: string, language: SupportedLanguage | string, packages?: string[]) => Promise<void>;
  cancel: () => Promise<void>;
  clear: () => void;
  isAvailable: boolean;
  isChecking: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCodeExecution(options: UseCodeExecutionOptions = {}): UseCodeExecutionReturn {
  const { onStart, onOutput, onComplete, onError } = options;

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<ExecutionOutput[]>([]);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);

  // Check availability on mount
  useEffect(() => {
    setIsChecking(true);
    codeSandbox.isAvailable()
      .then(setIsAvailable)
      .finally(() => setIsChecking(false));
  }, []);

  // Execute code
  const execute = useCallback(async (
    code: string,
    language: SupportedLanguage | string,
    packages?: string[]
  ) => {
    if (isRunning) {
      console.warn('[useCodeExecution] Already running');
      return;
    }

    // Normalize language
    const normalizedLanguage = isExecutableLanguage(language)
      ? normalizeLanguage(language)
      : 'javascript';

    // Reset state
    setIsRunning(true);
    setOutputs([]);
    setResult(null);
    setError(null);
    setDuration(null);
    startTimeRef.current = Date.now();

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      await codeSandbox.executeWithStream(
        {
          language: normalizedLanguage,
          code,
          packages,
          networkEnabled: packages && packages.length > 0
        },
        {
          onStart: (id) => {
            setExecutionId(id);
            onStart?.(id);
          },
          onOutput: (output) => {
            setOutputs(prev => [...prev, output]);
            onOutput?.(output);
          },
          onComplete: (completeResult) => {
            const fullResult: ExecutionResult = {
              executionId: executionId || '',
              success: completeResult.success,
              exitCode: completeResult.exitCode,
              stdout: '',
              stderr: '',
              duration: completeResult.duration,
              timedOut: completeResult.timedOut,
              filesCreated: completeResult.filesCreated,
              error: completeResult.error,
              status: completeResult.success ? 'completed' : 'failed'
            };
            setResult(fullResult);
            setDuration(completeResult.duration);
            setIsRunning(false);
            onComplete?.(fullResult);
          },
          onError: (errorMessage) => {
            setError(errorMessage);
            setIsRunning(false);
            setDuration(Date.now() - startTimeRef.current);
            onError?.(errorMessage);
          }
        },
        abortControllerRef.current
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setIsRunning(false);
      setDuration(Date.now() - startTimeRef.current);
      onError?.(errorMessage);
    }
  }, [isRunning, executionId, onStart, onOutput, onComplete, onError]);

  // Cancel execution
  const cancel = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (executionId) {
      await codeSandbox.cancelExecution(executionId);
    }
    setIsRunning(false);
    setDuration(Date.now() - startTimeRef.current);
  }, [executionId]);

  // Clear state
  const clear = useCallback(() => {
    setOutputs([]);
    setResult(null);
    setError(null);
    setDuration(null);
    setExecutionId(null);
  }, []);

  return {
    state: {
      isRunning,
      executionId,
      outputs,
      result,
      error,
      duration
    },
    execute,
    cancel,
    clear,
    isAvailable,
    isChecking
  };
}

export default useCodeExecution;

// ============================================================================
// SIMPLE EXECUTE HELPER
// ============================================================================

/**
 * Simple one-shot code execution
 */
export async function executeCode(
  code: string,
  language: SupportedLanguage | string,
  packages?: string[]
): Promise<ExecutionResult> {
  const normalizedLanguage = isExecutableLanguage(language)
    ? normalizeLanguage(language)
    : 'javascript';

  return codeSandbox.execute({
    language: normalizedLanguage,
    code,
    packages,
    networkEnabled: packages && packages.length > 0
  });
}
