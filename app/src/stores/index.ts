// ============================================================================
// Alabobai Store Exports
// ============================================================================

export { useAppStore } from './appStore'
export type { Message, ToolCall, Chat, FileNode, Task, HistoryEntry } from './appStore'

export { useApiKeyStore } from './apiKeyStore'
export type { ApiKeyConfig, ConnectionTestResult } from './apiKeyStore'
export {
  testOpenAIConnection,
  testAnthropicConnection,
  testGroqConnection,
  testOllamaConnection,
} from './apiKeyStore'

export { useFinancialStore } from './financialStore'
export type {
  Transaction,
  TransactionType,
  RecurringFrequency,
  SavingsGoal,
  GoalContribution,
  Budget,
  FinancialAccount,
  Bill,
  FinancialInsight,
  MonthlySnapshot,
  FinancialReport,
} from './financialStore'
export {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  getCategoryInfo,
  formatCurrency,
  formatDateString,
  getMonthKey,
} from './financialStore'

export { usePresenceStore, presence } from './presenceStore'
export type {
  UserStatus,
  ActivityType,
  UserCursor,
  UserSelection,
  User,
  UserPresence,
  ActivityFeedItem,
  Notification,
} from './presenceStore'

export { useProjectStore, projectStore, PROJECT_TEMPLATES } from './projectStore'
export type {
  Project,
  ProjectFile,
  ProjectMetadata,
  ProjectSettings,
  ProjectTemplate,
  SortOption,
  SortDirection,
} from './projectStore'

export { useSandboxStore } from './sandboxStore'
export type { CodeExecution, SandboxState } from './sandboxStore'
