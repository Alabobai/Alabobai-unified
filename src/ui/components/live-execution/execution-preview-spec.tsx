/**
 * ============================================================================
 * ALABOBAI LIVE EXECUTION PREVIEW SYSTEM
 * Complete UI Component Specification
 *
 * Apple Morphic Glass Design - Dark Mode Primary
 * Manus AI-style Real-time Agent Visualization
 * ============================================================================
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ViewMode = 'browser' | 'terminal' | 'editor';
export type AgentStatus = 'working' | 'waiting' | 'complete' | 'idle' | 'error';
export type EventType = 'action' | 'navigation' | 'file' | 'command' | 'api' | 'decision' | 'complete';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ExecutionEvent {
  id: string;
  timestamp: Date;
  agentId: string;
  agentName: string;
  type: EventType;
  title: string;
  description: string;
  details?: Record<string, unknown>;
  isExpanded?: boolean;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  currentTask?: string;
  progress?: number;
  color: string;
}

export interface TaskProgress {
  id: string;
  name: string;
  agentId: string;
  progress: number;
  status: 'pending' | 'in-progress' | 'complete' | 'failed';
  startTime?: Date;
  estimatedEnd?: Date;
}

export interface ApprovalItem {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  description: string;
  context: string;
  options: ApprovalOption[];
  riskLevel: RiskLevel;
  timestamp: Date;
}

export interface ApprovalOption {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
  isDestructive?: boolean;
}

// ============================================================================
// CSS CUSTOM PROPERTIES (Design Tokens)
// ============================================================================

export const ExecutionPreviewStyles = `
  :root {
    /* ===== Core Glass Properties ===== */
    --exec-glass-bg: rgba(12, 10, 8, 0.85);
    --exec-glass-bg-elevated: rgba(18, 15, 12, 0.9);
    --exec-glass-bg-sunken: rgba(8, 6, 4, 0.92);
    --exec-glass-blur: 20px;
    --exec-glass-blur-strong: 40px;

    /* ===== Rose Gold Accent System ===== */
    --exec-accent: #d9a07a;
    --exec-accent-light: #ecd4c0;
    --exec-accent-dark: #b8845c;
    --exec-accent-glow: rgba(217, 160, 122, 0.4);

    /* ===== Border System ===== */
    --exec-border: rgba(217, 160, 122, 0.15);
    --exec-border-hover: rgba(217, 160, 122, 0.4);
    --exec-border-active: rgba(217, 160, 122, 0.6);
    --exec-border-subtle: rgba(255, 255, 255, 0.08);

    /* ===== Status Colors ===== */
    --exec-status-working: #4ade80;
    --exec-status-waiting: #fbbf24;
    --exec-status-complete: #22c55e;
    --exec-status-idle: rgba(255, 255, 255, 0.3);
    --exec-status-error: #ef4444;

    /* ===== Risk Level Colors ===== */
    --exec-risk-low: #4ade80;
    --exec-risk-medium: #fbbf24;
    --exec-risk-high: #f97316;
    --exec-risk-critical: #ef4444;

    /* ===== Event Type Colors ===== */
    --exec-event-action: #60a5fa;
    --exec-event-navigation: #a78bfa;
    --exec-event-file: #34d399;
    --exec-event-command: #fb923c;
    --exec-event-api: #f472b6;
    --exec-event-decision: #fbbf24;
    --exec-event-complete: #4ade80;

    /* ===== Typography ===== */
    --exec-font-system: system-ui, -apple-system, BlinkMacSystemFont,
                        'SF Pro Text', 'SF Pro Display', sans-serif;
    --exec-font-mono: ui-monospace, 'SF Mono', Menlo, Monaco, monospace;

    /* ===== Spacing Scale ===== */
    --exec-space-xs: 4px;
    --exec-space-sm: 8px;
    --exec-space-md: 12px;
    --exec-space-lg: 16px;
    --exec-space-xl: 24px;
    --exec-space-2xl: 32px;

    /* ===== Border Radius ===== */
    --exec-radius-sm: 6px;
    --exec-radius-md: 10px;
    --exec-radius-lg: 14px;
    --exec-radius-xl: 20px;
    --exec-radius-full: 9999px;

    /* ===== Transitions ===== */
    --exec-transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    --exec-transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    --exec-transition-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    --exec-spring: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

    /* ===== Shadows ===== */
    --exec-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
    --exec-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4);
    --exec-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
    --exec-shadow-glow: 0 0 40px var(--exec-accent-glow);
  }

  /* ===== Base Reset for Execution Preview ===== */
  .exec-preview * {
    box-sizing: border-box;
  }

  .exec-preview {
    font-family: var(--exec-font-system);
    color: rgba(255, 255, 255, 0.9);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
`;

// ============================================================================
// 1. EXECUTION PREVIEW PANEL
// ============================================================================

export const ExecutionPreviewPanelStyles = `
  /* ===== Main Container ===== */
  .exec-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 400px;
    background: var(--exec-glass-bg);
    backdrop-filter: blur(var(--exec-glass-blur));
    -webkit-backdrop-filter: blur(var(--exec-glass-blur));
    border: 1px solid var(--exec-border);
    border-radius: var(--exec-radius-xl);
    overflow: hidden;
    transition: var(--exec-transition);
  }

  .exec-panel:hover {
    border-color: var(--exec-border-hover);
  }

  /* ===== Panel Header with Tab Navigation ===== */
  .exec-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--exec-space-sm) var(--exec-space-lg);
    background: var(--exec-glass-bg-elevated);
    border-bottom: 1px solid var(--exec-border-subtle);
  }

  .exec-panel__tabs {
    display: flex;
    gap: var(--exec-space-xs);
  }

  .exec-panel__tab {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-sm) var(--exec-space-md);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--exec-radius-md);
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: var(--exec-transition);
  }

  .exec-panel__tab:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.8);
  }

  .exec-panel__tab--active {
    background: rgba(217, 160, 122, 0.1);
    border-color: var(--exec-border-hover);
    color: var(--exec-accent);
  }

  .exec-panel__tab-icon {
    width: 16px;
    height: 16px;
    opacity: 0.7;
  }

  .exec-panel__tab--active .exec-panel__tab-icon {
    opacity: 1;
  }

  /* ===== Panel Controls ===== */
  .exec-panel__controls {
    display: flex;
    gap: var(--exec-space-sm);
  }

  .exec-panel__control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-sm);
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: var(--exec-transition);
  }

  .exec-panel__control-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--exec-border);
    color: rgba(255, 255, 255, 0.8);
  }

  .exec-panel__control-btn--active {
    background: rgba(217, 160, 122, 0.15);
    border-color: var(--exec-border-hover);
    color: var(--exec-accent);
  }

  /* ===== Panel Content Area ===== */
  .exec-panel__content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  /* ===== View Containers ===== */
  .exec-view {
    position: absolute;
    inset: 0;
    opacity: 0;
    visibility: hidden;
    transition: opacity var(--exec-transition);
  }

  .exec-view--active {
    opacity: 1;
    visibility: visible;
  }

  /* ===== Browser View Component ===== */
  .exec-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .exec-browser__toolbar {
    display: flex;
    align-items: center;
    gap: var(--exec-space-md);
    padding: var(--exec-space-sm) var(--exec-space-lg);
    background: var(--exec-glass-bg-sunken);
    border-bottom: 1px solid var(--exec-border-subtle);
  }

  .exec-browser__traffic-lights {
    display: flex;
    gap: var(--exec-space-sm);
  }

  .exec-browser__traffic-light {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .exec-browser__traffic-light--close {
    background: rgba(239, 68, 68, 0.8);
    border-color: rgba(239, 68, 68, 0.6);
  }

  .exec-browser__traffic-light--minimize {
    background: rgba(251, 191, 36, 0.8);
    border-color: rgba(251, 191, 36, 0.6);
  }

  .exec-browser__traffic-light--maximize {
    background: rgba(74, 222, 128, 0.8);
    border-color: rgba(74, 222, 128, 0.6);
  }

  .exec-browser__address-bar {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-sm) var(--exec-space-md);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-sm);
  }

  .exec-browser__address-icon {
    width: 14px;
    height: 14px;
    color: rgba(255, 255, 255, 0.4);
  }

  .exec-browser__address-text {
    flex: 1;
    font-size: 12px;
    font-family: var(--exec-font-mono);
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .exec-browser__viewport {
    flex: 1;
    position: relative;
    background: #0a0a0a;
    overflow: hidden;
  }

  .exec-browser__stream {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .exec-browser__cursor-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .exec-browser__cursor {
    position: absolute;
    width: 20px;
    height: 20px;
    transition: transform 0.1s ease-out;
  }

  .exec-browser__cursor-dot {
    position: absolute;
    top: 0;
    left: 0;
    width: 8px;
    height: 8px;
    background: var(--exec-accent);
    border-radius: 50%;
    box-shadow: 0 0 12px var(--exec-accent-glow);
  }

  .exec-browser__click-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
    border: 2px solid var(--exec-accent);
    border-radius: 50%;
    animation: exec-click-ripple 0.4s ease-out forwards;
  }

  @keyframes exec-click-ripple {
    0% {
      transform: translate(-50%, -50%) scale(0.5);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) scale(2);
      opacity: 0;
    }
  }

  /* ===== Terminal View Component ===== */
  .exec-terminal {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0a0a0a;
    font-family: var(--exec-font-mono);
  }

  .exec-terminal__header {
    display: flex;
    align-items: center;
    gap: var(--exec-space-md);
    padding: var(--exec-space-sm) var(--exec-space-lg);
    background: var(--exec-glass-bg-sunken);
    border-bottom: 1px solid var(--exec-border-subtle);
  }

  .exec-terminal__title {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
  }

  .exec-terminal__path {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    font-family: var(--exec-font-mono);
  }

  .exec-terminal__output {
    flex: 1;
    padding: var(--exec-space-md);
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.85);
  }

  .exec-terminal__line {
    display: flex;
    gap: var(--exec-space-sm);
    margin-bottom: 2px;
  }

  .exec-terminal__prompt {
    color: var(--exec-accent);
    user-select: none;
  }

  .exec-terminal__command {
    color: #60a5fa;
  }

  .exec-terminal__result {
    color: rgba(255, 255, 255, 0.7);
  }

  .exec-terminal__error {
    color: var(--exec-status-error);
  }

  .exec-terminal__cursor {
    display: inline-block;
    width: 8px;
    height: 16px;
    background: var(--exec-accent);
    animation: exec-terminal-blink 1s step-end infinite;
  }

  @keyframes exec-terminal-blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  /* ===== Editor View Component ===== */
  .exec-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0d0d0d;
  }

  .exec-editor__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--exec-space-sm) var(--exec-space-lg);
    background: var(--exec-glass-bg-sunken);
    border-bottom: 1px solid var(--exec-border-subtle);
  }

  .exec-editor__tabs {
    display: flex;
    gap: 1px;
  }

  .exec-editor__tab {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-sm) var(--exec-space-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: var(--exec-radius-sm) var(--exec-radius-sm) 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: var(--exec-transition-fast);
  }

  .exec-editor__tab:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.7);
  }

  .exec-editor__tab--active {
    background: rgba(217, 160, 122, 0.08);
    border-color: var(--exec-border);
    color: var(--exec-accent);
  }

  .exec-editor__tab-icon {
    width: 14px;
    height: 14px;
    opacity: 0.6;
  }

  .exec-editor__tab--active .exec-editor__tab-icon {
    opacity: 1;
  }

  .exec-editor__tab-modified {
    width: 6px;
    height: 6px;
    background: var(--exec-accent);
    border-radius: 50%;
  }

  .exec-editor__content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .exec-editor__line-numbers {
    padding: var(--exec-space-md);
    background: rgba(0, 0, 0, 0.3);
    border-right: 1px solid var(--exec-border-subtle);
    font-family: var(--exec-font-mono);
    font-size: 12px;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.3);
    text-align: right;
    user-select: none;
  }

  .exec-editor__line-number {
    padding-right: var(--exec-space-sm);
  }

  .exec-editor__line-number--highlighted {
    color: var(--exec-accent);
    background: rgba(217, 160, 122, 0.1);
  }

  .exec-editor__code {
    flex: 1;
    padding: var(--exec-space-md);
    overflow: auto;
    font-family: var(--exec-font-mono);
    font-size: 13px;
    line-height: 1.7;
  }

  .exec-editor__highlight {
    background: rgba(217, 160, 122, 0.15);
    border-left: 2px solid var(--exec-accent);
    margin-left: -2px;
    padding-left: 2px;
    animation: exec-highlight-flash 1.5s ease-out;
  }

  @keyframes exec-highlight-flash {
    0% { background: rgba(217, 160, 122, 0.4); }
    100% { background: rgba(217, 160, 122, 0.15); }
  }

  /* Syntax Highlighting Tokens */
  .exec-token--keyword { color: #c792ea; }
  .exec-token--string { color: #c3e88d; }
  .exec-token--number { color: #f78c6c; }
  .exec-token--comment { color: rgba(255, 255, 255, 0.35); font-style: italic; }
  .exec-token--function { color: #82aaff; }
  .exec-token--variable { color: #f07178; }
  .exec-token--type { color: #ffcb6b; }
  .exec-token--operator { color: #89ddff; }

  /* ===== Fullscreen Mode ===== */
  .exec-panel--fullscreen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    border-radius: 0;
    border: none;
  }

  .exec-panel--fullscreen .exec-panel__header {
    padding: var(--exec-space-md) var(--exec-space-xl);
  }

  /* ===== Picture-in-Picture Mode ===== */
  .exec-panel--pip {
    position: fixed;
    bottom: var(--exec-space-xl);
    right: var(--exec-space-xl);
    width: 400px;
    height: 280px;
    min-height: 280px;
    z-index: 9998;
    box-shadow: var(--exec-shadow-lg), var(--exec-shadow-glow);
    resize: both;
    overflow: auto;
  }

  .exec-panel--pip .exec-panel__header {
    cursor: grab;
  }

  .exec-panel--pip .exec-panel__header:active {
    cursor: grabbing;
  }

  .exec-panel--pip .exec-panel__tabs {
    display: none;
  }

  .exec-panel--pip .exec-panel__tab-indicator {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-xs) var(--exec-space-sm);
    background: rgba(217, 160, 122, 0.1);
    border-radius: var(--exec-radius-sm);
    font-size: 11px;
    color: var(--exec-accent);
  }

  /* ===== Loading State ===== */
  .exec-panel__loading {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--exec-space-lg);
    background: var(--exec-glass-bg);
  }

  .exec-panel__loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--exec-border);
    border-top-color: var(--exec-accent);
    border-radius: 50%;
    animation: exec-spin 0.8s linear infinite;
  }

  @keyframes exec-spin {
    to { transform: rotate(360deg); }
  }

  .exec-panel__loading-text {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
  }
`;

// ============================================================================
// 2. ACTIVITY FEED COMPONENT
// ============================================================================

export const ActivityFeedStyles = `
  /* ===== Activity Feed Container ===== */
  .exec-activity {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--exec-glass-bg);
    backdrop-filter: blur(var(--exec-glass-blur));
    -webkit-backdrop-filter: blur(var(--exec-glass-blur));
    border: 1px solid var(--exec-border);
    border-radius: var(--exec-radius-xl);
    overflow: hidden;
  }

  /* ===== Activity Header ===== */
  .exec-activity__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--exec-space-lg);
    border-bottom: 1px solid var(--exec-border-subtle);
  }

  .exec-activity__title {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    letter-spacing: -0.01em;
  }

  .exec-activity__live-indicator {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-xs) var(--exec-space-sm);
    background: rgba(74, 222, 128, 0.1);
    border: 1px solid rgba(74, 222, 128, 0.2);
    border-radius: var(--exec-radius-full);
    font-size: 11px;
    color: var(--exec-status-working);
  }

  .exec-activity__live-dot {
    width: 6px;
    height: 6px;
    background: var(--exec-status-working);
    border-radius: 50%;
    animation: exec-live-pulse 1.5s ease-in-out infinite;
  }

  @keyframes exec-live-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.2); }
  }

  /* ===== Filter Bar ===== */
  .exec-activity__filters {
    display: flex;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-md) var(--exec-space-lg);
    border-bottom: 1px solid var(--exec-border-subtle);
    overflow-x: auto;
  }

  .exec-activity__filter {
    display: flex;
    align-items: center;
    gap: var(--exec-space-xs);
    padding: var(--exec-space-xs) var(--exec-space-sm);
    background: transparent;
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-full);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    white-space: nowrap;
    transition: var(--exec-transition-fast);
  }

  .exec-activity__filter:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--exec-border);
    color: rgba(255, 255, 255, 0.7);
  }

  .exec-activity__filter--active {
    background: rgba(217, 160, 122, 0.1);
    border-color: var(--exec-border-hover);
    color: var(--exec-accent);
  }

  .exec-activity__filter-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  /* ===== Event List ===== */
  .exec-activity__list {
    flex: 1;
    overflow-y: auto;
    padding: var(--exec-space-sm);
  }

  /* ===== Event Item ===== */
  .exec-event {
    display: flex;
    gap: var(--exec-space-md);
    padding: var(--exec-space-md);
    border-radius: var(--exec-radius-md);
    cursor: pointer;
    transition: var(--exec-transition-fast);
  }

  .exec-event:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .exec-event--expanded {
    background: rgba(217, 160, 122, 0.05);
    border: 1px solid var(--exec-border-subtle);
  }

  /* Event Icon */
  .exec-event__icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--exec-radius-sm);
    font-size: 14px;
  }

  .exec-event__icon--action {
    background: rgba(96, 165, 250, 0.15);
    color: var(--exec-event-action);
  }

  .exec-event__icon--navigation {
    background: rgba(167, 139, 250, 0.15);
    color: var(--exec-event-navigation);
  }

  .exec-event__icon--file {
    background: rgba(52, 211, 153, 0.15);
    color: var(--exec-event-file);
  }

  .exec-event__icon--command {
    background: rgba(251, 146, 60, 0.15);
    color: var(--exec-event-command);
  }

  .exec-event__icon--api {
    background: rgba(244, 114, 182, 0.15);
    color: var(--exec-event-api);
  }

  .exec-event__icon--decision {
    background: rgba(251, 191, 36, 0.15);
    color: var(--exec-event-decision);
  }

  .exec-event__icon--complete {
    background: rgba(74, 222, 128, 0.15);
    color: var(--exec-event-complete);
  }

  /* Event Content */
  .exec-event__content {
    flex: 1;
    min-width: 0;
  }

  .exec-event__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--exec-space-sm);
    margin-bottom: var(--exec-space-xs);
  }

  .exec-event__agent {
    display: flex;
    align-items: center;
    gap: var(--exec-space-xs);
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.5);
  }

  .exec-event__agent-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .exec-event__timestamp {
    font-size: 10px;
    font-family: var(--exec-font-mono);
    color: rgba(255, 255, 255, 0.3);
  }

  .exec-event__title {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: var(--exec-space-xs);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .exec-event__description {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    line-height: 1.4;
  }

  /* Expanded Details */
  .exec-event__details {
    margin-top: var(--exec-space-md);
    padding: var(--exec-space-md);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--exec-radius-sm);
    font-size: 11px;
    font-family: var(--exec-font-mono);
  }

  .exec-event__detail-row {
    display: flex;
    gap: var(--exec-space-md);
    margin-bottom: var(--exec-space-xs);
  }

  .exec-event__detail-key {
    color: rgba(255, 255, 255, 0.4);
    min-width: 80px;
  }

  .exec-event__detail-value {
    color: rgba(255, 255, 255, 0.7);
    word-break: break-all;
  }

  /* Expand Indicator */
  .exec-event__expand {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: rgba(255, 255, 255, 0.3);
    transition: var(--exec-transition-fast);
  }

  .exec-event:hover .exec-event__expand {
    color: rgba(255, 255, 255, 0.5);
  }

  .exec-event--expanded .exec-event__expand {
    transform: rotate(180deg);
    color: var(--exec-accent);
  }
`;

// ============================================================================
// 3. PROGRESS DASHBOARD
// ============================================================================

export const ProgressDashboardStyles = `
  /* ===== Progress Dashboard Container ===== */
  .exec-progress {
    display: flex;
    flex-direction: column;
    gap: var(--exec-space-lg);
    padding: var(--exec-space-lg);
    background: var(--exec-glass-bg);
    backdrop-filter: blur(var(--exec-glass-blur));
    -webkit-backdrop-filter: blur(var(--exec-glass-blur));
    border: 1px solid var(--exec-border);
    border-radius: var(--exec-radius-xl);
  }

  /* ===== Overall Progress ===== */
  .exec-progress__overall {
    padding: var(--exec-space-lg);
    background: var(--exec-glass-bg-elevated);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-lg);
  }

  .exec-progress__overall-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--exec-space-md);
  }

  .exec-progress__overall-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .exec-progress__overall-percent {
    font-size: 24px;
    font-weight: 700;
    color: var(--exec-accent);
    letter-spacing: -0.02em;
  }

  .exec-progress__overall-bar {
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--exec-radius-full);
    overflow: hidden;
  }

  .exec-progress__overall-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--exec-accent-dark), var(--exec-accent), var(--exec-accent-light));
    border-radius: var(--exec-radius-full);
    transition: width var(--exec-transition-slow);
    box-shadow: 0 0 12px var(--exec-accent-glow);
  }

  .exec-progress__overall-stats {
    display: flex;
    justify-content: space-between;
    margin-top: var(--exec-space-md);
  }

  .exec-progress__stat {
    text-align: center;
  }

  .exec-progress__stat-value {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: var(--exec-space-xs);
  }

  .exec-progress__stat-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ===== Agent Progress Bars ===== */
  .exec-progress__agents {
    display: flex;
    flex-direction: column;
    gap: var(--exec-space-md);
  }

  .exec-progress__agents-title {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .exec-progress__agent {
    padding: var(--exec-space-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-md);
    transition: var(--exec-transition-fast);
  }

  .exec-progress__agent:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--exec-border);
  }

  .exec-progress__agent-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--exec-space-sm);
  }

  .exec-progress__agent-info {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
  }

  .exec-progress__agent-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .exec-progress__agent-indicator--working {
    background: var(--exec-status-working);
    animation: exec-indicator-pulse 1s ease-in-out infinite;
  }

  .exec-progress__agent-indicator--waiting {
    background: var(--exec-status-waiting);
  }

  .exec-progress__agent-indicator--complete {
    background: var(--exec-status-complete);
  }

  .exec-progress__agent-indicator--idle {
    background: var(--exec-status-idle);
  }

  @keyframes exec-indicator-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .exec-progress__agent-name {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }

  .exec-progress__agent-percent {
    font-size: 12px;
    font-family: var(--exec-font-mono);
    color: rgba(255, 255, 255, 0.5);
  }

  .exec-progress__agent-bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--exec-radius-full);
    overflow: hidden;
    margin-bottom: var(--exec-space-sm);
  }

  .exec-progress__agent-fill {
    height: 100%;
    border-radius: var(--exec-radius-full);
    transition: width var(--exec-transition);
  }

  .exec-progress__agent-task {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ===== Parallel Tasks Visualization ===== */
  .exec-progress__parallel {
    padding: var(--exec-space-lg);
    background: var(--exec-glass-bg-sunken);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-lg);
  }

  .exec-progress__parallel-title {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--exec-space-md);
  }

  .exec-progress__lanes {
    display: flex;
    flex-direction: column;
    gap: var(--exec-space-sm);
  }

  .exec-progress__lane {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
  }

  .exec-progress__lane-label {
    width: 60px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    text-align: right;
  }

  .exec-progress__lane-track {
    flex: 1;
    height: 24px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: var(--exec-radius-sm);
    position: relative;
    overflow: hidden;
  }

  .exec-progress__task-block {
    position: absolute;
    top: 2px;
    bottom: 2px;
    border-radius: var(--exec-radius-sm);
    display: flex;
    align-items: center;
    padding: 0 var(--exec-space-sm);
    font-size: 10px;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: var(--exec-transition);
  }

  .exec-progress__task-block:hover {
    z-index: 1;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  /* ===== Time Display ===== */
  .exec-progress__time {
    display: flex;
    justify-content: space-between;
    padding: var(--exec-space-md);
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--exec-radius-md);
  }

  .exec-progress__time-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--exec-space-xs);
  }

  .exec-progress__time-value {
    font-size: 18px;
    font-weight: 600;
    font-family: var(--exec-font-mono);
    color: rgba(255, 255, 255, 0.9);
  }

  .exec-progress__time-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

// ============================================================================
// 4. CONTROL PANEL
// ============================================================================

export const ControlPanelStyles = `
  /* ===== Control Panel Container ===== */
  .exec-controls {
    display: flex;
    align-items: center;
    gap: var(--exec-space-md);
    padding: var(--exec-space-md) var(--exec-space-lg);
    background: var(--exec-glass-bg);
    backdrop-filter: blur(var(--exec-glass-blur));
    -webkit-backdrop-filter: blur(var(--exec-glass-blur));
    border: 1px solid var(--exec-border);
    border-radius: var(--exec-radius-lg);
  }

  /* ===== Primary Controls ===== */
  .exec-controls__primary {
    display: flex;
    gap: var(--exec-space-sm);
  }

  .exec-controls__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-sm) var(--exec-space-lg);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--exec-border);
    border-radius: var(--exec-radius-md);
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: var(--exec-transition);
  }

  .exec-controls__btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--exec-border-hover);
  }

  .exec-controls__btn:active {
    transform: scale(0.98);
  }

  .exec-controls__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  .exec-controls__btn-icon {
    width: 16px;
    height: 16px;
  }

  /* Pause Button */
  .exec-controls__btn--pause {
    background: rgba(251, 191, 36, 0.1);
    border-color: rgba(251, 191, 36, 0.3);
    color: var(--exec-status-waiting);
  }

  .exec-controls__btn--pause:hover {
    background: rgba(251, 191, 36, 0.2);
    border-color: rgba(251, 191, 36, 0.5);
  }

  /* Resume Button */
  .exec-controls__btn--resume {
    background: rgba(74, 222, 128, 0.1);
    border-color: rgba(74, 222, 128, 0.3);
    color: var(--exec-status-working);
  }

  .exec-controls__btn--resume:hover {
    background: rgba(74, 222, 128, 0.2);
    border-color: rgba(74, 222, 128, 0.5);
  }

  /* Skip Button */
  .exec-controls__btn--skip {
    background: rgba(96, 165, 250, 0.1);
    border-color: rgba(96, 165, 250, 0.3);
    color: #60a5fa;
  }

  .exec-controls__btn--skip:hover {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.5);
  }

  /* Takeover Button */
  .exec-controls__btn--takeover {
    background: rgba(167, 139, 250, 0.1);
    border-color: rgba(167, 139, 250, 0.3);
    color: #a78bfa;
  }

  .exec-controls__btn--takeover:hover {
    background: rgba(167, 139, 250, 0.2);
    border-color: rgba(167, 139, 250, 0.5);
  }

  /* Cancel Button */
  .exec-controls__btn--cancel {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    color: var(--exec-status-error);
  }

  .exec-controls__btn--cancel:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
  }

  /* ===== Divider ===== */
  .exec-controls__divider {
    width: 1px;
    height: 32px;
    background: linear-gradient(
      180deg,
      transparent,
      var(--exec-border),
      transparent
    );
  }

  /* ===== Speed Controls ===== */
  .exec-controls__speed {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
  }

  .exec-controls__speed-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .exec-controls__speed-buttons {
    display: flex;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-sm);
    overflow: hidden;
  }

  .exec-controls__speed-btn {
    padding: var(--exec-space-sm) var(--exec-space-md);
    background: transparent;
    border: none;
    border-right: 1px solid var(--exec-border-subtle);
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: var(--exec-transition-fast);
  }

  .exec-controls__speed-btn:last-child {
    border-right: none;
  }

  .exec-controls__speed-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.8);
  }

  .exec-controls__speed-btn--active {
    background: rgba(217, 160, 122, 0.15);
    color: var(--exec-accent);
  }

  /* ===== Status Indicator ===== */
  .exec-controls__status {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
    margin-left: auto;
    padding: var(--exec-space-sm) var(--exec-space-md);
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--exec-radius-sm);
  }

  .exec-controls__status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .exec-controls__status-dot--running {
    background: var(--exec-status-working);
    animation: exec-status-pulse 1.5s ease-in-out infinite;
  }

  .exec-controls__status-dot--paused {
    background: var(--exec-status-waiting);
  }

  .exec-controls__status-dot--complete {
    background: var(--exec-status-complete);
  }

  @keyframes exec-status-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 var(--exec-status-working); }
    50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.2); }
  }

  .exec-controls__status-text {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
`;

// ============================================================================
// 5. AGENT STATUS CARDS
// ============================================================================

export const AgentStatusCardStyles = `
  /* ===== Agent Cards Container ===== */
  .exec-agents {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--exec-space-md);
  }

  /* ===== Single Agent Card ===== */
  .exec-agent-card {
    display: flex;
    flex-direction: column;
    padding: var(--exec-space-lg);
    background: var(--exec-glass-bg);
    backdrop-filter: blur(var(--exec-glass-blur));
    -webkit-backdrop-filter: blur(var(--exec-glass-blur));
    border: 1px solid var(--exec-border);
    border-radius: var(--exec-radius-lg);
    transition: var(--exec-transition);
  }

  .exec-agent-card:hover {
    border-color: var(--exec-border-hover);
    box-shadow: var(--exec-shadow-md);
  }

  .exec-agent-card--working {
    border-color: rgba(74, 222, 128, 0.3);
    background: linear-gradient(
      135deg,
      var(--exec-glass-bg),
      rgba(74, 222, 128, 0.05)
    );
  }

  .exec-agent-card--waiting {
    border-color: rgba(251, 191, 36, 0.3);
    background: linear-gradient(
      135deg,
      var(--exec-glass-bg),
      rgba(251, 191, 36, 0.05)
    );
  }

  .exec-agent-card--complete {
    border-color: rgba(34, 197, 94, 0.3);
  }

  .exec-agent-card--error {
    border-color: rgba(239, 68, 68, 0.3);
    background: linear-gradient(
      135deg,
      var(--exec-glass-bg),
      rgba(239, 68, 68, 0.05)
    );
  }

  /* ===== Card Header ===== */
  .exec-agent-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--exec-space-md);
  }

  .exec-agent-card__identity {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
  }

  .exec-agent-card__avatar {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--exec-radius-md);
    font-size: 18px;
    font-weight: 600;
  }

  .exec-agent-card__name {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .exec-agent-card__role {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* ===== Status Badge ===== */
  .exec-agent-card__status {
    display: flex;
    align-items: center;
    gap: var(--exec-space-xs);
    padding: var(--exec-space-xs) var(--exec-space-sm);
    border-radius: var(--exec-radius-full);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .exec-agent-card__status--working {
    background: rgba(74, 222, 128, 0.15);
    color: var(--exec-status-working);
  }

  .exec-agent-card__status--waiting {
    background: rgba(251, 191, 36, 0.15);
    color: var(--exec-status-waiting);
  }

  .exec-agent-card__status--complete {
    background: rgba(34, 197, 94, 0.15);
    color: var(--exec-status-complete);
  }

  .exec-agent-card__status--idle {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.4);
  }

  .exec-agent-card__status--error {
    background: rgba(239, 68, 68, 0.15);
    color: var(--exec-status-error);
  }

  .exec-agent-card__status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .exec-agent-card--working .exec-agent-card__status-dot {
    animation: exec-agent-status-blink 1s ease-in-out infinite;
  }

  @keyframes exec-agent-status-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* ===== Task Description ===== */
  .exec-agent-card__task {
    flex: 1;
    margin-bottom: var(--exec-space-md);
  }

  .exec-agent-card__task-label {
    font-size: 10px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--exec-space-xs);
  }

  .exec-agent-card__task-text {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ===== Progress Bar ===== */
  .exec-agent-card__progress {
    margin-bottom: var(--exec-space-md);
  }

  .exec-agent-card__progress-bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--exec-radius-full);
    overflow: hidden;
  }

  .exec-agent-card__progress-fill {
    height: 100%;
    border-radius: var(--exec-radius-full);
    transition: width var(--exec-transition);
  }

  /* ===== Quick Actions ===== */
  .exec-agent-card__actions {
    display: flex;
    gap: var(--exec-space-sm);
  }

  .exec-agent-card__action {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--exec-space-xs);
    padding: var(--exec-space-sm);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-sm);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: var(--exec-transition-fast);
  }

  .exec-agent-card__action:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--exec-border);
    color: rgba(255, 255, 255, 0.9);
  }

  .exec-agent-card__action-icon {
    width: 14px;
    height: 14px;
  }

  /* ===== Minimal Card Variant ===== */
  .exec-agent-card--minimal {
    flex-direction: row;
    align-items: center;
    padding: var(--exec-space-md);
    gap: var(--exec-space-md);
  }

  .exec-agent-card--minimal .exec-agent-card__header {
    margin-bottom: 0;
  }

  .exec-agent-card--minimal .exec-agent-card__task {
    flex: 1;
    margin-bottom: 0;
  }

  .exec-agent-card--minimal .exec-agent-card__actions {
    flex: 0;
  }
`;

// ============================================================================
// 6. APPROVAL QUEUE MODAL
// ============================================================================

export const ApprovalQueueStyles = `
  /* ===== Approval Overlay ===== */
  .exec-approval-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: exec-overlay-fade 0.2s ease;
  }

  @keyframes exec-overlay-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* ===== Approval Modal ===== */
  .exec-approval {
    width: 100%;
    max-width: 520px;
    margin: var(--exec-space-xl);
    background: var(--exec-glass-bg);
    backdrop-filter: blur(var(--exec-glass-blur-strong));
    -webkit-backdrop-filter: blur(var(--exec-glass-blur-strong));
    border: 1px solid var(--exec-border);
    border-radius: var(--exec-radius-xl);
    overflow: hidden;
    box-shadow:
      var(--exec-shadow-lg),
      0 0 60px rgba(217, 160, 122, 0.1);
    animation: exec-modal-appear 0.3s var(--exec-spring);
  }

  @keyframes exec-modal-appear {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  /* ===== Attention Bar ===== */
  .exec-approval__attention {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-sm);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .exec-approval__attention--low {
    background: rgba(74, 222, 128, 0.15);
    color: var(--exec-risk-low);
  }

  .exec-approval__attention--medium {
    background: rgba(251, 191, 36, 0.15);
    color: var(--exec-risk-medium);
  }

  .exec-approval__attention--high {
    background: rgba(249, 115, 22, 0.15);
    color: var(--exec-risk-high);
  }

  .exec-approval__attention--critical {
    background: rgba(239, 68, 68, 0.2);
    color: var(--exec-risk-critical);
    animation: exec-attention-pulse 1.5s ease-in-out infinite;
  }

  @keyframes exec-attention-pulse {
    0%, 100% { background: rgba(239, 68, 68, 0.2); }
    50% { background: rgba(239, 68, 68, 0.3); }
  }

  .exec-approval__attention-icon {
    width: 14px;
    height: 14px;
  }

  /* ===== Modal Header ===== */
  .exec-approval__header {
    padding: var(--exec-space-xl);
    border-bottom: 1px solid var(--exec-border-subtle);
  }

  .exec-approval__agent {
    display: flex;
    align-items: center;
    gap: var(--exec-space-sm);
    margin-bottom: var(--exec-space-md);
  }

  .exec-approval__agent-avatar {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--exec-radius-sm);
    font-size: 14px;
    font-weight: 600;
  }

  .exec-approval__agent-name {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
  }

  .exec-approval__agent-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  .exec-approval__title {
    font-size: 20px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    line-height: 1.3;
    margin-bottom: var(--exec-space-sm);
  }

  .exec-approval__description {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.5;
  }

  /* ===== Context Section ===== */
  .exec-approval__context {
    padding: var(--exec-space-lg) var(--exec-space-xl);
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid var(--exec-border-subtle);
  }

  .exec-approval__context-label {
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: var(--exec-space-sm);
  }

  .exec-approval__context-content {
    padding: var(--exec-space-md);
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-md);
    font-size: 12px;
    font-family: var(--exec-font-mono);
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.6;
    max-height: 150px;
    overflow-y: auto;
  }

  /* ===== Options Section ===== */
  .exec-approval__options {
    padding: var(--exec-space-lg) var(--exec-space-xl);
    border-bottom: 1px solid var(--exec-border-subtle);
  }

  .exec-approval__options-label {
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: var(--exec-space-md);
  }

  .exec-approval__option {
    display: flex;
    align-items: flex-start;
    gap: var(--exec-space-md);
    padding: var(--exec-space-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-md);
    margin-bottom: var(--exec-space-sm);
    cursor: pointer;
    transition: var(--exec-transition-fast);
  }

  .exec-approval__option:last-child {
    margin-bottom: 0;
  }

  .exec-approval__option:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--exec-border);
  }

  .exec-approval__option--selected {
    background: rgba(217, 160, 122, 0.1);
    border-color: var(--exec-border-hover);
  }

  .exec-approval__option--destructive {
    border-color: rgba(239, 68, 68, 0.2);
  }

  .exec-approval__option--destructive:hover {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.3);
  }

  .exec-approval__option-radio {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border: 2px solid var(--exec-border);
    border-radius: 50%;
    margin-top: 2px;
    transition: var(--exec-transition-fast);
  }

  .exec-approval__option--selected .exec-approval__option-radio {
    border-color: var(--exec-accent);
    background: var(--exec-accent);
    box-shadow: inset 0 0 0 3px var(--exec-glass-bg);
  }

  .exec-approval__option-content {
    flex: 1;
  }

  .exec-approval__option-title {
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: var(--exec-space-xs);
  }

  .exec-approval__option-desc {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    line-height: 1.4;
  }

  .exec-approval__option-badge {
    padding: var(--exec-space-xs) var(--exec-space-sm);
    border-radius: var(--exec-radius-sm);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .exec-approval__option-badge--default {
    background: rgba(217, 160, 122, 0.15);
    color: var(--exec-accent);
  }

  /* ===== Actions Footer ===== */
  .exec-approval__footer {
    display: flex;
    gap: var(--exec-space-md);
    padding: var(--exec-space-lg) var(--exec-space-xl);
  }

  .exec-approval__btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-md) var(--exec-space-lg);
    border-radius: var(--exec-radius-md);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: var(--exec-transition);
  }

  .exec-approval__btn:active {
    transform: scale(0.98);
  }

  .exec-approval__btn--reject {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--exec-border);
    color: rgba(255, 255, 255, 0.8);
  }

  .exec-approval__btn--reject:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.4);
    color: var(--exec-status-error);
  }

  .exec-approval__btn--modify {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--exec-border);
    color: rgba(255, 255, 255, 0.8);
  }

  .exec-approval__btn--modify:hover {
    background: rgba(167, 139, 250, 0.1);
    border-color: rgba(167, 139, 250, 0.4);
    color: #a78bfa;
  }

  .exec-approval__btn--approve {
    background: linear-gradient(135deg, var(--exec-accent-dark), var(--exec-accent));
    border: none;
    color: rgba(0, 0, 0, 0.9);
    box-shadow: 0 4px 16px var(--exec-accent-glow);
  }

  .exec-approval__btn--approve:hover {
    box-shadow: 0 6px 20px rgba(217, 160, 122, 0.5);
    transform: translateY(-1px);
  }

  .exec-approval__btn-icon {
    width: 16px;
    height: 16px;
  }

  /* ===== Keyboard Hints ===== */
  .exec-approval__hints {
    display: flex;
    justify-content: center;
    gap: var(--exec-space-xl);
    padding: var(--exec-space-md);
    background: rgba(0, 0, 0, 0.2);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
  }

  .exec-approval__hint {
    display: flex;
    align-items: center;
    gap: var(--exec-space-xs);
  }

  .exec-approval__kbd {
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--exec-border-subtle);
    border-radius: 3px;
    font-family: var(--exec-font-mono);
    font-size: 10px;
  }
`;

// ============================================================================
// 7. COMPANY DASHBOARD LAYOUT
// ============================================================================

export const CompanyDashboardStyles = `
  /* ===== Dashboard Container ===== */
  .exec-dashboard {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: #0a0908;
  }

  /* ===== Dashboard Header ===== */
  .exec-dashboard__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--exec-space-lg) var(--exec-space-2xl);
    background: var(--exec-glass-bg);
    backdrop-filter: blur(var(--exec-glass-blur));
    -webkit-backdrop-filter: blur(var(--exec-glass-blur));
    border-bottom: 1px solid var(--exec-border);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .exec-dashboard__brand {
    display: flex;
    align-items: center;
    gap: var(--exec-space-md);
  }

  .exec-dashboard__logo {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--exec-accent-dark), var(--exec-accent));
    border-radius: var(--exec-radius-md);
    font-size: 20px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.9);
  }

  .exec-dashboard__company-info {
    display: flex;
    flex-direction: column;
  }

  .exec-dashboard__company-name {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }

  .exec-dashboard__company-plan {
    font-size: 11px;
    color: var(--exec-accent);
  }

  .exec-dashboard__header-actions {
    display: flex;
    align-items: center;
    gap: var(--exec-space-md);
  }

  .exec-dashboard__header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-md);
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: var(--exec-transition-fast);
  }

  .exec-dashboard__header-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--exec-border);
    color: rgba(255, 255, 255, 0.9);
  }

  .exec-dashboard__header-btn--notification {
    position: relative;
  }

  .exec-dashboard__notification-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: var(--exec-status-error);
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ===== Dashboard Body ===== */
  .exec-dashboard__body {
    display: flex;
    flex: 1;
  }

  /* ===== Sidebar ===== */
  .exec-dashboard__sidebar {
    width: 280px;
    flex-shrink: 0;
    padding: var(--exec-space-lg);
    background: var(--exec-glass-bg);
    border-right: 1px solid var(--exec-border);
    overflow-y: auto;
  }

  .exec-dashboard__sidebar-section {
    margin-bottom: var(--exec-space-xl);
  }

  .exec-dashboard__sidebar-title {
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0 var(--exec-space-md);
    margin-bottom: var(--exec-space-sm);
  }

  .exec-dashboard__sidebar-item {
    display: flex;
    align-items: center;
    gap: var(--exec-space-md);
    padding: var(--exec-space-md);
    border-radius: var(--exec-radius-md);
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: var(--exec-transition-fast);
  }

  .exec-dashboard__sidebar-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.9);
  }

  .exec-dashboard__sidebar-item--active {
    background: rgba(217, 160, 122, 0.1);
    border: 1px solid var(--exec-border);
    color: var(--exec-accent);
  }

  .exec-dashboard__sidebar-icon {
    width: 20px;
    height: 20px;
    opacity: 0.7;
  }

  .exec-dashboard__sidebar-item--active .exec-dashboard__sidebar-icon {
    opacity: 1;
  }

  .exec-dashboard__sidebar-label {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
  }

  .exec-dashboard__sidebar-badge {
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--exec-radius-full);
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
  }

  /* ===== Main Content ===== */
  .exec-dashboard__main {
    flex: 1;
    padding: var(--exec-space-2xl);
    overflow-y: auto;
  }

  .exec-dashboard__main-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--exec-space-xl);
  }

  .exec-dashboard__main-title {
    font-size: 24px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    letter-spacing: -0.02em;
  }

  .exec-dashboard__main-subtitle {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: var(--exec-space-xs);
  }

  /* ===== Content Grid ===== */
  .exec-dashboard__grid {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: var(--exec-space-xl);
  }

  @media (max-width: 1400px) {
    .exec-dashboard__grid {
      grid-template-columns: 1fr;
    }
  }

  .exec-dashboard__preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--exec-space-lg);
  }

  .exec-dashboard__side-section {
    display: flex;
    flex-direction: column;
    gap: var(--exec-space-lg);
  }

  /* ===== Assets Section ===== */
  .exec-dashboard__assets {
    padding: var(--exec-space-lg);
    background: var(--exec-glass-bg);
    backdrop-filter: blur(var(--exec-glass-blur));
    -webkit-backdrop-filter: blur(var(--exec-glass-blur));
    border: 1px solid var(--exec-border);
    border-radius: var(--exec-radius-xl);
  }

  .exec-dashboard__assets-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--exec-space-lg);
  }

  .exec-dashboard__assets-title {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .exec-dashboard__assets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: var(--exec-space-md);
  }

  .exec-dashboard__asset {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--exec-space-sm);
    padding: var(--exec-space-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--exec-border-subtle);
    border-radius: var(--exec-radius-md);
    cursor: pointer;
    transition: var(--exec-transition-fast);
  }

  .exec-dashboard__asset:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--exec-border);
  }

  .exec-dashboard__asset-preview {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: var(--exec-radius-sm);
    font-size: 24px;
    color: rgba(255, 255, 255, 0.4);
  }

  .exec-dashboard__asset-name {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* ===== Metrics Section ===== */
  .exec-dashboard__metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--exec-space-md);
  }

  @media (max-width: 1200px) {
    .exec-dashboard__metrics {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .exec-dashboard__metric {
    padding: var(--exec-space-lg);
    background: var(--exec-glass-bg);
    backdrop-filter: blur(var(--exec-glass-blur));
    -webkit-backdrop-filter: blur(var(--exec-glass-blur));
    border: 1px solid var(--exec-border);
    border-radius: var(--exec-radius-lg);
    transition: var(--exec-transition-fast);
  }

  .exec-dashboard__metric:hover {
    border-color: var(--exec-border-hover);
  }

  .exec-dashboard__metric-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--exec-radius-sm);
    margin-bottom: var(--exec-space-md);
    font-size: 16px;
  }

  .exec-dashboard__metric-value {
    font-size: 28px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
    letter-spacing: -0.02em;
    margin-bottom: var(--exec-space-xs);
  }

  .exec-dashboard__metric-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .exec-dashboard__metric-change {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-top: var(--exec-space-sm);
    padding: 2px 6px;
    border-radius: var(--exec-radius-sm);
    font-size: 11px;
    font-weight: 500;
  }

  .exec-dashboard__metric-change--positive {
    background: rgba(74, 222, 128, 0.15);
    color: var(--exec-status-working);
  }

  .exec-dashboard__metric-change--negative {
    background: rgba(239, 68, 68, 0.15);
    color: var(--exec-status-error);
  }

  /* ===== Responsive Sidebar ===== */
  @media (max-width: 1024px) {
    .exec-dashboard__sidebar {
      position: fixed;
      left: -280px;
      top: 0;
      bottom: 0;
      z-index: 200;
      transition: left var(--exec-transition);
    }

    .exec-dashboard__sidebar--open {
      left: 0;
    }

    .exec-dashboard__sidebar-toggle {
      display: flex;
    }
  }

  @media (min-width: 1025px) {
    .exec-dashboard__sidebar-toggle {
      display: none;
    }
  }
`;

// ============================================================================
// COMBINED STYLES EXPORT
// ============================================================================

export const AllExecutionPreviewStyles = `
  ${ExecutionPreviewStyles}
  ${ExecutionPreviewPanelStyles}
  ${ActivityFeedStyles}
  ${ProgressDashboardStyles}
  ${ControlPanelStyles}
  ${AgentStatusCardStyles}
  ${ApprovalQueueStyles}
  ${CompanyDashboardStyles}
`;

// ============================================================================
// COMPONENT INTERFACES AND PROPS
// ============================================================================

export interface ExecutionPreviewPanelProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  isFullscreen?: boolean;
  isPip?: boolean;
  onToggleFullscreen?: () => void;
  onTogglePip?: () => void;
  browserUrl?: string;
  browserStream?: MediaStream | string;
  terminalOutput?: string[];
  editorFiles?: { name: string; content: string; language: string }[];
  activeEditorFile?: number;
  cursorPosition?: { x: number; y: number };
  isLoading?: boolean;
}

export interface ActivityFeedProps {
  events: ExecutionEvent[];
  isLive?: boolean;
  onEventClick?: (event: ExecutionEvent) => void;
  activeFilters?: EventType[];
  onFilterChange?: (filters: EventType[]) => void;
  agents: AgentInfo[];
}

export interface ProgressDashboardProps {
  overallProgress: number;
  agents: AgentInfo[];
  tasks: TaskProgress[];
  timeElapsed: number;
  estimatedTotal?: number;
}

export interface ControlPanelProps {
  status: 'running' | 'paused' | 'complete';
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onTakeover: () => void;
  onCancel: () => void;
  speed?: number;
  onSpeedChange?: (speed: number) => void;
  canPause?: boolean;
  canSkip?: boolean;
  canTakeover?: boolean;
  canCancel?: boolean;
}

export interface AgentStatusCardProps {
  agent: AgentInfo;
  variant?: 'default' | 'minimal';
  onViewDetails?: () => void;
  onPause?: () => void;
  onMessage?: () => void;
}

export interface ApprovalQueueProps {
  item: ApprovalItem;
  onApprove: (optionId?: string) => void;
  onReject: (reason?: string) => void;
  onModify?: () => void;
  selectedOption?: string;
  onOptionSelect?: (optionId: string) => void;
}

export interface CompanyDashboardProps {
  companyName: string;
  companyPlan: string;
  agents: AgentInfo[];
  activeSection?: string;
  onSectionChange?: (section: string) => void;
  children?: React.ReactNode;
}

// ============================================================================
// ICON COMPONENTS (SVG Icons - No Emojis)
// ============================================================================

export const Icons = {
  Browser: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <circle cx="7" cy="6" r="0.5" fill="currentColor" />
      <circle cx="10" cy="6" r="0.5" fill="currentColor" />
    </svg>
  ),
  Terminal: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  Editor: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  Fullscreen: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  Pip: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <rect x="12" y="10" width="8" height="6" rx="1" />
    </svg>
  ),
  Pause: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  ),
  Play: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  Skip: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 4l10 8-10 8V4z" />
      <rect x="17" y="5" width="2" height="14" />
    </svg>
  ),
  Hand: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  ChevronDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Globe: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  FileCode: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </svg>
  ),
  Zap: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Users: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Bell: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Menu: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
};

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  styles: AllExecutionPreviewStyles,
  icons: Icons,
};
