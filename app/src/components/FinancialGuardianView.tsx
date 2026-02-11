/**
 * Financial Guardian View Component
 * A fully functional financial management tool with AI-powered analysis
 */

import { useState, useEffect, useRef } from 'react'
import {
  Shield, Plus, Trash2, Edit3, Save, X, DollarSign,
  TrendingUp, TrendingDown, PieChart, Calendar, Target,
  AlertTriangle, Download, Upload, FileText, Brain,
  Loader2, CheckCircle2, Clock, ArrowRight, Sparkles,
  BarChart2, Wallet, CreditCard, Home, Zap, Car, ShoppingBag,
  Coffee, Film, Heart, Book, Plane, Gift, MoreHorizontal
} from 'lucide-react'
import { aiService, type Message } from '@/services/ai'

// Types
interface Transaction {
  id: string
  type: 'income' | 'expense'
  amount: number
  category: string
  description: string
  date: string
  recurring?: boolean
  recurringFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'yearly'
}

interface SavingsGoal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  deadline: string
  color: string
}

interface Budget {
  category: string
  limit: number
  spent: number
}

interface FinancialReport {
  summary: string
  insights: string[]
  recommendations: string[]
  riskAlerts: string[]
  savingOpportunities: string[]
}

interface ExpenseAlert {
  id: string
  type: 'warning' | 'danger' | 'info'
  message: string
  category?: string
  timestamp: Date
}

// Category configuration
const EXPENSE_CATEGORIES = [
  { id: 'rent', name: 'Rent/Mortgage', icon: Home, color: '#f43f5e' },
  { id: 'utilities', name: 'Utilities', icon: Zap, color: '#f59e0b' },
  { id: 'food', name: 'Food & Groceries', icon: Coffee, color: '#10b981' },
  { id: 'transportation', name: 'Transportation', icon: Car, color: '#3b82f6' },
  { id: 'shopping', name: 'Shopping', icon: ShoppingBag, color: '#8b5cf6' },
  { id: 'entertainment', name: 'Entertainment', icon: Film, color: '#ec4899' },
  { id: 'healthcare', name: 'Healthcare', icon: Heart, color: '#ef4444' },
  { id: 'education', name: 'Education', icon: Book, color: '#06b6d4' },
  { id: 'travel', name: 'Travel', icon: Plane, color: '#14b8a6' },
  { id: 'gifts', name: 'Gifts & Donations', icon: Gift, color: '#a855f7' },
  { id: 'other', name: 'Other', icon: MoreHorizontal, color: '#6b7280' },
]

const INCOME_CATEGORIES = [
  { id: 'salary', name: 'Salary', icon: Wallet, color: '#22c55e' },
  { id: 'freelance', name: 'Freelance', icon: CreditCard, color: '#3b82f6' },
  { id: 'investments', name: 'Investments', icon: TrendingUp, color: '#8b5cf6' },
  { id: 'other', name: 'Other Income', icon: DollarSign, color: '#6b7280' },
]

// Local Storage Keys
const STORAGE_KEYS = {
  transactions: 'financial-guardian-transactions',
  goals: 'financial-guardian-goals',
  budgets: 'financial-guardian-budgets',
  alerts: 'financial-guardian-alerts',
}

// Helper functions
const generateId = () => crypto.randomUUID()

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const getCategoryInfo = (categoryId: string, type: 'income' | 'expense') => {
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  return categories.find(c => c.id === categoryId) || categories[categories.length - 1]
}

export default function FinancialGuardianView() {
  // State
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [alerts, setAlerts] = useState<ExpenseAlert[]>([])

  // UI State
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'budgets' | 'goals' | 'analysis'>('overview')
  const [viewPeriod, setViewPeriod] = useState<'month' | 'year'>('month')
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)

  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState(0)

  // Form State
  const [newTransaction, setNewTransaction] = useState<Partial<Transaction>>({
    type: 'expense',
    amount: 0,
    category: 'food',
    description: '',
    date: new Date().toISOString().split('T')[0],
    recurring: false,
  })

  const [newGoal, setNewGoal] = useState({
    name: '',
    targetAmount: 0,
    currentAmount: 0,
    deadline: '',
    color: '#8b5cf6',
  })

  const [importText, setImportText] = useState('')
  const [isParsingImport, setIsParsingImport] = useState(false)

  // Load data from localStorage
  useEffect(() => {
    const loadedTransactions = localStorage.getItem(STORAGE_KEYS.transactions)
    const loadedGoals = localStorage.getItem(STORAGE_KEYS.goals)
    const loadedBudgets = localStorage.getItem(STORAGE_KEYS.budgets)
    const loadedAlerts = localStorage.getItem(STORAGE_KEYS.alerts)

    if (loadedTransactions) setTransactions(JSON.parse(loadedTransactions))
    if (loadedGoals) setSavingsGoals(JSON.parse(loadedGoals))
    if (loadedBudgets) setBudgets(JSON.parse(loadedBudgets))
    if (loadedAlerts) setAlerts(JSON.parse(loadedAlerts).map((a: any) => ({ ...a, timestamp: new Date(a.timestamp) })))

    // Initialize default budgets if none exist
    if (!loadedBudgets) {
      const defaultBudgets: Budget[] = EXPENSE_CATEGORIES.slice(0, 6).map(cat => ({
        category: cat.id,
        limit: 500,
        spent: 0,
      }))
      setBudgets(defaultBudgets)
    }
  }, [])

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions))
  }, [transactions])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.goals, JSON.stringify(savingsGoals))
  }, [savingsGoals])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.budgets, JSON.stringify(budgets))
  }, [budgets])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(alerts))
  }, [alerts])

  // Calculate budget spending and check alerts
  useEffect(() => {
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()

    const updatedBudgets = budgets.map(budget => {
      const spent = transactions
        .filter(t => {
          const tDate = new Date(t.date)
          return t.type === 'expense' &&
                 t.category === budget.category &&
                 tDate.getMonth() === currentMonth &&
                 tDate.getFullYear() === currentYear
        })
        .reduce((sum, t) => sum + t.amount, 0)

      return { ...budget, spent }
    })

    // Only update if there's a change
    const hasChanged = updatedBudgets.some((b, i) => b.spent !== budgets[i]?.spent)
    if (hasChanged) {
      setBudgets(updatedBudgets)

      // Generate alerts for over-budget categories
      const newAlerts: ExpenseAlert[] = []
      updatedBudgets.forEach(budget => {
        const percentage = (budget.spent / budget.limit) * 100
        if (percentage >= 100) {
          newAlerts.push({
            id: generateId(),
            type: 'danger',
            message: `You've exceeded your ${getCategoryInfo(budget.category, 'expense').name} budget!`,
            category: budget.category,
            timestamp: new Date(),
          })
        } else if (percentage >= 80) {
          newAlerts.push({
            id: generateId(),
            type: 'warning',
            message: `You've used ${Math.round(percentage)}% of your ${getCategoryInfo(budget.category, 'expense').name} budget`,
            category: budget.category,
            timestamp: new Date(),
          })
        }
      })

      if (newAlerts.length > 0) {
        setAlerts(prev => [...newAlerts, ...prev].slice(0, 10)) // Keep last 10 alerts
      }
    }
  }, [transactions])

  // Calculate totals
  const calculateTotals = () => {
    const now = new Date()
    const filterDate = viewPeriod === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), 0, 1)

    const filteredTransactions = transactions.filter(t => new Date(t.date) >= filterDate)

    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0)

    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)

    const savings = income - expenses
    const savingsRate = income > 0 ? (savings / income) * 100 : 0

    return { income, expenses, savings, savingsRate }
  }

  const totals = calculateTotals()

  // Get expense breakdown by category
  const getExpenseBreakdown = () => {
    const now = new Date()
    const filterDate = viewPeriod === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), 0, 1)

    const categoryTotals: Record<string, number> = {}

    transactions
      .filter(t => t.type === 'expense' && new Date(t.date) >= filterDate)
      .forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount
      })

    return Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totals.expenses > 0 ? (amount / totals.expenses) * 100 : 0,
        info: getCategoryInfo(category, 'expense')
      }))
      .sort((a, b) => b.amount - a.amount)
  }

  // Add transaction
  const handleAddTransaction = () => {
    if (!newTransaction.amount || !newTransaction.category || !newTransaction.date) return

    const transaction: Transaction = {
      id: generateId(),
      type: newTransaction.type as 'income' | 'expense',
      amount: Number(newTransaction.amount),
      category: newTransaction.category,
      description: newTransaction.description || '',
      date: newTransaction.date,
      recurring: newTransaction.recurring,
      recurringFrequency: newTransaction.recurringFrequency,
    }

    setTransactions(prev => [transaction, ...prev])
    setShowAddTransaction(false)
    setNewTransaction({
      type: 'expense',
      amount: 0,
      category: 'food',
      description: '',
      date: new Date().toISOString().split('T')[0],
      recurring: false,
    })
  }

  // Update transaction
  const handleUpdateTransaction = () => {
    if (!editingTransaction) return

    setTransactions(prev =>
      prev.map(t => t.id === editingTransaction.id ? editingTransaction : t)
    )
    setEditingTransaction(null)
  }

  // Delete transaction
  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id))
  }

  // Add savings goal
  const handleAddGoal = () => {
    if (!newGoal.name || !newGoal.targetAmount || !newGoal.deadline) return

    const goal: SavingsGoal = {
      id: generateId(),
      name: newGoal.name,
      targetAmount: Number(newGoal.targetAmount),
      currentAmount: Number(newGoal.currentAmount),
      deadline: newGoal.deadline,
      color: newGoal.color,
    }

    setSavingsGoals(prev => [...prev, goal])
    setShowAddGoal(false)
    setNewGoal({
      name: '',
      targetAmount: 0,
      currentAmount: 0,
      deadline: '',
      color: '#8b5cf6',
    })
  }

  // Update goal progress
  const updateGoalProgress = (id: string, amount: number) => {
    setSavingsGoals(prev =>
      prev.map(g => g.id === id ? { ...g, currentAmount: Math.min(g.currentAmount + amount, g.targetAmount) } : g)
    )
  }

  // Update budget limit
  const updateBudgetLimit = (category: string, limit: number) => {
    setBudgets(prev =>
      prev.map(b => b.category === category ? { ...b, limit } : b)
    )
  }

  // AI-powered import parsing
  const handleImportParse = async () => {
    if (!importText.trim()) return

    setIsParsingImport(true)

    try {
      const messages: Message[] = [
        {
          role: 'system',
          content: `You are a financial data parser. Parse the following bank statement text and extract transactions.
Return a JSON array of transactions with this format:
[
  {
    "type": "expense" or "income",
    "amount": number (positive),
    "category": one of: rent, utilities, food, transportation, shopping, entertainment, healthcare, education, travel, gifts, other (for expenses) or salary, freelance, investments, other (for income),
    "description": string,
    "date": "YYYY-MM-DD"
  }
]
Only return the JSON array, no other text.`
        },
        {
          role: 'user',
          content: importText
        }
      ]

      const response = await aiService.chatSync(messages)

      // Try to parse the response as JSON
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsedTransactions = JSON.parse(jsonMatch[0])

        const newTransactions: Transaction[] = parsedTransactions.map((t: any) => ({
          id: generateId(),
          type: t.type,
          amount: Math.abs(Number(t.amount)),
          category: t.category,
          description: t.description,
          date: t.date,
        }))

        setTransactions(prev => [...newTransactions, ...prev])
        setShowImportModal(false)
        setImportText('')

        setAlerts(prev => [{
          id: generateId(),
          type: 'info',
          message: `Successfully imported ${newTransactions.length} transactions`,
          timestamp: new Date(),
        }, ...prev])
      }
    } catch (error) {
      console.error('Import parse error:', error)
      setAlerts(prev => [{
        id: generateId(),
        type: 'danger',
        message: 'Failed to parse import data. Please check the format.',
        timestamp: new Date(),
      }, ...prev])
    }

    setIsParsingImport(false)
  }

  // AI Financial Analysis
  const runFinancialAnalysis = async () => {
    setIsAnalyzing(true)
    setAnalysisProgress(0)
    setFinancialReport(null)

    try {
      // Prepare financial summary for AI
      const expenseBreakdown = getExpenseBreakdown()
      const recentTransactions = transactions.slice(0, 30)

      const financialSummary = {
        period: viewPeriod,
        totals,
        expenseBreakdown: expenseBreakdown.map(e => ({
          category: e.info.name,
          amount: e.amount,
          percentage: e.percentage.toFixed(1)
        })),
        budgets: budgets.map(b => ({
          category: getCategoryInfo(b.category, 'expense').name,
          limit: b.limit,
          spent: b.spent,
          percentUsed: ((b.spent / b.limit) * 100).toFixed(1)
        })),
        savingsGoals: savingsGoals.map(g => ({
          name: g.name,
          target: g.targetAmount,
          current: g.currentAmount,
          progress: ((g.currentAmount / g.targetAmount) * 100).toFixed(1),
          deadline: g.deadline
        })),
        recentTransactions: recentTransactions.map(t => ({
          type: t.type,
          amount: t.amount,
          category: t.category,
          description: t.description,
          date: t.date
        }))
      }

      setAnalysisProgress(20)

      const messages: Message[] = [
        {
          role: 'system',
          content: `You are a professional financial advisor AI. Analyze the user's financial data and provide actionable insights.

Return a JSON object with this exact structure:
{
  "summary": "A 2-3 sentence overview of the financial situation",
  "insights": ["insight 1", "insight 2", "insight 3"],
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

      setAnalysisProgress(50)

      const response = await aiService.chatSync(messages)

      setAnalysisProgress(80)

      // Parse the response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const report = JSON.parse(jsonMatch[0]) as FinancialReport
        setFinancialReport(report)
      } else {
        // Fallback if JSON parsing fails
        setFinancialReport({
          summary: response.slice(0, 200),
          insights: ['Analysis completed but could not be structured.'],
          recommendations: ['Try running the analysis again.'],
          riskAlerts: [],
          savingOpportunities: []
        })
      }

      setAnalysisProgress(100)
    } catch (error) {
      console.error('Analysis error:', error)
      setFinancialReport({
        summary: 'Unable to complete analysis. Please ensure AI service is available.',
        insights: [],
        recommendations: [],
        riskAlerts: [],
        savingOpportunities: []
      })
    }

    setIsAnalyzing(false)
  }

  // Export data
  const exportData = () => {
    const data = {
      transactions,
      savingsGoals,
      budgets,
      exportDate: new Date().toISOString()
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financial-guardian-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex flex-col bg-dark-500 overflow-hidden">
      {/* Header */}
      <div className="glass-morphic-header p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-glow-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Financial Guardian</h2>
              <p className="text-xs text-white/50">AI-powered budget tracking and analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Period Selector */}
            <div className="flex bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setViewPeriod('month')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewPeriod === 'month' ? 'bg-emerald-500 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setViewPeriod('year')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewPeriod === 'year' ? 'bg-emerald-500 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                Yearly
              </button>
            </div>

            <button
              onClick={() => setShowImportModal(true)}
              className="glass-btn-secondary px-3 py-2 text-sm flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>

            <button
              onClick={exportData}
              className="glass-btn-secondary px-3 py-2 text-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>

            <button
              onClick={() => setShowAddTransaction(true)}
              className="glass-btn-primary px-3 py-2 text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Transaction
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mt-4">
          {[
            { id: 'overview', label: 'Overview', icon: PieChart },
            { id: 'transactions', label: 'Transactions', icon: FileText },
            { id: 'budgets', label: 'Budgets', icon: Target },
            { id: 'goals', label: 'Goals', icon: TrendingUp },
            { id: 'analysis', label: 'AI Analysis', icon: Brain },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
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
        {/* Alerts Banner */}
        {alerts.length > 0 && activeTab === 'overview' && (
          <div className="mb-4 space-y-2">
            {alerts.slice(0, 3).map(alert => (
              <div
                key={alert.id}
                className={`glass-card p-3 rounded-lg flex items-center gap-3 ${
                  alert.type === 'danger' ? 'border-red-500/30 bg-red-500/10' :
                  alert.type === 'warning' ? 'border-yellow-500/30 bg-yellow-500/10' :
                  'border-blue-500/30 bg-blue-500/10'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 ${
                  alert.type === 'danger' ? 'text-red-400' :
                  alert.type === 'warning' ? 'text-yellow-400' :
                  'text-blue-400'
                }`} />
                <span className="text-sm text-white/80">{alert.message}</span>
                <button
                  onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
                  className="ml-auto text-white/40 hover:text-white"
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
            <div className="grid grid-cols-4 gap-4">
              <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center gap-2 text-white/60 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-xs">Income</span>
                </div>
                <div className="text-2xl font-bold text-green-400">
                  {formatCurrency(totals.income)}
                </div>
                <div className="text-xs text-white/40 mt-1">
                  This {viewPeriod}
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center gap-2 text-white/60 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs">Expenses</span>
                </div>
                <div className="text-2xl font-bold text-red-400">
                  {formatCurrency(totals.expenses)}
                </div>
                <div className="text-xs text-white/40 mt-1">
                  This {viewPeriod}
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center gap-2 text-white/60 mb-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs">Net Savings</span>
                </div>
                <div className={`text-2xl font-bold ${totals.savings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(totals.savings)}
                </div>
                <div className="text-xs text-white/40 mt-1">
                  This {viewPeriod}
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center gap-2 text-white/60 mb-2">
                  <BarChart2 className="w-4 h-4 text-purple-400" />
                  <span className="text-xs">Savings Rate</span>
                </div>
                <div className={`text-2xl font-bold ${totals.savingsRate >= 20 ? 'text-emerald-400' : totals.savingsRate >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {totals.savingsRate.toFixed(1)}%
                </div>
                <div className="text-xs text-white/40 mt-1">
                  {totals.savingsRate >= 20 ? 'Great!' : totals.savingsRate >= 10 ? 'Good' : 'Needs work'}
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Expense Breakdown */}
              <div className="glass-card p-4 rounded-xl">
                <h3 className="text-sm font-semibold text-white mb-4">Expense Breakdown</h3>
                <div className="space-y-3">
                  {getExpenseBreakdown().slice(0, 6).map(item => (
                    <div key={item.category} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${item.info.color}20` }}
                      >
                        <item.info.icon className="w-4 h-4" style={{ color: item.info.color }} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white">{item.info.name}</span>
                          <span className="text-white/60">{formatCurrency(item.amount)}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: item.info.color
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-white/40 w-12 text-right">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Budget Overview */}
              <div className="glass-card p-4 rounded-xl">
                <h3 className="text-sm font-semibold text-white mb-4">Budget Status</h3>
                <div className="space-y-3">
                  {budgets.slice(0, 6).map(budget => {
                    const info = getCategoryInfo(budget.category, 'expense')
                    const percentage = Math.min((budget.spent / budget.limit) * 100, 100)
                    const isOver = budget.spent > budget.limit

                    return (
                      <div key={budget.category} className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${info.color}20` }}
                        >
                          <info.icon className="w-4 h-4" style={{ color: info.color }} />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-white">{info.name}</span>
                            <span className={isOver ? 'text-red-400' : 'text-white/60'}>
                              {formatCurrency(budget.spent)} / {formatCurrency(budget.limit)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isOver ? 'bg-red-500' : percentage > 80 ? 'bg-yellow-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Savings Goals */}
            {savingsGoals.length > 0 && (
              <div className="glass-card p-4 rounded-xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-white">Savings Goals</h3>
                  <button
                    onClick={() => setShowAddGoal(true)}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    + Add Goal
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {savingsGoals.map(goal => {
                    const progress = (goal.currentAmount / goal.targetAmount) * 100
                    const daysLeft = Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))

                    return (
                      <div key={goal.id} className="bg-white/5 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-sm font-medium text-white">{goal.name}</h4>
                          <span className="text-[10px] text-white/40">{daysLeft} days left</span>
                        </div>
                        <div className="text-lg font-bold text-white mb-2">
                          {formatCurrency(goal.currentAmount)}
                          <span className="text-xs text-white/40 font-normal ml-1">
                            / {formatCurrency(goal.targetAmount)}
                          </span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(progress, 100)}%`,
                              backgroundColor: goal.color
                            }}
                          />
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => updateGoalProgress(goal.id, 50)}
                            className="flex-1 text-[10px] py-1 bg-white/5 rounded hover:bg-white/10 text-white/60"
                          >
                            +$50
                          </button>
                          <button
                            onClick={() => updateGoalProgress(goal.id, 100)}
                            className="flex-1 text-[10px] py-1 bg-white/5 rounded hover:bg-white/10 text-white/60"
                          >
                            +$100
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Recent Transactions */}
            <div className="glass-card p-4 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-2">
                {transactions.slice(0, 5).map(t => {
                  const info = getCategoryInfo(t.category, t.type)

                  return (
                    <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${info.color}20` }}
                      >
                        <info.icon className="w-4 h-4" style={{ color: info.color }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-white">{t.description || info.name}</div>
                        <div className="text-xs text-white/40">{formatDate(t.date)}</div>
                      </div>
                      <div className={`text-sm font-medium ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
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
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">All Transactions</h3>
              <div className="text-xs text-white/40">{transactions.length} transactions</div>
            </div>
            <div className="divide-y divide-white/5">
              {transactions.map(t => {
                const info = getCategoryInfo(t.category, t.type)

                return (
                  <div key={t.id} className="flex items-center gap-3 p-4 hover:bg-white/5">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${info.color}20` }}
                    >
                      <info.icon className="w-5 h-5" style={{ color: info.color }} />
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
                            <span className="text-purple-400">Recurring</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={`text-sm font-bold ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                      {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingTransaction(t)}
                        className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTransaction(t.id)}
                        className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
              {transactions.length === 0 && (
                <div className="text-center py-12 text-white/40">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No transactions yet</p>
                  <button
                    onClick={() => setShowAddTransaction(true)}
                    className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm"
                  >
                    Add your first transaction
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Budgets Tab */}
        {activeTab === 'budgets' && (
          <div className="space-y-4">
            <div className="glass-card p-4 rounded-xl">
              <h3 className="text-sm font-semibold text-white mb-4">Monthly Budget Limits</h3>
              <div className="grid grid-cols-2 gap-4">
                {budgets.map(budget => {
                  const info = getCategoryInfo(budget.category, 'expense')
                  const percentage = Math.min((budget.spent / budget.limit) * 100, 100)
                  const isOver = budget.spent > budget.limit

                  return (
                    <div key={budget.category} className="bg-white/5 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${info.color}20` }}
                        >
                          <info.icon className="w-5 h-5" style={{ color: info.color }} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{info.name}</div>
                          <div className={`text-xs ${isOver ? 'text-red-400' : 'text-white/40'}`}>
                            {formatCurrency(budget.spent)} spent
                          </div>
                        </div>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isOver ? 'bg-red-500' : percentage > 80 ? 'bg-yellow-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/40">Limit:</span>
                        <input
                          type="number"
                          value={budget.limit}
                          onChange={(e) => updateBudgetLimit(budget.category, Number(e.target.value))}
                          className="flex-1 bg-white/5 rounded px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Add new budget category */}
            <div className="glass-card p-4 rounded-xl">
              <h3 className="text-sm font-semibold text-white mb-4">Add Budget Category</h3>
              <div className="grid grid-cols-4 gap-2">
                {EXPENSE_CATEGORIES.filter(cat => !budgets.some(b => b.category === cat.id)).map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setBudgets(prev => [...prev, { category: cat.id, limit: 500, spent: 0 }])}
                    className="flex items-center gap-2 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <cat.icon className="w-4 h-4" style={{ color: cat.color }} />
                    <span className="text-xs text-white/80">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Goals Tab */}
        {activeTab === 'goals' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-white">Savings Goals</h3>
              <button
                onClick={() => setShowAddGoal(true)}
                className="glass-btn-primary px-3 py-2 text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Goal
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {savingsGoals.map(goal => {
                const progress = (goal.currentAmount / goal.targetAmount) * 100
                const daysLeft = Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                const monthsLeft = Math.ceil(daysLeft / 30)
                const remainingAmount = goal.targetAmount - goal.currentAmount
                const monthlyNeeded = monthsLeft > 0 ? remainingAmount / monthsLeft : remainingAmount

                return (
                  <div key={goal.id} className="glass-card p-6 rounded-xl">
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
                      <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(progress, 100)}%`,
                            backgroundColor: goal.color
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-white/40">Saved</div>
                        <div className="text-lg font-bold text-white">{formatCurrency(goal.currentAmount)}</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-white/40">Remaining</div>
                        <div className="text-lg font-bold text-white">{formatCurrency(remainingAmount)}</div>
                      </div>
                    </div>

                    <div className="text-xs text-white/40 mb-4">
                      Save <span className="text-emerald-400 font-medium">{formatCurrency(monthlyNeeded)}/month</span> to reach your goal
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => updateGoalProgress(goal.id, 25)}
                        className="flex-1 py-2 text-xs bg-white/5 rounded-lg hover:bg-white/10 text-white/60"
                      >
                        +$25
                      </button>
                      <button
                        onClick={() => updateGoalProgress(goal.id, 50)}
                        className="flex-1 py-2 text-xs bg-white/5 rounded-lg hover:bg-white/10 text-white/60"
                      >
                        +$50
                      </button>
                      <button
                        onClick={() => updateGoalProgress(goal.id, 100)}
                        className="flex-1 py-2 text-xs bg-white/5 rounded-lg hover:bg-white/10 text-white/60"
                      >
                        +$100
                      </button>
                      <button
                        onClick={() => setSavingsGoals(prev => prev.filter(g => g.id !== goal.id))}
                        className="px-3 py-2 text-xs bg-red-500/10 rounded-lg hover:bg-red-500/20 text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {savingsGoals.length === 0 && (
              <div className="glass-card p-12 rounded-xl text-center">
                <Target className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No Savings Goals Yet</h3>
                <p className="text-sm text-white/40 mb-4">Set financial goals to track your progress</p>
                <button
                  onClick={() => setShowAddGoal(true)}
                  className="glass-btn-primary px-4 py-2 text-sm"
                >
                  Create Your First Goal
                </button>
              </div>
            )}
          </div>
        )}

        {/* AI Analysis Tab */}
        {activeTab === 'analysis' && (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
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
                  className="glass-btn-primary px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
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
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all duration-500"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {transactions.length === 0 && !isAnalyzing && (
                <div className="text-center py-8 text-white/40">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Add some transactions first to enable AI analysis</p>
                </div>
              )}
            </div>

            {financialReport && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="glass-card p-6 rounded-xl">
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    Summary
                  </h4>
                  <p className="text-white/80 leading-relaxed">{financialReport.summary}</p>
                </div>

                {/* Insights */}
                {financialReport.insights.length > 0 && (
                  <div className="glass-card p-6 rounded-xl">
                    <h4 className="text-sm font-semibold text-white mb-3">Key Insights</h4>
                    <ul className="space-y-2">
                      {financialReport.insights.map((insight, i) => (
                        <li key={i} className="flex items-start gap-3 text-white/80">
                          <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {financialReport.recommendations.length > 0 && (
                  <div className="glass-card p-6 rounded-xl">
                    <h4 className="text-sm font-semibold text-white mb-3">Recommendations</h4>
                    <ul className="space-y-2">
                      {financialReport.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-3 text-white/80">
                          <ArrowRight className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risk Alerts */}
                {financialReport.riskAlerts.length > 0 && (
                  <div className="glass-card p-6 rounded-xl border border-red-500/30 bg-red-500/5">
                    <h4 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Risk Alerts
                    </h4>
                    <ul className="space-y-2">
                      {financialReport.riskAlerts.map((alert, i) => (
                        <li key={i} className="flex items-start gap-3 text-white/80">
                          <span className="text-sm">{alert}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Saving Opportunities */}
                {financialReport.savingOpportunities.length > 0 && (
                  <div className="glass-card p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                    <h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Saving Opportunities
                    </h4>
                    <ul className="space-y-2">
                      {financialReport.savingOpportunities.map((opp, i) => (
                        <li key={i} className="flex items-start gap-3 text-white/80">
                          <span className="text-sm">{opp}</span>
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

      {/* Add Transaction Modal */}
      {showAddTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-xl w-[500px] max-h-[90vh] overflow-y-auto">
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
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  Expense
                </button>
                <button
                  onClick={() => setNewTransaction(prev => ({ ...prev, type: 'income', category: 'salary' }))}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors ${
                    newTransaction.type === 'income'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
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
                    value={newTransaction.amount || ''}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full bg-white/5 rounded-lg pl-10 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Category</label>
                <div className="grid grid-cols-4 gap-2">
                  {(newTransaction.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setNewTransaction(prev => ({ ...prev, category: cat.id }))}
                      className={`p-3 rounded-lg flex flex-col items-center gap-1 transition-colors ${
                        newTransaction.category === cat.id
                          ? 'bg-emerald-500/20 border border-emerald-500/30'
                          : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <cat.icon className="w-5 h-5" style={{ color: cat.color }} />
                      <span className="text-[10px] text-white/60">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Description</label>
                <input
                  type="text"
                  value={newTransaction.description || ''}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Optional description..."
                />
              </div>

              {/* Date */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Date</label>
                <input
                  type="date"
                  value={newTransaction.date || ''}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Recurring */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={newTransaction.recurring || false}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, recurring: e.target.checked }))}
                  className="w-4 h-4 rounded bg-white/5 border-white/20"
                />
                <label htmlFor="recurring" className="text-sm text-white/60">This is a recurring transaction</label>
              </div>

              {newTransaction.recurring && (
                <select
                  value={newTransaction.recurringFrequency || 'monthly'}
                  onChange={(e) => setNewTransaction(prev => ({ ...prev, recurringFrequency: e.target.value as any }))}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
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
                className="w-full glass-btn-primary py-3 text-sm font-semibold disabled:opacity-50"
              >
                Add Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-xl w-[500px] max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Edit Transaction</h3>
              <button onClick={() => setEditingTransaction(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Amount */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Amount</label>
                <input
                  type="number"
                  value={editingTransaction.amount}
                  onChange={(e) => setEditingTransaction(prev => prev ? { ...prev, amount: Number(e.target.value) } : null)}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Description</label>
                <input
                  type="text"
                  value={editingTransaction.description}
                  onChange={(e) => setEditingTransaction(prev => prev ? { ...prev, description: e.target.value } : null)}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Date */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">Date</label>
                <input
                  type="date"
                  value={editingTransaction.date}
                  onChange={(e) => setEditingTransaction(prev => prev ? { ...prev, date: e.target.value } : null)}
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditingTransaction(null)}
                  className="flex-1 glass-btn-secondary py-3 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateTransaction}
                  className="flex-1 glass-btn-primary py-3 text-sm font-semibold"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-xl w-[450px]">
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
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g., Emergency Fund, Vacation, New Car"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Target Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="number"
                    value={newGoal.targetAmount || ''}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, targetAmount: Number(e.target.value) }))}
                    className="w-full bg-white/5 rounded-lg pl-10 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
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
                    value={newGoal.currentAmount || ''}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, currentAmount: Number(e.target.value) }))}
                    className="w-full bg-white/5 rounded-lg pl-10 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full bg-white/5 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">Color</label>
                <div className="flex gap-2">
                  {['#8b5cf6', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'].map(color => (
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
                className="w-full glass-btn-primary py-3 text-sm font-semibold disabled:opacity-50"
              >
                Create Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-card p-6 rounded-xl w-[600px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Import Transactions</h3>
              <button onClick={() => setShowImportModal(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Paste your bank statement text below. Our AI will automatically parse and categorize your transactions.
              </p>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full h-64 bg-white/5 rounded-lg p-4 text-white text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                placeholder="Paste your bank statement text here...

Example:
01/15/2024 - Grocery Store - $85.23
01/14/2024 - Gas Station - $45.00
01/14/2024 - Paycheck Direct Deposit - +$2,500.00
01/13/2024 - Netflix Subscription - $15.99"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 glass-btn-secondary py-3 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportParse}
                  disabled={!importText.trim() || isParsingImport}
                  className="flex-1 glass-btn-primary py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isParsingImport ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4" />
                      Parse with AI
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
