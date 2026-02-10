/**
 * Self-Annealing System
 *
 * Automatically learns from user feedback and improves over time.
 * Prevents recurring design and quality issues.
 */

export * from './DesignQualityEngine.js';

// Re-export key functions
export { designQualityEngine, getDesignQualityRules } from './DesignQualityEngine.js';
