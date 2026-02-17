/**
 * Alabobai Code Execution Panel
 * Interactive code editor with sandbox execution
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Play,
  Square,
  Download,
  Upload,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  FileCode,
  Terminal,
  Package,
  ChevronDown,
  ChevronRight,
  File,
  FolderOpen,
  X
} from 'lucide-react';
import { BRAND_TOKENS, BRAND_GRADIENT_ACCENT } from '@/config/brandTokens';
import codeSandbox, {
  type SupportedLanguage,
  type ExecutionOutput,
  type ExecutionResult,
  getExampleCode,
  formatDuration,
  normalizeLanguage
} from '@/services/codeSandbox';

// ============================================================================
// TYPES
// ============================================================================

interface CodeExecutionPanelProps {
  initialCode?: string;
  initialLanguage?: SupportedLanguage;
  onExecutionComplete?: (result: ExecutionResult) => void;
  className?: string;
  compact?: boolean;
  preferBrowserExecutable?: boolean; // Default to JavaScript when Docker unavailable
}

interface OutputLine {
  type: 'stdout' | 'stderr' | 'system' | 'file';
  content: string;
  timestamp: Date;
  filename?: string;
}

// ============================================================================
// LANGUAGE CONFIG
// ============================================================================

const LANGUAGES: Array<{
  id: SupportedLanguage;
  name: string;
  icon: string;
}> = [
  { id: 'python', name: 'Python', icon: 'python' },
  { id: 'javascript', name: 'JavaScript', icon: 'javascript' },
  { id: 'typescript', name: 'TypeScript', icon: 'typescript' }
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function CodeExecutionPanel({
  initialCode,
  initialLanguage = 'python',
  onExecutionComplete,
  className = '',
  compact = false,
  preferBrowserExecutable = true
}: CodeExecutionPanelProps) {
  // State
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [code, setCode] = useState(initialCode || getExampleCode(initialLanguage));
  const [packages, setPackages] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<OutputLine[]>([]);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPackages, setShowPackages] = useState(false);
  const [filesCreated, setFilesCreated] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const executionIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check service availability on mount
  useEffect(() => {
    let alive = true;

    const fallbackTimer = globalThis.setTimeout(() => {
      if (alive) setServiceAvailable(false);
    }, 2500);

    codeSandbox.isAvailable()
      .then((available) => {
        if (alive) setServiceAvailable(available);
      })
      .catch(() => {
        if (alive) setServiceAvailable(false);
      })
      .finally(() => {
        globalThis.clearTimeout(fallbackTimer);
      });

    return () => {
      alive = false;
      globalThis.clearTimeout(fallbackTimer);
    };
  }, []);

  // Auto-switch to browser-executable language when Docker is unavailable.
  useEffect(() => {
    if (!preferBrowserExecutable) return;
    if (serviceAvailable !== false) return;
    if (language === 'python') {
      setLanguage('javascript');
      if (!initialCode) {
        setCode(getExampleCode('javascript'));
      }
    }
  }, [preferBrowserExecutable, serviceAvailable, language, initialCode]);

  // Keep output scrolling fully user-controlled (no forced auto-jump)

  // Handle language change
  const handleLanguageChange = useCallback((newLanguage: SupportedLanguage) => {
    setLanguage(newLanguage);
    if (!initialCode) {
      setCode(getExampleCode(newLanguage));
    }
    setLanguageMenuOpen(false);
  }, [initialCode]);

  // Handle code execution
  const handleRun = useCallback(async () => {
    if (isRunning || !code.trim()) return;

    setIsRunning(true);
    setOutputs([]);
    setResult(null);
    setError(null);
    setFilesCreated([]);
    setExecutionId(null);
    executionIdRef.current = null;

    abortControllerRef.current = new AbortController();

    const packageList = packages
      .split(/[,\n]/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    try {
      await codeSandbox.executeWithStream(
        {
          language,
          code,
          packages: packageList.length > 0 ? packageList : undefined,
          networkEnabled: packageList.length > 0 // Enable network only if installing packages
        },
        {
          onStart: (id) => {
            executionIdRef.current = id;
            setExecutionId(id);
            setOutputs(prev => [...prev, {
              type: 'system',
              content: `Starting execution...`,
              timestamp: new Date()
            }]);
          },
          onOutput: (output) => {
            setOutputs(prev => [...prev, {
              type: output.type,
              content: output.content,
              timestamp: new Date(output.timestamp),
              filename: output.filename
            }]);
          },
          onComplete: (completeResult) => {
            const resolvedExecutionId = executionIdRef.current || executionId || '';
            const fullResult: ExecutionResult = {
              executionId: resolvedExecutionId,
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
            setFilesCreated(completeResult.filesCreated);
            setIsRunning(false);
            onExecutionComplete?.(fullResult);
          },
          onError: (errorMessage) => {
            setError(errorMessage);
            setIsRunning(false);
          }
        },
        abortControllerRef.current
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
    }
  }, [code, language, packages, isRunning, executionId, onExecutionComplete]);

  // Handle stop
  const handleStop = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (executionId) {
      await codeSandbox.cancelExecution(executionId);
    }
    setIsRunning(false);
  }, [executionId]);

  // Handle clear
  const handleClear = useCallback(() => {
    setOutputs([]);
    setResult(null);
    setError(null);
    setFilesCreated([]);
  }, []);

  // Handle copy code
  const handleCopyCode = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  // Handle file download
  const handleDownloadFile = useCallback(async (filename: string) => {
    if (!executionId) return;
    try {
      await codeSandbox.downloadFileToUser(executionId, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }, [executionId]);

  // Get status badge
  const getStatusBadge = () => {
    if (isRunning) {
      return (
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium"
          style={{ background: `${BRAND_TOKENS.semantic.info}20`, color: BRAND_TOKENS.semantic.info }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </span>
      );
    }
    if (result) {
      if (result.success) {
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium"
            style={{ background: `${BRAND_TOKENS.semantic.success}20`, color: BRAND_TOKENS.semantic.success }}>
            <CheckCircle className="w-3 h-3" />
            Completed in {formatDuration(result.duration)}
          </span>
        );
      } else if (result.timedOut) {
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium"
            style={{ background: `${BRAND_TOKENS.semantic.warning}20`, color: BRAND_TOKENS.semantic.warning }}>
            <Clock className="w-3 h-3" />
            Timed out
          </span>
        );
      } else {
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium"
            style={{ background: `${BRAND_TOKENS.semantic.danger}20`, color: BRAND_TOKENS.semantic.danger }}>
            <AlertCircle className="w-3 h-3" />
            Failed (exit {result.exitCode})
          </span>
        );
      }
    }
    return null;
  };

  // Browser-based JavaScript execution fallback
  const executeBrowserFallback = useCallback(async () => {
    if (isRunning || !code.trim()) return;

    setIsRunning(true);
    setOutputs([]);
    setResult(null);
    setError(null);
    setFilesCreated([]);

    const startTime = performance.now();

    setOutputs(prev => [...prev, {
      type: 'system',
      content: '⚡ Running in browser sandbox (Docker unavailable)...',
      timestamp: new Date()
    }]);

    try {
      // Capture console output
      const logs: OutputLine[] = [];
      const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info
      };

      const captureLog = (type: 'stdout' | 'stderr') => (...args: any[]) => {
        const content = args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        logs.push({ type, content, timestamp: new Date() });
        setOutputs(prev => [...prev, { type, content, timestamp: new Date() }]);
      };

      // Override console methods
      console.log = captureLog('stdout');
      console.info = captureLog('stdout');
      console.warn = captureLog('stderr');
      console.error = captureLog('stderr');

      let result: any;
      try {
        if (language === 'javascript' || language === 'typescript') {
          // Create a sandboxed execution context
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          const sandboxedCode = `
            "use strict";
            ${code}
          `;
          const fn = new AsyncFunction(sandboxedCode);
          result = await fn();
        } else if (language === 'python') {
          // For Python, show a helpful message
          setOutputs(prev => [...prev, {
            type: 'stderr',
            content: 'Python execution requires Docker. Please start Docker or use JavaScript/TypeScript instead.',
            timestamp: new Date()
          }]);
          throw new Error('Python requires Docker');
        }

        if (result !== undefined) {
          setOutputs(prev => [...prev, {
            type: 'stdout',
            content: `→ ${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`,
            timestamp: new Date()
          }]);
        }
      } finally {
        // Restore console methods
        console.log = originalConsole.log;
        console.error = originalConsole.error;
        console.warn = originalConsole.warn;
        console.info = originalConsole.info;
      }

      const duration = performance.now() - startTime;
      const fullResult: ExecutionResult = {
        executionId: `browser-${Date.now()}`,
        success: true,
        exitCode: 0,
        stdout: logs.filter(l => l.type === 'stdout').map(l => l.content).join('\n'),
        stderr: logs.filter(l => l.type === 'stderr').map(l => l.content).join('\n'),
        duration,
        timedOut: false,
        filesCreated: [],
        status: 'completed'
      };
      setResult(fullResult);
      onExecutionComplete?.(fullResult);

    } catch (err) {
      const duration = performance.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setOutputs(prev => [...prev, {
        type: 'stderr',
        content: `Error: ${errorMessage}`,
        timestamp: new Date()
      }]);
      setError(errorMessage);

      const fullResult: ExecutionResult = {
        executionId: `browser-${Date.now()}`,
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: errorMessage,
        duration,
        timedOut: false,
        filesCreated: [],
        error: errorMessage,
        status: 'failed'
      };
      setResult(fullResult);
      onExecutionComplete?.(fullResult);
    } finally {
      setIsRunning(false);
    }
  }, [code, language, isRunning, onExecutionComplete]);

  // Use browser fallback for JS/TS when Docker is unavailable
  const canUseBrowserFallback = serviceAvailable === false && (language === 'javascript' || language === 'typescript');
  const effectiveHandleRun = canUseBrowserFallback ? executeBrowserFallback : handleRun;

  // Show warning banner instead of blocking the whole component
  const showDockerWarning = serviceAvailable === false;

  return (
    <div className={`morphic-glass rounded-2xl border border-rose-gold-400/20 overflow-hidden ${className}`}>
      {/* Docker Unavailable Warning Banner */}
      {showDockerWarning && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-rose-gold-400/10"
          style={{ background: `${BRAND_TOKENS.semantic.warning}15` }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: BRAND_TOKENS.semantic.warning }} />
          <span className="text-xs" style={{ color: BRAND_TOKENS.semantic.warning }}>
            Docker unavailable. {canUseBrowserFallback
              ? 'Running JavaScript in browser sandbox.'
              : 'Switch to JavaScript for browser execution.'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-rose-gold-400/10">
        <div className="flex items-center gap-3">
          {/* Language Selector */}
          <div className="relative">
            <button
              onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg morphic-glass border border-rose-gold-400/20 hover:border-rose-gold-400/40 transition-colors"
            >
              <FileCode className="w-4 h-4" style={{ color: BRAND_TOKENS.accent.base }} />
              <span className="text-sm text-white">
                {LANGUAGES.find(l => l.id === language)?.name}
              </span>
              <ChevronDown className="w-3 h-3 text-white/50" />
            </button>

            {languageMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-40 py-1 rounded-xl morphic-glass border border-rose-gold-400/20 shadow-xl z-50">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.id}
                    onClick={() => handleLanguageChange(lang.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-rose-gold-400/10 transition-colors ${
                      language === lang.id ? 'text-rose-gold-400' : 'text-white/80'
                    }`}
                  >
                    <FileCode className="w-4 h-4" />
                    {lang.name}
                    {language === lang.id && (
                      <Check className="w-3 h-3 ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Packages Toggle */}
          <button
            onClick={() => setShowPackages(!showPackages)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showPackages
                ? 'bg-rose-gold-400/20 text-rose-gold-400'
                : 'text-white/60 hover:text-white/80 hover:bg-rose-gold-400/10'
            }`}
          >
            <Package className="w-4 h-4" />
            Packages
            {packages.trim() && (
              <span className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center"
                style={{ background: BRAND_TOKENS.accent.base, color: BRAND_TOKENS.text.onAccent }}>
                {packages.split(/[,\n]/).filter(p => p.trim()).length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge()}

          {/* Copy Button */}
          <button
            onClick={handleCopyCode}
            className="p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-rose-gold-400/10 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check className="w-4 h-4" style={{ color: BRAND_TOKENS.semantic.success }} />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>

          {/* Clear Button */}
          {outputs.length > 0 && (
            <button
              onClick={handleClear}
              className="p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-rose-gold-400/10 transition-colors"
              title="Clear output"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Run/Stop Button */}
          {isRunning ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: BRAND_TOKENS.semantic.danger,
                color: 'white'
              }}
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          ) : (
            <button
              onClick={effectiveHandleRun}
              disabled={!code.trim() || (serviceAvailable === null) || (serviceAvailable === false && !canUseBrowserFallback)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-sm hover:opacity-90"
              style={{
                background: BRAND_GRADIENT_ACCENT,
                color: BRAND_TOKENS.text.onAccent
              }}
            >
              <Play className="w-4 h-4" />
              {canUseBrowserFallback ? 'Run (Browser)' : 'Run'}
            </button>
          )}
        </div>
      </div>

      {/* Packages Input */}
      {showPackages && (
        <div className="px-4 py-3 border-b border-rose-gold-400/10 bg-dark-400/30">
          <label className="block text-xs text-white/60 mb-2">
            {language === 'python' ? 'pip packages' : 'npm packages'} (comma or newline separated)
          </label>
          <textarea
            value={packages}
            onChange={(e) => setPackages(e.target.value)}
            placeholder={language === 'python' ? 'numpy, pandas, requests' : 'lodash, axios, dayjs'}
            className="w-full px-3 py-2 rounded-lg bg-dark-500/50 border border-rose-gold-400/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-rose-gold-400/40 resize-none"
            rows={2}
          />
        </div>
      )}

      {/* Code Editor */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              effectiveHandleRun();
            }
          }}
          className={`w-full px-4 py-4 font-mono text-sm text-white bg-dark-500/30 border-none focus:outline-none resize-none morphic-scrollbar ${
            compact ? 'min-h-[150px]' : 'min-h-[300px]'
          }`}
          placeholder="Enter your code here..."
          spellCheck={false}
        />
        <div className="absolute bottom-2 right-2 text-xs text-white/30">
          {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to run
        </div>
      </div>

      {/* Output Panel */}
      {(outputs.length > 0 || error || filesCreated.length > 0) && (
        <div className="border-t border-rose-gold-400/10">
          {/* Output Header */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-rose-gold-400/10 bg-dark-400/30">
            <Terminal className="w-4 h-4" style={{ color: BRAND_TOKENS.accent.base }} />
            <span className="text-sm font-medium text-white">Output</span>
          </div>

          {/* Output Content */}
          <div className={`px-4 py-3 font-mono text-sm overflow-auto morphic-scrollbar bg-dark-500/50 ${
            compact ? 'max-h-[150px]' : 'max-h-[300px]'
          }`}>
            {outputs.map((output, index) => (
              <div
                key={index}
                className={`whitespace-pre-wrap break-words ${
                  output.type === 'stderr'
                    ? 'text-rose-400'
                    : output.type === 'system'
                    ? 'text-white/50 italic'
                    : 'text-white/90'
                }`}
              >
                {output.content}
              </div>
            ))}
            {error && (
              <div className="flex items-start gap-2 text-rose-400 mt-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Created Files */}
          {filesCreated.length > 0 && (
            <div className="px-4 py-3 border-t border-rose-gold-400/10 bg-dark-400/30">
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="w-4 h-4" style={{ color: BRAND_TOKENS.accent.base }} />
                <span className="text-sm font-medium text-white">Generated Files</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {filesCreated.map(filename => (
                  <button
                    key={filename}
                    onClick={() => handleDownloadFile(filename)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg morphic-glass border border-rose-gold-400/20 hover:border-rose-gold-400/40 transition-colors group"
                  >
                    <File className="w-3 h-3 text-white/60" />
                    <span className="text-sm text-white/80">{filename}</span>
                    <Download className="w-3 h-3 text-white/40 group-hover:text-rose-gold-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CODE BLOCK RUN BUTTON
// ============================================================================

interface RunCodeButtonProps {
  code: string;
  language: string;
  onRun?: () => void;
  className?: string;
}

export function RunCodeButton({ code, language, onRun, className = '' }: RunCodeButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; duration: number } | null>(null);

  const normalizedLang = normalizeLanguage(language);

  const handleRun = async () => {
    setIsRunning(true);
    setShowOutput(true);
    setOutput([]);
    setError(null);
    setResult(null);
    onRun?.();

    try {
      await codeSandbox.executeWithStream(
        { language: normalizedLang, code },
        {
          onStart: () => {},
          onOutput: (out) => {
            setOutput(prev => [...prev, {
              type: out.type,
              content: out.content,
              timestamp: new Date(out.timestamp)
            }]);
          },
          onComplete: (res) => {
            setResult({ success: res.success, duration: res.duration });
            setIsRunning(false);
          },
          onError: (err) => {
            setError(err);
            setIsRunning(false);
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
      setIsRunning(false);
    }
  };

  return (
    <div className={className}>
      <button
        onClick={handleRun}
        disabled={isRunning}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 shadow-glow-sm hover:opacity-90"
        style={{
          background: BRAND_GRADIENT_ACCENT,
          color: BRAND_TOKENS.text.onAccent
        }}
      >
        {isRunning ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Running...
          </>
        ) : (
          <>
            <Play className="w-3 h-3" />
            Run Code
          </>
        )}
      </button>

      {showOutput && (
        <div className="mt-3 rounded-xl morphic-glass border border-rose-gold-400/10 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-rose-gold-400/10 bg-dark-400/30">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3" style={{ color: BRAND_TOKENS.accent.base }} />
              <span className="text-xs text-white/60">Output</span>
            </div>
            <div className="flex items-center gap-2">
              {result && (
                <span className={`text-xs ${result.success ? 'text-rose-gold-400' : 'text-rose-400'}`}>
                  {result.success ? 'Success' : 'Failed'} ({formatDuration(result.duration)})
                </span>
              )}
              <button
                onClick={() => setShowOutput(false)}
                className="p-1 rounded hover:bg-rose-gold-400/10 transition-colors"
              >
                <X className="w-3 h-3 text-white/50" />
              </button>
            </div>
          </div>
          <div className="px-3 py-2 max-h-40 overflow-auto font-mono text-xs morphic-scrollbar bg-dark-500/50">
            {output.map((line, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap ${
                  line.type === 'stderr' ? 'text-rose-400' : 'text-white/80'
                }`}
              >
                {line.content}
              </div>
            ))}
            {error && (
              <div className="text-rose-400">{error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
