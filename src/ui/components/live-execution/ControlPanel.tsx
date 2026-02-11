/**
 * ============================================================================
 * CONTROL PANEL COMPONENT
 * Execution controls: pause, resume, skip, takeover, cancel
 * ============================================================================
 */

import React from 'react';
import type { ControlPanelProps } from './execution-preview-spec.js';
import { Icons } from './execution-preview-spec.js';

// ============================================================================
// SPEED OPTIONS
// ============================================================================

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
];

// ============================================================================
// STATUS TEXT MAPPING
// ============================================================================

const getStatusText = (status: 'running' | 'paused' | 'complete'): string => {
  switch (status) {
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'complete':
      return 'Complete';
    default:
      return 'Unknown';
  }
};

// ============================================================================
// MAIN CONTROL PANEL COMPONENT
// ============================================================================

export const ControlPanel: React.FC<ControlPanelProps> = ({
  status,
  onPause,
  onResume,
  onSkip,
  onTakeover,
  onCancel,
  speed = 1,
  onSpeedChange,
  canPause = true,
  canSkip = true,
  canTakeover = true,
  canCancel = true,
}) => {
  const isPaused = status === 'paused';
  const isComplete = status === 'complete';

  return (
    <div className="exec-controls">
      {/* Primary Controls */}
      <div className="exec-controls__primary">
        {/* Pause/Resume Button */}
        {!isComplete && (
          isPaused ? (
            <button
              className="exec-controls__btn exec-controls__btn--resume"
              onClick={onResume}
              disabled={!canPause}
              title="Resume execution"
            >
              <span className="exec-controls__btn-icon">
                <Icons.Play />
              </span>
              <span>Resume</span>
            </button>
          ) : (
            <button
              className="exec-controls__btn exec-controls__btn--pause"
              onClick={onPause}
              disabled={!canPause}
              title="Pause execution"
            >
              <span className="exec-controls__btn-icon">
                <Icons.Pause />
              </span>
              <span>Pause</span>
            </button>
          )
        )}

        {/* Skip Button */}
        <button
          className="exec-controls__btn exec-controls__btn--skip"
          onClick={onSkip}
          disabled={!canSkip || isComplete}
          title="Skip current task"
        >
          <span className="exec-controls__btn-icon">
            <Icons.Skip />
          </span>
          <span>Skip</span>
        </button>

        {/* Takeover Button */}
        <button
          className="exec-controls__btn exec-controls__btn--takeover"
          onClick={onTakeover}
          disabled={!canTakeover || isComplete}
          title="Take over manually"
        >
          <span className="exec-controls__btn-icon">
            <Icons.Hand />
          </span>
          <span>Take Over</span>
        </button>
      </div>

      {/* Divider */}
      <div className="exec-controls__divider" />

      {/* Speed Controls */}
      {onSpeedChange && !isComplete && (
        <div className="exec-controls__speed">
          <span className="exec-controls__speed-label">Speed</span>
          <div className="exec-controls__speed-buttons">
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`exec-controls__speed-btn ${speed === option.value ? 'exec-controls__speed-btn--active' : ''}`}
                onClick={() => onSpeedChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      {onSpeedChange && !isComplete && <div className="exec-controls__divider" />}

      {/* Cancel Button */}
      <button
        className="exec-controls__btn exec-controls__btn--cancel"
        onClick={onCancel}
        disabled={!canCancel || isComplete}
        title="Cancel execution"
      >
        <span className="exec-controls__btn-icon">
          <Icons.X />
        </span>
        <span>Cancel</span>
      </button>

      {/* Status Indicator */}
      <div className="exec-controls__status">
        <span className={`exec-controls__status-dot exec-controls__status-dot--${status}`} />
        <span className="exec-controls__status-text">{getStatusText(status)}</span>
      </div>
    </div>
  );
};

export default ControlPanel;
