/**
 * Alabobai Builder - Better than Bolt.new
 *
 * A complete app generation and deployment system that solves
 * all the major problems with existing AI code generators:
 *
 * PROBLEMS SOLVED:
 *
 * 1. FIX-AND-BREAK CYCLE
 *    - Every edit runs regression tests automatically
 *    - AI suggests fixes when tests fail
 *    - No more "$1000 debugging"
 *
 * 2. TOKEN WASTE
 *    - Surgical Editor changes only necessary lines
 *    - Not entire file rewrites like Bolt.new
 *    - 90%+ token savings on small changes
 *
 * 3. NO VERSION CONTROL
 *    - Built-in Git with AI-generated commit messages
 *    - Easy rollback to any previous state
 *    - Branch management for features
 *
 * 4. NO PREVIEW
 *    - Real-time live preview with hot reload
 *    - Multi-device responsive testing
 *    - Console output capture
 *
 * 5. DEPLOYMENT COMPLEXITY
 *    - One-click deploy to Vercel, Netlify, Railway, Fly.io
 *    - Environment variable management
 *    - Custom domain configuration
 *
 * USAGE:
 *
 * ```typescript
 * import { quickStart } from '@alabobai/builder';
 *
 * // Quick start with defaults
 * const builder = quickStart('./my-project');
 *
 * // Build from natural language
 * const result = await builder.build({
 *   prompt: "Create a task management app with user authentication"
 * });
 *
 * // Make surgical changes
 * await builder.change({
 *   instruction: "Add dark mode toggle to the header"
 * });
 *
 * // Deploy with one click
 * await builder.deploy('vercel');
 * ```
 *
 * ARCHITECTURE:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │                     BUILDER ENGINE                          │
 * │  - Orchestrates all components                              │
 * │  - Manages state and history                                │
 * │  - Handles events and progress                              │
 * └─────────────────────────────────────────────────────────────┘
 *                              │
 *        ┌───────────┬────────┼────────┬───────────┐
 *        ▼           ▼        ▼        ▼           ▼
 * ┌──────────┐ ┌──────────┐ ┌──────┐ ┌──────┐ ┌──────────┐
 * │  CODE    │ │ SURGICAL │ │LIVE  │ │ GIT  │ │DEPLOYMENT│
 * │GENERATOR │ │ EDITOR   │ │PREVIEW│ │MANAGER│ │ PIPELINE │
 * └──────────┘ └──────────┘ └──────┘ └──────┘ └──────────┘
 *      │            │          │         │          │
 *      │     ┌──────┴──────┐   │         │          │
 *      │     ▼             │   │         │          │
 *      │ ┌──────────┐      │   │         │          │
 *      │ │REGRESSION│      │   │         │          │
 *      │ │ TESTER   │      │   │         │          │
 *      │ └──────────┘      │   │         │          │
 *      │                   │   │         │          │
 *      └───────────────────┴───┴─────────┴──────────┘
 *                              │
 *                              ▼
 *                     [LLM Client (Claude/GPT)]
 */

// Main Engine
export {
  BuilderEngine,
  createBuilderEngine,
  quickStart,
  type BuilderConfig,
  type BuildRequest,
  type EditChangeRequest,
  type BuildResult,
  type ChangeResult,
  type BuilderState,
  type BuilderAction,
  type BuilderEvent,
  type BuildStats,
} from './BuilderEngine.js';

// Code Generator
export {
  CodeGenerator,
  createCodeGenerator,
  type CodeGenerationRequest,
  type GenerationResult,
  type ProjectContext,
  type TargetStack,
  type FrontendFramework,
  type BackendFramework,
  type DatabaseType,
  type StylingFramework,
  type GenerationConstraints,
  type GenerationProgress,
} from './CodeGenerator.js';

// Live Preview
export {
  LivePreview,
  createLivePreview,
  type PreviewConfig,
  type PreviewSession,
  type PreviewStatus,
  type PreviewError,
  type FileUpdate,
  type PreviewFrame,
  type PreviewEvent,
} from './LivePreview.js';

// Surgical Editor
export {
  SurgicalEditor,
  createSurgicalEditor,
  type EditOperation,
  type EditType,
  type EditLocation,
  type EditRequest,
  type EditResult,
  type EditContext,
  type EditConstraints,
  type DiffHunk,
  type CodeAnalysis,
} from './SurgicalEditor.js';

// Regression Tester
export {
  RegressionTester,
  createRegressionTester,
  createTestRunner,
  type TestSuite,
  type TestCase,
  type TestType,
  type TestStatus,
  type TestRunResult,
  type TestCaseResult,
  type TestError,
  type RegressionAnalysis,
  type AutoFixSuggestion,
  type TestGenerationConfig,
  type WatchConfig,
} from './RegressionTester.js';

// Git Manager
export {
  GitManager,
  createGitManager,
  type GitConfig,
  type Repository,
  type RepoStatus,
  type FileChange,
  type ChangeStatus,
  type BranchInfo,
  type CommitInfo,
  type ConflictInfo,
  type DiffResult,
  type CommitOptions,
  type PushOptions,
  type PullOptions,
  type MergeOptions,
} from './GitManager.js';

// Deployment Pipeline
export {
  DeploymentPipeline,
  createDeploymentPipeline,
  type DeploymentConfig,
  type DeploymentProvider,
  type Deployment,
  type DeploymentStatus,
  type DomainInfo,
  type Project,
  type EnvVariable,
  type DeploymentProgress,
  type ProviderCredentials,
} from './DeploymentPipeline.js';

/**
 * Default export - the quick start function for easy usage
 */
export { quickStart as default } from './BuilderEngine.js';
