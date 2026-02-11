/**
 * ============================================================================
 * PROGRESS DASHBOARD COMPONENT
 * Overall and per-agent progress visualization with parallel task lanes
 * ============================================================================
 */

import React, { useMemo } from 'react';
import type {
  AgentInfo,
  TaskProgress,
  ProgressDashboardProps,
} from './execution-preview-spec.js';

// ============================================================================
// TIME FORMATTING UTILITIES
// ============================================================================

const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

const formatTimeDigits = (milliseconds: number): { hours: string; minutes: string; seconds: string } => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes % 60).padStart(2, '0'),
    seconds: String(seconds % 60).padStart(2, '0'),
  };
};

// ============================================================================
// AGENT PROGRESS BAR SUBCOMPONENT
// ============================================================================

interface AgentProgressBarProps {
  agent: AgentInfo;
  tasks: TaskProgress[];
}

const AgentProgressBar: React.FC<AgentProgressBarProps> = ({ agent, tasks }) => {
  const agentTasks = tasks.filter((t: TaskProgress) => t.agentId === agent.id);
  const totalProgress = agentTasks.length > 0
    ? agentTasks.reduce((sum: number, t: TaskProgress) => sum + t.progress, 0) / agentTasks.length
    : agent.progress || 0;

  const currentTask = agentTasks.find((t: TaskProgress) => t.status === 'in-progress');

  return (
    <div className="exec-progress__agent">
      <div className="exec-progress__agent-header">
        <div className="exec-progress__agent-info">
          <span className={`exec-progress__agent-indicator exec-progress__agent-indicator--${agent.status}`} />
          <span className="exec-progress__agent-name">{agent.name}</span>
        </div>
        <span className="exec-progress__agent-percent">{Math.round(totalProgress)}%</span>
      </div>
      <div className="exec-progress__agent-bar">
        <div
          className="exec-progress__agent-fill"
          style={{
            width: `${totalProgress}%`,
            backgroundColor: agent.color,
          }}
        />
      </div>
      {currentTask && (
        <div className="exec-progress__agent-task">
          {currentTask.name}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// PARALLEL TASKS LANE SUBCOMPONENT
// ============================================================================

interface ParallelLanesProps {
  agents: AgentInfo[];
  tasks: TaskProgress[];
  totalDuration: number;
}

const ParallelLanes: React.FC<ParallelLanesProps> = ({ agents, tasks, totalDuration }) => {
  // Group tasks by agent
  const tasksByAgent = useMemo(() => {
    const grouped: Record<string, TaskProgress[]> = {};
    agents.forEach((agent: AgentInfo) => {
      grouped[agent.id] = tasks.filter((t: TaskProgress) => t.agentId === agent.id);
    });
    return grouped;
  }, [agents, tasks]);

  // Calculate task positions
  const getTaskStyle = (task: TaskProgress, agentColor: string) => {
    const startTime = task.startTime ? new Date(task.startTime).getTime() : 0;
    const endTime = task.estimatedEnd ? new Date(task.estimatedEnd).getTime() : startTime + 10000;
    const duration = endTime - startTime;

    const leftPercent = totalDuration > 0 ? (startTime / totalDuration) * 100 : 0;
    const widthPercent = totalDuration > 0 ? (duration / totalDuration) * 100 : 10;

    return {
      left: `${Math.max(0, Math.min(leftPercent, 95))}%`,
      width: `${Math.max(5, Math.min(widthPercent, 100 - leftPercent))}%`,
      backgroundColor: task.status === 'complete'
        ? 'rgba(74, 222, 128, 0.8)'
        : task.status === 'failed'
        ? 'rgba(239, 68, 68, 0.8)'
        : agentColor,
    };
  };

  return (
    <div className="exec-progress__parallel">
      <h4 className="exec-progress__parallel-title">Parallel Task Execution</h4>
      <div className="exec-progress__lanes">
        {agents.map((agent) => (
          <div key={agent.id} className="exec-progress__lane">
            <span className="exec-progress__lane-label">{agent.name.split(' ')[0]}</span>
            <div className="exec-progress__lane-track">
              {(tasksByAgent[agent.id] || []).map((task) => (
                <div
                  key={task.id}
                  className="exec-progress__task-block"
                  style={getTaskStyle(task, agent.color)}
                  title={task.name}
                >
                  {task.name}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN PROGRESS DASHBOARD COMPONENT
// ============================================================================

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  overallProgress,
  agents,
  tasks,
  timeElapsed,
  estimatedTotal,
}) => {
  // Calculate statistics
  const completedTasks = tasks.filter((t: TaskProgress) => t.status === 'complete').length;
  const totalTasks = tasks.length;
  const activeAgents = agents.filter((a: AgentInfo) => a.status === 'working').length;

  // Time calculations
  const elapsedTime = formatTimeDigits(timeElapsed);
  const estimatedRemaining = estimatedTotal && estimatedTotal > timeElapsed
    ? formatDuration(estimatedTotal - timeElapsed)
    : 'Calculating...';

  return (
    <div className="exec-progress">
      {/* Overall Progress Section */}
      <div className="exec-progress__overall">
        <div className="exec-progress__overall-header">
          <span className="exec-progress__overall-title">Overall Progress</span>
          <span className="exec-progress__overall-percent">{Math.round(overallProgress)}%</span>
        </div>
        <div className="exec-progress__overall-bar">
          <div
            className="exec-progress__overall-fill"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="exec-progress__overall-stats">
          <div className="exec-progress__stat">
            <div className="exec-progress__stat-value">{completedTasks}/{totalTasks}</div>
            <div className="exec-progress__stat-label">Tasks</div>
          </div>
          <div className="exec-progress__stat">
            <div className="exec-progress__stat-value">{activeAgents}</div>
            <div className="exec-progress__stat-label">Active Agents</div>
          </div>
          <div className="exec-progress__stat">
            <div className="exec-progress__stat-value">{agents.length}</div>
            <div className="exec-progress__stat-label">Total Agents</div>
          </div>
        </div>
      </div>

      {/* Agent Progress Bars */}
      <div className="exec-progress__agents">
        <h4 className="exec-progress__agents-title">Agent Progress</h4>
        {agents.map((agent) => (
          <AgentProgressBar key={agent.id} agent={agent} tasks={tasks} />
        ))}
      </div>

      {/* Parallel Task Lanes */}
      {tasks.length > 0 && (
        <ParallelLanes
          agents={agents}
          tasks={tasks}
          totalDuration={estimatedTotal || timeElapsed * 2}
        />
      )}

      {/* Time Display */}
      <div className="exec-progress__time">
        <div className="exec-progress__time-item">
          <span className="exec-progress__time-value">
            {elapsedTime.hours}:{elapsedTime.minutes}:{elapsedTime.seconds}
          </span>
          <span className="exec-progress__time-label">Elapsed</span>
        </div>
        <div className="exec-progress__time-item">
          <span className="exec-progress__time-value">{estimatedRemaining}</span>
          <span className="exec-progress__time-label">Remaining</span>
        </div>
      </div>
    </div>
  );
};

export default ProgressDashboard;
