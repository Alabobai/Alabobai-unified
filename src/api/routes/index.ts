/**
 * Alabobai API Routes Index
 * Central export for all API route handlers
 */

export { createCommandsRouter, default as commandsRouter } from './commands.js';
export type { CommandsRouterConfig } from './commands.js';

export { createConversationsRouter, default as conversationsRouter } from './conversations.js';
export type { ConversationsRouterConfig } from './conversations.js';

export { createHealthRouter, default as healthRouter } from './health.js';
export type { HealthRouterConfig } from './health.js';

export { createDepartmentsRouter, default as departmentsRouter, recordDepartmentUsage } from './departments.js';
export type { DepartmentsRouterConfig } from './departments.js';

export { createAuthRouter, default as authRouter } from './auth.js';
export type { AuthRouterConfig, UserStore, TokenBlacklist, EmailService } from './auth.js';

export { createCompaniesRouter, attachCompaniesWebSocket, default as companiesRouter } from './companies.js';
export type { CompaniesRouterConfig, CompanyCreationRequest, StoredCompany, GeneratedAssets } from './companies.js';
