/**
 * Alabobai Code Sandbox View
 * Full-page code execution environment
 */

import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Code2,
  Play,
  Square,
  Trash2,
  Download,
  Upload,
  Settings,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileCode,
  FolderOpen,
  File,
  ChevronRight,
  X,
  Package,
  Cpu,
  HardDrive,
  Info
} from 'lucide-react';
import { BRAND_TOKENS, BRAND_GRADIENT_ACCENT } from '@/config/brandTokens';
import { BRAND } from '@/config/brand';
import CodeExecutionPanel from './CodeExecutionPanel';
import codeSandbox, {
  type SandboxHealth,
  type LanguageInfo,
  formatDuration
} from '@/services/codeSandbox';

// ============================================================================
// TYPES
// ============================================================================

interface RecentExecution {
  id: string;
  language: string;
  code: string;
  success: boolean;
  duration: number;
  timestamp: Date;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function CodeSandboxView() {
  // State
  const [health, setHealth] = useState<SandboxHealth | null>(null);
  const [languages, setLanguages] = useState<LanguageInfo[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<RecentExecution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<RecentExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Fetch initial data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [healthData, languagesData] = await Promise.all([
          codeSandbox.getHealth().catch(() => null),
          codeSandbox.getLanguages().catch(() => [])
        ]);
        setHealth(healthData);
        setLanguages(languagesData);
      } catch (error) {
        console.error('Failed to load sandbox data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Handle execution complete
  const handleExecutionComplete = (result: any) => {
    const execution: RecentExecution = {
      id: result.executionId,
      language: 'python', // This would come from the panel
      code: '', // This would come from the panel
      success: result.success,
      duration: result.duration,
      timestamp: new Date()
    };
    setRecentExecutions(prev => [execution, ...prev.slice(0, 9)]);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND_TOKENS.accent.base }} />
          <span className="text-white/60">Loading Code Sandbox...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-dark-500">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-rose-gold-400/10">
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-glow-sm"
            style={{ background: BRAND_GRADIENT_ACCENT }}
          >
            <Terminal className="w-5 h-5" style={{ color: BRAND_TOKENS.text.onAccent }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Code Sandbox</h1>
            <p className="text-sm text-white/50">Secure code execution environment</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Service Status */}
          {health && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              health.status === 'healthy'
                ? 'bg-green-500/20 text-green-400'
                : health.status === 'degraded'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                health.status === 'healthy' ? 'bg-green-400' :
                health.status === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'
              }`} />
              <span className="text-xs font-medium capitalize">{health.status}</span>
            </div>
          )}

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-rose-gold-400/10 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Code Editor */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 p-6 overflow-auto morphic-scrollbar">
            <CodeExecutionPanel
              onExecutionComplete={handleExecutionComplete}
              className="h-full"
            />
          </div>
        </div>

        {/* Right Panel - Info & History */}
        <div className="w-80 border-l border-rose-gold-400/10 flex flex-col overflow-hidden">
          {/* Service Info */}
          {health && (
            <div className="p-4 border-b border-rose-gold-400/10">
              <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <Info className="w-4 h-4" style={{ color: BRAND_TOKENS.accent.base }} />
                Service Info
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">Docker</span>
                  <span className={`text-xs ${health.dockerAvailable ? 'text-green-400' : 'text-red-400'}`}>
                    {health.dockerAvailable ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">Active Sessions</span>
                  <span className="text-xs text-white">{health.activeSessions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">Max Concurrent</span>
                  <span className="text-xs text-white">{health.maxConcurrentExecutions}</span>
                </div>
              </div>
            </div>
          )}

          {/* Supported Languages */}
          {languages.length > 0 && (
            <div className="p-4 border-b border-rose-gold-400/10">
              <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <Code2 className="w-4 h-4" style={{ color: BRAND_TOKENS.accent.base }} />
                Supported Languages
              </h3>
              <div className="space-y-2">
                {languages.map(lang => (
                  <div
                    key={lang.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg morphic-glass border border-rose-gold-400/10"
                  >
                    <FileCode className="w-4 h-4" style={{ color: BRAND_TOKENS.accent.base }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{lang.name}</div>
                      <div className="text-xs text-white/40">{lang.version}</div>
                    </div>
                    <span className="text-xs text-white/30">{lang.extension}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Executions */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 pb-2">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <Clock className="w-4 h-4" style={{ color: BRAND_TOKENS.accent.base }} />
                Recent Executions
              </h3>
            </div>
            <div className="flex-1 overflow-auto morphic-scrollbar px-4 pb-4">
              {recentExecutions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <Terminal className="w-8 h-8 text-white/20 mb-2" />
                  <span className="text-sm text-white/40">No recent executions</span>
                  <span className="text-xs text-white/30 mt-1">Run some code to see history</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentExecutions.map(exec => (
                    <button
                      key={exec.id}
                      onClick={() => setSelectedExecution(exec)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg morphic-glass border border-rose-gold-400/10 hover:border-rose-gold-400/30 transition-colors text-left"
                    >
                      {exec.success ? (
                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white truncate">
                          {exec.language.charAt(0).toUpperCase() + exec.language.slice(1)}
                        </div>
                        <div className="text-xs text-white/40">
                          {formatDuration(exec.duration)}
                        </div>
                      </div>
                      <span className="text-xs text-white/30">
                        {exec.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-4 border-t border-rose-gold-400/10">
            <div className="space-y-2">
              <button
                onClick={() => setRecentExecutions([])}
                disabled={recentExecutions.length === 0}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-rose-gold-400/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                Clear History
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="morphic-glass rounded-2xl border border-rose-gold-400/20 w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-rose-gold-400/10">
              <h2 className="text-lg font-semibold text-white">Sandbox Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-rose-gold-400/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Default Timeout</label>
                <select className="w-full px-3 py-2 rounded-lg bg-dark-400/50 border border-rose-gold-400/20 text-white text-sm focus:outline-none focus:border-rose-gold-400/50">
                  <option value="30000">30 seconds</option>
                  <option value="60000" selected>1 minute</option>
                  <option value="120000">2 minutes</option>
                  <option value="300000">5 minutes</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">Memory Limit</label>
                <select className="w-full px-3 py-2 rounded-lg bg-dark-400/50 border border-rose-gold-400/20 text-white text-sm focus:outline-none focus:border-rose-gold-400/50">
                  <option value="256">256 MB</option>
                  <option value="512" selected>512 MB</option>
                  <option value="1024">1 GB</option>
                  <option value="2048">2 GB</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white">Enable Network Access</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-dark-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-gold-400"></div>
                </label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-rose-gold-400/10 flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-rose-gold-400/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium shadow-glow-sm hover:opacity-90 transition-all"
                style={{
                  background: BRAND_GRADIENT_ACCENT,
                  color: BRAND_TOKENS.text.onAccent
                }}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
