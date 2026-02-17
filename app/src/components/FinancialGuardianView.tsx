/**
 * Financial Guardian View Component
 * A fully functional financial management tool with real charts and AI analysis
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Shield, Plus, Trash2, Edit3, X, DollarSign,
  TrendingUp, TrendingDown, PieChart, Target,
  AlertTriangle, Download, Upload, FileText, Brain,
  Loader2, CheckCircle2, Clock, ArrowRight, Sparkles,
  BarChart2, Wallet, CreditCard, Home, Zap, Car, ShoppingBag,
  Coffee, Film, Heart, Book, Plane, Gift, MoreHorizontal,
  ChevronLeft, ChevronRight, Calendar, Filter, RefreshCcw,
  Briefcase, Star, Bell, Settings, Eye, EyeOff, Copy,
  ArrowUpRight, ArrowDownRight, Minus, TrendingDown as TrendingDownIcon
} from 'lucide-react'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  ComposedChart,
} from 'recharts'
import { aiService, type Message } from '@/services/ai'
import { BRAND_TOKENS, BRAND_STATUS_COLORS, BRAND_GRADIENT_ACCENT } from '@/config/brandTokens'
import { BRAND } from '@/config/brand'
import {
  useFinancialStore,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type Transaction,
  type SavingsGoal,
  type Budget,
  type Bill,
  type FinancialReport,
  type FinancialInsight,
} from '@/stores'

// ============================================================================
// Types & Constants
// ============================================================================

type TabType = 'overview' | 'transactions' | 'budgets' | 'goals' | 'bills' | 'analysis' | 'accounts'
type ViewPeriod = 'week' | 'month' | 'quarter' | 'year'
type TransactionFilter = 'all' | 'income' | 'expense'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Home, Zap, Coffee, Car, ShoppingBag, Film, Heart, Book, Plane, Gift, MoreHorizontal,
  Wallet, CreditCard, TrendingUp, DollarSign, Briefcase, RefreshCcw, Star, Shield,
}

// ============================================================================
// Helper Functions
// ============================================================================

const formatCurrency = (amount: number, showCents = true): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(amount)
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const formatShortDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

const getMonthName = (monthKey: string): string => {
  const [year, month] = monthKey.split('-')
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short' })
}

const getCategoryInfo = (categoryId: string, type: 'income' | 'expense') => {
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  return categories.find(c => c.id === categoryId) || categories[categories.length - 1]
}

const getCategoryIcon = (iconName: string) => {
  return ICON_MAP[iconName] || MoreHorizontal
}

const getPeriodDates = (period: ViewPeriod): { start: Date; end: Date } => {
  const now = new Date()
  const end = new Date(now)
  let start: Date

  switch (period) {
    case 'week':
      start = new Date(now)
      start.setDate(now.getDate() - 7)
      break
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'quarter':
      start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      break
    case 'year':
      start = new Date(now.getFullYear(), 0, 1)
      break
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  return { start, end }
}

// ============================================================================
// Custom Tooltip Components
// ============================================================================

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-dark-300 border border-white/10 rounded-lg p-3 shadow-xl">
        <p className="text-white/60 text-xs mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

const PieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]
    return (
      <div className="bg-dark-300 border border-white/10 rounded-lg p-3 shadow-xl">
        <p className="text-white font-medium text-sm">{data.name}</p>
        <p className="text-white/60 text-xs">{formatCurrency(data.value)}</p>
        <p className="text-white/40 text-xs">{data.payload.percentage?.toFixed(1)}%</p>
      </div>
    )
  }
  return null
}

// ============================================================================
// Sub Components
// ============================================================================

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  trend?: number
  color?: string
  subtitle?: string
}

const StatCard = ({ label, value, icon: Icon, trend, color = 'rose-gold', subtitle }: StatCardProps) => {
  const colorClasses = {
    'rose-gold': 'text-rose-gold-400 bg-rose-gold-400/10',
    'green': 'text-rose-gold-400 bg-rose-gold-500/10',
    'red': 'text-rose-gold-400 bg-rose-gold-500/10',
    'blue': 'text-rose-gold-400 bg-rose-gold-500/10',
    'yellow': 'text-rose-gold-400 bg-rose-gold-500/10',
  }[color] || 'text-rose-gold-400 bg-rose-gold-400/10'

  return (
    <div className="morphic-card p-4 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-2 ${colorClasses.split(' ')[0]}`}>
          <Icon className="w-4 h-4" />
          <span className="text-xs text-white/60">{label}</span>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center text-xs ${trend >= 0 ? 'text-rose-gold-400' : 'text-rose-gold-400'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div className={`text-2xl font-bold ${colorClasses.split(' ')[0]}`}>
        {typeof value === 'number' ? formatCurrency(value) : value}
      </div>
      {subtitle && (
        <div className="text-xs text-white/40 mt-1">{subtitle}</div>
      )}
    </div>
  )
}

interface ProgressBarProps {
  value: number
  max: number
  color?: string
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const ProgressBar = ({ value, max, color = BRAND_TOKENS.accent.base, showLabel = false, size = 'md' }: ProgressBarProps) => {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const heights = { sm: 'h-1', md: 'h-2', lg: 'h-3' }

  return (
    <div className="w-full">
      <div className={`${heights[size]} bg-white/10 rounded-full overflow-hidden`}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: percentage > 100 ? BRAND_STATUS_COLORS.danger : percentage > 80 ? BRAND_STATUS_COLORS.warning : color
          }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-xs mt-1">
          <span className="text-white/60">{formatCurrency(value)}</span>
          <span className="text-white/40">{formatCurrency(max)}</span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function FinancialGuardianView() {
  // Store
  const {
    transactions,
    savingsGoals,
    budgets,
    bills,
    insights,
    accounts,
    lastReport,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    bulkImportTransactions,
    addSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    contributeToGoal,
    setBudget,
    removeBudget,
    addBill,
    updateBill,
    deleteBill,
    markBillPaid,
    dismissInsight,
    generateInsights,
    setReport,
    getMonthlyTotals,
    getYearlyTotals,
    getBudgetStatus,
    getExpenseBreakdown,
    getIncomeBreakdown,
    getMonthlyTrends,
    getUpcomingBills,
    getNetWorth,
    getProjectedSavings,
    exportToCSV,
    exportToJSON,
    importFromCSV,
    importFromJSON,
  } = useFinancialStore()

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('month')
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [showAddBill, setShowAddBill] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [showBalances, setShowBalances] = useState(true)

  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)

  // Form State
  const [newTransaction, setNewTransaction] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: '',
    category: 'food',
    description: '',
    date: new Date().toISOString().split('T')[0],
    recurring: false,
    recurringFrequency: 'monthly' as 'weekly' | 'biweekly' | 'monthly' | 'yearly',
  })

  const [newGoal, setNewGoal] = useState<{ name: string; targetAmount: string; currentAmount: string; deadline: string; color: string }>({
    name: '',
    targetAmount: '',
    currentAmount: '',
    deadline: '',
    color: BRAND_TOKENS.accent.base,
  })

  const [newBill, setNewBill] = useState({
    name: '',
    amount: '',
    dueDate: 1,
    category: 'utilities',
    isRecurring: true,
    frequency: 'monthly' as 'weekly' | 'biweekly' | 'monthly' | 'yearly',
    autoPay: false,
    reminderDays: 3,
  })

  const [importText, setImportText] = useState('')
  const [importType, setImportType] = useState<'csv' | 'json' | 'ai'>('ai')
  const [isImporting, setIsImporting] = useState(false)

  // ============================================================================
  // Computed Values
  // ============================================================================

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const monthlyTotals = useMemo(() => {
    return getMonthlyTotals(currentYear, currentMonth)
  }, [transactions, currentYear, currentMonth])

  const yearlyTotals = useMemo(() => {
    return getYearlyTotals(currentYear)
  }, [transactions, currentYear])

  const periodDates = useMemo(() => getPeriodDates(viewPeriod), [viewPeriod])

  const expenseBreakdown = useMemo(() => {
    return getExpenseBreakdown(periodDates.start, periodDates.end)
  }, [transactions, periodDates])

  const incomeBreakdown = useMemo(() => {
    return getIncomeBreakdown(periodDates.start, periodDates.end)
  }, [transactions, periodDates])

  const budgetStatuses = useMemo(() => {
    return getBudgetStatus()
  }, [transactions, budgets])

  const monthlyTrends = useMemo(() => {
    return getMonthlyTrends(6)
  }, [transactions])

  const upcomingBills = useMemo(() => {
    return getUpcomingBills(14)
  }, [bills])

  const netWorth = useMemo(() => {
    return getNetWorth()
  }, [accounts])

  const projectedSavings = useMemo(() => {
    return getProjectedSavings(12)
  }, [transactions])

  // Filter and search transactions
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(t => {
        if (transactionFilter !== 'all' && t.type !== transactionFilter) return false
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          return (
            t.description.toLowerCase().includes(query) ||
            t.category.toLowerCase().includes(query)
          )
        }
        return true
      })
      .slice(0, 100) // Limit for performance
  }, [transactions, transactionFilter, searchQuery])

  // Active insights (not dismissed)
  const activeInsights = useMemo(() => {
    return insights.filter(i => !i.dismissed).slice(0, 5)
  }, [insights])

  // Chart data for trends
  const trendChartData = useMemo(() => {
    return monthlyTrends.map(t => ({
      month: getMonthName(t.month),
      income: t.income,
      expenses: t.expenses,
      savings: t.savings,
    }))
  }, [monthlyTrends])

  // Pie chart data for expenses
  const pieChartData = useMemo(() => {
    return expenseBreakdown.slice(0, 8).map(item => ({
      name: getCategoryInfo(item.category, 'expense').name,
      value: item.amount,
      percentage: item.percentage,
      color: item.color,
    }))
  }, [expenseBreakdown])

  // Budget chart data
  const budgetChartData = useMemo(() => {
    return budgetStatuses.slice(0, 6).map(b => ({
      category: getCategoryInfo(b.category, 'expense').name.split(' ')[0],
      budget: b.limit,
      spent: b.spent,
      remaining: Math.max(0, b.remaining),
    }))
  }, [budgetStatuses])

  // ============================================================================
  // Effects
  // ============================================================================

  // Generate insights on mount and when transactions change
  useEffect(() => {
    if (transactions.length > 0) {
      generateInsights()
    }
  }, [transactions.length])

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleAddTransaction = () => {
    if (!newTransaction.amount || !newTransaction.category) return

    addTransaction({
      type: newTransaction.type,
      amount: parseFloat(newTransaction.amount),
      category: newTransaction.category,
      description: newTransaction.description,
      date: newTransaction.date,
      recurring: newTransaction.recurring,
      recurringFrequency: newTransaction.recurring ? newTransaction.recurringFrequency : undefined,
    })

    setShowAddTransaction(false)
    setNewTransaction({
      type: 'expense',
      amount: '',
      category: 'food',
      description: '',
      date: new Date().toISOString().split('T')[0],
      recurring: false,
      recurringFrequency: 'monthly',
    })
  }

  const handleUpdateTransaction = () => {
    if (!editingTransaction) return

    updateTransaction(editingTransaction.id, {
      amount: editingTransaction.amount,
      description: editingTransaction.description,
      date: editingTransaction.date,
      category: editingTransaction.category,
    })
    setEditingTransaction(null)
  }

  const handleAddGoal = () => {
    if (!newGoal.name || !newGoal.targetAmount || !newGoal.deadline) return

    addSavingsGoal({
      name: newGoal.name,
      targetAmount: parseFloat(newGoal.targetAmount),
      currentAmount: parseFloat(newGoal.currentAmount) || 0,
      deadline: newGoal.deadline,
      color: newGoal.color,
    })

    setShowAddGoal(false)
    setNewGoal({
      name: '',
      targetAmount: '',
      currentAmount: '',
      deadline: '',
      color: BRAND_TOKENS.accent.base,
    })
  }

  const handleAddBill = () => {
    if (!newBill.name || !newBill.amount) return

    addBill({
      name: newBill.name,
      amount: parseFloat(newBill.amount),
      dueDate: newBill.dueDate,
      category: newBill.category,
      isPaid: false,
      isRecurring: newBill.isRecurring,
      frequency: newBill.isRecurring ? newBill.frequency : undefined,
      autoPay: newBill.autoPay,
      reminderDays: newBill.reminderDays,
    })

    setShowAddBill(false)
    setNewBill({
      name: '',
      amount: '',
      dueDate: 1,
      category: 'utilities',
      isRecurring: true,
      frequency: 'monthly',
      autoPay: false,
      reminderDays: 3,
    })
  }

  const handleImport = async () => {
    if (!importText.trim()) return

    setIsImporting(true)

    try {
      if (importType === 'csv') {
        const result = importFromCSV(importText)
        alert(`Imported ${result.success} transactions (${result.failed} failed)`)
      } else if (importType === 'json') {
        const success = importFromJSON(importText)
        alert(success ? 'Data imported successfully!' : 'Failed to import data')
      } else {
        // AI parsing
        const messages: Message[] = [
          {
            role: 'system',
            content: `You are a financial data parser. Parse the following text and extract transactions.
Return a JSON array of transactions with this format:
[
  {
    "type": "expense" or "income",
    "amount": number (positive),
    "category": one of: rent, utilities, food, transportation, shopping, entertainment, healthcare, education, travel, gifts, other (for expenses) or salary, freelance, investments, rental, refund, bonus, other (for income),
    "description": string,
    "date": "YYYY-MM-DD"
  }
]
Only return the JSON array, no other text.`
          },
          { role: 'user', content: importText }
        ]

        const response = await aiService.chatSync(messages)
        const jsonMatch = response.match(/\[[\s\S]*\]/)

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          const count = bulkImportTransactions(parsed)
          alert(`Successfully imported ${count} transactions`)
        } else {
          throw new Error('Could not parse response')
        }
      }

      setShowImportModal(false)
      setImportText('')
    } catch (error) {
      console.error('Import error:', error)
      alert('Failed to import. Please check the format and try again.')
    }

    setIsImporting(false)
  }

  const handleExport = (type: 'csv' | 'json') => {
    const content = type === 'csv' ? exportToCSV() : exportToJSON()
    const blob = new Blob([content], { type: type === 'csv' ? 'text/csv' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financial-guardian-${new Date().toISOString().split('T')[0]}.${type}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const runFinancialAnalysis = async () => {
    setIsAnalyzing(true)
    setAnalysisProgress(0)

    try {
      const financialSummary = {
        period: viewPeriod,
        monthlyTotals,
        yearlyTotals,
        expenseBreakdown: expenseBreakdown.map(e => ({
          category: getCategoryInfo(e.category, 'expense').name,
          amount: e.amount,
          percentage: e.percentage.toFixed(1)
        })),
        budgetStatuses: budgetStatuses.map(b => ({
          category: getCategoryInfo(b.category, 'expense').name,
          limit: b.limit,
          spent: b.spent,
          percentUsed: b.percentage.toFixed(1)
        })),
        savingsGoals: savingsGoals.map(g => ({
          name: g.name,
          target: g.targetAmount,
          current: g.currentAmount,
          progress: ((g.currentAmount / g.targetAmount) * 100).toFixed(1),
          deadline: g.deadline
        })),
        monthlyTrends: monthlyTrends.slice(-3),
        upcomingBills: upcomingBills.map(b => ({
          name: b.name,
          amount: b.amount,
          dueDate: b.dueDate
        })),
        recentTransactions: transactions.slice(0, 20).map(t => ({
          type: t.type,
          amount: t.amount,
          category: t.category,
          description: t.description,
          date: t.date
        }))
      }

      setAnalysisProgress(30)

      const messages: Message[] = [
        {
          role: 'system',
          content: `You are a professional financial advisor AI. Analyze the user's financial data and provide actionable insights.

Return a JSON object with this exact structure:
{
  "summary": "A 2-3 sentence overview of the financial situation",
  "insights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "riskAlerts": ["alert 1 if any risks", "alert 2 if any"],
  "savingOpportunities": ["opportunity 1", "opportunity 2"]
}

Be specific with numbers and percentages. Be constructive and helpful.
Only return the JSON object, no other text.`
        },
        {
          role: 'user',
          content: `Analyze this financial data:\n${JSON.stringify(financialSummary, null, 2)}`
        }
      ]

      setAnalysisProgress(60)

      const response = await aiService.chatSync(messages)

      setAnalysisProgress(90)

      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const report = JSON.parse(jsonMatch[0]) as FinancialReport
        setReport({ ...report, generatedAt: new Date().toISOString() })
      } else {
        setReport({
          summary: response.slice(0, 300),
          insights: ['Analysis completed. See summary above.'],
          recommendations: [],
          riskAlerts: [],
          savingOpportunities: [],
          generatedAt: new Date().toISOString()
        })
      }

      setAnalysisProgress(100)
    } catch (error) {
      console.error('Analysis error:', error)
      alert('Failed to complete analysis. Please check AI service configuration.')
    }

    setIsAnalyzing(false)
  }

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
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-glow-sm"
                style={{ background: BRAND_GRADIENT_ACCENT }}
              >
                <Shield className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Financial Guardian</h2>
                <p className="text-xs text-rose-gold-400/70">Smart budget tracking and analysis</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Period Selector */}
            <div className="flex bg-white/5 rounded-lg p-1">
              {(['week', 'month', 'quarter', 'year'] as ViewPeriod[]).map(period => (
                <button
                  key={period}
                  onClick={() => setViewPeriod(period)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                    viewPeriod === period ? 'bg-rose-gold-500 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>

            {/* Toggle Balance Visibility */}
            <button
              onClick={() => setShowBalances(!showBalances)}
              className="morphic-btn p-2"
              title={showBalances ? 'Hide amounts' : 'Show amounts'}
            >
              {showBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="morphic-btn px-3 py-2 text-sm flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>

            <div className="relative group">
              <button className="morphic-btn px-3 py-2 text-sm flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export
              </button>
              <div className="absolute right-0 top-full mt-1 bg-dark-300 border border-white/10 rounded-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-32">
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full px-3 py-2 text-sm text-white/80 hover:bg-white/5 text-left"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-3 py-2 text-sm text-white/80 hover:bg-white/5 text-left"
                >
                  Export JSON
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowAddTransaction(true)}
              className="morphic-btn-ghost bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-3 py-2 text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Transaction
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: PieChart },
            { id: 'transactions', label: 'Transactions', icon: FileText },
            { id: 'budgets', label: 'Budgets', icon: Target },
            { id: 'goals', label: 'Goals', icon: TrendingUp },
            { id: 'bills', label: 'Bills', icon: CreditCard },
            { id: 'analysis', label: 'AI Analysis', icon: Brain },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-rose-gold-500/20 text-rose-gold-400 border border-rose-gold-400/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto morphic-scrollbar p-4">
        {/* Insights Banner */}
        {activeInsights.length > 0 && activeTab === 'overview' && (
          <div className="mb-4 space-y-2">
            {activeInsights.slice(0, 3).map(insight => (
              <div
                key={insight.id}
                className={`morphic-card p-3 rounded-lg flex items-center gap-3 ${
                  insight.type === 'warning' ? 'border-rose-gold-400/30 bg-rose-gold-500/10' :
                  insight.type === 'success' ? 'border-rose-gold-400/30 bg-rose-gold-500/10' :
                  insight.type === 'tip' ? 'border-rose-gold-400/30 bg-rose-gold-500/10' :
                  'border-rose-gold-400/30 bg-rose-gold-400/10'
                }`}
              >
                {insight.type === 'warning' && <AlertTriangle className="w-4 h-4 text-rose-gold-400" />}
                {insight.type === 'success' && <CheckCircle2 className="w-4 h-4 text-rose-gold-400" />}
                {insight.type === 'tip' && <Sparkles className="w-4 h-4 text-rose-gold-400" />}
                {insight.type === 'info' && <Bell className="w-4 h-4 text-rose-gold-400" />}
                <div className="flex-1">
                  <span className="text-sm text-white font-medium">{insight.title}</span>
                  <p className="text-xs text-white/60">{insight.message}</p>
                </div>
                <button
                  onClick={() => dismissInsight(insight.id)}
                  className="text-white/40 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Income"
                value={showBalances ? monthlyTotals.income : '****'}
                icon={TrendingUp}
                color="green"
                subtitle="This month"
              />
              <StatCard
                label="Expenses"
                value={showBalances ? monthlyTotals.expenses : '****'}
                icon={TrendingDown}
                color="red"
                subtitle="This month"
              />
              <StatCard
                label="Net Savings"
                value={showBalances ? monthlyTotals.savings : '****'}
                icon={Wallet}
                color={monthlyTotals.savings >= 0 ? 'green' : 'red'}
                subtitle="This month"
              />
              <StatCard
                label="Savings Rate"
                value={`${monthlyTotals.savingsRate.toFixed(1)}%`}
                icon={BarChart2}
                color={monthlyTotals.savingsRate >= 20 ? 'green' : monthlyTotals.savingsRate >= 10 ? 'yellow' : 'red'}
                subtitle={monthlyTotals.savingsRate >= 20 ? 'Great!' : monthlyTotals.savingsRate >= 10 ? 'Good' : 'Needs work'}
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Expense Breakdown Pie Chart */}
              <div className="morphic-card p-4 rounded-xl">
                <h3 className="text-sm font-semibold text-white mb-4">Expense Breakdown</h3>
                {pieChartData.length > 0 ? (
                  <div className="flex items-center">
                    <ResponsiveContainer width="50%" height={200}>
                      <RechartsPieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="w-1/2 space-y-2">
                      {pieChartData.slice(0, 5).map(item => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs text-white/60 flex-1 truncate">{item.name}</span>
                          <span className="text-xs text-white/80">{item.percentage?.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-white/40 text-sm">
                    No expense data available
                  </div>
                )}
              </div>

              {/* Income vs Expenses Trend */}
              <div className="morphic-card p-4 rounded-xl">
                <h3 className="text-sm font-semibold text-white mb-4">Monthly Trends</h3>
                {trendChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={trendChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={BRAND_TOKENS.charts.grid} />
                      <XAxis dataKey="month" tick={{ fill: BRAND_TOKENS.charts.axisMuted, fontSize: 11 }} />
                      <YAxis tick={{ fill: BRAND_TOKENS.charts.axisMuted, fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="income" name="Income" fill={BRAND_STATUS_COLORS.success} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="Expenses" fill={BRAND_STATUS_COLORS.danger} radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="savings" name="Savings" stroke={BRAND_TOKENS.accent.base} strokeWidth={2} dot={{ fill: BRAND_TOKENS.accent.base }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-48 flex items-center justify-center text-white/40 text-sm">
                    No trend data available
                  </div>
                )}
              </div>
            </div>

            {/* Budget vs Actual */}
            <div className="morphic-card p-4 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-white">Budget vs Actual</h3>
                <button
                  onClick={() => setActiveTab('budgets')}
                  className="text-xs text-rose-gold-400 hover:text-rose-gold-300 flex items-center gap-1"
                >
                  Manage <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {budgetChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={budgetChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={BRAND_TOKENS.charts.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fill: BRAND_TOKENS.charts.axisMuted, fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="category" tick={{ fill: BRAND_TOKENS.charts.axis, fontSize: 11 }} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="budget" name="Budget" fill={'rgba(243, 214, 199, 0.18)'} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="spent" name="Spent" fill={BRAND_TOKENS.accent.base} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-white/40 text-sm">
                  <Target className="w-8 h-8 mb-2 opacity-50" />
                  <p>No budgets set yet</p>
                  <button
                    onClick={() => setActiveTab('budgets')}
                    className="mt-2 text-rose-gold-400 hover:text-rose-gold-300"
                  >
                    Create your first budget
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Row: Goals & Upcoming Bills */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Savings Goals */}
              <div className="morphic-card p-4 rounded-xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-white">Savings Goals</h3>
                  <button
                    onClick={() => setShowAddGoal(true)}
                    className="text-xs text-rose-gold-400 hover:text-rose-gold-300"
                  >
                    + Add Goal
                  </button>
                </div>
                {savingsGoals.length > 0 ? (
                  <div className="space-y-4">
                    {savingsGoals.slice(0, 3).map(goal => {
                      const progress = (goal.currentAmount / goal.targetAmount) * 100
                      const daysLeft = Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))

                      return (
                        <div key={goal.id} className="bg-white/5 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-white font-medium">{goal.name}</span>
                            <span className="text-xs text-white/40">{daysLeft} days left</span>
                          </div>
                          <ProgressBar value={goal.currentAmount} max={goal.targetAmount} color={goal.color} size="sm" />
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-white/60">
                              {showBalances ? formatCurrency(goal.currentAmount) : '****'}
                            </span>
                            <span className="text-white/40">
                              {showBalances ? formatCurrency(goal.targetAmount) : '****'} ({progress.toFixed(0)}%)
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="h-32 flex flex-col items-center justify-center text-white/40 text-sm">
                    <Target className="w-8 h-8 mb-2 opacity-50" />
                    <p>No savings goals yet</p>
                  </div>
                )}
              </div>

              {/* Upcoming Bills */}
              <div className="morphic-card p-4 rounded-xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-white">Upcoming Bills</h3>
                  <button
                    onClick={() => setActiveTab('bills')}
                    className="text-xs text-rose-gold-400 hover:text-rose-gold-300 flex items-center gap-1"
                  >
                    View All <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                {upcomingBills.length > 0 ? (
                  <div className="space-y-2">
                    {upcomingBills.slice(0, 4).map(bill => {
                      const info = getCategoryInfo(bill.category, 'expense')
                      const Icon = getCategoryIcon(info.icon)
                      const dueDate = new Date()
                      dueDate.setDate(bill.dueDate)
                      if (dueDate < new Date()) {
                        dueDate.setMonth(dueDate.getMonth() + 1)
                      }

                      return (
                        <div key={bill.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${info.color}20` }}
                          >
                            <Icon className="w-4 h-4" style={{ color: info.color }} />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm text-white">{bill.name}</div>
                            <div className="text-xs text-white/40">Due {formatShortDate(dueDate.toISOString())}</div>
                          </div>
                          <div className="text-sm font-medium text-white">
                            {showBalances ? formatCurrency(bill.amount) : '****'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="h-32 flex flex-col items-center justify-center text-white/40 text-sm">
                    <CreditCard className="w-8 h-8 mb-2 opacity-50" />
                    <p>No upcoming bills</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="morphic-card p-4 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className="text-xs text-rose-gold-400 hover:text-rose-gold-300 flex items-center gap-1"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-2">
                {transactions.slice(0, 5).map(t => {
                  const info = getCategoryInfo(t.category, t.type)
                  const Icon = getCategoryIcon(info.icon)

                  return (
                    <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${info.color}20` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: info.color }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-white">{t.description || info.name}</div>
                        <div className="text-xs text-white/40">{formatDate(t.date)}</div>
                      </div>
                      <div className={`text-sm font-medium ${t.type === 'income' ? 'text-rose-gold-400' : 'text-rose-gold-400'}`}>
                        {t.type === 'income' ? '+' : '-'}{showBalances ? formatCurrency(t.amount) : '****'}
                      </div>
                    </div>
                  )
                })}
                {transactions.length === 0 && (
                  <div className="text-center py-8 text-white/40 text-sm">
                    No transactions yet. Add your first transaction to get started!
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="morphic-card p-4 rounded-xl flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-64">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transactions..."
                  className="w-full bg-white/5 rounded-lg px-4 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-rose-gold-500"
                />
              </div>
              <div className="flex bg-white/5 rounded-lg p-1">
                {(['all', 'income', 'expense'] as TransactionFilter[]).map(filter => (
                  <button
                    key={filter}
                    onClick={() => setTransactionFilter(filter)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                      transactionFilter === filter ? 'bg-rose-gold-500 text-white' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <div className="text-xs text-white/40">
                {filteredTransactions.length} transactions
              </div>
            </div>

            {/* Transaction List */}
            <div className="morphic-card rounded-xl overflow-hidden">
              <div className="divide-y divide-white/5">
                {filteredTransactions.map(t => {
                  const info = getCategoryInfo(t.category, t.type)
                  const Icon = getCategoryIcon(info.icon)

                  return (
                    <div key={t.id} className="flex items-center gap-3 p-4 hover:bg-white/5">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${info.color}20` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: info.color }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-white font-medium">{t.description || info.name}</div>
                        <div className="text-xs text-white/40 flex items-center gap-2">
                          <span>{formatDate(t.date)}</span>
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                          <span>{info.name}</span>
                          {t.recurring && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-white/20" />
                              <span className="text-rose-gold-400">Recurring</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className={`text-sm font-bold ${t.type === 'income' ? 'text-rose-gold-400' : 'text-rose-gold-400'}`}>
                        {t.type === 'income' ? '+' : '-'}{showBalances ? formatCurrency(t.amount) : '****'}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditingTransaction(t)}
                          className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteTransaction(t.id)}
                          className="p-2 text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-500/10 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {filteredTransactions.length === 0 && (
                  <div className="text-center py-12 text-white/40">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No transactions found</p>
                    <button
                      onClick={() => setShowAddTransaction(true)}
                      className="mt-4 text-rose-gold-400 hover:text-rose-gold-300 text-sm"
                    >
                      Add a transaction
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Budgets Tab */}
        {activeTab === 'budgets' && (
          <div className="space-y-4">
            {/* Current Budget Status */}
            <div className="morphic-card p-4 rounded-xl">
              <h3 className="text-sm font-semibold text-white mb-4">Monthly Budget Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {budgetStatuses.map(budget => {
                  const info = getCategoryInfo(budget.category, 'expense')
                  const Icon = getCategoryIcon(info.icon)
                  const isOver = budget.spent > budget.limit

                  return (
                    <div key={budget.category} className="bg-white/5 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${info.color}20` }}
                        >
                          <Icon className="w-5 h-5" style={{ color: info.color }} />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{info.name}</div>
                          <div className={`text-xs ${isOver ? 'text-rose-gold-400' : 'text-white/40'}`}>
                            {showBalances ? formatCurrency(budget.spent) : '****'} of {showBalances ? formatCurrency(budget.limit) : '****'}
                          </div>
                        </div>
                        <div className={`text-lg font-bold ${
                          isOver ? 'text-rose-gold-400' :
                          budget.percentage >= 80 ? 'text-rose-gold-400' :
                          'text-rose-gold-400'
                        }`}>
                          {budget.percentage.toFixed(0)}%
                        </div>
                      </div>
                      <ProgressBar
                        value={budget.spent}
                        max={budget.limit}
                        color={info.color}
                        size="md"
                      />
                      <div className="flex items-center gap-2 mt-3">
                        <input
                          type="number"
                          value={budget.limit}
                          onChange={(e) => setBudget(budget.category, Number(e.target.value))}
                          className="flex-1 bg-white/5 rounded px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-rose-gold-500"
                        />
                        <button
                          onClick={() => removeBudget(budget.category)}
                          className="p-1 text-white/40 hover:text-rose-gold-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Add Budget Category */}
            <div className="morphic-card p-4 rounded-xl">
              <h3 className="text-sm font-semibold text-white mb-4">Add Budget Category</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {EXPENSE_CATEGORIES.filter(cat => !budgets.some(b => b.category === cat.id)).map(cat => {
                  const Icon = getCategoryIcon(cat.icon)
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setBudget(cat.id, 500)}
                      className="flex items-center gap-2 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <Icon className="w-4 h-4" style={{ color: cat.color }} />
                      <span className="text-xs text-white/80">{cat.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Goals Tab */}
        {activeTab === 'goals' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Savings Goals</h3>
              <button
                onClick={() => setShowAddGoal(true)}
                className="morphic-btn-ghost bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-3 py-2 text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Goal
              </button>
            </div>

            {/* Goals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savingsGoals.map(goal => {
                const progress = (goal.currentAmount / goal.targetAmount) * 100
                const daysLeft = Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30))
                const remainingAmount = goal.targetAmount - goal.currentAmount
                const monthlyNeeded = remainingAmount / monthsLeft

                return (
                  <div key={goal.id} className="morphic-card p-6 rounded-xl">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-semibold text-white">{goal.name}</h4>
                        <p className="text-xs text-white/40 flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3" />
                          {daysLeft} days left ({formatDate(goal.deadline)})
                        </p>
                      </div>
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${goal.color}20` }}
                      >
                        <Target className="w-6 h-6" style={{ color: goal.color }} />
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white/60">Progress</span>
                        <span className="text-white font-medium">{progress.toFixed(1)}%</span>
                      </div>
                      <ProgressBar value={goal.currentAmount} max={goal.targetAmount} color={goal.color} size="lg" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-white/40">Saved</div>
                        <div className="text-lg font-bold text-white">
                          {showBalances ? formatCurrency(goal.currentAmount) : '****'}
                        </div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-white/40">Remaining</div>
                        <div className="text-lg font-bold text-white">
                          {showBalances ? formatCurrency(remainingAmount) : '****'}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-white/40 mb-4">
                      Save <span className="text-rose-gold-400 font-medium">{formatCurrency(monthlyNeeded)}/month</span> to reach your goal
                    </div>

                    <div className="flex gap-2">
                      {[25, 50, 100].map(amount => (
                        <button
                          key={amount}
                          onClick={() => contributeToGoal(goal.id, amount)}
                          className="flex-1 py-2 text-xs bg-white/5 rounded-lg hover:bg-white/10 text-white/60"
                        >
                          +${amount}
                        </button>
                      ))}
                      <button
                        onClick={() => deleteSavingsGoal(goal.id)}
                        className="px-3 py-2 text-xs bg-rose-gold-500/10 rounded-lg hover:bg-rose-gold-500/20 text-rose-gold-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {savingsGoals.length === 0 && (
              <div className="morphic-card p-12 rounded-xl text-center">
                <Target className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No Savings Goals Yet</h3>
                <p className="text-sm text-white/40 mb-4">Set financial goals to track your progress</p>
                <button
                  onClick={() => setShowAddGoal(true)}
                  className="morphic-btn-ghost bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-4 py-2 text-sm"
                >
                  Create Your First Goal
                </button>
              </div>
            )}

            {/* Projected Savings Chart */}
            {savingsGoals.length > 0 && projectedSavings.length > 0 && (
              <div className="morphic-card p-4 rounded-xl">
                <h3 className="text-sm font-semibold text-white mb-4">Projected Savings (12 Months)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={projectedSavings}>
                    <defs>
                      <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BRAND_TOKENS.accent.base} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={BRAND_TOKENS.accent.base} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={BRAND_TOKENS.charts.grid} />
                    <XAxis dataKey="month" tick={{ fill: BRAND_TOKENS.charts.axisMuted, fontSize: 11 }} tickFormatter={getMonthName} />
                    <YAxis tick={{ fill: BRAND_TOKENS.charts.axisMuted, fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      name="Cumulative Savings"
                      stroke={BRAND_TOKENS.accent.base}
                      fill="url(#savingsGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Bills Tab */}
        {activeTab === 'bills' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Bills & Subscriptions</h3>
              <button
                onClick={() => setShowAddBill(true)}
                className="morphic-btn-ghost bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-3 py-2 text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Bill
              </button>
            </div>

            {/* Upcoming Bills */}
            <div className="morphic-card p-4 rounded-xl">
              <h4 className="text-sm font-medium text-white mb-4">Upcoming (Next 14 Days)</h4>
              {upcomingBills.length > 0 ? (
                <div className="space-y-2">
                  {upcomingBills.map(bill => {
                    const info = getCategoryInfo(bill.category, 'expense')
                    const Icon = getCategoryIcon(info.icon)
                    const dueDate = new Date()
                    dueDate.setDate(bill.dueDate)
                    if (dueDate < new Date()) {
                      dueDate.setMonth(dueDate.getMonth() + 1)
                    }

                    return (
                      <div key={bill.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${info.color}20` }}
                        >
                          <Icon className="w-5 h-5" style={{ color: info.color }} />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-white font-medium">{bill.name}</div>
                          <div className="text-xs text-white/40">
                            Due {formatShortDate(dueDate.toISOString())}
                            {bill.autoPay && <span className="ml-2 text-rose-gold-400">Auto-pay</span>}
                          </div>
                        </div>
                        <div className="text-sm font-bold text-white">
                          {showBalances ? formatCurrency(bill.amount) : '****'}
                        </div>
                        <button
                          onClick={() => markBillPaid(bill.id)}
                          className="p-2 text-rose-gold-400 hover:bg-rose-gold-500/10 rounded-lg"
                          title="Mark as paid"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-white/40 text-sm">
                  No upcoming bills in the next 14 days
                </div>
              )}
            </div>

            {/* All Bills */}
            <div className="morphic-card p-4 rounded-xl">
              <h4 className="text-sm font-medium text-white mb-4">All Bills</h4>
              <div className="space-y-2">
                {bills.map(bill => {
                  const info = getCategoryInfo(bill.category, 'expense')
                  const Icon = getCategoryIcon(info.icon)

                  return (
                    <div key={bill.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${info.color}20` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: info.color }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-white font-medium">{bill.name}</div>
                        <div className="text-xs text-white/40">
                          Due on {bill.dueDate}th
                          {bill.isRecurring && ` (${bill.frequency})`}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-white">
                        {showBalances ? formatCurrency(bill.amount) : '****'}
                      </div>
                      <button
                        onClick={() => deleteBill(bill.id)}
                        className="p-2 text-white/40 hover:text-rose-gold-400 hover:bg-rose-gold-500/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
                {bills.length === 0 && (
                  <div className="text-center py-8 text-white/40 text-sm">
                    <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No bills added yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI Analysis Tab */}
        {activeTab === 'analysis' && (
          <div className="space-y-4">
            <div className="morphic-card p-6 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">AI Financial Analysis</h3>
                    <p className="text-xs text-white/40">Get personalized insights and recommendations</p>
                  </div>
                </div>
                <button
                  onClick={runFinancialAnalysis}
                  disabled={isAnalyzing || transactions.length === 0}
                  className="morphic-btn-ghost bg-rose-gold-400/20 text-rose-gold-400 border-rose-gold-400/30 hover:bg-rose-gold-400/30 px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Run Analysis
                    </>
                  )}
                </button>
              </div>

              {isAnalyzing && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-white/60 mb-2">
                    <span>Analyzing your financial data...</span>
                    <span>{analysisProgress}%</span>
                  </div>
                  <ProgressBar value={analysisProgress} max={100} size="sm" />
                </div>
              )}

              {transactions.length === 0 && !isAnalyzing && (
                <div className="text-center py-8 text-white/40">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Add some transactions first to enable AI analysis</p>
                </div>
              )}
            </div>

            {lastReport && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="morphic-card p-6 rounded-xl">
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-rose-gold-400" />
                    Summary
                  </h4>
                  <p className="text-white/80 leading-relaxed">{lastReport.summary}</p>
                </div>

                {/* Insights */}
                {lastReport.insights.length > 0 && (
                  <div className="morphic-card p-6 rounded-xl">
                    <h4 className="text-sm font-semibold text-white mb-3">Key Insights</h4>
                    <ul className="space-y-2">
                      {lastReport.insights.map((insight, i) => (
                        <li key={i} className="flex items-start gap-3 text-white/80">
                          <CheckCircle2 className="w-4 h-4 text-rose-gold-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {lastReport.recommendations.length > 0 && (
                  <div className="morphic-card p-6 rounded-xl">
                    <h4 className="text-sm font-semibold text-white mb-3">Recommendations</h4>
                    <ul className="space-y-2">
                      {lastReport.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-3 text-white/80">
                          <ArrowRight className="w-4 h-4 text-rose-gold-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risk Alerts */}
                {lastReport.riskAlerts.length > 0 && (
                  <div className="morphic-card p-6 rounded-xl border border-rose-gold-400/30 bg-rose-gold-500/5">
                    <h4 className="text-sm font-semibold text-rose-gold-400 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Risk Alerts
                    </h4>
                    <ul className="space-y-2">
                      {lastReport.riskAlerts.map((alert, i) => (
                        <li key={i} className="text-sm text-white/80">{alert}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Saving Opportunities */}
                {lastReport.savingOpportunities.length > 0 && (
                  <div className="morphic-card p-6 rounded-xl border border-rose-gold-400/30 bg-rose-gold-500/5">
                    <h4 className="text-sm font-semibold text-rose-gold-400 mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Saving Opportunities
                    </h4>
                    <ul className="space-y-2">
                      {lastReport.savingOpportunities.map((opp, i) => (
                        <li key={i} className="text-sm text-white/80">{opp}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================================ */}
      {/* Modals */}
      {/* ============================================================================ */}

      {/* Add Transaction Modal */}
      {showAddTransaction && (
        <div className="fixed inset-0 bg-dark-400/70 flex items-center justify-center z-50 p-4">
          <div className="morphic-card p-6 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto morphic-scrollbar">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Add Transaction</h3>
              <button onClick={() => setShowAddTransaction(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Type Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setNewTransaction(prev => ({ ...prev, type: 'expense', category: 'food' }))}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors ${
                    newTransaction.type === 'expense'
                      ? 'bg-rose-gold-500/20 text-rose-gold-400 border border-rose-gold-400/30'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  Expense
                </button>
                <button
                  onClick={() => setNewTransaction(prev => ({ ...prev, type: 'income', category: 'salary' }))}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors ${
                    newTransaction.type === 'income'
                      ? 'bg-rose-gold-500/20 text-rose-gold-400 border border-rose-gold-400/30'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  Income
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="number"
                    value={newTransaction.amount}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full bg-white/5 rounded-lg pl-10 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Category</label>
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto morphic-scrollbar p-1">
                  {(newTransaction.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => {
                    const Icon = getCategoryIcon(cat.icon)
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setNewTransaction(prev => ({ ...prev, category: cat.id }))}
                        className={`p-3 rounded-lg flex flex-col items-center gap-1 transition-colors ${
                          newTransaction.category === cat.id
                            ? 'bg-rose-gold-500/20 border border-rose-gold-400/30'
                            : 'bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <Icon className="w-5 h-5" style={{ color: cat.color }} />
                        <span className="text-[10px] text-white/60 text-center leading-tight">{cat.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Description</label>
                <input
                  type="text"
                  value={newTransaction.description}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                  placeholder="Optional description..."
                />
              </div>

              {/* Date */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Date</label>
                <input
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                />
              </div>

              {/* Recurring */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={newTransaction.recurring}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, recurring: e.target.checked }))}
                  className="w-4 h-4 rounded bg-white/5 border-white/20"
                />
                <label htmlFor="recurring" className="text-sm text-white/60">Recurring transaction</label>
              </div>

              {newTransaction.recurring && (
                <select
                  value={newTransaction.recurringFrequency}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, recurringFrequency: e.target.value as any }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              )}

              <button
                onClick={handleAddTransaction}
                disabled={!newTransaction.amount || !newTransaction.category}
                className="w-full morphic-btn py-3 text-sm font-semibold disabled:opacity-50"
              >
                Add Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <div className="fixed inset-0 bg-dark-400/70 flex items-center justify-center z-50 p-4">
          <div className="morphic-card p-6 rounded-xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Edit Transaction</h3>
              <button onClick={() => setEditingTransaction(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/40 mb-1 block">Amount</label>
                <input
                  type="number"
                  value={editingTransaction.amount}
                  onChange={(e) => setEditingTransaction(prev => prev ? { ...prev, amount: Number(e.target.value) } : null)}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Description</label>
                <input
                  type="text"
                  value={editingTransaction.description}
                  onChange={(e) => setEditingTransaction(prev => prev ? { ...prev, description: e.target.value } : null)}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Date</label>
                <input
                  type="date"
                  value={editingTransaction.date}
                  onChange={(e) => setEditingTransaction(prev => prev ? { ...prev, date: e.target.value } : null)}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditingTransaction(null)}
                  className="flex-1 morphic-btn py-3 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateTransaction}
                  className="flex-1 morphic-btn py-3 text-sm font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {showAddGoal && (
        <div className="fixed inset-0 bg-dark-400/70 flex items-center justify-center z-50 p-4">
          <div className="morphic-card p-6 rounded-xl w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">New Savings Goal</h3>
              <button onClick={() => setShowAddGoal(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/40 mb-1 block">Goal Name</label>
                <input
                  type="text"
                  value={newGoal.name}
                  onChange={(e) => setNewGoal(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                  placeholder="e.g., Emergency Fund, Vacation"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Target Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="number"
                    value={newGoal.targetAmount}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, targetAmount: e.target.value }))}
                    className="w-full bg-white/5 rounded-lg pl-10 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Current Amount (optional)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="number"
                    value={newGoal.currentAmount}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, currentAmount: e.target.value }))}
                    className="w-full bg-white/5 rounded-lg pl-10 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Target Date</label>
                <input
                  type="date"
                  value={newGoal.deadline}
                  onChange={(e) => setNewGoal(prev => ({ ...prev, deadline: e.target.value }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Color</label>
                <div className="flex gap-2">
                  {[...BRAND_TOKENS.charts.primary.slice(0, 6)].map(color => (
                    <button
                      key={color}
                      onClick={() => setNewGoal(prev => ({ ...prev, color }))}
                      className={`w-8 h-8 rounded-lg transition-transform ${
                        newGoal.color === color ? 'scale-110 ring-2 ring-white' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={handleAddGoal}
                disabled={!newGoal.name || !newGoal.targetAmount || !newGoal.deadline}
                className="w-full morphic-btn py-3 text-sm font-semibold disabled:opacity-50"
              >
                Create Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Bill Modal */}
      {showAddBill && (
        <div className="fixed inset-0 bg-dark-400/70 flex items-center justify-center z-50 p-4">
          <div className="morphic-card p-6 rounded-xl w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Add Bill</h3>
              <button onClick={() => setShowAddBill(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/40 mb-1 block">Bill Name</label>
                <input
                  type="text"
                  value={newBill.name}
                  onChange={(e) => setNewBill(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                  placeholder="e.g., Rent, Netflix"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="number"
                    value={newBill.amount}
                    onChange={(e) => setNewBill(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full bg-white/5 rounded-lg pl-10 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Due Day of Month</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={newBill.dueDate}
                  onChange={(e) => setNewBill(prev => ({ ...prev, dueDate: Number(e.target.value) }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Category</label>
                <select
                  value={newBill.category}
                  onChange={(e) => setNewBill(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-rose-gold-500"
                >
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="billRecurring"
                  checked={newBill.isRecurring}
                  onChange={(e) => setNewBill(prev => ({ ...prev, isRecurring: e.target.checked }))}
                  className="w-4 h-4 rounded bg-white/5 border-white/20"
                />
                <label htmlFor="billRecurring" className="text-sm text-white/60">Recurring bill</label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoPay"
                  checked={newBill.autoPay}
                  onChange={(e) => setNewBill(prev => ({ ...prev, autoPay: e.target.checked }))}
                  className="w-4 h-4 rounded bg-white/5 border-white/20"
                />
                <label htmlFor="autoPay" className="text-sm text-white/60">Auto-pay enabled</label>
              </div>

              <button
                onClick={handleAddBill}
                disabled={!newBill.name || !newBill.amount}
                className="w-full morphic-btn py-3 text-sm font-semibold disabled:opacity-50"
              >
                Add Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-dark-400/70 flex items-center justify-center z-50 p-4">
          <div className="morphic-card p-6 rounded-xl w-full max-w-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Import Transactions</h3>
              <button onClick={() => setShowImportModal(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Import Type */}
              <div className="flex bg-white/5 rounded-lg p-1">
                {[
                  { id: 'ai', label: 'AI Parse', icon: Brain },
                  { id: 'csv', label: 'CSV', icon: FileText },
                  { id: 'json', label: 'JSON', icon: FileText },
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => setImportType(type.id as any)}
                    className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      importType === type.id ? 'bg-rose-gold-500 text-white' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <type.icon className="w-4 h-4" />
                    {type.label}
                  </button>
                ))}
              </div>

              <p className="text-sm text-white/60">
                {importType === 'ai' && 'Paste any bank statement text. AI will parse and categorize transactions.'}
                {importType === 'csv' && 'Paste CSV with columns: Date, Type, Category, Amount, Description'}
                {importType === 'json' && 'Paste exported JSON data from Financial Guardian'}
              </p>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full h-64 bg-white/5 rounded-lg p-4 text-white text-sm font-mono outline-none focus:ring-2 focus:ring-rose-gold-500 resize-none morphic-scrollbar"
                placeholder={
                  importType === 'ai'
                    ? `Paste your bank statement here...

Example:
01/15/2024 - Grocery Store - $85.23
01/14/2024 - Gas Station - $45.00
01/14/2024 - Paycheck - +$2,500.00`
                    : importType === 'csv'
                    ? `Date,Type,Category,Amount,Description
2024-01-15,expense,food,85.23,Grocery Store
2024-01-14,income,salary,2500,Paycheck`
                    : '{ "transactions": [...], "savingsGoals": [...] }'
                }
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 morphic-btn py-3 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!importText.trim() || isImporting}
                  className="flex-1 morphic-btn py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Import
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
