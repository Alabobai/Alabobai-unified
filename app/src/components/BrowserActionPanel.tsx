/**
 * Alabobai Browser Action Panel
 *
 * Manual action controls for browser automation:
 * - Action type selector
 * - Element selector input
 * - Script runner
 * - Quick actions
 * - AI task input
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Mouse, Type, Move, ScrollText, Timer, Code, Play, Square,
  Terminal, Send, Trash2, Plus, ChevronDown, ChevronRight,
  Settings, Zap, Brain, Target, Search, RefreshCw, Loader2,
  CheckCircle, XCircle, Copy, Download, Upload, FileCode,
  CornerDownLeft, Sparkles
} from 'lucide-react'
import browserControl, { BrowserAction, ActionResult, ElementInfo } from '@/services/browserControl'
import { BRAND_TOKENS } from '@/config/brandTokens'

// ============================================================================
// TYPES
// ============================================================================

interface BrowserActionPanelProps {
  sessionId: string | null
  onActionExecuted?: (result: ActionResult) => void
  onError?: (error: string) => void
  className?: string
}

interface ActionConfig {
  type: string
  icon: typeof Mouse
  label: string
  description: string
  fields: ActionField[]
}

interface ActionField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox'
  placeholder?: string
  options?: { value: string; label: string }[]
  required?: boolean
  defaultValue?: string | number | boolean
}

interface QuickAction {
  id: string
  label: string
  icon: typeof Mouse
  action: () => Promise<void>
}

// ============================================================================
// ACTION CONFIGS
// ============================================================================

const ACTION_CONFIGS: ActionConfig[] = [
  {
    type: 'click',
    icon: Mouse,
    label: 'Click',
    description: 'Click on an element or coordinates',
    fields: [
      { name: 'selector', label: 'Selector', type: 'text', placeholder: '#submit-btn or .my-button' },
      { name: 'x', label: 'X Coordinate', type: 'number', placeholder: '100' },
      { name: 'y', label: 'Y Coordinate', type: 'number', placeholder: '200' },
      {
        name: 'button',
        label: 'Button',
        type: 'select',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
          { value: 'middle', label: 'Middle' },
        ],
        defaultValue: 'left',
      },
    ],
  },
  {
    type: 'type',
    icon: Type,
    label: 'Type',
    description: 'Type text character by character',
    fields: [
      { name: 'text', label: 'Text', type: 'textarea', placeholder: 'Text to type...', required: true },
      { name: 'selector', label: 'Target Selector', type: 'text', placeholder: 'Optional: focus this element first' },
      { name: 'delay', label: 'Delay (ms)', type: 'number', placeholder: '50', defaultValue: 50 },
    ],
  },
  {
    type: 'fill',
    icon: Type,
    label: 'Fill',
    description: 'Fill a form field instantly',
    fields: [
      { name: 'selector', label: 'Selector', type: 'text', placeholder: '#email or input[name="email"]', required: true },
      { name: 'value', label: 'Value', type: 'text', placeholder: 'Value to fill', required: true },
    ],
  },
  {
    type: 'hover',
    icon: Move,
    label: 'Hover',
    description: 'Hover over an element',
    fields: [
      { name: 'selector', label: 'Selector', type: 'text', placeholder: '.dropdown-trigger' },
      { name: 'x', label: 'X Coordinate', type: 'number', placeholder: '100' },
      { name: 'y', label: 'Y Coordinate', type: 'number', placeholder: '200' },
    ],
  },
  {
    type: 'scroll',
    icon: ScrollText,
    label: 'Scroll',
    description: 'Scroll the page',
    fields: [
      { name: 'deltaY', label: 'Vertical (px)', type: 'number', placeholder: '300', defaultValue: 300 },
      { name: 'deltaX', label: 'Horizontal (px)', type: 'number', placeholder: '0', defaultValue: 0 },
      { name: 'selector', label: 'Element Selector', type: 'text', placeholder: 'Scroll to this element' },
    ],
  },
  {
    type: 'wait',
    icon: Timer,
    label: 'Wait',
    description: 'Wait for a condition',
    fields: [
      { name: 'duration', label: 'Duration (ms)', type: 'number', placeholder: '1000' },
      { name: 'selector', label: 'Wait for Selector', type: 'text', placeholder: '.loading-complete' },
      {
        name: 'state',
        label: 'State',
        type: 'select',
        options: [
          { value: 'visible', label: 'Visible' },
          { value: 'hidden', label: 'Hidden' },
          { value: 'attached', label: 'Attached' },
          { value: 'detached', label: 'Detached' },
        ],
        defaultValue: 'visible',
      },
    ],
  },
  {
    type: 'press',
    icon: CornerDownLeft,
    label: 'Press Key',
    description: 'Press a keyboard key',
    fields: [
      { name: 'key', label: 'Key', type: 'text', placeholder: 'Enter, Tab, Escape, etc.', required: true },
      {
        name: 'modifiers',
        label: 'Modifiers',
        type: 'text',
        placeholder: 'Control, Shift, Alt (comma-separated)',
      },
    ],
  },
  {
    type: 'evaluate',
    icon: Code,
    label: 'Evaluate',
    description: 'Run JavaScript on the page',
    fields: [
      {
        name: 'script',
        label: 'Script',
        type: 'textarea',
        placeholder: 'document.title',
        required: true,
      },
    ],
  },
]

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function BrowserActionPanel({
  sessionId,
  onActionExecuted,
  onError,
  className = '',
}: BrowserActionPanelProps) {
  // State
  const [selectedAction, setSelectedAction] = useState<string>('click')
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean>>({})
  const [isExecuting, setIsExecuting] = useState(false)
  const [lastResult, setLastResult] = useState<ActionResult | null>(null)
  const [showScript, setShowScript] = useState(false)
  const [scriptContent, setScriptContent] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [isAiProcessing, setIsAiProcessing] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    actions: true,
    quick: true,
    script: false,
    ai: true,
  })

  // Get current action config
  const currentConfig = ACTION_CONFIGS.find(c => c.type === selectedAction)

  // Reset field values when action changes
  useEffect(() => {
    if (currentConfig) {
      const defaults: Record<string, string | number | boolean> = {}
      currentConfig.fields.forEach(field => {
        if (field.defaultValue !== undefined) {
          defaults[field.name] = field.defaultValue
        }
      })
      setFieldValues(defaults)
    }
  }, [selectedAction, currentConfig])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleFieldChange = useCallback((name: string, value: string | number | boolean) => {
    setFieldValues(prev => ({ ...prev, [name]: value }))
  }, [])

  const executeAction = useCallback(async () => {
    if (!sessionId || !currentConfig) {
      onError?.('No session active')
      return
    }

    setIsExecuting(true)
    setLastResult(null)

    try {
      let result: ActionResult

      switch (currentConfig.type) {
        case 'click':
          result = await browserControl.click(sessionId, {
            selector: fieldValues.selector as string || undefined,
            x: fieldValues.x ? Number(fieldValues.x) : undefined,
            y: fieldValues.y ? Number(fieldValues.y) : undefined,
            button: (fieldValues.button as 'left' | 'right' | 'middle') || 'left',
          })
          break

        case 'type':
          result = await browserControl.type(sessionId, fieldValues.text as string, {
            selector: fieldValues.selector as string || undefined,
            delay: fieldValues.delay ? Number(fieldValues.delay) : undefined,
          })
          break

        case 'fill':
          result = await browserControl.fill(
            sessionId,
            fieldValues.selector as string,
            fieldValues.value as string
          )
          break

        case 'hover':
          result = await browserControl.hover(sessionId, {
            selector: fieldValues.selector as string || undefined,
            x: fieldValues.x ? Number(fieldValues.x) : undefined,
            y: fieldValues.y ? Number(fieldValues.y) : undefined,
          })
          break

        case 'scroll':
          result = await browserControl.scroll(sessionId, {
            deltaY: fieldValues.deltaY ? Number(fieldValues.deltaY) : 300,
            deltaX: fieldValues.deltaX ? Number(fieldValues.deltaX) : 0,
            selector: fieldValues.selector as string || undefined,
          })
          break

        case 'wait':
          result = await browserControl.wait(sessionId, {
            duration: fieldValues.duration ? Number(fieldValues.duration) : undefined,
            selector: fieldValues.selector as string || undefined,
            state: fieldValues.state as 'visible' | 'hidden' | undefined,
          })
          break

        case 'press':
          const modifiers = fieldValues.modifiers
            ? (fieldValues.modifiers as string).split(',').map(m => m.trim()) as ('Control' | 'Shift' | 'Alt' | 'Meta')[]
            : undefined
          result = await browserControl.press(sessionId, fieldValues.key as string, modifiers)
          break

        case 'evaluate':
          const evalResult = await browserControl.evaluate(sessionId, fieldValues.script as string)
          result = {
            success: true,
            data: evalResult,
            action: {
              id: crypto.randomUUID(),
              sessionId,
              type: 'evaluate',
              timestamp: new Date().toISOString(),
              data: { script: fieldValues.script },
              success: true,
            },
          }
          break

        default:
          throw new Error(`Unknown action type: ${currentConfig.type}`)
      }

      setLastResult(result)
      onActionExecuted?.(result)
    } catch (error) {
      const errorMessage = (error as Error).message
      setLastResult({
        success: false,
        error: errorMessage,
        action: {
          id: crypto.randomUUID(),
          sessionId,
          type: currentConfig.type as any,
          timestamp: new Date().toISOString(),
          data: fieldValues,
          success: false,
          error: errorMessage,
        },
      })
      onError?.(errorMessage)
    } finally {
      setIsExecuting(false)
    }
  }, [sessionId, currentConfig, fieldValues, onActionExecuted, onError])

  const executeScript = useCallback(async () => {
    if (!sessionId || !scriptContent.trim()) return

    setIsExecuting(true)
    setLastResult(null)

    try {
      const result = await browserControl.evaluate(sessionId, scriptContent)
      const actionResult: ActionResult = {
        success: true,
        data: result,
        action: {
          id: crypto.randomUUID(),
          sessionId,
          type: 'evaluate',
          timestamp: new Date().toISOString(),
          data: { script: scriptContent },
          success: true,
        },
      }
      setLastResult(actionResult)
      onActionExecuted?.(actionResult)
    } catch (error) {
      const errorMessage = (error as Error).message
      setLastResult({
        success: false,
        error: errorMessage,
        action: {
          id: crypto.randomUUID(),
          sessionId,
          type: 'evaluate',
          timestamp: new Date().toISOString(),
          data: { script: scriptContent },
          success: false,
          error: errorMessage,
        },
      })
      onError?.(errorMessage)
    } finally {
      setIsExecuting(false)
    }
  }, [sessionId, scriptContent, onActionExecuted, onError])

  const handleAiSubmit = useCallback(async () => {
    if (!sessionId || !aiPrompt.trim()) return

    setIsAiProcessing(true)

    try {
      // This would integrate with the browser agent service
      // For now, we'll show a placeholder
      await new Promise(resolve => setTimeout(resolve, 1000))

      // The actual implementation would call the browser agent
      // const result = await browserAgent.executeTask(sessionId, { goal: aiPrompt })

      setAiPrompt('')
    } catch (error) {
      onError?.((error as Error).message)
    } finally {
      setIsAiProcessing(false)
    }
  }, [sessionId, aiPrompt, onError])

  // ============================================================================
  // QUICK ACTIONS
  // ============================================================================

  const quickActions: QuickAction[] = [
    {
      id: 'scroll-down',
      label: 'Scroll Down',
      icon: ScrollText,
      action: async () => {
        if (sessionId) await browserControl.scroll(sessionId, { deltaY: 500 })
      },
    },
    {
      id: 'scroll-up',
      label: 'Scroll Up',
      icon: ScrollText,
      action: async () => {
        if (sessionId) await browserControl.scroll(sessionId, { deltaY: -500 })
      },
    },
    {
      id: 'scroll-top',
      label: 'To Top',
      icon: ScrollText,
      action: async () => {
        if (sessionId) await browserControl.press(sessionId, 'Home', ['Control'])
      },
    },
    {
      id: 'scroll-bottom',
      label: 'To Bottom',
      icon: ScrollText,
      action: async () => {
        if (sessionId) await browserControl.press(sessionId, 'End', ['Control'])
      },
    },
    {
      id: 'escape',
      label: 'Escape',
      icon: CornerDownLeft,
      action: async () => {
        if (sessionId) await browserControl.press(sessionId, 'Escape')
      },
    },
    {
      id: 'enter',
      label: 'Enter',
      icon: CornerDownLeft,
      action: async () => {
        if (sessionId) await browserControl.press(sessionId, 'Enter')
      },
    },
  ]

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  const isDisabled = !sessionId

  return (
    <div className={`flex flex-col h-full bg-dark-400 border-l border-white/10 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
          <Terminal className="w-4 h-4" style={{ color: BRAND_TOKENS.accent.base }} />
          Browser Actions
        </h3>
        <p className="text-xs text-white/40 mt-1">Control the browser manually</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* AI Task Input */}
        <div className="border-b border-white/10">
          <button
            onClick={() => toggleSection('ai')}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <span className="text-xs font-medium text-white/60 flex items-center gap-2">
              <Sparkles className="w-3 h-3" style={{ color: BRAND_TOKENS.accent.base }} />
              AI Task
            </span>
            {expandedSections.ai ? (
              <ChevronDown className="w-3 h-3 text-white/40" />
            ) : (
              <ChevronRight className="w-3 h-3 text-white/40" />
            )}
          </button>

          {expandedSections.ai && (
            <div className="px-4 pb-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
                  placeholder="Describe what you want to do..."
                  disabled={isDisabled || isAiProcessing}
                  className="flex-1 px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-sm text-white/80 placeholder:text-white/30 outline-none focus:border-rose-gold-400/50 disabled:opacity-50 transition-colors"
                />
                <button
                  onClick={handleAiSubmit}
                  disabled={isDisabled || isAiProcessing || !aiPrompt.trim()}
                  className="px-3 py-2 rounded-lg bg-rose-gold-400/20 text-rose-gold-400 hover:bg-rose-gold-400/30 disabled:opacity-50 transition-colors"
                >
                  {isAiProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Brain className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-white/30 mt-2">
                Example: "Find the login button and click it"
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="border-b border-white/10">
          <button
            onClick={() => toggleSection('quick')}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <span className="text-xs font-medium text-white/60 flex items-center gap-2">
              <Zap className="w-3 h-3" style={{ color: BRAND_TOKENS.accent.base }} />
              Quick Actions
            </span>
            {expandedSections.quick ? (
              <ChevronDown className="w-3 h-3 text-white/40" />
            ) : (
              <ChevronRight className="w-3 h-3 text-white/40" />
            )}
          </button>

          {expandedSections.quick && (
            <div className="px-4 pb-3 grid grid-cols-3 gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  onClick={action.action}
                  disabled={isDisabled}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg bg-dark-300 border border-white/10 hover:border-white/20 hover:bg-dark-200 disabled:opacity-50 transition-all"
                >
                  <action.icon className="w-4 h-4 text-white/60" />
                  <span className="text-xs text-white/50">{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Manual Actions */}
        <div className="border-b border-white/10">
          <button
            onClick={() => toggleSection('actions')}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <span className="text-xs font-medium text-white/60 flex items-center gap-2">
              <Settings className="w-3 h-3" style={{ color: BRAND_TOKENS.accent.base }} />
              Manual Actions
            </span>
            {expandedSections.actions ? (
              <ChevronDown className="w-3 h-3 text-white/40" />
            ) : (
              <ChevronRight className="w-3 h-3 text-white/40" />
            )}
          </button>

          {expandedSections.actions && (
            <div className="px-4 pb-3 space-y-3">
              {/* Action Type Selector */}
              <div className="flex flex-wrap gap-1">
                {ACTION_CONFIGS.map((config) => (
                  <button
                    key={config.type}
                    onClick={() => setSelectedAction(config.type)}
                    disabled={isDisabled}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                      selectedAction === config.type
                        ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                        : 'bg-dark-300 text-white/60 border border-white/10 hover:border-white/20'
                    } disabled:opacity-50`}
                  >
                    <config.icon className="w-3 h-3" />
                    {config.label}
                  </button>
                ))}
              </div>

              {/* Action Fields */}
              {currentConfig && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40">{currentConfig.description}</p>

                  {currentConfig.fields.map((field) => (
                    <div key={field.name}>
                      <label className="text-xs text-white/50 mb-1 block">
                        {field.label}
                        {field.required && <span className="text-rose-gold-400">*</span>}
                      </label>

                      {field.type === 'select' ? (
                        <select
                          value={String(fieldValues[field.name] ?? field.defaultValue ?? '')}
                          onChange={(e) => handleFieldChange(field.name, e.target.value)}
                          disabled={isDisabled}
                          className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-sm text-white/80 outline-none focus:border-rose-gold-400/50 disabled:opacity-50"
                        >
                          {field.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'textarea' ? (
                        <textarea
                          value={String(fieldValues[field.name] ?? '')}
                          onChange={(e) => handleFieldChange(field.name, e.target.value)}
                          placeholder={field.placeholder}
                          disabled={isDisabled}
                          rows={3}
                          className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-sm text-white/80 placeholder:text-white/30 outline-none focus:border-rose-gold-400/50 disabled:opacity-50 resize-none"
                        />
                      ) : field.type === 'checkbox' ? (
                        <input
                          type="checkbox"
                          checked={Boolean(fieldValues[field.name])}
                          onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                          disabled={isDisabled}
                          className="rounded bg-dark-300 border-white/20"
                        />
                      ) : (
                        <input
                          type={field.type}
                          value={String(fieldValues[field.name] ?? '')}
                          onChange={(e) => handleFieldChange(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                          placeholder={field.placeholder}
                          disabled={isDisabled}
                          className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-sm text-white/80 placeholder:text-white/30 outline-none focus:border-rose-gold-400/50 disabled:opacity-50"
                        />
                      )}
                    </div>
                  ))}

                  {/* Execute Button */}
                  <button
                    onClick={executeAction}
                    disabled={isDisabled || isExecuting}
                    className="w-full py-2 rounded-lg bg-rose-gold-400/20 border border-rose-gold-400/30 text-rose-gold-400 text-sm font-medium hover:bg-rose-gold-400/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Execute {currentConfig.label}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Script Runner */}
        <div className="border-b border-white/10">
          <button
            onClick={() => toggleSection('script')}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <span className="text-xs font-medium text-white/60 flex items-center gap-2">
              <FileCode className="w-3 h-3" style={{ color: BRAND_TOKENS.accent.base }} />
              Script Runner
            </span>
            {expandedSections.script ? (
              <ChevronDown className="w-3 h-3 text-white/40" />
            ) : (
              <ChevronRight className="w-3 h-3 text-white/40" />
            )}
          </button>

          {expandedSections.script && (
            <div className="px-4 pb-3 space-y-2">
              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                placeholder="// JavaScript to run on the page&#10;document.title"
                disabled={isDisabled}
                rows={5}
                className="w-full px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-sm text-white/80 font-mono placeholder:text-white/30 outline-none focus:border-rose-gold-400/50 disabled:opacity-50 resize-none"
              />
              <button
                onClick={executeScript}
                disabled={isDisabled || isExecuting || !scriptContent.trim()}
                className="w-full py-2 rounded-lg bg-dark-300 border border-white/10 text-white/60 text-sm hover:bg-dark-200 hover:border-white/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run Script
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Result Display */}
        {lastResult && (
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2 mb-2">
              {lastResult.success ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-xs font-medium ${lastResult.success ? 'text-green-500' : 'text-red-500'}`}>
                {lastResult.success ? 'Success' : 'Failed'}
              </span>
            </div>

            {lastResult.error && (
              <p className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                {lastResult.error}
              </p>
            )}

            {lastResult.data !== undefined && (
              <div className="mt-2">
                <p className="text-xs text-white/40 mb-1">Result:</p>
                <pre className="text-xs text-white/60 bg-dark-300 px-2 py-1 rounded overflow-auto max-h-32">
                  {typeof lastResult.data === 'object'
                    ? JSON.stringify(lastResult.data, null, 2)
                    : String(lastResult.data)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10 bg-dark-300">
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>
            {sessionId ? (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Session active
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-white/30" />
                No session
              </span>
            )}
          </span>
          {isExecuting && (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Processing...
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
