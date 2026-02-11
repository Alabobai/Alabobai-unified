/**
 * AgentActivity Component
 * Shows what agents are doing - the "Cabinet" view
 */

import React from 'react';

interface Agent {
  id: string;
  name: string;
  icon: string;
  status: 'idle' | 'working' | 'waiting-approval' | 'collaborating' | 'error';
  currentTask?: string;
}

interface AgentActivityProps {
  agents: Agent[];
}

export const AgentActivity: React.FC<AgentActivityProps> = ({ agents }) => {
  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'working':
        return '#4ade80';
      case 'waiting-approval':
        return '#fbbf24';
      case 'collaborating':
        return '#8b5cf6';
      case 'error':
        return '#ef4444';
      default:
        return 'rgba(255, 255, 255, 0.3)';
    }
  };

  const getStatusText = (status: Agent['status']) => {
    switch (status) {
      case 'working':
        return 'Working';
      case 'waiting-approval':
        return 'Needs Approval';
      case 'collaborating':
        return 'Collaborating';
      case 'error':
        return 'Error';
      default:
        return 'Ready';
    }
  };

  // Sort agents: working first, then others
  const sortedAgents = [...agents].sort((a, b) => {
    const order = { working: 0, 'waiting-approval': 1, collaborating: 2, error: 3, idle: 4 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="agent-activity">
      <h3 className="section-title">Your AI Cabinet</h3>
      <p className="section-subtitle">
        {agents.filter((a) => a.status === 'working').length} agents working
      </p>

      <div className="agents-list">
        {sortedAgents.map((agent) => (
          <div key={agent.id} className={`agent-card ${agent.status}`}>
            <div className="agent-icon">{agent.icon}</div>
            <div className="agent-info">
              <div className="agent-name">{agent.name}</div>
              <div className="agent-status" style={{ color: getStatusColor(agent.status) }}>
                <span
                  className="status-indicator"
                  style={{ backgroundColor: getStatusColor(agent.status) }}
                />
                {getStatusText(agent.status)}
              </div>
              {agent.currentTask && agent.status === 'working' && (
                <div className="agent-task">{agent.currentTask}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .agent-activity {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .section-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: #f5a9b8;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0 0 0.25rem 0;
        }

        .section-subtitle {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
          margin: 0 0 1rem 0;
        }

        .agents-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          overflow-y: auto;
          flex: 1;
        }

        .agent-card {
          display: flex;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          transition: all 0.2s ease;
        }

        .agent-card.working {
          background: rgba(74, 222, 128, 0.1);
          border: 1px solid rgba(74, 222, 128, 0.2);
        }

        .agent-card.waiting-approval {
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.2);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.4);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(251, 191, 36, 0);
          }
        }

        .agent-card.collaborating {
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.2);
        }

        .agent-card.error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .agent-icon {
          font-size: 1.5rem;
          line-height: 1;
        }

        .agent-info {
          flex: 1;
          min-width: 0;
        }

        .agent-name {
          font-size: 0.8125rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .agent-status {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.6875rem;
          margin-top: 0.25rem;
        }

        .status-indicator {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .agent-card.working .status-indicator {
          animation: blink 1s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }

        .agent-task {
          font-size: 0.6875rem;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 0.25rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
};

export default AgentActivity;
