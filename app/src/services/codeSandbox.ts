/**
 * Alabobai Code Sandbox Frontend Service
 * Client-side service for interacting with the sandbox API
 */

// ============================================================================
// TYPES
// ============================================================================

export type SupportedLanguage = 'python' | 'javascript' | 'typescript';

export interface ExecutionRequest {
  language: SupportedLanguage;
  code: string;
  files?: Record<string, string>;
  packages?: string[];
  timeout?: number;
  memoryLimit?: number;
  networkEnabled?: boolean;
  env?: Record<string, string>;
  stream?: boolean;
}

export interface ExecutionOutput {
  type: 'stdout' | 'stderr' | 'system' | 'file';
  content: string;
  timestamp: string;
  filename?: string;
}

export interface ExecutionResult {
  executionId: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
  filesCreated: string[];
  error?: string;
  status: string;
}

export interface ExecutionStatus {
  executionId: string;
  language: SupportedLanguage;
  status: string;
  createdAt: string;
  updatedAt: string;
  filesCreated: string[];
  hasResult: boolean;
}

export interface StreamCallbacks {
  onStart: (executionId: string) => void;
  onOutput: (output: ExecutionOutput) => void;
  onComplete: (result: { success: boolean; exitCode: number; duration: number; timedOut: boolean; filesCreated: string[]; error?: string }) => void;
  onError: (error: string) => void;
}

export interface LanguageInfo {
  id: SupportedLanguage;
  name: string;
  version: string;
  extension: string;
  icon: string;
  packageManager: string;
  example: string;
}

export interface SandboxHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  dockerAvailable: boolean;
  activeSessions: number;
  activeExecutions: number;
  maxConcurrentExecutions: number;
  supportedLanguages: string[];
}

// ============================================================================
// CODE SANDBOX SERVICE
// ============================================================================

const API_BASE = '/api/sandbox';

class CodeSandboxService {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Execute code and get result
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const response = await fetch(`${this.baseUrl}${API_BASE}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...request, stream: false })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || 'Execution failed');
    }

    return response.json();
  }

  /**
   * Execute code with streaming output
   */
  async executeWithStream(
    request: ExecutionRequest,
    callbacks: StreamCallbacks,
    abortController?: AbortController
  ): Promise<void> {
    const controller = abortController || new AbortController();

    try {
      const response = await fetch(`${this.baseUrl}${API_BASE}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...request, stream: true }),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.json();
        callbacks.onError(error.message || error.error || 'Execution failed');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError('No response body available');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              switch (parsed.type) {
                case 'start':
                  callbacks.onStart(parsed.executionId);
                  break;
                case 'output':
                  callbacks.onOutput({
                    type: parsed.outputType,
                    content: parsed.content,
                    timestamp: parsed.timestamp,
                    filename: parsed.filename
                  });
                  break;
                case 'complete':
                  callbacks.onComplete(parsed.result);
                  break;
                case 'error':
                  callbacks.onError(parsed.error);
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onError('Execution cancelled');
        return;
      }
      callbacks.onError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get execution status
   */
  async getStatus(executionId: string): Promise<ExecutionStatus> {
    const response = await fetch(`${this.baseUrl}${API_BASE}/status/${executionId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || 'Failed to get status');
    }

    return response.json();
  }

  /**
   * Get execution output
   */
  async getOutput(executionId: string): Promise<{
    executionId: string;
    status: string;
    outputs: ExecutionOutput[];
    result: ExecutionResult | null;
  }> {
    const response = await fetch(`${this.baseUrl}${API_BASE}/output/${executionId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || 'Failed to get output');
    }

    return response.json();
  }

  /**
   * Upload files to sandbox
   */
  async uploadFiles(executionId: string, files: File[]): Promise<string[]> {
    const formData = new FormData();
    formData.append('executionId', executionId);

    for (const file of files) {
      formData.append('files', file);
    }

    const response = await fetch(`${this.baseUrl}${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || 'Upload failed');
    }

    const result = await response.json();
    return result.uploadedFiles;
  }

  /**
   * Download a file from sandbox
   */
  async downloadFile(executionId: string, filename: string): Promise<Blob> {
    const response = await fetch(
      `${this.baseUrl}${API_BASE}/download/${executionId}/${encodeURIComponent(filename)}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || 'Download failed');
    }

    return response.blob();
  }

  /**
   * Download file and trigger browser download
   */
  async downloadFileToUser(executionId: string, filename: string): Promise<void> {
    const blob = await this.downloadFile(executionId, filename);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * List files in execution workspace
   */
  async listFiles(executionId: string, subdir?: string): Promise<string[]> {
    const params = subdir ? `?subdir=${encodeURIComponent(subdir)}` : '';
    const response = await fetch(`${this.baseUrl}${API_BASE}/files/${executionId}${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || 'Failed to list files');
    }

    const result = await response.json();
    return result.files;
  }

  /**
   * Cancel ongoing execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}${API_BASE}/cancel/${executionId}`, {
      method: 'POST'
    });

    if (!response.ok) {
      return false;
    }

    return true;
  }

  /**
   * Clean up execution
   */
  async cleanup(executionId: string): Promise<void> {
    await fetch(`${this.baseUrl}${API_BASE}/${executionId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Get sandbox health status
   */
  async getHealth(): Promise<SandboxHealth> {
    const response = await fetch(`${this.baseUrl}${API_BASE}/health`);

    if (!response.ok) {
      throw new Error('Failed to get health status');
    }

    return response.json();
  }

  /**
   * Get supported languages
   */
  async getLanguages(): Promise<LanguageInfo[]> {
    const response = await fetch(`${this.baseUrl}${API_BASE}/languages`);

    if (!response.ok) {
      throw new Error('Failed to get languages');
    }

    const result = await response.json();
    return result.languages;
  }

  /**
   * Check if sandbox service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.getHealth();
      return health.status !== 'unhealthy';
    } catch {
      return false;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const codeSandbox = new CodeSandboxService();

export default codeSandbox;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse code blocks from markdown text
 */
export function extractCodeBlocks(text: string): Array<{
  language: string;
  code: string;
  startIndex: number;
  endIndex: number;
}> {
  const blocks: Array<{
    language: string;
    code: string;
    startIndex: number;
    endIndex: number;
  }> = [];

  const regex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1]?.toLowerCase() || 'text',
      code: match[2].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }

  return blocks;
}

/**
 * Check if a language is executable
 */
export function isExecutableLanguage(language: string): language is SupportedLanguage {
  return ['python', 'javascript', 'typescript', 'js', 'ts', 'py'].includes(language.toLowerCase());
}

/**
 * Normalize language identifier
 */
export function normalizeLanguage(language: string): SupportedLanguage {
  const normalized = language.toLowerCase();

  switch (normalized) {
    case 'py':
    case 'python3':
    case 'python':
      return 'python';
    case 'js':
    case 'javascript':
    case 'node':
    case 'nodejs':
      return 'javascript';
    case 'ts':
    case 'typescript':
      return 'typescript';
    default:
      return 'javascript';
  }
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Get default example code for a language
 */
export function getExampleCode(language: SupportedLanguage): string {
  switch (language) {
    case 'python':
      return `# Python Example
import json

data = {
    "message": "Hello from Python!",
    "numbers": [1, 2, 3, 4, 5],
    "sum": sum([1, 2, 3, 4, 5])
}

print(json.dumps(data, indent=2))`;

    case 'javascript':
      return `// JavaScript Example
const data = {
  message: "Hello from JavaScript!",
  numbers: [1, 2, 3, 4, 5],
  sum: [1, 2, 3, 4, 5].reduce((a, b) => a + b, 0)
};

console.log(JSON.stringify(data, null, 2));`;

    case 'typescript':
      return `// TypeScript Example
interface Data {
  message: string;
  numbers: number[];
  sum: number;
}

const data: Data = {
  message: "Hello from TypeScript!",
  numbers: [1, 2, 3, 4, 5],
  sum: [1, 2, 3, 4, 5].reduce((a, b) => a + b, 0)
};

console.log(JSON.stringify(data, null, 2));`;

    default:
      return '// Enter your code here';
  }
}
