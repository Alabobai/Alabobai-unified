import { useState } from 'react'
import {
  Building2, Users, DollarSign, TrendingUp, MessageSquare,
  Code2, Palette, Megaphone, Scale, Shield, HeadphonesIcon,
  BarChart3, Settings, Plus, ChevronRight, Zap,
  FileText, Mail, Calendar, Target, Brain
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { BRAND } from '@/config/brand'

interface Department {
  id: string
  name: string
  icon: typeof Building2
  status: 'active' | 'idle' | 'working'
  tasksCompleted: number
  activeTask?: string
  metrics: { label: string; value: string; change?: string }[]
}

const COMPANY_DEPARTMENTS: Department[] = [
  {
    id: 'executive',
    name: 'CEO Office',
    icon: Building2,
    status: 'active',
    tasksCompleted: 23,
    activeTask: 'Preparing investor update',
    metrics: [
      { label: 'Decisions Made', value: '47', change: '+12' },
      { label: 'Strategy Score', value: '94%' },
    ]
  },
  {
    id: 'engineering',
    name: 'Engineering',
    icon: Code2,
    status: 'working',
    tasksCompleted: 156,
    activeTask: 'Building checkout flow',
    metrics: [
      { label: 'Features Shipped', value: '34', change: '+8' },
      { label: 'Bugs Fixed', value: '127' },
    ]
  },
  {
    id: 'design',
    name: 'Design',
    icon: Palette,
    status: 'working',
    tasksCompleted: 89,
    activeTask: 'Creating mobile app mockups',
    metrics: [
      { label: 'Assets Created', value: '234' },
      { label: 'Brand Score', value: '98%' },
    ]
  },
  {
    id: 'marketing',
    name: 'Marketing',
    icon: Megaphone,
    status: 'active',
    tasksCompleted: 67,
    activeTask: 'Running social media campaign',
    metrics: [
      { label: 'Impressions', value: '2.4M', change: '+340%' },
      { label: 'Leads Generated', value: '1,247' },
    ]
  },
  {
    id: 'sales',
    name: 'Sales',
    icon: Target,
    status: 'working',
    tasksCompleted: 234,
    activeTask: 'Following up with enterprise leads',
    metrics: [
      { label: 'Pipeline', value: '$4.2M' },
      { label: 'Close Rate', value: '34%', change: '+5%' },
    ]
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: DollarSign,
    status: 'active',
    tasksCompleted: 45,
    activeTask: 'Processing monthly invoices',
    metrics: [
      { label: 'Revenue', value: '$847K', change: '+23%' },
      { label: 'Burn Rate', value: '$12K/mo' },
    ]
  },
  {
    id: 'legal',
    name: 'Legal',
    icon: Scale,
    status: 'idle',
    tasksCompleted: 28,
    metrics: [
      { label: 'Contracts Drafted', value: '156' },
      { label: 'Compliance', value: '100%' },
    ]
  },
  {
    id: 'support',
    name: 'Customer Success',
    icon: HeadphonesIcon,
    status: 'working',
    tasksCompleted: 1247,
    activeTask: 'Responding to 23 tickets',
    metrics: [
      { label: 'Tickets Resolved', value: '1,247' },
      { label: 'CSAT Score', value: '4.9/5' },
    ]
  },
  {
    id: 'security',
    name: 'Security',
    icon: Shield,
    status: 'active',
    tasksCompleted: 12,
    activeTask: 'Running security audit',
    metrics: [
      { label: 'Threats Blocked', value: '2,847' },
      { label: 'Uptime', value: '99.99%' },
    ]
  },
  {
    id: 'research',
    name: 'Research',
    icon: Brain,
    status: 'working',
    tasksCompleted: 34,
    activeTask: 'Analyzing competitor pricing',
    metrics: [
      { label: 'Reports Generated', value: '67' },
      { label: 'Insights Found', value: '234' },
    ]
  },
  {
    id: 'data',
    name: 'Data & Analytics',
    icon: BarChart3,
    status: 'active',
    tasksCompleted: 89,
    metrics: [
      { label: 'Dashboards', value: '12' },
      { label: 'Data Points', value: '4.7M' },
    ]
  },
  {
    id: 'hr',
    name: 'People Ops',
    icon: Users,
    status: 'idle',
    tasksCompleted: 15,
    metrics: [
      { label: 'Contractors', value: '3' },
      { label: 'Culture Score', value: '95%' },
    ]
  },
]

interface CompanyMetrics {
  revenue: string
  customers: string
  mrr: string
  growth: string
}

export default function CompanyDashboard() {
  const { setView } = useAppStore()
  const [selectedDept, setSelectedDept] = useState<string | null>(null)
  const [companyName] = useState('TechStartup AI')

  const metrics: CompanyMetrics = {
    revenue: '$847,234',
    customers: '12,847',
    mrr: '$127,000',
    growth: '+34%',
  }

  const activeDepartments = COMPANY_DEPARTMENTS.filter(d => d.status === 'working').length
  const totalTasksToday = COMPANY_DEPARTMENTS.reduce((sum, d) => sum + d.tasksCompleted, 0)

  return (
    <div className="h-full w-full flex flex-col bg-dark-400 overflow-hidden alabobai-shell">
      {/* Company Header */}
      <div className="p-6 border-b border-rose-gold-400/20 bg-gradient-to-r from-dark-300 to-dark-400">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-gold-300 to-rose-gold-600 flex items-center justify-center shadow-glow-lg">
              <Building2 className="w-7 h-7 text-dark-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{companyName}</h1>
              <p className="text-sm text-rose-gold-400/70">{BRAND.name} - Your AI-powered company</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-rose-gold-400/20 border border-rose-gold-400/30">
              <span className="text-rose-gold-400 text-sm font-medium">
                {activeDepartments} departments working
              </span>
            </div>
            <button
              onClick={() => setView('chat')}
              className="px-4 py-2 rounded-xl bg-rose-gold-400/20 text-rose-gold-400 text-sm font-medium hover:bg-rose-gold-400/30 transition-colors framer-btn"
            >
              <MessageSquare className="w-4 h-4 inline mr-2" />
              AI Chat
            </button>
            <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors framer-btn">
              <Settings className="w-5 h-5 text-white/60" />
            </button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Revenue', value: metrics.revenue, icon: DollarSign, change: '+23%' },
            { label: 'Customers', value: metrics.customers, icon: Users, change: '+156' },
            { label: 'MRR', value: metrics.mrr, icon: TrendingUp, change: '+34%' },
            { label: 'Tasks Today', value: totalTasksToday.toLocaleString(), icon: Zap, change: 'by AI' },
          ].map((metric, i) => (
            <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-rose-gold-400/30 transition-colors framer-card lux-card">
              <div className="flex items-center justify-between mb-2">
                <metric.icon className="w-5 h-5 text-rose-gold-400" />
                <span className="text-xs text-rose-gold-400">{metric.change}</span>
              </div>
              <p className="text-2xl font-bold text-white">{metric.value}</p>
              <p className="text-xs text-white/50">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Departments Grid */}
      <div className="flex-1 overflow-auto p-6 morphic-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">AI Departments</h2>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-gold-400/20 text-rose-gold-400 text-sm hover:bg-rose-gold-400/30 transition-colors framer-btn">
            <Plus className="w-4 h-4" />
            Add Department
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {COMPANY_DEPARTMENTS.map(dept => (
            <button
              key={dept.id}
              onClick={() => setSelectedDept(dept.id)}
              className={`department-card framer-card lux-card depth-2 p-4 rounded-xl border text-left transition-all ${
                selectedDept === dept.id
                  ? 'bg-rose-gold-400/15 border-rose-gold-400/50 shadow-glow-sm'
                  : 'bg-white/5 border-white/10 hover:border-rose-gold-400/30 hover:bg-white/8'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${
                  dept.status === 'working'
                    ? 'bg-rose-gold-400/20 text-rose-gold-400'
                    : dept.status === 'active'
                    ? 'bg-rose-gold-400/20 text-rose-gold-400'
                    : 'bg-white/10 text-white/50'
                }`}>
                  <dept.icon className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    dept.status === 'working'
                      ? 'bg-rose-gold-400 animate-pulse'
                      : dept.status === 'active'
                      ? 'bg-rose-gold-400'
                      : 'bg-white/30'
                  }`} />
                  <span className="text-xs text-white/40 capitalize">{dept.status}</span>
                </div>
              </div>

              <h3 className="text-sm font-semibold text-white mb-1">{dept.name}</h3>

              {dept.activeTask && (
                <p className="text-xs text-rose-gold-400 mb-2 truncate">
                  → {dept.activeTask}
                </p>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/40">{dept.tasksCompleted} tasks done</span>
                <ChevronRight className="w-4 h-4 text-white/30" />
              </div>

              {/* Mini Metrics */}
              <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2">
                {dept.metrics.slice(0, 2).map((metric, i) => (
                  <div key={i}>
                    <p className="text-xs text-white/40">{metric.label}</p>
                    <p className="text-sm font-medium text-white">
                      {metric.value}
                      {metric.change && (
                        <span className="text-rose-gold-400 text-xs ml-1">{metric.change}</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="p-4 border-t border-white/10 bg-dark-300">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40">Quick Actions:</span>
          {[
            { label: 'Generate Report', icon: FileText },
            { label: 'Send Campaign', icon: Mail },
            { label: 'Schedule Meeting', icon: Calendar },
            { label: 'Analyze Competitors', icon: Target },
          ].map((action, i) => (
            <button
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 text-white/70 text-xs hover:bg-white/10 hover:text-white transition-colors framer-btn"
            >
              <action.icon className="w-3.5 h-3.5" />
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
