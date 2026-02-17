/**
 * Data Analyst View Component
 * Comprehensive data analysis capabilities with real data processing and Chart.js visualizations
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import {
  BarChart3, Upload, FileText, Table, PieChart, TrendingUp,
  Download, Copy, Sparkles, AlertCircle, CheckCircle2,
  Loader2, ChevronDown, ChevronUp, Search,
  Database, Brain, SortAsc, SortDesc, Trash2, Filter,
  RefreshCw, Activity, Grid3X3, Settings, Eye, EyeOff,
  ArrowUpDown, Columns, FileJson, FilePlus, Clipboard,
  MoreVertical, ChevronLeft, ChevronRight, Maximize2,
  LayoutGrid, List, Zap, Info
} from 'lucide-react'
import ChartBuilder, { CSSBarChart, CSSLineChart, CSSPieChart } from './ChartBuilder'
import {
  parseData, parseCSV, parseJSON,
  calculateColumnStats, calculateCorrelationMatrix, calculateBasicStats,
  suggestCharts, aggregateBy,
  filterData, sortData, searchData,
  exportAsCSV, exportAsJSON, exportStatsSummary,
  analyzeMissingValues, detectOutliers,
  SAMPLE_DATASETS,
  type ParsedData, type DataColumn, type ColumnStats,
  type FilterCondition, type SortConfig, type CorrelationResult, type ChartSuggestion
} from '../services/dataAnalysis'
import { aiService } from '@/services/ai'
import { BRAND_TOKENS } from '@/config/brandTokens'
import { BRAND } from '@/config/brand'

// ============================================================================
// Types
// ============================================================================

type ActiveTab = 'data' | 'statistics' | 'charts' | 'correlation' | 'ai'
type SortDirection = 'asc' | 'desc' | null
type ViewMode = 'table' | 'cards'

interface AnalysisResult {
  summary: string
  insights: string[]
  recommendations: string[]
  warnings?: string[]
}

// ============================================================================
// Color palette for charts
// ============================================================================

const CHART_COLORS = [...BRAND_TOKENS.charts.primary]

// ============================================================================
// Main Component
// ============================================================================

export default function DataAnalystView() {
  // ========== Data State ==========
  const [inputMode, setInputMode] = useState<'paste' | 'upload' | 'sample'>('paste')
  const [rawInput, setRawInput] = useState('')
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // ========== UI State ==========
  const [activeTab, setActiveTab] = useState<ActiveTab>('data')
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  // ========== Table State ==========
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [filterText, setFilterText] = useState('')
  const [filters, setFilters] = useState<FilterCondition[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  // ========== Chart State ==========
  const [selectedChartType, setSelectedChartType] = useState<'bar' | 'line' | 'pie' | 'scatter' | 'histogram'>('bar')
  const [chartXAxis, setChartXAxis] = useState('')
  const [chartYAxis, setChartYAxis] = useState('')
  const [chartAggregation, setChartAggregation] = useState<'sum' | 'avg' | 'count' | 'min' | 'max'>('sum')
  const [chartSuggestions, setChartSuggestions] = useState<ChartSuggestion[]>([])
  const [useChartBuilder, setUseChartBuilder] = useState(true)

  // ========== Correlation State ==========
  const [correlationMatrix, setCorrelationMatrix] = useState<CorrelationResult[]>([])

  // ========== AI Analysis State ==========
  const [aiQuery, setAiQuery] = useState('')
  const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // ========== Drag & Drop State ==========
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // ========== Derived Data ==========
  const filteredData = useMemo(() => {
    if (!parsedData) return []

    let data = [...parsedData.raw]

    // Apply text search
    if (filterText) {
      data = searchData(data, filterText)
    }

    // Apply column filters
    if (filters.length > 0) {
      data = filterData(data, filters)
    }

    // Apply sorting
    if (sortColumn && sortDirection) {
      data = sortData(data, [{ column: sortColumn, direction: sortDirection }])
    }

    return data
  }, [parsedData, filterText, filters, sortColumn, sortDirection])

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize)
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredData.slice(start, start + pageSize)
  }, [filteredData, currentPage, pageSize])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filterText, filters, sortColumn, sortDirection])

  // Calculate correlations when data changes
  useEffect(() => {
    if (parsedData) {
      const matrix = calculateCorrelationMatrix(parsedData)
      setCorrelationMatrix(matrix)

      const suggestions = suggestCharts(parsedData)
      setChartSuggestions(suggestions)

      // Set default chart axes
      const numericCol = parsedData.columns.find(c => c.type === 'number')
      const categoricalCol = parsedData.columns.find(c => c.type === 'string')
      if (categoricalCol) setChartXAxis(categoricalCol.name)
      if (numericCol) setChartYAxis(numericCol.name)
    }
  }, [parsedData])

  // ========== Parse Functions ==========
  const handleParse = useCallback(async () => {
    setError(null)
    setIsProcessing(true)

    try {
      const trimmed = rawInput.trim()
      if (!trimmed) {
        throw new Error('Please enter some data to analyze')
      }

      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 100))

      const data = parseData(trimmed)
      setParsedData(data)
      setActiveTab('data')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse data')
    } finally {
      setIsProcessing(false)
    }
  }, [rawInput])

  // ========== File Handling ==========
  const handleFileUpload = useCallback((files: FileList | null) => {
    const file = files?.[0]
    if (!file) return

    setIsProcessing(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setRawInput(text)
      setInputMode('paste')

      // Auto-parse the file
      try {
        const data = parseData(text)
        setParsedData(data)
        setActiveTab('data')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file')
      } finally {
        setIsProcessing(false)
      }
    }
    reader.onerror = () => {
      setError('Failed to read file')
      setIsProcessing(false)
    }
    reader.readAsText(file)
  }, [])

  // ========== Drag & Drop ==========
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer?.files
    handleFileUpload(files)
  }, [handleFileUpload])

  // ========== Clipboard Paste ==========
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setRawInput(text)
        setInputMode('paste')
      }
    } catch (err) {
      setError('Failed to read from clipboard. Please paste manually.')
    }
  }, [])

  // ========== Sample Data ==========
  const loadSample = useCallback((key: keyof typeof SAMPLE_DATASETS) => {
    const sample = SAMPLE_DATASETS[key]
    setRawInput(sample.data)
    setInputMode('paste')

    // Auto-parse
    try {
      const data = parseCSV(sample.data)
      setParsedData(data)
      setActiveTab('data')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse sample data')
    }
  }, [])

  // ========== Sorting ==========
  const toggleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection(null)
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }, [sortColumn, sortDirection])

  // ========== Column Visibility ==========
  const toggleColumnVisibility = useCallback((column: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev)
      if (next.has(column)) {
        next.delete(column)
      } else {
        next.add(column)
      }
      return next
    })
  }, [])

  // ========== Row Selection ==========
  const toggleRowSelection = useCallback((index: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const selectAllRows = useCallback(() => {
    if (selectedRows.size === filteredData.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(filteredData.map((_, i) => i)))
    }
  }, [filteredData, selectedRows.size])

  // ========== Export Functions ==========
  const handleExportCSV = useCallback(() => {
    if (!parsedData) return

    const dataToExport = selectedRows.size > 0
      ? Array.from(selectedRows).map(i => filteredData[i])
      : filteredData

    const csv = exportAsCSV(parsedData, dataToExport)
    downloadFile(csv, 'data-export.csv', 'text/csv')
  }, [parsedData, filteredData, selectedRows])

  const handleExportJSON = useCallback(() => {
    if (!parsedData) return

    const dataToExport = selectedRows.size > 0
      ? Array.from(selectedRows).map(i => filteredData[i])
      : filteredData

    const json = exportAsJSON(parsedData, dataToExport)
    downloadFile(json, 'data-export.json', 'application/json')
  }, [parsedData, filteredData, selectedRows])

  const handleCopyJSON = useCallback(async () => {
    if (!parsedData) return

    const dataToExport = selectedRows.size > 0
      ? Array.from(selectedRows).map(i => filteredData[i])
      : filteredData

    await navigator.clipboard.writeText(JSON.stringify(dataToExport, null, 2))
  }, [parsedData, filteredData, selectedRows])

  const handleExportStats = useCallback(() => {
    if (!parsedData) return
    const stats = exportStatsSummary(parsedData)
    downloadFile(stats, 'statistics-summary.md', 'text/markdown')
  }, [parsedData])

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // ========== AI Analysis ==========
  const runAIAnalysis = useCallback(async () => {
    if (!parsedData || !aiQuery.trim()) return

    setIsAnalyzing(true)

    const insights: string[] = []
    const recommendations: string[] = []
    const warnings: string[] = []

    const numericCols = parsedData.columns.filter(c => c.type === 'number')
    const stringCols = parsedData.columns.filter(c => c.type === 'string')

    // Generate summary
    let summary = `Dataset contains ${parsedData.rowCount.toLocaleString()} rows and ${parsedData.columns.length} columns. `

    // Missing value analysis
    const missingAnalysis = analyzeMissingValues(parsedData)
    if (missingAnalysis.missingPercentage > 0) {
      summary += `${missingAnalysis.missingPercentage.toFixed(1)}% of data is missing. `
      if (missingAnalysis.missingPercentage > 20) {
        warnings.push(`High missing data rate (${missingAnalysis.missingPercentage.toFixed(1)}%) may affect analysis quality`)
      }
    }

    // Numeric column insights
    numericCols.forEach(col => {
      if (col.stats) {
        if (col.stats.stdDev && col.stats.mean) {
          const cv = (col.stats.stdDev / Math.abs(col.stats.mean)) * 100
          if (cv > 50) {
            insights.push(`${col.name} shows high variability (CV: ${cv.toFixed(1)}%)`)
          }
        }

        // Outlier detection
        const outliers = detectOutliers(col)
        if (outliers.outliers.length > 0) {
          insights.push(`${col.name} contains ${outliers.outliers.length} potential outliers`)
        }
      }
    })

    // Categorical column insights
    stringCols.forEach(col => {
      if (col.stats && col.stats.unique < 10) {
        insights.push(`${col.name} is categorical with ${col.stats.unique} unique values`)
      }
    })

    // Query-specific analysis
    const queryLower = aiQuery.toLowerCase()

    if (queryLower.includes('trend') || queryLower.includes('pattern')) {
      if (numericCols.length > 0) {
        const vals = numericCols[0].values.filter(v => typeof v === 'number') as number[]
        if (vals.length > 2) {
          const firstThird = vals.slice(0, Math.floor(vals.length / 3))
          const lastThird = vals.slice(-Math.floor(vals.length / 3))
          const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length
          const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length
          const change = ((lastAvg - firstAvg) / firstAvg) * 100

          if (Math.abs(change) > 10) {
            insights.push(`${numericCols[0].name} shows ${change > 0 ? 'upward' : 'downward'} trend (${change.toFixed(1)}% change)`)
          }
        }
      }
    }

    if (queryLower.includes('correlation') || queryLower.includes('relationship')) {
      const strongCorrelations = correlationMatrix.filter(c => Math.abs(c.correlation) > 0.5)
      strongCorrelations.forEach(c => {
        insights.push(`Strong ${c.correlation > 0 ? 'positive' : 'negative'} correlation between ${c.column1} and ${c.column2} (r=${c.correlation.toFixed(3)})`)
      })
    }

    // Recommendations
    if (numericCols.length >= 2) {
      recommendations.push(`Consider scatter plot analysis for ${numericCols[0].name} vs ${numericCols[1].name}`)
    }
    if (stringCols.length > 0 && numericCols.length > 0) {
      recommendations.push(`Create grouped bar chart of ${numericCols[0].name} by ${stringCols[0].name}`)
    }
    if (missingAnalysis.columnsMissing.length > 0) {
      recommendations.push(`Address missing values in: ${missingAnalysis.columnsMissing.map(c => c.column).join(', ')}`)
    }

    // Use AI service for enhanced natural language interpretation
    try {
      const dataContext = {
        rowCount: parsedData.rowCount,
        columns: parsedData.columns.map(c => ({
          name: c.name,
          type: c.type,
          stats: c.stats
        })),
        insights,
        correlations: correlationMatrix.slice(0, 5),
        query: aiQuery
      }

      const aiResponse = await aiService.chatSync([
        {
          role: 'system',
          content: 'You are a data analyst assistant. Provide a brief, insightful interpretation of the data analysis results. Be concise and actionable.'
        },
        {
          role: 'user',
          content: `Analyze this dataset and answer: "${aiQuery}"\n\nData context: ${JSON.stringify(dataContext, null, 2)}\n\nProvide a 2-3 sentence natural language summary focusing on the user's question.`
        }
      ])

      // Prepend AI interpretation to summary
      if (aiResponse) {
        summary = aiResponse + '\n\n' + summary
      }
    } catch (error) {
      // AI enhancement failed, continue with statistical analysis
      console.log('[DataAnalyst] AI enhancement unavailable, using statistical analysis only')
    }

    setAiAnalysis({
      summary,
      insights: insights.slice(0, 8),
      recommendations: recommendations.slice(0, 5),
      warnings
    })
    setIsAnalyzing(false)
  }, [parsedData, aiQuery, correlationMatrix])

  // ========== Clear Data ==========
  const clearData = useCallback(() => {
    setParsedData(null)
    setRawInput('')
    setError(null)
    setAiAnalysis(null)
    setSortColumn(null)
    setSortDirection(null)
    setFilterText('')
    setFilters([])
    setSelectedRows(new Set())
    setHiddenColumns(new Set())
    setCurrentPage(1)
  }, [])

  // ========== Chart Data ==========
  const chartData = useMemo(() => {
    if (!parsedData || !chartXAxis || !chartYAxis) {
      return []
    }
    return aggregateBy(parsedData.raw, chartXAxis, chartYAxis, chartAggregation)
  }, [parsedData, chartXAxis, chartYAxis, chartAggregation])

  // ========== Visible Columns ==========
  const visibleHeaders = useMemo(() => {
    if (!parsedData) return []
    return parsedData.headers.filter(h => !hiddenColumns.has(h))
  }, [parsedData, hiddenColumns])

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="h-full w-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src={BRAND.assets.logo} alt={BRAND.name} className="w-8 h-8 object-contain logo-render" />
              <div className="h-6 w-px bg-white/10" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-400 to-rose-gold-600 flex items-center justify-center shadow-glow-lg">
                <BarChart3 className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Data Analyst</h2>
                <p className="text-xs text-rose-gold-400/70">
                  {parsedData
                    ? `${parsedData.rowCount.toLocaleString()} rows - ${parsedData.columns.length} columns`
                    : 'Upload, paste, or select sample data to analyze'}
                </p>
              </div>
            </div>
          </div>

          {parsedData && (
            <div className="flex items-center gap-2">
              <div className="relative group">
                <button className="morphic-btn px-3 py-1.5 text-xs flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Export
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute right-0 top-full mt-1 py-1 bg-dark-400 border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[140px]">
                  <button onClick={handleExportCSV} className="w-full px-3 py-2 text-xs text-left text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                  <button onClick={handleExportJSON} className="w-full px-3 py-2 text-xs text-left text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2">
                    <FileJson className="w-3.5 h-3.5" />
                    Export JSON
                  </button>
                  <button onClick={handleCopyJSON} className="w-full px-3 py-2 text-xs text-left text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2">
                    <Copy className="w-3.5 h-3.5" />
                    Copy JSON
                  </button>
                  <button onClick={handleExportStats} className="w-full px-3 py-2 text-xs text-left text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5" />
                    Export Stats
                  </button>
                </div>
              </div>
              <button
                onClick={clearData}
                className="morphic-btn-ghost bg-rose-gold-500/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-500/30 px-3 py-1.5 text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Data Input Panel */}
        {!parsedData ? (
          <div
            ref={dropZoneRef}
            className={`flex-1 flex flex-col p-6 overflow-y-auto morphic-scrollbar transition-colors ${
              isDragging ? 'bg-rose-gold-400/10' : ''
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Input Mode Tabs */}
            <div className="flex gap-2 mb-4">
              {(['paste', 'upload', 'sample'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setInputMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    inputMode === mode
                      ? 'bg-rose-gold-400/20 text-rose-gold-400 border border-rose-gold-400/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {mode === 'paste' && <FileText className="w-4 h-4" />}
                  {mode === 'upload' && <Upload className="w-4 h-4" />}
                  {mode === 'sample' && <Database className="w-4 h-4" />}
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>

            {/* Paste Mode */}
            {inputMode === 'paste' && (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/50">Paste CSV or JSON data</span>
                  <button
                    onClick={handlePasteFromClipboard}
                    className="text-xs text-rose-gold-400 hover:text-rose-gold-300 flex items-center gap-1"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                    Paste from clipboard
                  </button>
                </div>
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={`Paste your CSV or JSON data here...

Example CSV:
Name,Age,City,Salary
John,30,New York,75000
Jane,25,Los Angeles,68000

Example JSON:
[{"name": "John", "age": 30, "salary": 75000}]`}
                  className="flex-1 min-h-[300px] p-4 bg-dark-400 border border-white/10 rounded-xl text-white placeholder-white/30 font-mono text-sm resize-none focus:outline-none focus:border-rose-gold-400/50"
                />
                <button
                  onClick={handleParse}
                  disabled={!rawInput.trim() || isProcessing}
                  className="mt-4 morphic-btn py-3 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="w-4 h-4" />
                      Analyze Data
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Upload Mode */}
            {inputMode === 'upload' && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,.txt,.tsv"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full max-w-xl p-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all text-center ${
                    isDragging
                      ? 'border-rose-gold-400 bg-rose-gold-400/10'
                      : 'border-white/20 hover:border-rose-gold-400/50 hover:bg-rose-gold-400/5'
                  }`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-16 h-16 text-rose-gold-400 mx-auto mb-4 animate-spin" />
                  ) : (
                    <Upload className="w-16 h-16 text-white/30 mx-auto mb-4" />
                  )}
                  <p className="text-white/70 mb-2">
                    {isDragging ? 'Drop file here' : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-white/40">CSV, JSON, TSV, or TXT files up to 50MB</p>
                </div>
              </div>
            )}

            {/* Sample Mode */}
            {inputMode === 'sample' && (
              <div className="flex-1">
                <p className="text-white/60 mb-4">Choose a sample dataset to explore:</p>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(SAMPLE_DATASETS).map(([key, dataset]) => (
                    <button
                      key={key}
                      onClick={() => loadSample(key as keyof typeof SAMPLE_DATASETS)}
                      className="morphic-card p-4 rounded-xl text-left hover:border-rose-gold-400/30 transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-rose-gold-400/20 flex items-center justify-center group-hover:bg-rose-gold-400/30 transition-colors flex-shrink-0">
                          <Database className="w-5 h-5 text-rose-gold-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{dataset.name}</h3>
                          <p className="text-xs text-white/50 mt-1">{dataset.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mt-4 p-4 bg-rose-gold-500/10 border border-rose-gold-400/30 rounded-xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-rose-gold-400 flex-shrink-0" />
                <p className="text-sm text-rose-gold-400">{error}</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Sidebar Tabs */}
            <div className="w-full border-b border-white/10 flex flex-col max-h-[260px]">
              <div className="p-3">
                <nav className="space-y-1">
                  {[
                    { id: 'data', label: 'Data Table', icon: Table },
                    { id: 'statistics', label: 'Statistics', icon: Activity },
                    { id: 'charts', label: 'Charts', icon: PieChart },
                    { id: 'correlation', label: 'Correlation', icon: Grid3X3 },
                    { id: 'ai', label: 'AI Analysis', icon: Brain }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as ActiveTab)}
                      className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all flex items-center gap-2 ${
                        activeTab === tab.id
                          ? 'bg-rose-gold-400/20 text-rose-gold-400'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                      {tab.id === 'ai' && <Sparkles className="w-3 h-3 ml-auto text-rose-gold-400" />}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Quick Stats */}
              <div className="p-3 border-t border-white/10">
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
                  Overview
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/50">Rows</span>
                    <span className="text-white font-mono">{parsedData.rowCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Columns</span>
                    <span className="text-white font-mono">{parsedData.columns.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Numeric</span>
                    <span className="text-rose-gold-400 font-mono">
                      {parsedData.columns.filter(c => c.type === 'number').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Text</span>
                    <span className="text-rose-gold-400 font-mono">
                      {parsedData.columns.filter(c => c.type === 'string').length}
                    </span>
                  </div>
                  {filteredData.length !== parsedData.rowCount && (
                    <div className="flex justify-between text-rose-gold-400">
                      <span>Filtered</span>
                      <span className="font-mono">{filteredData.length.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Column List */}
              <div className="flex-1 overflow-y-auto morphic-scrollbar p-3 pt-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                    Columns
                  </h3>
                  <button
                    onClick={() => setHiddenColumns(new Set())}
                    className="text-[10px] text-rose-gold-400 hover:text-rose-gold-300"
                  >
                    Show all
                  </button>
                </div>
                <div className="space-y-1">
                  {parsedData.columns.map((col) => (
                    <div
                      key={col.name}
                      className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                        hiddenColumns.has(col.name) ? 'opacity-50' : ''
                      } hover:bg-white/5`}
                    >
                      <button
                        onClick={() => toggleColumnVisibility(col.name)}
                        className="text-white/40 hover:text-white"
                      >
                        {hiddenColumns.has(col.name) ? (
                          <EyeOff className="w-3 h-3" />
                        ) : (
                          <Eye className="w-3 h-3" />
                        )}
                      </button>
                      <span className="text-xs text-white truncate flex-1">{col.name}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded ${
                        col.type === 'number' ? 'bg-rose-gold-500/20 text-rose-gold-400' :
                        col.type === 'string' ? 'bg-rose-gold-500/20 text-rose-gold-400' :
                        col.type === 'date' ? 'bg-rose-gold-500/20 text-rose-gold-400' :
                        col.type === 'boolean' ? 'bg-rose-gold-500/20 text-rose-gold-400' :
                        'bg-white/10 text-white/50'
                      }`}>
                        {col.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Data Table Tab */}
              {activeTab === 'data' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Table Controls */}
                  <div className="flex items-center gap-3 p-3 border-b border-white/10">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        type="text"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder="Search all columns..."
                        className="w-full pl-9 pr-3 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50"
                      />
                    </div>

                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`p-2 rounded-lg transition-all ${
                        showFilters || filters.length > 0
                          ? 'bg-rose-gold-400/20 text-rose-gold-400'
                          : 'text-white/50 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Filter className="w-4 h-4" />
                    </button>

                    <div className="flex gap-1">
                      <button
                        onClick={() => setViewMode('table')}
                        className={`p-2 rounded-lg transition-all ${
                          viewMode === 'table'
                            ? 'bg-white/10 text-white'
                            : 'text-white/40 hover:text-white'
                        }`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode('cards')}
                        className={`p-2 rounded-lg transition-all ${
                          viewMode === 'cards'
                            ? 'bg-white/10 text-white'
                            : 'text-white/40 hover:text-white'
                        }`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                    </div>

                    <span className="text-xs text-white/40 ml-auto">
                      {selectedRows.size > 0 && `${selectedRows.size} selected - `}
                      {filteredData.length.toLocaleString()} rows
                    </span>
                  </div>

                  {/* Data Table */}
                  <div className="flex-1 overflow-auto morphic-scrollbar">
                    {viewMode === 'table' ? (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-dark-400/95 backdrop-blur z-10">
                          <tr>
                            <th className="w-10 px-2 py-2 border-b border-white/10">
                              <input
                                type="checkbox"
                                checked={selectedRows.size === filteredData.length && filteredData.length > 0}
                                onChange={selectAllRows}
                                className="w-3.5 h-3.5 rounded bg-dark-500 border-white/20"
                              />
                            </th>
                            {visibleHeaders.map((header) => (
                              <th
                                key={header}
                                onClick={() => toggleSort(header)}
                                className="px-3 py-2 text-left font-semibold text-white/80 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors select-none"
                                style={{ width: columnWidths[header] }}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate">{header}</span>
                                  {sortColumn === header ? (
                                    sortDirection === 'asc'
                                      ? <SortAsc className="w-3.5 h-3.5 text-rose-gold-400 flex-shrink-0" />
                                      : <SortDesc className="w-3.5 h-3.5 text-rose-gold-400 flex-shrink-0" />
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 text-white/20 flex-shrink-0" />
                                  )}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedData.map((row, idx) => {
                            const globalIdx = (currentPage - 1) * pageSize + idx
                            return (
                              <tr
                                key={idx}
                                className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                                  selectedRows.has(globalIdx) ? 'bg-rose-gold-400/10' : ''
                                }`}
                              >
                                <td className="px-2 py-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedRows.has(globalIdx)}
                                    onChange={() => toggleRowSelection(globalIdx)}
                                    className="w-3.5 h-3.5 rounded bg-dark-500 border-white/20"
                                  />
                                </td>
                                {visibleHeaders.map((header) => (
                                  <td key={header} className="px-3 py-2 text-white/70">
                                    <span className="truncate block max-w-[200px]">
                                      {formatCellValue(row[header])}
                                    </span>
                                  </td>
                                ))}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                        {paginatedData.map((row, idx) => (
                          <div key={idx} className="morphic-card p-4 rounded-xl">
                            {visibleHeaders.slice(0, 6).map((header) => (
                              <div key={header} className="flex justify-between py-1 border-b border-white/5 last:border-0">
                                <span className="text-xs text-white/50">{header}</span>
                                <span className="text-xs text-white font-mono">{formatCellValue(row[header])}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between p-3 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="px-2 py-1 bg-dark-400 border border-white/10 rounded text-xs text-white"
                      >
                        {[10, 25, 50, 100].map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">
                        {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length.toLocaleString()}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                      >
                        <ChevronLeft className="w-4 h-4 text-white/60" />
                      </button>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                      >
                        <ChevronRight className="w-4 h-4 text-white/60" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Statistics Tab */}
              {activeTab === 'statistics' && (
                <div className="flex-1 overflow-y-auto morphic-scrollbar p-4">
                  <div className="grid gap-4">
                    {parsedData.columns.map((col) => (
                      <ColumnStatsCard key={col.name} column={col} />
                    ))}
                  </div>
                </div>
              )}

              {/* Charts Tab */}
              {activeTab === 'charts' && (
                <div className="flex-1 overflow-hidden flex flex-col">
                  {useChartBuilder ? (
                    <ChartBuilder data={parsedData} />
                  ) : (
                    <div className="flex-1 overflow-y-auto morphic-scrollbar p-4">
                      {/* Simple Chart Controls */}
                      <div className="flex flex-wrap items-center gap-4 mb-6">
                        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                          {(['bar', 'line', 'pie'] as const).map((type) => (
                            <button
                              key={type}
                              onClick={() => setSelectedChartType(type)}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                selectedChartType === type
                                  ? 'bg-rose-gold-400/20 text-rose-gold-400'
                                  : 'text-white/50 hover:text-white'
                              }`}
                            >
                              {type.charAt(0).toUpperCase() + type.slice(1)}
                            </button>
                          ))}
                        </div>

                        <select
                          value={chartXAxis}
                          onChange={(e) => setChartXAxis(e.target.value)}
                          className="px-3 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white"
                        >
                          {parsedData.headers.map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>

                        <select
                          value={chartYAxis}
                          onChange={(e) => setChartYAxis(e.target.value)}
                          className="px-3 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white"
                        >
                          {parsedData.headers.map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>

                      {/* CSS Chart Fallback */}
                      <div className="morphic-card p-6 rounded-xl">
                        {selectedChartType === 'bar' && <CSSBarChart data={chartData} colors={CHART_COLORS} />}
                        {selectedChartType === 'line' && <CSSLineChart data={chartData} colors={CHART_COLORS} />}
                        {selectedChartType === 'pie' && <CSSPieChart data={chartData} colors={CHART_COLORS} />}
                      </div>
                    </div>
                  )}

                  {/* Toggle Chart Builder */}
                  <div className="p-3 border-t border-white/10">
                    <button
                      onClick={() => setUseChartBuilder(!useChartBuilder)}
                      className="text-xs text-rose-gold-400 hover:text-rose-gold-300"
                    >
                      {useChartBuilder ? 'Use Simple Charts' : 'Use Advanced Chart Builder'}
                    </button>
                  </div>
                </div>
              )}

              {/* Correlation Tab */}
              {activeTab === 'correlation' && (
                <div className="flex-1 overflow-y-auto morphic-scrollbar p-4">
                  <h3 className="text-sm font-semibold text-white mb-4">Correlation Matrix</h3>

                  {correlationMatrix.length === 0 ? (
                    <div className="text-center py-12 text-white/40">
                      <Grid3X3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Need at least 2 numeric columns to calculate correlations</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {correlationMatrix.map((result, idx) => (
                        <div key={idx} className="morphic-card p-4 rounded-xl">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-white">
                              {result.column1} vs {result.column2}
                            </span>
                            <span className={`text-sm font-mono px-2 py-0.5 rounded ${
                              Math.abs(result.correlation) > 0.7 ? 'bg-rose-gold-500/20 text-rose-gold-400' :
                              Math.abs(result.correlation) > 0.4 ? 'bg-rose-gold-500/20 text-rose-gold-400' :
                              'bg-white/10 text-white/60'
                            }`}>
                              r = {result.correlation.toFixed(3)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  result.correlation > 0 ? 'bg-rose-gold-500' : 'bg-rose-gold-500'
                                }`}
                                style={{ width: `${Math.abs(result.correlation) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-white/50 capitalize">{result.strength}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AI Analysis Tab */}
              {activeTab === 'ai' && (
                <div className="flex-1 overflow-y-auto morphic-scrollbar p-4">
                  {/* AI Query Input */}
                  <div className="morphic-card p-4 rounded-xl mb-6">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-rose-gold-400" />
                      Ask AI About Your Data
                    </h3>
                    <textarea
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      placeholder="Ask questions like:
- What are the main trends in this data?
- Are there any outliers or anomalies?
- What correlations exist between variables?"
                      className="w-full h-24 p-3 bg-dark-400 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-rose-gold-400/50"
                    />
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={runAIAnalysis}
                        disabled={!aiQuery.trim() || isAnalyzing}
                        className="morphic-btn-ghost bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-4 py-2 text-sm disabled:opacity-50"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 inline mr-2" />
                            Analyze
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Quick Analysis Buttons */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {[
                      { label: 'Trends & Patterns', query: 'What are the main trends and patterns?' },
                      { label: 'Outlier Detection', query: 'Are there any outliers or anomalies?' },
                      { label: 'Correlations', query: 'What correlations exist between variables?' },
                      { label: 'Data Quality', query: 'What is the quality of this data?' },
                      { label: 'Summary Report', query: 'Generate a comprehensive summary report' }
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        onClick={() => {
                          setAiQuery(btn.query)
                          setTimeout(runAIAnalysis, 100)
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* AI Analysis Results */}
                  {aiAnalysis && (
                    <div className="space-y-4">
                      {/* Warnings */}
                      {aiAnalysis.warnings && aiAnalysis.warnings.length > 0 && (
                        <div className="p-4 bg-rose-gold-500/10 border border-rose-gold-400/30 rounded-xl">
                          <h3 className="text-sm font-semibold text-rose-gold-400 mb-2 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Warnings
                          </h3>
                          <ul className="space-y-1">
                            {aiAnalysis.warnings.map((warning, i) => (
                              <li key={i} className="text-sm text-rose-gold-400/80">{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Summary */}
                      <div className="morphic-card p-4 rounded-xl">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-rose-gold-400" />
                          Summary
                        </h3>
                        <p className="text-sm text-white/70 leading-relaxed">{aiAnalysis.summary}</p>
                      </div>

                      {/* Insights */}
                      {aiAnalysis.insights.length > 0 && (
                        <div className="morphic-card p-4 rounded-xl">
                          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-rose-gold-400" />
                            Key Insights
                          </h3>
                          <ul className="space-y-2">
                            {aiAnalysis.insights.map((insight, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                                <CheckCircle2 className="w-4 h-4 text-rose-gold-400 flex-shrink-0 mt-0.5" />
                                {insight}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Recommendations */}
                      {aiAnalysis.recommendations.length > 0 && (
                        <div className="morphic-card p-4 rounded-xl">
                          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-rose-gold-400" />
                            Recommendations
                          </h3>
                          <ul className="space-y-2">
                            {aiAnalysis.recommendations.map((rec, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                                <Zap className="w-4 h-4 text-rose-gold-400 flex-shrink-0 mt-0.5" />
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Helper Components
// ============================================================================

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (value instanceof Date) return value.toLocaleDateString()
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString()
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function ColumnStatsCard({ column }: { column: DataColumn }) {
  const [expanded, setExpanded] = useState(false)
  const stats = column.stats

  if (!stats) return null

  return (
    <div className="morphic-card rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            column.type === 'number' ? 'bg-rose-gold-500/20 text-rose-gold-400' :
            column.type === 'string' ? 'bg-rose-gold-500/20 text-rose-gold-400' :
            column.type === 'date' ? 'bg-rose-gold-500/20 text-rose-gold-400' :
            column.type === 'boolean' ? 'bg-rose-gold-500/20 text-rose-gold-400' :
            'bg-white/10 text-white/60'
          }`}>
            {column.type === 'number' ? '#' :
             column.type === 'string' ? 'Aa' :
             column.type === 'date' ? 'D' :
             column.type === 'boolean' ? 'B' : '?'}
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-white">{column.name}</h3>
            <p className="text-xs text-white/50">{column.type} - {stats.unique} unique values</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>

      {expanded && (
        <div className="p-4 pt-0 border-t border-white/10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <StatItem label="Count" value={stats.count.toLocaleString()} />
            <StatItem label="Unique" value={stats.unique.toLocaleString()} />
            <StatItem label="Missing" value={`${stats.nullCount} (${stats.nullPercentage.toFixed(1)}%)`} />
            <StatItem label="Mode" value={stats.mode !== undefined ? String(stats.mode) : 'N/A'} />

            {column.type === 'number' && (
              <>
                <StatItem label="Mean" value={stats.mean?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Median" value={stats.median?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Std Dev" value={stats.stdDev?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Variance" value={stats.variance?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Sum" value={stats.sum?.toLocaleString() ?? 'N/A'} />
                <StatItem label="Min" value={stats.min !== undefined ? String(stats.min) : 'N/A'} />
                <StatItem label="Max" value={stats.max !== undefined ? String(stats.max) : 'N/A'} />
                <StatItem label="Range" value={stats.min !== undefined && stats.max !== undefined ? String(Number(stats.max) - Number(stats.min)) : 'N/A'} />
                <StatItem label="Q1 (25%)" value={stats.q1?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Q3 (75%)" value={stats.q3?.toFixed(2) ?? 'N/A'} />
                <StatItem label="IQR" value={stats.iqr?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Skewness" value={stats.skewness?.toFixed(3) ?? 'N/A'} />
              </>
            )}

            {column.type === 'string' && (
              <>
                <StatItem label="Min Length" value={stats.minLength?.toString() ?? 'N/A'} />
                <StatItem label="Max Length" value={stats.maxLength?.toString() ?? 'N/A'} />
                <StatItem label="Avg Length" value={stats.avgLength?.toFixed(1) ?? 'N/A'} />
              </>
            )}
          </div>

          {/* Top Values */}
          {stats.topValues && stats.topValues.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-white/50 mb-2">Top Values</h4>
              <div className="space-y-1">
                {stats.topValues.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-white/70 truncate w-24">{String(item.value)}</span>
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-gold-400 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-white/50 w-12 text-right">{item.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Histogram for numeric columns */}
          {column.type === 'number' && stats.histogram && stats.histogram.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-white/50 mb-2">Distribution</h4>
              <div className="flex items-end gap-0.5 h-16">
                {stats.histogram.map((bin, idx) => {
                  const maxCount = Math.max(...stats.histogram!.map(h => h.count))
                  const height = maxCount > 0 ? (bin.count / maxCount) * 100 : 0
                  return (
                    <div
                      key={idx}
                      className="flex-1 bg-rose-gold-400/60 hover:bg-rose-gold-400 transition-colors rounded-t"
                      style={{ height: `${height}%` }}
                      title={`${bin.bin}: ${bin.count}`}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Completeness Bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/50">Completeness</span>
              <span className="text-white/70">{(100 - stats.nullPercentage).toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  stats.nullPercentage > 20 ? 'bg-rose-gold-500' :
                  stats.nullPercentage > 5 ? 'bg-rose-gold-500' :
                  'bg-rose-gold-500'
                }`}
                style={{ width: `${100 - stats.nullPercentage}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="px-3 py-2 bg-white/5 rounded-lg">
      <p className="text-[10px] text-white/40 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-white font-mono truncate" title={String(value)}>{value}</p>
    </div>
  )
}
