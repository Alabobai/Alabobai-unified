/**
 * Deep Research View Component
 * Provides a full interface for conducting real web research
 */

import { useState, useRef, useEffect } from 'react'
import {
  Search, FileText, ExternalLink, Clock, CheckCircle2,
  Loader2, AlertCircle, BookOpen, Brain, Sparkles,
  ArrowRight, Copy, Download, RefreshCw, Globe, Zap
} from 'lucide-react'
import {
  DeepResearchEngine,
  type ResearchProgress,
  type ResearchReport,
  type ResearchSource,
  type SearchResult,
  formatDuration
} from '@/services/deepResearch'
import { toast } from '@/stores/toastStore'
import { ProgressBar, GlowSpinner } from './ui/LoadingSpinner'
import { SkeletonSource, SkeletonResearchReport } from './ui/Skeleton'
import { BRAND } from '@/config/brand'

interface DeepResearchViewProps {
  onClose?: () => void
}

export default function DeepResearchView({ onClose: _onClose }: DeepResearchViewProps) {
  const [topic, setTopic] = useState('')
  const [isResearching, setIsResearching] = useState(false)
  const [progress, setProgress] = useState<ResearchProgress | null>(null)
  const [report, setReport] = useState<ResearchReport | null>(null)
  const [sources, setSources] = useState<ResearchSource[]>([])
  const [foundResults, setFoundResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const engineRef = useRef<DeepResearchEngine | null>(null)
  const reportEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    engineRef.current = new DeepResearchEngine()
    return () => {
      engineRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    if (report) {
      reportEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [report])

  const startResearch = async () => {
    if (!topic.trim() || !engineRef.current) return

    setIsResearching(true)
    setError(null)
    setReport(null)
    setSources([])
    setFoundResults([])

    try {
      await engineRef.current.research(topic, {
        onProgress: setProgress,
        onSourceFound: (result) => {
          setFoundResults(prev => [...prev, result])
        },
        onSourceProcessed: (source) => {
          setSources(prev => [...prev, source])
        },
        onComplete: (result) => {
          setReport(result)
          setIsResearching(false)
          toast.success(
            'Research Complete',
            `Found ${result.sources.length} sources and generated a comprehensive report.`
          )
        },
        onError: (err) => {
          setError(err.message)
          setIsResearching(false)

          // Show user-friendly toast
          const errorMsg = err.message.toLowerCase()
          if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
            toast.error(
              'Network Error',
              'Unable to fetch web sources. Please check your internet connection.'
            )
          } else if (errorMsg.includes('abort')) {
            toast.info('Research Stopped', 'The research was cancelled.')
          } else {
            toast.error(
              'Research Failed',
              err.message || 'An error occurred during research. Please try again.'
            )
          }
        }
      }, {
        maxSources: 5
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error.message)
      setIsResearching(false)
      toast.error('Research Error', 'An unexpected error occurred. Please try again.')
    }
  }

  const stopResearch = () => {
    engineRef.current?.stop()
    setIsResearching(false)
  }

  const copyReport = async () => {
    if (!report) return
    try {
      const text = formatReportAsText(report)
      await navigator.clipboard.writeText(text)
      toast.success('Copied', 'Report copied to clipboard.')
    } catch (err) {
      toast.error('Copy Failed', 'Unable to copy to clipboard. Please try again.')
    }
  }

  const downloadReport = () => {
    if (!report) return
    try {
      const text = formatReportAsMarkdown(report)
      const blob = new Blob([text], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `research-${report.topic.slice(0, 30).replace(/\s+/g, '-')}.md`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Downloaded', 'Report downloaded as Markdown.')
    } catch (err) {
      toast.error('Download Failed', 'Unable to download report. Please try again.')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isResearching) {
      e.preventDefault()
      startResearch()
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Brand Logo */}
            <div className="flex items-center gap-2">
              <img src={BRAND.assets.logo} alt={BRAND.name} className="w-8 h-8 object-contain logo-render" />
              <div className="h-6 w-px bg-white/10" />
            </div>
            {/* View Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg animate-pulse-glow">
                <Search className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Deep Research</h2>
                <p className="text-xs text-rose-gold-400/70">AI-powered web research with real sources</p>
              </div>
            </div>
          </div>

          {isResearching && (
            <button
              onClick={stopResearch}
              className="morphic-btn-ghost bg-rose-gold-500/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-500/30 px-4 py-2 text-sm"
            >
              Stop Research
            </button>
          )}
        </div>

        {/* Progress Bar */}
        {progress && isResearching && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/70 flex items-center gap-2">
                <PhaseIcon phase={progress.phase} />
                {progress.message}
              </span>
              <span className="text-sm text-rose-gold-400">{progress.progress}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-300 rounded-full transition-all duration-500 relative"
                style={{ width: `${progress.progress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-shimmer" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top: Input & Sources */}
        <div className="w-full border-b border-white/10 flex flex-col max-h-[320px] overflow-y-auto morphic-scrollbar">
          {/* Search Input */}
          <div className="p-4 border-b border-white/10">
            <div className="morphic-card p-1 rounded-xl">
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What would you like to research?"
                className="w-full h-20 p-3 bg-transparent text-white placeholder-white/30 resize-none focus:outline-none text-sm"
                disabled={isResearching}
              />
            </div>
            <button
              onClick={startResearch}
              disabled={!topic.trim() || isResearching}
              className="w-full morphic-btn mt-3 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <span className="flex items-center justify-center gap-2">
                {isResearching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Researching...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 group-hover:animate-bounce" />
                    Start Research
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </span>
            </button>
          </div>

          {/* Sources Panel */}
          <div className="flex-1 overflow-y-auto morphic-scrollbar">
            <div className="p-4">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                Sources ({sources.length})
              </h3>

              {!isResearching && sources.length === 0 && foundResults.length === 0 && (
                <div className="text-center py-8">
                  <Globe className="w-12 h-12 text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-white/40">
                    Enter a topic to begin research
                  </p>
                </div>
              )}

              {/* Skeleton Sources (while searching) */}
              {isResearching && sources.length === 0 && foundResults.length === 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-white/50 mb-2">Searching for sources...</p>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="stagger-item" style={{ animationDelay: `${i * 100}ms` }}>
                      <SkeletonSource />
                    </div>
                  ))}
                </div>
              )}

              {/* Found Results (during search) */}
              {isResearching && foundResults.length > 0 && sources.length === 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-white/50 mb-2">Found results:</p>
                  {foundResults.map((result, i) => (
                    <div
                      key={i}
                      className="morphic-card p-3 rounded-lg animate-fade-in-up hover-lift interactive-card"
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <div className="flex items-start gap-2">
                        <Loader2 className="w-4 h-4 text-rose-gold-400 animate-spin flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs text-white truncate">{result.title}</p>
                          <p className="text-[10px] text-white/40 truncate">{result.url}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Processed Sources */}
              <div className="space-y-2">
                {sources.map((source, i) => (
                  <SourceCard key={source.id} source={source} index={i} />
                ))}
              </div>
            </div>
          </div>

          {/* Quick Suggestions */}
          {!isResearching && !report && (
            <div className="p-4 border-t border-white/10">
              <p className="text-xs text-white/40 mb-2">Try researching:</p>
              <div className="space-y-2">
                {[
                  'Quantum Computing',
                  'Machine Learning',
                  'Renewable Energy',
                  'Space Exploration',
                  'Blockchain'
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setTopic(suggestion)}
                    className="w-full text-left text-xs text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: Report */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!report && !isResearching && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4 animate-float">
                  <BookOpen className="w-10 h-10 text-rose-gold-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  AI-Powered Research
                </h2>
                <p className="text-white/50 mb-6">
                  Enter any topic and our AI will search the web, analyze multiple sources,
                  and generate a comprehensive research report with citations.
                </p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="morphic-card p-3 rounded-xl">
                    <Search className="w-5 h-5 text-rose-gold-400 mx-auto mb-1" />
                    <p className="text-[10px] text-white/60">Web Search</p>
                  </div>
                  <div className="morphic-card p-3 rounded-xl">
                    <FileText className="w-5 h-5 text-rose-gold-400 mx-auto mb-1" />
                    <p className="text-[10px] text-white/60">Content Analysis</p>
                  </div>
                  <div className="morphic-card p-3 rounded-xl">
                    <Brain className="w-5 h-5 text-rose-gold-400 mx-auto mb-1" />
                    <p className="text-[10px] text-white/60">AI Synthesis</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isResearching && !report && (
            <div className="flex-1 flex flex-col p-8">
              {/* Research Progress Header */}
              <div className="text-center mb-8">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-gold-300/20 to-rose-gold-600/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-4">
                  <GlowSpinner size="lg" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  Researching: {topic}
                </h2>
                <p className="text-white/50 mb-4">
                  {progress?.message || 'Initializing research...'}
                </p>
                {progress && (
                  <div className="max-w-md mx-auto">
                    <ProgressBar progress={progress.progress} size="md" showLabel />
                  </div>
                )}
              </div>

              {/* Skeleton Report Preview */}
              <div className="flex-1 overflow-y-auto max-w-3xl mx-auto w-full">
                <SkeletonResearchReport />
              </div>
            </div>
          )}

          {report && (
            <div className="flex-1 overflow-y-auto morphic-scrollbar">
              <div className="p-6 max-w-3xl mx-auto">
                {/* Report Header */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-white mb-2">
                      {report.topic}
                    </h1>
                    <div className="flex items-center gap-4 text-xs text-white/50">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(report.researchDuration)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {report.sources.length} sources
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-rose-gold-400" />
                        Complete
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={copyReport}
                      className="morphic-btn p-2"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={downloadReport}
                      className="morphic-btn p-2"
                      title="Download as Markdown"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setReport(null)
                        setSources([])
                        setFoundResults([])
                        setTopic('')
                      }}
                      className="morphic-btn p-2"
                      title="New research"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Summary */}
                <section className="morphic-card p-6 rounded-xl mb-6">
                  <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-rose-gold-400" />
                    Executive Summary
                  </h2>
                  <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
                    {report.summary}
                  </p>
                </section>

                {/* Key Findings */}
                {report.keyFindings.length > 0 && (
                  <section className="morphic-card p-6 rounded-xl mb-6">
                    <h2 className="text-lg font-semibold text-white mb-3">
                      Key Findings
                    </h2>
                    <ul className="space-y-2">
                      {report.keyFindings.map((finding, i) => (
                        <li key={i} className="flex items-start gap-3 text-white/80">
                          <CheckCircle2 className="w-4 h-4 text-rose-gold-400 flex-shrink-0 mt-1" />
                          <span>{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Detailed Analysis */}
                <section className="morphic-card p-6 rounded-xl mb-6">
                  <h2 className="text-lg font-semibold text-white mb-3">
                    Detailed Analysis
                  </h2>
                  <div className="text-white/80 leading-relaxed whitespace-pre-wrap prose prose-invert prose-sm max-w-none">
                    {report.detailedAnalysis}
                  </div>
                </section>

                {/* Citations */}
                <section className="morphic-card p-6 rounded-xl mb-6">
                  <h2 className="text-lg font-semibold text-white mb-3">
                    Sources & Citations
                  </h2>
                  <div className="space-y-3">
                    {report.citations.map((citation) => (
                      <div key={citation.number} className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-gold-500/20 text-rose-gold-400 text-xs flex items-center justify-center">
                          {citation.number}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white">{citation.title}</p>
                          <a
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-rose-gold-400 hover:underline flex items-center gap-1 truncate"
                          >
                            {citation.url}
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <div ref={reportEndRef} />
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-4">
              <div className="morphic-card p-4 rounded-xl border border-rose-gold-400/30 bg-rose-gold-500/10">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-gold-400" />
                  <div>
                    <p className="text-sm font-medium text-rose-gold-400">Research Error</p>
                    <p className="text-xs text-white/60">{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SourceCard({ source, index }: { source: ResearchSource; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`morphic-card p-3 rounded-lg transition-all cursor-pointer ${
        source.error ? 'border-rose-gold-400/30' : 'border-rose-gold-400/30'
      }`}
      onClick={() => setExpanded(!expanded)}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-start gap-2">
        {source.error ? (
          <AlertCircle className="w-4 h-4 text-rose-gold-400 flex-shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-rose-gold-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white font-medium truncate">{source.title}</p>
          <p className="text-[10px] text-white/40 truncate">{source.url}</p>
          {source.relevanceScore !== undefined && (
            <div className="flex items-center gap-1 mt-1">
              <div className="h-1 w-16 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-gold-400 rounded-full"
                  style={{ width: `${source.relevanceScore * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-white/30">
                {Math.round(source.relevanceScore * 100)}%
              </span>
            </div>
          )}
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-white/40 hover:text-white"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {expanded && source.summary && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-xs text-white/60">{source.summary}</p>
        </div>
      )}

      {source.error && (
        <p className="text-[10px] text-rose-gold-400 mt-1">{source.error}</p>
      )}
    </div>
  )
}

function PhaseIcon({ phase }: { phase: string }) {
  switch (phase) {
    case 'searching':
      return <Search className="w-4 h-4 text-rose-gold-400 animate-pulse" />
    case 'fetching':
      return <Globe className="w-4 h-4 text-rose-gold-400 animate-pulse" />
    case 'extracting':
      return <FileText className="w-4 h-4 text-rose-gold-400 animate-pulse" />
    case 'analyzing':
      return <Brain className="w-4 h-4 text-rose-gold-400 animate-pulse" />
    case 'synthesizing':
      return <Sparkles className="w-4 h-4 text-rose-gold-400 animate-pulse" />
    case 'complete':
      return <CheckCircle2 className="w-4 h-4 text-rose-gold-400" />
    case 'error':
      return <AlertCircle className="w-4 h-4 text-rose-gold-400" />
    default:
      return <Loader2 className="w-4 h-4 text-white/50 animate-spin" />
  }
}

function formatReportAsText(report: ResearchReport): string {
  return `# ${report.topic}

## Summary
${report.summary}

## Key Findings
${report.keyFindings.map(f => `- ${f}`).join('\n')}

## Detailed Analysis
${report.detailedAnalysis}

## Sources
${report.citations.map(c => `[${c.number}] ${c.title} - ${c.url}`).join('\n')}

---
Research completed in ${formatDuration(report.researchDuration)}
Generated by ${BRAND.name} Deep Research
`
}

function formatReportAsMarkdown(report: ResearchReport): string {
  return `# Research Report: ${report.topic}

*Generated on ${report.generatedAt.toLocaleDateString()} in ${formatDuration(report.researchDuration)}*

---

## Executive Summary

${report.summary}

## Key Findings

${report.keyFindings.map(f => `- ${f}`).join('\n')}

## Detailed Analysis

${report.detailedAnalysis}

## Sources & Citations

${report.citations.map(c => `${c.number}. [${c.title}](${c.url}) - Accessed ${c.accessedAt.toLocaleDateString()}`).join('\n')}

---

*This report was generated by ${BRAND.name} Deep Research Agent*
`
}
