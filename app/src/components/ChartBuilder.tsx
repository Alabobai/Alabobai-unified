/**
 * Chart Builder Component
 * Interactive chart creation with Chart.js integration
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  BarChart3, LineChart, PieChart, ScatterChart, Activity,
  Settings, Download, Palette, Type, Grid3X3, RefreshCw,
  ChevronDown, ChevronUp, Check, X, Plus, Minus,
  TrendingUp, Layers, ZoomIn
} from 'lucide-react'
import type { ParsedData, ChartSuggestion } from '../services/dataAnalysis'
import { suggestCharts, aggregateBy } from '../services/dataAnalysis'
import { BRAND_TOKENS } from '@/config/brandTokens'

// ============================================================================
// Types
// ============================================================================

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'area' | 'doughnut' | 'radar'

export interface ChartConfig {
  type: ChartType
  title: string
  xAxis: string
  yAxis: string
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max'
  colorScheme: string
  showLegend: boolean
  showGrid: boolean
  showLabels: boolean
  animated: boolean
  stacked: boolean
}

interface ChartBuilderProps {
  data: ParsedData
  onExport?: (chartData: string, format: 'png' | 'svg' | 'json') => void
}

// ============================================================================
// Color Schemes
// ============================================================================

const COLOR_SCHEMES = {
  roseGold: {
    name: 'Rose Gold',
    colors: [...BRAND_TOKENS.charts.primary]
  },
  copper: {
    name: 'Copper Depth',
    colors: ['#f3d6c7', '#e8b89d', '#d9a07a', '#c9956c', '#be7a6a', '#b8845c', '#a67c52', '#8e4f42', '#6b4d32', '#5f332d']
  },
  ember: {
    name: 'Ember Rose',
    colors: ['#ffe7da', '#f3d6c7', '#dbb590', '#d9ab7e', '#c9956c', '#be7a6a', '#a67c52', '#8e4f42', '#6b4d32', '#5f332d']
  },
  monochrome: {
    name: 'Warm Neutrals',
    colors: ['#2a201d', '#3a2a26', '#4b3530', '#5f443d', '#74544b', '#8e6a5d', '#a88777', '#c3aa98', '#dfcfbf', '#f3ebe4']
  }
}

// ============================================================================
// Chart Icon Component
// ============================================================================

function ChartIcon({ type, className = '' }: { type: ChartType; className?: string }) {
  const icons = {
    bar: BarChart3,
    line: LineChart,
    pie: PieChart,
    scatter: ScatterChart,
    histogram: Activity,
    area: TrendingUp,
    doughnut: PieChart,
    radar: Grid3X3
  }
  const Icon = icons[type]
  return <Icon className={className} />
}

// ============================================================================
// Main Chart Builder Component
// ============================================================================

export default function ChartBuilder({ data, onExport }: ChartBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartInstanceRef = useRef<unknown>(null)

  // Configuration state
  const [config, setConfig] = useState<ChartConfig>({
    type: 'bar',
    title: '',
    xAxis: '',
    yAxis: '',
    aggregation: 'sum',
    colorScheme: 'roseGold',
    showLegend: true,
    showGrid: true,
    showLabels: true,
    animated: true,
    stacked: false
  })

  // UI state
  const [showSettings, setShowSettings] = useState(false)
  const [suggestions, setSuggestions] = useState<ChartSuggestion[]>([])
  const [chartJsLoaded, setChartJsLoaded] = useState(false)

  // Get columns by type
  const numericColumns = useMemo(() =>
    data.columns.filter(c => c.type === 'number').map(c => c.name),
    [data.columns]
  )

  const categoricalColumns = useMemo(() =>
    data.columns.filter(c => c.type === 'string' || c.type === 'date').map(c => c.name),
    [data.columns]
  )

  const allColumns = useMemo(() => data.headers, [data.headers])

  // Load Chart.js from CDN
  useEffect(() => {
    if ((window as unknown as { Chart?: unknown }).Chart) {
      setChartJsLoaded(true)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
    script.async = true
    script.onload = () => setChartJsLoaded(true)
    script.onerror = () => console.error('Failed to load Chart.js')
    document.head.appendChild(script)

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script)
      }
    }
  }, [])

  // Get chart suggestions on data change
  useEffect(() => {
    const chartSuggestions = suggestCharts(data)
    setSuggestions(chartSuggestions)

    // Set default axes based on suggestions
    if (chartSuggestions.length > 0) {
      const topSuggestion = chartSuggestions[0]
      setConfig(prev => ({
        ...prev,
        type: topSuggestion.type as ChartType,
        xAxis: topSuggestion.xAxis || categoricalColumns[0] || '',
        yAxis: topSuggestion.yAxis || numericColumns[0] || ''
      }))
    } else {
      setConfig(prev => ({
        ...prev,
        xAxis: categoricalColumns[0] || allColumns[0] || '',
        yAxis: numericColumns[0] || allColumns[1] || ''
      }))
    }
  }, [data, categoricalColumns, numericColumns, allColumns])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!config.xAxis || !config.yAxis) {
      return { labels: [], datasets: [] }
    }

    const colors = COLOR_SCHEMES[config.colorScheme as keyof typeof COLOR_SCHEMES]?.colors || COLOR_SCHEMES.roseGold.colors

    // For pie/doughnut charts, we aggregate by the x-axis column
    if (config.type === 'pie' || config.type === 'doughnut') {
      const aggregated = aggregateBy(data.raw, config.xAxis, config.yAxis, config.aggregation)
      return {
        labels: aggregated.map(d => d.label),
        datasets: [{
          data: aggregated.map(d => d.value),
          backgroundColor: colors.slice(0, aggregated.length),
          borderColor: colors.map(c => c),
          borderWidth: 2
        }]
      }
    }

    // For scatter plots, use raw x and y values
    if (config.type === 'scatter') {
      const points = data.raw
        .filter(row => row[config.xAxis] != null && row[config.yAxis] != null)
        .map(row => ({
          x: Number(row[config.xAxis]),
          y: Number(row[config.yAxis])
        }))
        .filter(p => !isNaN(p.x) && !isNaN(p.y))

      return {
        datasets: [{
          label: `${config.yAxis} vs ${config.xAxis}`,
          data: points,
          backgroundColor: colors[0] + '80',
          borderColor: colors[0],
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      }
    }

    // For histogram, create bins
    if (config.type === 'histogram') {
      const column = data.columns.find(c => c.name === config.yAxis)
      if (column?.stats?.histogram) {
        return {
          labels: column.stats.histogram.map(h => h.bin),
          datasets: [{
            label: config.yAxis,
            data: column.stats.histogram.map(h => h.count),
            backgroundColor: colors[0] + '80',
            borderColor: colors[0],
            borderWidth: 2
          }]
        }
      }
    }

    // For bar, line, area charts - aggregate by category
    const aggregated = aggregateBy(data.raw, config.xAxis, config.yAxis, config.aggregation)

    return {
      labels: aggregated.map(d => d.label),
      datasets: [{
        label: `${config.yAxis} (${config.aggregation})`,
        data: aggregated.map(d => d.value),
        backgroundColor: config.type === 'line' || config.type === 'area'
          ? colors[0] + '20'
          : colors.slice(0, aggregated.length).map(c => c + '80'),
        borderColor: config.type === 'line' || config.type === 'area'
          ? colors[0]
          : colors.slice(0, aggregated.length),
        borderWidth: 2,
        fill: config.type === 'area',
        tension: 0.4
      }]
    }
  }, [data, config])

  // Render chart with Chart.js
  useEffect(() => {
    if (!chartJsLoaded || !canvasRef.current) return

    const Chart = (window as unknown as { Chart: new (ctx: CanvasRenderingContext2D | null, config: unknown) => { destroy: () => void } }).Chart
    if (!Chart) return

    // Destroy previous chart instance
    if (chartInstanceRef.current) {
      (chartInstanceRef.current as { destroy: () => void }).destroy()
    }

    const ctx = canvasRef.current.getContext('2d')

    const chartType = config.type === 'area' ? 'line' : config.type === 'histogram' ? 'bar' : config.type

    chartInstanceRef.current = new Chart(ctx, {
      type: chartType,
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: config.animated ? { duration: 750 } : false,
        plugins: {
          legend: {
            display: config.showLegend,
            position: 'top' as const,
            labels: {
              color: 'rgba(255, 255, 255, 0.7)',
              font: { size: 12 }
            }
          },
          title: {
            display: !!config.title,
            text: config.title,
            color: 'rgba(255, 255, 255, 0.9)',
            font: { size: 16, weight: 'bold' as const }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: BRAND_TOKENS.text.primary,
            bodyColor: 'rgba(255, 255, 255, 0.8)',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8
          }
        },
        scales: config.type !== 'pie' && config.type !== 'doughnut' && config.type !== 'radar' ? {
          x: {
            display: true,
            grid: {
              display: config.showGrid,
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)',
              maxRotation: 45
            }
          },
          y: {
            display: true,
            stacked: config.stacked,
            grid: {
              display: config.showGrid,
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)'
            },
            beginAtZero: true
          }
        } : undefined
      }
    })

    return () => {
      if (chartInstanceRef.current) {
        (chartInstanceRef.current as { destroy: () => void }).destroy()
        chartInstanceRef.current = null
      }
    }
  }, [chartJsLoaded, chartData, config])

  // Export chart
  const handleExport = useCallback((format: 'png' | 'svg' | 'json') => {
    if (format === 'png' && canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `chart-${Date.now()}.png`
      link.href = dataUrl
      link.click()
      onExport?.(dataUrl, 'png')
    } else if (format === 'json') {
      const jsonData = JSON.stringify({ config, data: chartData }, null, 2)
      const blob = new Blob([jsonData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `chart-data-${Date.now()}.json`
      link.href = url
      link.click()
      URL.revokeObjectURL(url)
      onExport?.(jsonData, 'json')
    }
  }, [config, chartData, onExport])

  // Apply suggestion
  const applySuggestion = (suggestion: ChartSuggestion) => {
    setConfig(prev => ({
      ...prev,
      type: suggestion.type as ChartType,
      xAxis: suggestion.xAxis || prev.xAxis,
      yAxis: suggestion.yAxis || prev.yAxis
    }))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-white/10">
        {/* Chart Type Selector */}
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {(['bar', 'line', 'pie', 'scatter', 'histogram', 'area'] as ChartType[]).map(type => (
            <button
              key={type}
              onClick={() => setConfig(prev => ({ ...prev, type }))}
              className={`p-2 rounded-md transition-all ${
                config.type === type
                  ? 'bg-rose-gold-400/20 text-rose-gold-400'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
              title={type.charAt(0).toUpperCase() + type.slice(1)}
            >
              <ChartIcon type={type} className="w-4 h-4" />
            </button>
          ))}
        </div>

        {/* Axis Selectors */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-white/50">X:</label>
          <select
            value={config.xAxis}
            onChange={e => setConfig(prev => ({ ...prev, xAxis: e.target.value }))}
            className="px-2 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-rose-gold-400/50 min-w-[120px]"
          >
            {allColumns.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-white/50">Y:</label>
          <select
            value={config.yAxis}
            onChange={e => setConfig(prev => ({ ...prev, yAxis: e.target.value }))}
            className="px-2 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-rose-gold-400/50 min-w-[120px]"
          >
            {allColumns.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>

        {/* Aggregation Selector */}
        {config.type !== 'scatter' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-white/50">Agg:</label>
            <select
              value={config.aggregation}
              onChange={e => setConfig(prev => ({ ...prev, aggregation: e.target.value as ChartConfig['aggregation'] }))}
              className="px-2 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-rose-gold-400/50"
            >
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="count">Count</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings & Export */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-lg transition-all ${
            showSettings
              ? 'bg-rose-gold-400/20 text-rose-gold-400'
              : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="flex gap-1">
          <button
            onClick={() => handleExport('png')}
            className="px-3 py-1.5 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg text-xs transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            PNG
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1.5 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg text-xs transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 border-b border-white/10 bg-white/5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Title */}
            <div>
              <label className="text-xs text-white/50 block mb-1">Chart Title</label>
              <input
                type="text"
                value={config.title}
                onChange={e => setConfig(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter title..."
                className="w-full px-2 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-rose-gold-400/50"
              />
            </div>

            {/* Color Scheme */}
            <div>
              <label className="text-xs text-white/50 block mb-1">Color Scheme</label>
              <select
                value={config.colorScheme}
                onChange={e => setConfig(prev => ({ ...prev, colorScheme: e.target.value }))}
                className="w-full px-2 py-1.5 bg-dark-400 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-rose-gold-400/50"
              >
                {Object.entries(COLOR_SCHEMES).map(([key, scheme]) => (
                  <option key={key} value={key}>{scheme.name}</option>
                ))}
              </select>
            </div>

            {/* Toggle Options */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-white/50">Options</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, showLegend: !prev.showLegend }))}
                  className={`px-2 py-1 rounded text-xs ${
                    config.showLegend ? 'bg-rose-gold-400/20 text-rose-gold-400' : 'bg-white/5 text-white/50'
                  }`}
                >
                  Legend
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                  className={`px-2 py-1 rounded text-xs ${
                    config.showGrid ? 'bg-rose-gold-400/20 text-rose-gold-400' : 'bg-white/5 text-white/50'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, animated: !prev.animated }))}
                  className={`px-2 py-1 rounded text-xs ${
                    config.animated ? 'bg-rose-gold-400/20 text-rose-gold-400' : 'bg-white/5 text-white/50'
                  }`}
                >
                  Animate
                </button>
              </div>
            </div>

            {/* Color Preview */}
            <div>
              <label className="text-xs text-white/50 block mb-1">Color Preview</label>
              <div className="flex gap-1">
                {COLOR_SCHEMES[config.colorScheme as keyof typeof COLOR_SCHEMES]?.colors.slice(0, 6).map((color, i) => (
                  <div
                    key={i}
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 overflow-x-auto">
          <span className="text-xs text-white/40 flex-shrink-0">Suggestions:</span>
          {suggestions.slice(0, 4).map((suggestion, i) => (
            <button
              key={i}
              onClick={() => applySuggestion(suggestion)}
              className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-white/60 hover:text-white transition-all flex-shrink-0"
            >
              <ChartIcon type={suggestion.type as ChartType} className="w-3 h-3" />
              <span className="truncate max-w-[150px]">{suggestion.reason}</span>
              <span className="text-white/30">({Math.round(suggestion.confidence * 100)}%)</span>
            </button>
          ))}
        </div>
      )}

      {/* Chart Canvas */}
      <div className="flex-1 p-4 min-h-[400px]">
        {chartJsLoaded ? (
          <div className="w-full h-full bg-dark-400/50 rounded-xl p-4">
            <canvas ref={canvasRef} />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-dark-400/50 rounded-xl">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-rose-gold-400 animate-spin" />
              <span className="text-white/50 text-sm">Loading Chart.js...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Fallback CSS Charts (when Chart.js is not loaded)
// ============================================================================

export function CSSBarChart({ data, colors }: { data: { label: string; value: number }[]; colors?: string[] }) {
  const maxValue = Math.max(...data.map(d => d.value), 1)
  const defaultColors = COLOR_SCHEMES.roseGold.colors

  return (
    <div className="space-y-3">
      {data.map((item, idx) => {
        const percentage = (item.value / maxValue) * 100
        const color = colors?.[idx % colors.length] || defaultColors[idx % defaultColors.length]

        return (
          <div key={item.label} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-white/70 truncate max-w-[150px]">{item.label}</span>
              <span className="text-xs text-white/50 font-mono">{item.value.toLocaleString()}</span>
            </div>
            <div className="h-6 bg-white/10 rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg transition-all duration-500 ease-out group-hover:brightness-110"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function CSSLineChart({ data, colors }: { data: { label: string; value: number }[]; colors?: string[] }) {
  const maxValue = Math.max(...data.map(d => d.value), 1)
  const minValue = Math.min(...data.map(d => d.value), 0)
  const range = maxValue - minValue || 1
  const color = colors?.[0] || COLOR_SCHEMES.roseGold.colors[0]

  return (
    <div className="relative h-64 bg-white/5 rounded-xl p-4">
      <svg className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          fill="url(#lineGradient)"
          opacity="0.3"
          points={`0,100 ${data.map((d, idx) => {
            const x = (idx / (data.length - 1 || 1)) * 100
            const y = 100 - ((d.value - minValue) / range) * 100
            return `${x},${y}`
          }).join(' ')} 100,100`}
        />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={data.map((d, idx) => {
            const x = (idx / (data.length - 1 || 1)) * 100
            const y = 100 - ((d.value - minValue) / range) * 100
            return `${x},${y}`
          }).join(' ')}
        />
        {data.map((d, idx) => {
          const x = (idx / (data.length - 1 || 1)) * 100
          const y = 100 - ((d.value - minValue) / range) * 100
          return (
            <g key={idx}>
              <circle cx={`${x}%`} cy={`${y}%`} r="4" fill={color} />
              <title>{`${d.label}: ${d.value.toLocaleString()}`}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function CSSPieChart({ data, colors }: { data: { label: string; value: number }[]; colors?: string[] }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const defaultColors = COLOR_SCHEMES.roseGold.colors

  let currentAngle = 0
  const segments = data.map((d, idx) => {
    const percentage = (d.value / total) * 100
    const startAngle = currentAngle
    currentAngle += percentage
    return {
      ...d,
      percentage,
      startAngle,
      color: colors?.[idx % colors.length] || defaultColors[idx % defaultColors.length]
    }
  })

  const gradientStops = segments.map((seg, idx) => {
    const prevEnd = idx === 0 ? 0 : segments.slice(0, idx).reduce((a, s) => a + s.percentage, 0)
    return `${seg.color} ${prevEnd}% ${prevEnd + seg.percentage}%`
  }).join(', ')

  return (
    <div className="flex items-center gap-8">
      <div
        className="w-48 h-48 rounded-full flex-shrink-0 relative"
        style={{ background: `conic-gradient(${gradientStops})` }}
      >
        <div className="absolute inset-8 rounded-full bg-dark-400 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-bold text-white">{total.toLocaleString()}</p>
            <p className="text-[10px] text-white/50">Total</p>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-2 max-h-48 overflow-y-auto">
        {segments.map((seg, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-xs text-white/70 truncate flex-1">{seg.label}</span>
            <span className="text-xs text-white/50 font-mono">{seg.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
