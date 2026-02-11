/**
 * Data Analyst View Component
 * Provides comprehensive data analysis capabilities with CSS-based visualizations
 */

import { useState, useRef, useCallback, useMemo } from 'react'
import {
  BarChart3, Upload, FileText, Table, PieChart, TrendingUp,
  Download, Copy, Sparkles, AlertCircle, CheckCircle2,
  Loader2, ChevronDown, ChevronUp, Search,
  Database, Brain, SortAsc, SortDesc, Trash2
} from 'lucide-react'

// Types
interface DataColumn {
  name: string
  type: 'number' | 'string' | 'date' | 'boolean' | 'mixed'
  values: (string | number | boolean | null)[]
  stats?: ColumnStats
}

interface ColumnStats {
  count: number
  unique: number
  nullCount: number
  nullPercentage: number
  mean?: number
  median?: number
  mode?: string | number
  min?: number | string
  max?: number | string
  stdDev?: number
  sum?: number
  q1?: number
  q3?: number
}

interface ParsedData {
  columns: DataColumn[]
  rowCount: number
  headers: string[]
  raw: Record<string, unknown>[]
}

interface ChartData {
  labels: string[]
  values: number[]
  colors?: string[]
}

interface AnalysisResult {
  summary: string
  insights: string[]
  recommendations: string[]
}

type ChartType = 'bar' | 'line' | 'pie' | 'table'
type SortDirection = 'asc' | 'desc' | null

// Sample datasets
const SAMPLE_DATASETS = {
  sales: {
    name: 'Sales Data',
    description: 'Monthly sales data for a retail store',
    data: `Month,Sales,Expenses,Profit,Region
January,45000,32000,13000,North
February,52000,35000,17000,North
March,48000,31000,17000,South
April,61000,40000,21000,East
May,55000,36000,19000,West
June,67000,42000,25000,North
July,72000,45000,27000,South
August,68000,43000,25000,East
September,59000,38000,21000,West
October,63000,41000,22000,North
November,71000,46000,25000,South
December,85000,52000,33000,East`
  },
  employees: {
    name: 'Employee Data',
    description: 'Employee information with department and salary',
    data: `Name,Department,Salary,Experience,Performance
Alice,Engineering,95000,5,Excellent
Bob,Marketing,72000,3,Good
Charlie,Engineering,105000,8,Excellent
Diana,Sales,68000,2,Good
Eve,Engineering,88000,4,Good
Frank,HR,65000,6,Excellent
Grace,Marketing,78000,4,Good
Henry,Sales,82000,7,Excellent
Ivy,Engineering,92000,3,Good
Jack,HR,58000,1,Fair`
  },
  products: {
    name: 'Product Inventory',
    description: 'Product stock levels and pricing',
    data: `Product,Category,Price,Stock,Rating
Laptop Pro,Electronics,1299,45,4.5
Wireless Mouse,Electronics,29,230,4.2
Office Chair,Furniture,349,78,4.0
Standing Desk,Furniture,599,32,4.7
Notebook Set,Stationery,15,500,4.1
Mechanical Keyboard,Electronics,149,120,4.6
Monitor 27,Electronics,399,65,4.4
Desk Lamp,Furniture,45,180,3.9
Pen Pack,Stationery,8,800,4.0
Webcam HD,Electronics,79,95,4.3`
  }
}

// Color palettes for charts
const CHART_COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#ec4899', // pink
  '#6366f1', // indigo
]

export default function DataAnalystView() {
  // State
  const [inputMode, setInputMode] = useState<'paste' | 'upload' | 'sample'>('paste')
  const [rawInput, setRawInput] = useState('')
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'columns' | 'charts' | 'ai'>('summary')

  // Chart state
  const [selectedChart, setSelectedChart] = useState<ChartType>('bar')
  const [chartColumn, setChartColumn] = useState<string>('')
  const [labelColumn, setLabelColumn] = useState<string>('')

  // Table state
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [filterText, setFilterText] = useState('')
  const [visibleRows, setVisibleRows] = useState(20)

  // AI Analysis state
  const [aiQuery, setAiQuery] = useState('')
  const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Parse CSV data
  const parseCSV = useCallback((csv: string): ParsedData => {
    const lines = csv.trim().split('\n')
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row')
    }

    const headers = lines[0].split(',').map(h => h.trim())
    const rows: Record<string, unknown>[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())
      const row: Record<string, unknown> = {}
      headers.forEach((header, idx) => {
        let value: string | number | boolean | null = values[idx] || null
        if (value !== null) {
          // Try to parse as number
          const numVal = Number(value)
          if (!isNaN(numVal) && value !== '') {
            value = numVal
          } else if (value.toLowerCase() === 'true') {
            value = true
          } else if (value.toLowerCase() === 'false') {
            value = false
          }
        }
        row[header] = value
      })
      rows.push(row)
    }

    // Build columns with type detection
    const columns: DataColumn[] = headers.map(header => {
      const values = rows.map(row => row[header] as string | number | boolean | null)
      const type = detectColumnType(values)
      return { name: header, type, values }
    })

    // Calculate statistics for each column
    columns.forEach(col => {
      col.stats = calculateColumnStats(col)
    })

    return { columns, rowCount: rows.length, headers, raw: rows }
  }, [])

  // Parse JSON data
  const parseJSON = useCallback((json: string): ParsedData => {
    const parsed = JSON.parse(json)
    const rows = Array.isArray(parsed) ? parsed : [parsed]

    if (rows.length === 0) {
      throw new Error('JSON array is empty')
    }

    const headers = Object.keys(rows[0])
    const columns: DataColumn[] = headers.map(header => {
      const values = rows.map(row => row[header] as string | number | boolean | null)
      const type = detectColumnType(values)
      return { name: header, type, values }
    })

    columns.forEach(col => {
      col.stats = calculateColumnStats(col)
    })

    return { columns, rowCount: rows.length, headers, raw: rows }
  }, [])

  // Detect column type
  const detectColumnType = (values: (string | number | boolean | null)[]): DataColumn['type'] => {
    const nonNull = values.filter(v => v !== null && v !== '')
    if (nonNull.length === 0) return 'mixed'

    const types = new Set(nonNull.map(v => {
      if (typeof v === 'number') return 'number'
      if (typeof v === 'boolean') return 'boolean'
      if (typeof v === 'string' && !isNaN(Date.parse(v))) return 'date'
      return 'string'
    }))

    if (types.size === 1) return types.values().next().value || 'mixed'
    return 'mixed'
  }

  // Calculate statistics for a column
  const calculateColumnStats = (column: DataColumn): ColumnStats => {
    const values = column.values
    const nonNull = values.filter(v => v !== null && v !== '')
    const nullCount = values.length - nonNull.length

    const stats: ColumnStats = {
      count: values.length,
      unique: new Set(nonNull.map(String)).size,
      nullCount,
      nullPercentage: (nullCount / values.length) * 100
    }

    // Calculate mode (most frequent value)
    const frequency = new Map<string | number | boolean, number>()
    nonNull.forEach(v => {
      const key = v as string | number | boolean
      frequency.set(key, (frequency.get(key) || 0) + 1)
    })
    let maxFreq = 0
    frequency.forEach((count, value) => {
      if (count > maxFreq) {
        maxFreq = count
        stats.mode = value as string | number
      }
    })

    // Numeric statistics
    if (column.type === 'number') {
      const numbers = nonNull as number[]
      if (numbers.length > 0) {
        const sorted = [...numbers].sort((a, b) => a - b)
        stats.sum = numbers.reduce((a, b) => a + b, 0)
        stats.mean = stats.sum / numbers.length
        stats.min = sorted[0]
        stats.max = sorted[sorted.length - 1]

        // Median
        const mid = Math.floor(sorted.length / 2)
        stats.median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

        // Standard deviation
        const squaredDiffs = numbers.map(n => Math.pow(n - stats.mean!, 2))
        stats.stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length)

        // Quartiles
        stats.q1 = sorted[Math.floor(sorted.length * 0.25)]
        stats.q3 = sorted[Math.floor(sorted.length * 0.75)]
      }
    } else if (column.type === 'string') {
      const strings = nonNull as string[]
      if (strings.length > 0) {
        const sorted = [...strings].sort()
        stats.min = sorted[0]
        stats.max = sorted[sorted.length - 1]
      }
    }

    return stats
  }

  // Parse input data
  const parseData = useCallback(() => {
    setError(null)
    try {
      const trimmed = rawInput.trim()
      if (!trimmed) {
        throw new Error('Please enter some data to analyze')
      }

      let data: ParsedData
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        data = parseJSON(trimmed)
      } else {
        data = parseCSV(trimmed)
      }

      setParsedData(data)
      setChartColumn(data.columns.find(c => c.type === 'number')?.name || data.headers[0])
      setLabelColumn(data.columns.find(c => c.type === 'string')?.name || data.headers[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse data')
    }
  }, [rawInput, parseCSV, parseJSON])

  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setRawInput(text)
      setInputMode('paste')
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(file)
  }, [])

  // Load sample dataset
  const loadSample = useCallback((key: keyof typeof SAMPLE_DATASETS) => {
    setRawInput(SAMPLE_DATASETS[key].data)
    setInputMode('paste')
  }, [])

  // Get chart data
  const chartData = useMemo((): ChartData => {
    if (!parsedData || !chartColumn) {
      return { labels: [], values: [] }
    }

    const valueCol = parsedData.columns.find(c => c.name === chartColumn)
    const labelCol = parsedData.columns.find(c => c.name === labelColumn)

    if (!valueCol) return { labels: [], values: [] }

    // If we have numeric values, aggregate by label column
    if (valueCol.type === 'number' && labelCol && labelCol.type === 'string') {
      const aggregated = new Map<string, number>()
      labelCol.values.forEach((label, idx) => {
        const key = String(label || 'Unknown')
        const val = valueCol.values[idx] as number
        if (typeof val === 'number') {
          aggregated.set(key, (aggregated.get(key) || 0) + val)
        }
      })
      return {
        labels: Array.from(aggregated.keys()),
        values: Array.from(aggregated.values()),
        colors: CHART_COLORS
      }
    }

    // For non-numeric, count occurrences
    const counts = new Map<string, number>()
    valueCol.values.forEach(v => {
      const key = String(v ?? 'null')
      counts.set(key, (counts.get(key) || 0) + 1)
    })

    return {
      labels: Array.from(counts.keys()),
      values: Array.from(counts.values()),
      colors: CHART_COLORS
    }
  }, [parsedData, chartColumn, labelColumn])

  // Sorted and filtered data for table
  const tableData = useMemo(() => {
    if (!parsedData) return []

    let data = [...parsedData.raw]

    // Filter
    if (filterText) {
      const lower = filterText.toLowerCase()
      data = data.filter(row =>
        Object.values(row).some(v =>
          String(v).toLowerCase().includes(lower)
        )
      )
    }

    // Sort
    if (sortColumn && sortDirection) {
      data.sort((a, b) => {
        const aVal = a[sortColumn]
        const bVal = b[sortColumn]
        if (aVal === bVal) return 0
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        const cmp = aVal < bVal ? -1 : 1
        return sortDirection === 'asc' ? cmp : -cmp
      })
    }

    return data
  }, [parsedData, sortColumn, sortDirection, filterText])

  // Toggle sort
  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') setSortDirection('desc')
      else if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection(null)
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // AI Analysis (simulated)
  const runAIAnalysis = async () => {
    if (!parsedData || !aiQuery.trim()) return

    setIsAnalyzing(true)

    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Generate insights based on the data
    const insights: string[] = []
    const recommendations: string[] = []

    // Find numeric columns for analysis
    const numericCols = parsedData.columns.filter(c => c.type === 'number')
    const stringCols = parsedData.columns.filter(c => c.type === 'string')

    // Generate summary based on query
    let summary = `Analysis of ${parsedData.rowCount} records across ${parsedData.columns.length} columns. `

    if (numericCols.length > 0) {
      const mainCol = numericCols[0]
      if (mainCol.stats) {
        summary += `The ${mainCol.name} column has a mean of ${mainCol.stats.mean?.toFixed(2) || 'N/A'} `
        summary += `with values ranging from ${mainCol.stats.min} to ${mainCol.stats.max}. `

        insights.push(`${mainCol.name} shows ${mainCol.stats.stdDev && mainCol.stats.stdDev > (mainCol.stats.mean || 0) * 0.3 ? 'high' : 'moderate'} variability (std dev: ${mainCol.stats.stdDev?.toFixed(2)})`)
      }
    }

    // Generate insights based on data patterns
    parsedData.columns.forEach(col => {
      if (col.stats) {
        if (col.stats.nullPercentage > 10) {
          insights.push(`${col.name} has ${col.stats.nullPercentage.toFixed(1)}% missing values`)
          recommendations.push(`Consider handling missing values in ${col.name} column`)
        }
        if (col.type === 'number' && col.stats.unique === col.stats.count) {
          insights.push(`${col.name} contains all unique values - could be an identifier`)
        }
        if (col.type === 'string' && col.stats.unique < 10 && col.stats.count > 20) {
          insights.push(`${col.name} appears to be a categorical variable with ${col.stats.unique} categories`)
        }
      }
    })

    // Add query-specific insights
    const queryLower = aiQuery.toLowerCase()
    if (queryLower.includes('trend') || queryLower.includes('pattern')) {
      if (numericCols.length > 0) {
        const vals = numericCols[0].values.filter(v => typeof v === 'number') as number[]
        const firstHalf = vals.slice(0, Math.floor(vals.length / 2))
        const secondHalf = vals.slice(Math.floor(vals.length / 2))
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
        const trend = secondAvg > firstAvg ? 'upward' : secondAvg < firstAvg ? 'downward' : 'stable'
        insights.push(`Overall ${trend} trend detected in ${numericCols[0].name}`)
      }
    }

    if (queryLower.includes('correlation') || queryLower.includes('relationship')) {
      if (numericCols.length >= 2) {
        recommendations.push(`Consider analyzing the relationship between ${numericCols[0].name} and ${numericCols[1].name}`)
      }
    }

    if (queryLower.includes('outlier') || queryLower.includes('anomal')) {
      numericCols.forEach(col => {
        if (col.stats && col.stats.q1 !== undefined && col.stats.q3 !== undefined) {
          const iqr = col.stats.q3 - col.stats.q1
          const outlierThreshold = 1.5 * iqr
          const outliers = (col.values.filter(v =>
            typeof v === 'number' &&
            (v < col.stats!.q1! - outlierThreshold || v > col.stats!.q3! + outlierThreshold)
          )).length
          if (outliers > 0) {
            insights.push(`${outliers} potential outliers detected in ${col.name}`)
          }
        }
      })
    }

    // Default recommendations
    if (recommendations.length === 0) {
      if (stringCols.length > 0 && numericCols.length > 0) {
        recommendations.push(`Create visualizations grouping ${numericCols[0].name} by ${stringCols[0].name}`)
      }
      recommendations.push('Export data for further analysis in specialized tools')
    }

    setAiAnalysis({ summary, insights, recommendations })
    setIsAnalyzing(false)
  }

  // Export functions
  const exportAsCSV = () => {
    if (!parsedData) return

    const headers = parsedData.headers.join(',')
    const rows = parsedData.raw.map(row =>
      parsedData.headers.map(h => {
        const val = row[h]
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`
        return String(val ?? '')
      }).join(',')
    )

    const csv = [headers, ...rows].join('\n')
    downloadFile(csv, 'data-export.csv', 'text/csv')
  }

  const copyAsJSON = async () => {
    if (!parsedData) return
    await navigator.clipboard.writeText(JSON.stringify(parsedData.raw, null, 2))
  }

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Export chart as image
  const exportChartAsImage = () => {
    const chartEl = document.getElementById('data-chart')
    if (!chartEl) return

    // Using html2canvas would be ideal here, but we'll create a simple text export
    const chartInfo = `Chart: ${selectedChart}\nData Column: ${chartColumn}\nLabel Column: ${labelColumn}\n\nData:\n${chartData.labels.map((l, i) => `${l}: ${chartData.values[i]}`).join('\n')}`
    downloadFile(chartInfo, 'chart-data.txt', 'text/plain')
  }

  // Clear data
  const clearData = () => {
    setParsedData(null)
    setRawInput('')
    setError(null)
    setAiAnalysis(null)
    setSortColumn(null)
    setSortDirection(null)
    setFilterText('')
  }

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-glow-lg">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Data Analyst</h2>
              <p className="text-xs text-white/50">Analyze, visualize, and gain insights from your data</p>
            </div>
          </div>

          {parsedData && (
            <div className="flex items-center gap-2">
              <button
                onClick={exportAsCSV}
                className="glass-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                onClick={copyAsJSON}
                className="glass-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy JSON
              </button>
              <button
                onClick={clearData}
                className="glass-btn-danger px-3 py-1.5 text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Data Input */}
        {!parsedData ? (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto morphic-scrollbar">
            {/* Input Mode Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setInputMode('paste')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  inputMode === 'paste'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileText className="w-4 h-4 inline mr-2" />
                Paste Data
              </button>
              <button
                onClick={() => setInputMode('upload')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  inputMode === 'upload'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Upload className="w-4 h-4 inline mr-2" />
                Upload File
              </button>
              <button
                onClick={() => setInputMode('sample')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  inputMode === 'sample'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Database className="w-4 h-4 inline mr-2" />
                Sample Data
              </button>
            </div>

            {/* Input Area */}
            {inputMode === 'paste' && (
              <div className="flex-1 flex flex-col">
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="Paste your CSV or JSON data here...

Example CSV:
Name,Age,City
John,30,New York
Jane,25,Los Angeles

Example JSON:
[{&quot;name&quot;: &quot;John&quot;, &quot;age&quot;: 30}]"
                  className="flex-1 min-h-[300px] p-4 bg-dark-400 border border-white/10 rounded-xl text-white placeholder-white/30 font-mono text-sm resize-none focus:outline-none focus:border-cyan-400/50"
                />
                <button
                  onClick={parseData}
                  disabled={!rawInput.trim()}
                  className="mt-4 glass-btn-primary py-3 text-sm font-semibold disabled:opacity-50"
                >
                  <BarChart3 className="w-4 h-4 inline mr-2" />
                  Analyze Data
                </button>
              </div>
            )}

            {inputMode === 'upload' && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full max-w-md p-12 border-2 border-dashed border-white/20 rounded-2xl cursor-pointer hover:border-cyan-400/50 hover:bg-cyan-400/5 transition-all text-center"
                >
                  <Upload className="w-16 h-16 text-white/30 mx-auto mb-4" />
                  <p className="text-white/70 mb-2">Click to upload or drag and drop</p>
                  <p className="text-xs text-white/40">CSV, JSON, or TXT files</p>
                </div>
              </div>
            )}

            {inputMode === 'sample' && (
              <div className="flex-1">
                <p className="text-white/60 mb-4">Choose a sample dataset to explore:</p>
                <div className="grid gap-4">
                  {Object.entries(SAMPLE_DATASETS).map(([key, dataset]) => (
                    <button
                      key={key}
                      onClick={() => loadSample(key as keyof typeof SAMPLE_DATASETS)}
                      className="glass-card p-4 rounded-xl text-left hover:border-cyan-400/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/30 transition-colors">
                          <Database className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{dataset.name}</h3>
                          <p className="text-xs text-white/50">{dataset.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Analysis Tabs */}
            <div className="w-72 border-r border-white/10 flex flex-col">
              <div className="p-4 border-b border-white/10">
                <div className="flex flex-col gap-1">
                  {(['summary', 'columns', 'charts', 'ai'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all flex items-center gap-2 ${
                        activeTab === tab
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {tab === 'summary' && <Table className="w-4 h-4" />}
                      {tab === 'columns' && <BarChart3 className="w-4 h-4" />}
                      {tab === 'charts' && <PieChart className="w-4 h-4" />}
                      {tab === 'ai' && <Brain className="w-4 h-4" />}
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      {tab === 'ai' && <Sparkles className="w-3 h-3 text-cyan-400 ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data Info */}
              <div className="p-4">
                <div className="glass-card p-4 rounded-xl">
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                    Data Overview
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Rows</span>
                      <span className="text-white font-mono">{parsedData.rowCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Columns</span>
                      <span className="text-white font-mono">{parsedData.columns.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Numeric</span>
                      <span className="text-cyan-400 font-mono">
                        {parsedData.columns.filter(c => c.type === 'number').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Categorical</span>
                      <span className="text-cyan-400 font-mono">
                        {parsedData.columns.filter(c => c.type === 'string').length}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column List */}
              <div className="flex-1 overflow-y-auto morphic-scrollbar p-4 pt-0">
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
                  Columns
                </h3>
                <div className="space-y-1">
                  {parsedData.columns.map((col) => (
                    <div
                      key={col.name}
                      className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">{col.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          col.type === 'number' ? 'bg-blue-500/20 text-blue-400' :
                          col.type === 'string' ? 'bg-green-500/20 text-green-400' :
                          col.type === 'date' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {col.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Analysis Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {activeTab === 'summary' && (
                <div className="flex-1 overflow-hidden flex flex-col p-4">
                  {/* Filter and Table Controls */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        type="text"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder="Filter data..."
                        className="w-full pl-10 pr-4 py-2 bg-dark-400 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/50"
                      />
                    </div>
                    <span className="text-xs text-white/40">
                      Showing {Math.min(visibleRows, tableData.length)} of {tableData.length} rows
                    </span>
                  </div>

                  {/* Data Table */}
                  <div className="flex-1 overflow-auto morphic-scrollbar glass-card rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-dark-400 z-10">
                        <tr>
                          {parsedData.headers.map((header) => (
                            <th
                              key={header}
                              onClick={() => toggleSort(header)}
                              className="px-4 py-3 text-left font-semibold text-white/80 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors select-none"
                            >
                              <div className="flex items-center gap-2">
                                {header}
                                {sortColumn === header && (
                                  sortDirection === 'asc'
                                    ? <SortAsc className="w-3.5 h-3.5 text-cyan-400" />
                                    : <SortDesc className="w-3.5 h-3.5 text-cyan-400" />
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.slice(0, visibleRows).map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                          >
                            {parsedData.headers.map((header) => (
                              <td key={header} className="px-4 py-2.5 text-white/70">
                                {String(row[header] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Load More */}
                  {visibleRows < tableData.length && (
                    <button
                      onClick={() => setVisibleRows(v => v + 20)}
                      className="mt-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Load more rows...
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'columns' && (
                <div className="flex-1 overflow-y-auto morphic-scrollbar p-4">
                  <div className="grid gap-4">
                    {parsedData.columns.map((col) => (
                      <ColumnCard key={col.name} column={col} />
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'charts' && (
                <div className="flex-1 overflow-y-auto morphic-scrollbar p-4">
                  {/* Chart Controls */}
                  <div className="flex flex-wrap items-center gap-4 mb-6">
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">Chart Type</label>
                      <div className="flex gap-1">
                        {(['bar', 'line', 'pie'] as const).map((type) => (
                          <button
                            key={type}
                            onClick={() => setSelectedChart(type)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              selectedChart === type
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'text-white/60 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-white/40 mb-1 block">Value Column</label>
                      <select
                        value={chartColumn}
                        onChange={(e) => setChartColumn(e.target.value)}
                        className="px-3 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400/50"
                      >
                        {parsedData.columns.map((col) => (
                          <option key={col.name} value={col.name}>{col.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-white/40 mb-1 block">Label Column</label>
                      <select
                        value={labelColumn}
                        onChange={(e) => setLabelColumn(e.target.value)}
                        className="px-3 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400/50"
                      >
                        {parsedData.columns.map((col) => (
                          <option key={col.name} value={col.name}>{col.name}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={exportChartAsImage}
                      className="ml-auto glass-btn-secondary px-3 py-1.5 text-xs"
                    >
                      <Download className="w-3.5 h-3.5 inline mr-1.5" />
                      Export Data
                    </button>
                  </div>

                  {/* Chart Display */}
                  <div id="data-chart" className="glass-card p-6 rounded-xl">
                    {selectedChart === 'bar' && <BarChartCSS data={chartData} />}
                    {selectedChart === 'line' && <LineChartCSS data={chartData} />}
                    {selectedChart === 'pie' && <PieChartCSS data={chartData} />}
                  </div>
                </div>
              )}

              {activeTab === 'ai' && (
                <div className="flex-1 overflow-y-auto morphic-scrollbar p-4">
                  {/* AI Query Input */}
                  <div className="glass-card p-4 rounded-xl mb-6">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-cyan-400" />
                      Ask AI About Your Data
                    </h3>
                    <textarea
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      placeholder="Ask questions like:
- What are the main trends in this data?
- Are there any outliers or anomalies?
- What patterns do you see?"
                      className="w-full h-24 p-3 bg-dark-400 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-cyan-400/50"
                    />
                    <button
                      onClick={runAIAnalysis}
                      disabled={!aiQuery.trim() || isAnalyzing}
                      className="mt-3 glass-btn-primary px-4 py-2 text-sm disabled:opacity-50"
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

                  {/* Quick Analysis Buttons */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    <button
                      onClick={() => { setAiQuery('What are the main trends and patterns?'); runAIAnalysis() }}
                      className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all"
                    >
                      Trends & Patterns
                    </button>
                    <button
                      onClick={() => { setAiQuery('Are there any outliers or anomalies?'); runAIAnalysis() }}
                      className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all"
                    >
                      Outlier Detection
                    </button>
                    <button
                      onClick={() => { setAiQuery('What correlations exist between variables?'); runAIAnalysis() }}
                      className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all"
                    >
                      Correlations
                    </button>
                    <button
                      onClick={() => { setAiQuery('Generate a summary report of this data'); runAIAnalysis() }}
                      className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all"
                    >
                      Full Report
                    </button>
                  </div>

                  {/* AI Analysis Results */}
                  {aiAnalysis && (
                    <div className="space-y-4">
                      <div className="glass-card p-4 rounded-xl">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-cyan-400" />
                          Summary
                        </h3>
                        <p className="text-sm text-white/70 leading-relaxed">{aiAnalysis.summary}</p>
                      </div>

                      {aiAnalysis.insights.length > 0 && (
                        <div className="glass-card p-4 rounded-xl">
                          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-cyan-400" />
                            Key Insights
                          </h3>
                          <ul className="space-y-2">
                            {aiAnalysis.insights.map((insight, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                {insight}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aiAnalysis.recommendations.length > 0 && (
                        <div className="glass-card p-4 rounded-xl">
                          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-cyan-400" />
                            Recommendations
                          </h3>
                          <ul className="space-y-2">
                            {aiAnalysis.recommendations.map((rec, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                                <span className="text-cyan-400">-</span>
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

// Column Statistics Card
function ColumnCard({ column }: { column: DataColumn }) {
  const [expanded, setExpanded] = useState(false)
  const stats = column.stats

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            column.type === 'number' ? 'bg-blue-500/20' :
            column.type === 'string' ? 'bg-green-500/20' :
            column.type === 'date' ? 'bg-purple-500/20' :
            'bg-gray-500/20'
          }`}>
            {column.type === 'number' ? '#' :
             column.type === 'string' ? 'Aa' :
             column.type === 'date' ? 'D' : '?'}
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-white">{column.name}</h3>
            <p className="text-xs text-white/50">{column.type} - {stats?.unique} unique values</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>

      {expanded && stats && (
        <div className="p-4 pt-0 border-t border-white/10">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <StatItem label="Count" value={stats.count} />
            <StatItem label="Unique" value={stats.unique} />
            <StatItem label="Missing" value={`${stats.nullCount} (${stats.nullPercentage.toFixed(1)}%)`} />
            <StatItem label="Mode" value={stats.mode !== undefined ? String(stats.mode) : 'N/A'} />

            {column.type === 'number' && (
              <>
                <StatItem label="Mean" value={stats.mean?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Median" value={stats.median?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Std Dev" value={stats.stdDev?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Sum" value={stats.sum?.toLocaleString() ?? 'N/A'} />
                <StatItem label="Min" value={stats.min !== undefined ? String(stats.min) : 'N/A'} />
                <StatItem label="Max" value={stats.max !== undefined ? String(stats.max) : 'N/A'} />
                <StatItem label="Q1 (25%)" value={stats.q1?.toFixed(2) ?? 'N/A'} />
                <StatItem label="Q3 (75%)" value={stats.q3?.toFixed(2) ?? 'N/A'} />
              </>
            )}

            {column.type === 'string' && (
              <>
                <StatItem label="Min" value={stats.min !== undefined ? String(stats.min) : 'N/A'} />
                <StatItem label="Max" value={stats.max !== undefined ? String(stats.max) : 'N/A'} />
              </>
            )}
          </div>

          {/* Missing Value Bar */}
          {stats.nullPercentage > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-white/50">Completeness</span>
                <span className="text-white/70">{(100 - stats.nullPercentage).toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${100 - stats.nullPercentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="px-3 py-2 bg-white/5 rounded-lg">
      <p className="text-[10px] text-white/40 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-white font-mono truncate">{value}</p>
    </div>
  )
}

// CSS-based Bar Chart
function BarChartCSS({ data }: { data: ChartData }) {
  const maxValue = Math.max(...data.values, 1)

  if (data.labels.length === 0) {
    return <div className="text-center py-12 text-white/40">No data to display</div>
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white/80 mb-4">Bar Chart</h3>
      {data.labels.map((label, idx) => {
        const percentage = (data.values[idx] / maxValue) * 100
        const color = data.colors?.[idx % (data.colors?.length || 1)] || CHART_COLORS[idx % CHART_COLORS.length]

        return (
          <div key={label} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-white/70 truncate max-w-[150px]">{label}</span>
              <span className="text-xs text-white/50 font-mono">{data.values[idx].toLocaleString()}</span>
            </div>
            <div className="h-6 bg-white/10 rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg transition-all duration-500 ease-out group-hover:brightness-110 relative"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: color,
                }}
              >
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// CSS-based Line Chart
function LineChartCSS({ data }: { data: ChartData }) {
  const maxValue = Math.max(...data.values, 1)
  const minValue = Math.min(...data.values, 0)
  const range = maxValue - minValue || 1

  if (data.labels.length === 0) {
    return <div className="text-center py-12 text-white/40">No data to display</div>
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/80 mb-4">Line Chart</h3>
      <div className="relative h-64 bg-white/5 rounded-xl p-4">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-4 bottom-8 w-12 flex flex-col justify-between text-[10px] text-white/40">
          <span>{maxValue.toLocaleString()}</span>
          <span>{((maxValue + minValue) / 2).toLocaleString()}</span>
          <span>{minValue.toLocaleString()}</span>
        </div>

        {/* Chart area */}
        <div className="ml-14 h-full relative">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-t border-white/10" />
            ))}
          </div>

          {/* Data points and lines */}
          <svg className="w-full h-full" preserveAspectRatio="none">
            {/* Line */}
            <polyline
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2"
              points={data.values.map((val, idx) => {
                const x = (idx / (data.values.length - 1 || 1)) * 100
                const y = 100 - ((val - minValue) / range) * 100
                return `${x}%,${y}%`
              }).join(' ')}
            />

            {/* Area fill */}
            <polygon
              fill="url(#lineGradient)"
              opacity="0.3"
              points={`0%,100% ${data.values.map((val, idx) => {
                const x = (idx / (data.values.length - 1 || 1)) * 100
                const y = 100 - ((val - minValue) / range) * 100
                return `${x}%,${y}%`
              }).join(' ')} 100%,100%`}
            />

            {/* Gradient definition */}
            <defs>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Data points */}
            {data.values.map((val, idx) => {
              const x = (idx / (data.values.length - 1 || 1)) * 100
              const y = 100 - ((val - minValue) / range) * 100
              return (
                <g key={idx}>
                  <circle
                    cx={`${x}%`}
                    cy={`${y}%`}
                    r="4"
                    fill="#06b6d4"
                    className="hover:r-6 transition-all"
                  />
                  <title>{`${data.labels[idx]}: ${val.toLocaleString()}`}</title>
                </g>
              )
            })}
          </svg>
        </div>

        {/* X-axis labels */}
        <div className="ml-14 flex justify-between mt-2 text-[10px] text-white/40">
          {data.labels.map((label, idx) => (
            <span key={idx} className="truncate max-w-[60px]" title={label}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// CSS-based Pie Chart
function PieChartCSS({ data }: { data: ChartData }) {
  const total = data.values.reduce((a, b) => a + b, 0) || 1

  if (data.labels.length === 0) {
    return <div className="text-center py-12 text-white/40">No data to display</div>
  }

  // Build conic gradient segments
  let currentAngle = 0
  const segments = data.values.map((val, idx) => {
    const percentage = (val / total) * 100
    const startAngle = currentAngle
    currentAngle += percentage
    return {
      label: data.labels[idx],
      value: val,
      percentage,
      startAngle,
      color: data.colors?.[idx % (data.colors?.length || 1)] || CHART_COLORS[idx % CHART_COLORS.length]
    }
  })

  const gradientStops = segments.map((seg, idx) => {
    const prevEnd = idx === 0 ? 0 : segments.slice(0, idx).reduce((a, s) => a + s.percentage, 0)
    return `${seg.color} ${prevEnd}% ${prevEnd + seg.percentage}%`
  }).join(', ')

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/80 mb-4">Pie Chart</h3>
      <div className="flex items-center gap-8">
        {/* Pie */}
        <div
          className="w-48 h-48 rounded-full flex-shrink-0 relative"
          style={{
            background: `conic-gradient(${gradientStops})`,
          }}
        >
          {/* Center circle for donut effect */}
          <div className="absolute inset-8 rounded-full bg-dark-400 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-bold text-white">{total.toLocaleString()}</p>
              <p className="text-[10px] text-white/50">Total</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2 max-h-48 overflow-y-auto morphic-scrollbar">
          {segments.map((seg, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-xs text-white/70 truncate flex-1">{seg.label}</span>
              <span className="text-xs text-white/50 font-mono">{seg.percentage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
