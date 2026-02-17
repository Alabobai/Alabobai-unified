/**
 * Financial Guardian Store
 * Comprehensive state management for personal finance tracking
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { BRAND_STATUS_COLORS, BRAND_TOKENS } from '@/config/brandTokens'

// ============================================================================
// Types
// ============================================================================

export type TransactionType = 'income' | 'expense'
export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly'

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  category: string
  description: string
  date: string
  recurring: boolean
  recurringFrequency?: RecurringFrequency
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export interface SavingsGoal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  deadline: string
  color: string
  description?: string
  contributions: GoalContribution[]
  createdAt: string
}

export interface GoalContribution {
  id: string
  amount: number
  date: string
  note?: string
}

export interface Budget {
  category: string
  limit: number
  rollover: boolean  // Roll over unused budget to next month
  alerts: {
    at50: boolean
    at75: boolean
    at90: boolean
    at100: boolean
  }
}

export interface FinancialAccount {
  id: string
  name: string
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'cash'
  balance: number
  currency: string
  color: string
  isActive: boolean
}

export interface Bill {
  id: string
  name: string
  amount: number
  dueDate: number  // Day of month
  category: string
  isPaid: boolean
  paidDate?: string
  isRecurring: boolean
  frequency?: RecurringFrequency
  autoPay: boolean
  reminderDays: number  // Days before to remind
}

export interface FinancialInsight {
  id: string
  type: 'warning' | 'info' | 'success' | 'tip'
  title: string
  message: string
  category?: string
  value?: number
  comparison?: number
  timestamp: string
  dismissed: boolean
}

export interface MonthlySnapshot {
  month: string  // YYYY-MM format
  income: number
  expenses: number
  savings: number
  savingsRate: number
  topCategories: { category: string; amount: number }[]
}

export interface FinancialReport {
  summary: string
  insights: string[]
  recommendations: string[]
  riskAlerts: string[]
  savingOpportunities: string[]
  generatedAt: string
}

// Category configuration
const FINANCIAL_PALETTE = BRAND_TOKENS.charts.primary

export const EXPENSE_CATEGORIES = [
  { id: 'rent', name: 'Rent/Mortgage', icon: 'Home', color: FINANCIAL_PALETTE[0] },
  { id: 'utilities', name: 'Utilities', icon: 'Zap', color: FINANCIAL_PALETTE[1] },
  { id: 'food', name: 'Food & Groceries', icon: 'Coffee', color: FINANCIAL_PALETTE[2] },
  { id: 'transportation', name: 'Transportation', icon: 'Car', color: FINANCIAL_PALETTE[3] },
  { id: 'shopping', name: 'Shopping', icon: 'ShoppingBag', color: FINANCIAL_PALETTE[4] },
  { id: 'entertainment', name: 'Entertainment', icon: 'Film', color: FINANCIAL_PALETTE[5] },
  { id: 'healthcare', name: 'Healthcare', icon: 'Heart', color: BRAND_STATUS_COLORS.danger },
  { id: 'education', name: 'Education', icon: 'Book', color: FINANCIAL_PALETTE[6] },
  { id: 'travel', name: 'Travel', icon: 'Plane', color: FINANCIAL_PALETTE[7] },
  { id: 'gifts', name: 'Gifts & Donations', icon: 'Gift', color: FINANCIAL_PALETTE[8] },
  { id: 'insurance', name: 'Insurance', icon: 'Shield', color: BRAND_STATUS_COLORS.neutral },
  { id: 'subscriptions', name: 'Subscriptions', icon: 'CreditCard', color: FINANCIAL_PALETTE[9] },
  { id: 'other', name: 'Other', icon: 'MoreHorizontal', color: BRAND_STATUS_COLORS.neutral },
] as const

export const INCOME_CATEGORIES = [
  { id: 'salary', name: 'Salary', icon: 'Wallet', color: BRAND_STATUS_COLORS.success },
  { id: 'freelance', name: 'Freelance', icon: 'Briefcase', color: FINANCIAL_PALETTE[0] },
  { id: 'investments', name: 'Investments', icon: 'TrendingUp', color: FINANCIAL_PALETTE[4] },
  { id: 'rental', name: 'Rental Income', icon: 'Home', color: FINANCIAL_PALETTE[1] },
  { id: 'refund', name: 'Refunds', icon: 'RefreshCcw', color: FINANCIAL_PALETTE[7] },
  { id: 'bonus', name: 'Bonus', icon: 'Star', color: FINANCIAL_PALETTE[8] },
  { id: 'other', name: 'Other Income', icon: 'DollarSign', color: BRAND_STATUS_COLORS.neutral },
] as const

// ============================================================================
// Store State Interface
// ============================================================================

interface FinancialState {
  // Data
  transactions: Transaction[]
  savingsGoals: SavingsGoal[]
  budgets: Budget[]
  accounts: FinancialAccount[]
  bills: Bill[]
  insights: FinancialInsight[]
  monthlySnapshots: MonthlySnapshot[]
  lastReport: FinancialReport | null

  // Settings
  currency: string
  monthStartDay: number  // 1-28, when month "starts" for budgeting
  showCents: boolean

  // Computed/cached values
  _cachedTotals: {
    month: string
    income: number
    expenses: number
  } | null
}

interface FinancialActions {
  // Transaction Actions
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateTransaction: (id: string, updates: Partial<Transaction>) => void
  deleteTransaction: (id: string) => void
  bulkImportTransactions: (transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[]) => number

  // Savings Goal Actions
  addSavingsGoal: (goal: Omit<SavingsGoal, 'id' | 'contributions' | 'createdAt'>) => string
  updateSavingsGoal: (id: string, updates: Partial<SavingsGoal>) => void
  deleteSavingsGoal: (id: string) => void
  contributeToGoal: (goalId: string, amount: number, note?: string) => void

  // Budget Actions
  setBudget: (category: string, limit: number, options?: Partial<Budget>) => void
  removeBudget: (category: string) => void

  // Account Actions
  addAccount: (account: Omit<FinancialAccount, 'id'>) => string
  updateAccount: (id: string, updates: Partial<FinancialAccount>) => void
  deleteAccount: (id: string) => void

  // Bill Actions
  addBill: (bill: Omit<Bill, 'id'>) => string
  updateBill: (id: string, updates: Partial<Bill>) => void
  deleteBill: (id: string) => void
  markBillPaid: (id: string, paidDate?: string) => void

  // Insight Actions
  addInsight: (insight: Omit<FinancialInsight, 'id' | 'timestamp' | 'dismissed'>) => void
  dismissInsight: (id: string) => void
  clearOldInsights: () => void

  // Report Actions
  setReport: (report: FinancialReport) => void
  clearReport: () => void

  // Settings Actions
  updateSettings: (settings: Partial<Pick<FinancialState, 'currency' | 'monthStartDay' | 'showCents'>>) => void

  // Calculation Helpers
  getTransactionsForPeriod: (startDate: Date, endDate: Date) => Transaction[]
  getMonthlyTotals: (year: number, month: number) => { income: number; expenses: number; savings: number; savingsRate: number }
  getYearlyTotals: (year: number) => { income: number; expenses: number; savings: number; savingsRate: number }
  getCategorySpending: (category: string, startDate: Date, endDate: Date) => number
  getBudgetStatus: () => { category: string; limit: number; spent: number; remaining: number; percentage: number }[]
  getExpenseBreakdown: (startDate: Date, endDate: Date) => { category: string; amount: number; percentage: number; color: string }[]
  getIncomeBreakdown: (startDate: Date, endDate: Date) => { category: string; amount: number; percentage: number; color: string }[]
  getMonthlyTrends: (months: number) => MonthlySnapshot[]
  getUpcomingBills: (days: number) => Bill[]
  getNetWorth: () => number
  getProjectedSavings: (months: number) => { month: string; projected: number; cumulative: number }[]

  // Generate insights based on current data
  generateInsights: () => void

  // Take monthly snapshot
  takeMonthlySnapshot: () => void

  // Export/Import
  exportToCSV: () => string
  exportToJSON: () => string
  importFromCSV: (csvContent: string) => { success: number; failed: number }
  importFromJSON: (jsonContent: string) => boolean
}

// ============================================================================
// Utility Functions
// ============================================================================

const generateId = () => crypto.randomUUID()

const formatDateString = (date: Date): string => {
  return date.toISOString().split('T')[0]
}

const getMonthKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const getCategoryInfo = (categoryId: string, type: TransactionType) => {
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  return categories.find(c => c.id === categoryId) || categories[categories.length - 1]
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useFinancialStore = create<FinancialState & FinancialActions>()(
  persist(
    immer((set, get) => ({
      // Initial State
      transactions: [],
      savingsGoals: [],
      budgets: [],
      accounts: [],
      bills: [],
      insights: [],
      monthlySnapshots: [],
      lastReport: null,
      currency: 'USD',
      monthStartDay: 1,
      showCents: true,
      _cachedTotals: null,

      // Transaction Actions
      addTransaction: (transaction) => {
        const id = generateId()
        const now = new Date().toISOString()
        set(state => {
          state.transactions.unshift({
            ...transaction,
            id,
            createdAt: now,
            updatedAt: now,
          })
          state._cachedTotals = null
        })
        // Trigger insight generation after adding
        setTimeout(() => get().generateInsights(), 100)
        return id
      },

      updateTransaction: (id, updates) => {
        set(state => {
          const index = state.transactions.findIndex(t => t.id === id)
          if (index !== -1) {
            state.transactions[index] = {
              ...state.transactions[index],
              ...updates,
              updatedAt: new Date().toISOString(),
            }
            state._cachedTotals = null
          }
        })
      },

      deleteTransaction: (id) => {
        set(state => {
          state.transactions = state.transactions.filter(t => t.id !== id)
          state._cachedTotals = null
        })
      },

      bulkImportTransactions: (transactions) => {
        const now = new Date().toISOString()
        let count = 0
        set(state => {
          transactions.forEach(t => {
            state.transactions.unshift({
              ...t,
              id: generateId(),
              createdAt: now,
              updatedAt: now,
            })
            count++
          })
          state._cachedTotals = null
        })
        return count
      },

      // Savings Goal Actions
      addSavingsGoal: (goal) => {
        const id = generateId()
        set(state => {
          state.savingsGoals.push({
            ...goal,
            id,
            contributions: [],
            createdAt: new Date().toISOString(),
          })
        })
        return id
      },

      updateSavingsGoal: (id, updates) => {
        set(state => {
          const index = state.savingsGoals.findIndex(g => g.id === id)
          if (index !== -1) {
            state.savingsGoals[index] = { ...state.savingsGoals[index], ...updates }
          }
        })
      },

      deleteSavingsGoal: (id) => {
        set(state => {
          state.savingsGoals = state.savingsGoals.filter(g => g.id !== id)
        })
      },

      contributeToGoal: (goalId, amount, note) => {
        set(state => {
          const goal = state.savingsGoals.find(g => g.id === goalId)
          if (goal) {
            goal.contributions.push({
              id: generateId(),
              amount,
              date: formatDateString(new Date()),
              note,
            })
            goal.currentAmount = Math.min(goal.currentAmount + amount, goal.targetAmount)
          }
        })
      },

      // Budget Actions
      setBudget: (category, limit, options = {}) => {
        set(state => {
          const existingIndex = state.budgets.findIndex(b => b.category === category)
          const newBudget: Budget = {
            category,
            limit,
            rollover: options.rollover ?? false,
            alerts: options.alerts ?? {
              at50: false,
              at75: true,
              at90: true,
              at100: true,
            },
          }
          if (existingIndex !== -1) {
            state.budgets[existingIndex] = newBudget
          } else {
            state.budgets.push(newBudget)
          }
        })
      },

      removeBudget: (category) => {
        set(state => {
          state.budgets = state.budgets.filter(b => b.category !== category)
        })
      },

      // Account Actions
      addAccount: (account) => {
        const id = generateId()
        set(state => {
          state.accounts.push({ ...account, id })
        })
        return id
      },

      updateAccount: (id, updates) => {
        set(state => {
          const index = state.accounts.findIndex(a => a.id === id)
          if (index !== -1) {
            state.accounts[index] = { ...state.accounts[index], ...updates }
          }
        })
      },

      deleteAccount: (id) => {
        set(state => {
          state.accounts = state.accounts.filter(a => a.id !== id)
        })
      },

      // Bill Actions
      addBill: (bill) => {
        const id = generateId()
        set(state => {
          state.bills.push({ ...bill, id })
        })
        return id
      },

      updateBill: (id, updates) => {
        set(state => {
          const index = state.bills.findIndex(b => b.id === id)
          if (index !== -1) {
            state.bills[index] = { ...state.bills[index], ...updates }
          }
        })
      },

      deleteBill: (id) => {
        set(state => {
          state.bills = state.bills.filter(b => b.id !== id)
        })
      },

      markBillPaid: (id, paidDate) => {
        set(state => {
          const bill = state.bills.find(b => b.id === id)
          if (bill) {
            bill.isPaid = true
            bill.paidDate = paidDate || formatDateString(new Date())
          }
        })
      },

      // Insight Actions
      addInsight: (insight) => {
        set(state => {
          state.insights.unshift({
            ...insight,
            id: generateId(),
            timestamp: new Date().toISOString(),
            dismissed: false,
          })
          // Keep only last 50 insights
          if (state.insights.length > 50) {
            state.insights = state.insights.slice(0, 50)
          }
        })
      },

      dismissInsight: (id) => {
        set(state => {
          const insight = state.insights.find(i => i.id === id)
          if (insight) {
            insight.dismissed = true
          }
        })
      },

      clearOldInsights: () => {
        const oneWeekAgo = new Date()
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
        set(state => {
          state.insights = state.insights.filter(
            i => !i.dismissed || new Date(i.timestamp) > oneWeekAgo
          )
        })
      },

      // Report Actions
      setReport: (report) => {
        set(state => {
          state.lastReport = report
        })
      },

      clearReport: () => {
        set(state => {
          state.lastReport = null
        })
      },

      // Settings Actions
      updateSettings: (settings) => {
        set(state => {
          if (settings.currency !== undefined) state.currency = settings.currency
          if (settings.monthStartDay !== undefined) state.monthStartDay = settings.monthStartDay
          if (settings.showCents !== undefined) state.showCents = settings.showCents
        })
      },

      // Calculation Helpers
      getTransactionsForPeriod: (startDate, endDate) => {
        const state = get()
        return state.transactions.filter(t => {
          const tDate = new Date(t.date)
          return tDate >= startDate && tDate <= endDate
        })
      },

      getMonthlyTotals: (year, month) => {
        const state = get()
        const startDate = new Date(year, month, 1)
        const endDate = new Date(year, month + 1, 0)

        const transactions = state.transactions.filter(t => {
          const tDate = new Date(t.date)
          return tDate >= startDate && tDate <= endDate
        })

        const income = transactions
          .filter(t => t.type === 'income')
          .reduce((sum, t) => sum + t.amount, 0)

        const expenses = transactions
          .filter(t => t.type === 'expense')
          .reduce((sum, t) => sum + t.amount, 0)

        const savings = income - expenses
        const savingsRate = income > 0 ? (savings / income) * 100 : 0

        return { income, expenses, savings, savingsRate }
      },

      getYearlyTotals: (year) => {
        const state = get()
        const startDate = new Date(year, 0, 1)
        const endDate = new Date(year, 11, 31)

        const transactions = state.transactions.filter(t => {
          const tDate = new Date(t.date)
          return tDate >= startDate && tDate <= endDate
        })

        const income = transactions
          .filter(t => t.type === 'income')
          .reduce((sum, t) => sum + t.amount, 0)

        const expenses = transactions
          .filter(t => t.type === 'expense')
          .reduce((sum, t) => sum + t.amount, 0)

        const savings = income - expenses
        const savingsRate = income > 0 ? (savings / income) * 100 : 0

        return { income, expenses, savings, savingsRate }
      },

      getCategorySpending: (category, startDate, endDate) => {
        const state = get()
        return state.transactions
          .filter(t => {
            const tDate = new Date(t.date)
            return t.type === 'expense' &&
                   t.category === category &&
                   tDate >= startDate &&
                   tDate <= endDate
          })
          .reduce((sum, t) => sum + t.amount, 0)
      },

      getBudgetStatus: () => {
        const state = get()
        const now = new Date()
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        return state.budgets.map(budget => {
          const spent = state.transactions
            .filter(t => {
              const tDate = new Date(t.date)
              return t.type === 'expense' &&
                     t.category === budget.category &&
                     tDate >= startDate &&
                     tDate <= endDate
            })
            .reduce((sum, t) => sum + t.amount, 0)

          return {
            category: budget.category,
            limit: budget.limit,
            spent,
            remaining: Math.max(0, budget.limit - spent),
            percentage: budget.limit > 0 ? (spent / budget.limit) * 100 : 0,
          }
        })
      },

      getExpenseBreakdown: (startDate, endDate) => {
        const state = get()
        const categoryTotals: Record<string, number> = {}
        let total = 0

        state.transactions
          .filter(t => {
            const tDate = new Date(t.date)
            return t.type === 'expense' && tDate >= startDate && tDate <= endDate
          })
          .forEach(t => {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount
            total += t.amount
          })

        return Object.entries(categoryTotals)
          .map(([category, amount]) => ({
            category,
            amount,
            percentage: total > 0 ? (amount / total) * 100 : 0,
            color: getCategoryInfo(category, 'expense').color,
          }))
          .sort((a, b) => b.amount - a.amount)
      },

      getIncomeBreakdown: (startDate, endDate) => {
        const state = get()
        const categoryTotals: Record<string, number> = {}
        let total = 0

        state.transactions
          .filter(t => {
            const tDate = new Date(t.date)
            return t.type === 'income' && tDate >= startDate && tDate <= endDate
          })
          .forEach(t => {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount
            total += t.amount
          })

        return Object.entries(categoryTotals)
          .map(([category, amount]) => ({
            category,
            amount,
            percentage: total > 0 ? (amount / total) * 100 : 0,
            color: getCategoryInfo(category, 'income').color,
          }))
          .sort((a, b) => b.amount - a.amount)
      },

      getMonthlyTrends: (months) => {
        const state = get()
        const trends: MonthlySnapshot[] = []
        const now = new Date()

        for (let i = months - 1; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const monthKey = getMonthKey(date)

          // Check if we have a snapshot
          const snapshot = state.monthlySnapshots.find(s => s.month === monthKey)
          if (snapshot) {
            trends.push(snapshot)
          } else {
            // Calculate on the fly
            const totals = state.getMonthlyTotals(date.getFullYear(), date.getMonth())
            const breakdown = state.getExpenseBreakdown(
              new Date(date.getFullYear(), date.getMonth(), 1),
              new Date(date.getFullYear(), date.getMonth() + 1, 0)
            )

            trends.push({
              month: monthKey,
              income: totals.income,
              expenses: totals.expenses,
              savings: totals.savings,
              savingsRate: totals.savingsRate,
              topCategories: breakdown.slice(0, 5).map(c => ({
                category: c.category,
                amount: c.amount,
              })),
            })
          }
        }

        return trends
      },

      getUpcomingBills: (days) => {
        const state = get()
        const today = new Date()
        const futureDate = new Date()
        futureDate.setDate(today.getDate() + days)

        return state.bills
          .filter(bill => {
            if (bill.isPaid) return false

            // Get next due date
            const currentMonth = today.getMonth()
            const currentYear = today.getFullYear()
            let dueDate = new Date(currentYear, currentMonth, bill.dueDate)

            // If due date has passed this month, look at next month
            if (dueDate < today) {
              dueDate = new Date(currentYear, currentMonth + 1, bill.dueDate)
            }

            return dueDate >= today && dueDate <= futureDate
          })
          .sort((a, b) => a.dueDate - b.dueDate)
      },

      getNetWorth: () => {
        const state = get()
        return state.accounts.reduce((total, account) => {
          if (!account.isActive) return total
          // Credit accounts are negative
          if (account.type === 'credit') {
            return total - account.balance
          }
          return total + account.balance
        }, 0)
      },

      getProjectedSavings: (months) => {
        const state = get()
        const trends = state.getMonthlyTrends(6)  // Use last 6 months average

        // Calculate average monthly savings
        const avgSavings = trends.length > 0
          ? trends.reduce((sum, t) => sum + t.savings, 0) / trends.length
          : 0

        const projections: { month: string; projected: number; cumulative: number }[] = []
        let cumulative = 0
        const now = new Date()

        for (let i = 1; i <= months; i++) {
          const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
          cumulative += avgSavings
          projections.push({
            month: getMonthKey(date),
            projected: avgSavings,
            cumulative,
          })
        }

        return projections
      },

      generateInsights: () => {
        const state = get()
        const now = new Date()
        const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

        // Get current and previous month data
        const currentTotals = state.getMonthlyTotals(now.getFullYear(), now.getMonth())
        const lastTotals = state.getMonthlyTotals(lastMonth.getFullYear(), lastMonth.getMonth())

        // Compare spending by category
        const currentBreakdown = state.getExpenseBreakdown(
          currentMonth,
          now
        )
        const lastBreakdown = state.getExpenseBreakdown(
          lastMonth,
          lastMonthEnd
        )

        const newInsights: Omit<FinancialInsight, 'id' | 'timestamp' | 'dismissed'>[] = []

        // Check budget status
        const budgetStatus = state.getBudgetStatus()
        budgetStatus.forEach(budget => {
          if (budget.percentage >= 100) {
            newInsights.push({
              type: 'warning',
              title: 'Budget Exceeded',
              message: `You've exceeded your ${getCategoryInfo(budget.category, 'expense').name} budget by ${formatCurrency(budget.spent - budget.limit)}`,
              category: budget.category,
              value: budget.percentage,
            })
          } else if (budget.percentage >= 90) {
            newInsights.push({
              type: 'warning',
              title: 'Budget Almost Depleted',
              message: `You've used ${Math.round(budget.percentage)}% of your ${getCategoryInfo(budget.category, 'expense').name} budget`,
              category: budget.category,
              value: budget.percentage,
            })
          }
        })

        // Compare spending trends
        currentBreakdown.forEach(current => {
          const previous = lastBreakdown.find(p => p.category === current.category)
          if (previous && current.amount > previous.amount * 1.3) {
            const increase = ((current.amount - previous.amount) / previous.amount) * 100
            newInsights.push({
              type: 'info',
              title: 'Spending Increase',
              message: `You're spending ${Math.round(increase)}% more on ${getCategoryInfo(current.category, 'expense').name} compared to last month`,
              category: current.category,
              value: current.amount,
              comparison: previous.amount,
            })
          }
        })

        // Check savings rate
        if (currentTotals.savingsRate < 10 && currentTotals.income > 0) {
          newInsights.push({
            type: 'warning',
            title: 'Low Savings Rate',
            message: `Your savings rate this month is only ${currentTotals.savingsRate.toFixed(1)}%. Consider reducing expenses.`,
            value: currentTotals.savingsRate,
          })
        } else if (currentTotals.savingsRate >= 30) {
          newInsights.push({
            type: 'success',
            title: 'Great Savings Rate!',
            message: `You're saving ${currentTotals.savingsRate.toFixed(1)}% of your income this month. Keep it up!`,
            value: currentTotals.savingsRate,
          })
        }

        // Check goals progress
        state.savingsGoals.forEach(goal => {
          const progress = (goal.currentAmount / goal.targetAmount) * 100
          const deadline = new Date(goal.deadline)
          const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30))
          const monthlyNeeded = (goal.targetAmount - goal.currentAmount) / monthsLeft

          if (progress >= 100) {
            newInsights.push({
              type: 'success',
              title: 'Goal Achieved!',
              message: `Congratulations! You've reached your "${goal.name}" savings goal!`,
              value: goal.currentAmount,
            })
          } else if (daysLeft <= 30 && progress < 75) {
            newInsights.push({
              type: 'warning',
              title: 'Goal at Risk',
              message: `Your "${goal.name}" goal deadline is in ${daysLeft} days and you're only ${Math.round(progress)}% there.`,
              value: progress,
            })
          } else if (monthlyNeeded > currentTotals.savings && currentTotals.savings > 0) {
            newInsights.push({
              type: 'tip',
              title: 'Goal Pace Check',
              message: `To reach "${goal.name}" by deadline, you need to save ${formatCurrency(monthlyNeeded)}/month. Current pace: ${formatCurrency(currentTotals.savings)}/month.`,
              value: monthlyNeeded,
              comparison: currentTotals.savings,
            })
          }
        })

        // Add upcoming bills insight
        const upcomingBills = state.getUpcomingBills(7)
        if (upcomingBills.length > 0) {
          const totalDue = upcomingBills.reduce((sum, b) => sum + b.amount, 0)
          newInsights.push({
            type: 'info',
            title: 'Upcoming Bills',
            message: `You have ${upcomingBills.length} bill(s) due in the next 7 days totaling ${formatCurrency(totalDue)}`,
            value: totalDue,
          })
        }

        // Only add insights that don't already exist (prevent duplicates)
        const existingMessages = new Set(state.insights.map(i => i.message))
        newInsights.forEach(insight => {
          if (!existingMessages.has(insight.message)) {
            get().addInsight(insight)
          }
        })
      },

      takeMonthlySnapshot: () => {
        const state = get()
        const now = new Date()
        const monthKey = getMonthKey(now)

        const totals = state.getMonthlyTotals(now.getFullYear(), now.getMonth())
        const breakdown = state.getExpenseBreakdown(
          new Date(now.getFullYear(), now.getMonth(), 1),
          new Date(now.getFullYear(), now.getMonth() + 1, 0)
        )

        const snapshot: MonthlySnapshot = {
          month: monthKey,
          income: totals.income,
          expenses: totals.expenses,
          savings: totals.savings,
          savingsRate: totals.savingsRate,
          topCategories: breakdown.slice(0, 5).map(c => ({
            category: c.category,
            amount: c.amount,
          })),
        }

        set(state => {
          const existingIndex = state.monthlySnapshots.findIndex(s => s.month === monthKey)
          if (existingIndex !== -1) {
            state.monthlySnapshots[existingIndex] = snapshot
          } else {
            state.monthlySnapshots.push(snapshot)
            // Keep only last 24 months
            if (state.monthlySnapshots.length > 24) {
              state.monthlySnapshots = state.monthlySnapshots.slice(-24)
            }
          }
        })
      },

      // Export/Import
      exportToCSV: () => {
        const state = get()
        const headers = ['Date', 'Type', 'Category', 'Amount', 'Description', 'Recurring']
        const rows = state.transactions.map(t => [
          t.date,
          t.type,
          t.category,
          t.amount.toString(),
          `"${t.description.replace(/"/g, '""')}"`,
          t.recurring ? 'Yes' : 'No',
        ])

        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      },

      exportToJSON: () => {
        const state = get()
        return JSON.stringify({
          transactions: state.transactions,
          savingsGoals: state.savingsGoals,
          budgets: state.budgets,
          accounts: state.accounts,
          bills: state.bills,
          settings: {
            currency: state.currency,
            monthStartDay: state.monthStartDay,
            showCents: state.showCents,
          },
          exportedAt: new Date().toISOString(),
        }, null, 2)
      },

      importFromCSV: (csvContent) => {
        const lines = csvContent.trim().split('\n')
        if (lines.length < 2) return { success: 0, failed: 0 }

        const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
        let success = 0
        let failed = 0

        const dateIndex = headers.findIndex(h => h.includes('date'))
        const typeIndex = headers.findIndex(h => h.includes('type'))
        const categoryIndex = headers.findIndex(h => h.includes('category'))
        const amountIndex = headers.findIndex(h => h.includes('amount'))
        const descIndex = headers.findIndex(h => h.includes('desc'))

        for (let i = 1; i < lines.length; i++) {
          try {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))

            const type = values[typeIndex]?.toLowerCase()
            if (type !== 'income' && type !== 'expense') {
              failed++
              continue
            }

            const amount = parseFloat(values[amountIndex])
            if (isNaN(amount) || amount <= 0) {
              failed++
              continue
            }

            get().addTransaction({
              type: type as TransactionType,
              amount: Math.abs(amount),
              category: values[categoryIndex] || 'other',
              description: values[descIndex] || '',
              date: values[dateIndex] || formatDateString(new Date()),
              recurring: false,
            })
            success++
          } catch {
            failed++
          }
        }

        return { success, failed }
      },

      importFromJSON: (jsonContent) => {
        try {
          const data = JSON.parse(jsonContent)

          set(state => {
            if (data.transactions && Array.isArray(data.transactions)) {
              // Merge transactions, avoiding duplicates by ID
              const existingIds = new Set(state.transactions.map(t => t.id))
              data.transactions.forEach((t: Transaction) => {
                if (!existingIds.has(t.id)) {
                  state.transactions.push(t)
                }
              })
            }

            if (data.savingsGoals && Array.isArray(data.savingsGoals)) {
              const existingIds = new Set(state.savingsGoals.map(g => g.id))
              data.savingsGoals.forEach((g: SavingsGoal) => {
                if (!existingIds.has(g.id)) {
                  state.savingsGoals.push(g)
                }
              })
            }

            if (data.budgets && Array.isArray(data.budgets)) {
              data.budgets.forEach((b: Budget) => {
                const existingIndex = state.budgets.findIndex(eb => eb.category === b.category)
                if (existingIndex !== -1) {
                  state.budgets[existingIndex] = b
                } else {
                  state.budgets.push(b)
                }
              })
            }

            if (data.settings) {
              if (data.settings.currency) state.currency = data.settings.currency
              if (data.settings.monthStartDay) state.monthStartDay = data.settings.monthStartDay
              if (data.settings.showCents !== undefined) state.showCents = data.settings.showCents
            }

            state._cachedTotals = null
          })

          return true
        } catch {
          return false
        }
      },
    })),
    {
      name: 'financial-guardian-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        transactions: state.transactions,
        savingsGoals: state.savingsGoals,
        budgets: state.budgets,
        accounts: state.accounts,
        bills: state.bills,
        insights: state.insights.filter(i => !i.dismissed),
        monthlySnapshots: state.monthlySnapshots,
        currency: state.currency,
        monthStartDay: state.monthStartDay,
        showCents: state.showCents,
      }),
    }
  )
)

// Helper function for formatting currency (used in insights)
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

// Export category helpers
export { getCategoryInfo, formatCurrency, formatDateString, getMonthKey }
