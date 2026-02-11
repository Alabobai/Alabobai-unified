/**
 * ============================================================================
 * AGENT STATUS CARD COMPONENT
 * Individual agent cards showing status, task, and quick actions
 * ============================================================================
 */

import React from 'react';
import type { AgentInfo, AgentStatusCardProps } from './execution-preview-spec.js';
import { Icons } from './execution-preview-spec.js';

// ============================================================================
// STATUS TEXT AND ICON MAPPING
// ============================================================================

const getStatusLabel = (status: AgentInfo['status']): string => {
  switch (status) {
    case 'working':
      return 'Working';
    case 'waiting':
      return 'Waiting';
    case 'complete':
      return 'Complete';
    case 'idle':
      return 'Idle';
    case 'error':
      return 'Error';
    default:
      return 'Unknown';
  }
};

// ============================================================================
// AGENT AVATAR COMPONENT
// ============================================================================

interface AgentAvatarProps {
  name: string;
  color: string;
}

const AgentAvatar: React.FC<AgentAvatarProps> = ({ name, color }) => {
  // Get initials from name
  const initials = name
    .split(' ')
    .map((word: string) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="exec-agent-card__avatar"
      style={{
        background: `linear-gradient(135deg, ${color}40, ${color}20)`,
        color: color,
      }}
    >
      {initials}
    </div>
  );
};

// ============================================================================
// MAIN AGENT STATUS CARD COMPONENT
// ============================================================================

export const AgentStatusCard: React.FC<AgentStatusCardProps> = ({
  agent,
  variant = 'default',
  onViewDetails,
  onPause,
  onMessage,
}) => {
  const isMinimal = variant === 'minimal';

  const cardClasses = [
    'exec-agent-card',
    `exec-agent-card--${agent.status}`,
    isMinimal && 'exec-agent-card--minimal',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      {/* Header */}
      <div className="exec-agent-card__header">
        <div className="exec-agent-card__identity">
          <AgentAvatar name={agent.name} color={agent.color} />
          <div>
            <div className="exec-agent-card__name">{agent.name}</div>
            <div className="exec-agent-card__role">{agent.role}</div>
          </div>
        </div>
        <div className={`exec-agent-card__status exec-agent-card__status--${agent.status}`}>
          <span className="exec-agent-card__status-dot" />
          <span>{getStatusLabel(agent.status)}</span>
        </div>
      </div>

      {/* Task Description */}
      {!isMinimal && (
        <div className="exec-agent-card__task">
          <div className="exec-agent-card__task-label">Current Task</div>
          <div className="exec-agent-card__task-text">
            {agent.currentTask || 'No active task'}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {!isMinimal && agent.progress !== undefined && agent.status === 'working' && (
        <div className="exec-agent-card__progress">
          <div className="exec-agent-card__progress-bar">
            <div
              className="exec-agent-card__progress-fill"
              style={{
                width: `${agent.progress}%`,
                backgroundColor: agent.color,
              }}
            />
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="exec-agent-card__actions">
        {onViewDetails && (
          <button
            className="exec-agent-card__action"
            onClick={onViewDetails}
            title="View details"
          >
            <span className="exec-agent-card__action-icon">
              <Icons.Settings />
            </span>
            <span>Details</span>
          </button>
        )}
        {onPause && agent.status === 'working' && (
          <button
            className="exec-agent-card__action"
            onClick={onPause}
            title="Pause agent"
          >
            <span className="exec-agent-card__action-icon">
              <Icons.Pause />
            </span>
            <span>Pause</span>
          </button>
        )}
        {onMessage && (
          <button
            className="exec-agent-card__action"
            onClick={onMessage}
            title="Message agent"
          >
            <span className="exec-agent-card__action-icon">
              <Icons.Zap />
            </span>
            <span>Message</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// AGENT STATUS CARDS GRID COMPONENT
// ============================================================================

export interface AgentStatusCardsProps {
  agents: AgentInfo[];
  variant?: 'default' | 'minimal';
  onViewDetails?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onMessage?: (agentId: string) => void;
}

export const AgentStatusCards: React.FC<AgentStatusCardsProps> = ({
  agents,
  variant = 'default',
  onViewDetails,
  onPause,
  onMessage,
}) => {
  // Sort agents: working first, then waiting, then others
  const sortedAgents = [...agents].sort((a: AgentInfo, b: AgentInfo) => {
    const order: Record<string, number> = { working: 0, waiting: 1, error: 2, idle: 3, complete: 4 };
    return (order[a.status] || 5) - (order[b.status] || 5);
  });

  return (
    <div className="exec-agents">
      {sortedAgents.map((agent) => (
        <AgentStatusCard
          key={agent.id}
          agent={agent}
          variant={variant}
          onViewDetails={onViewDetails ? () => onViewDetails(agent.id) : undefined}
          onPause={onPause ? () => onPause(agent.id) : undefined}
          onMessage={onMessage ? () => onMessage(agent.id) : undefined}
        />
      ))}
    </div>
  );
};

export default AgentStatusCard;
