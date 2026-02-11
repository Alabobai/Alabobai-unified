/**
 * ============================================================================
 * APPROVAL QUEUE MODAL COMPONENT
 * Decision prompt for agent actions requiring human approval
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ApprovalItem, ApprovalOption, ApprovalQueueProps } from './execution-preview-spec.js';
import { Icons } from './execution-preview-spec.js';

// ============================================================================
// RISK LEVEL LABEL MAPPING
// ============================================================================

const getRiskLabel = (level: ApprovalItem['riskLevel']): string => {
  switch (level) {
    case 'low':
      return 'Low Risk';
    case 'medium':
      return 'Medium Risk';
    case 'high':
      return 'High Risk';
    case 'critical':
      return 'Critical - Requires Careful Review';
    default:
      return 'Unknown Risk';
  }
};

// ============================================================================
// MAIN APPROVAL QUEUE MODAL COMPONENT
// ============================================================================

export const ApprovalQueue: React.FC<ApprovalQueueProps> = ({
  item,
  onApprove,
  onReject,
  onModify,
  selectedOption,
  onOptionSelect,
}) => {
  const [localSelectedOption, setLocalSelectedOption] = useState<string | undefined>(
    selectedOption || item.options.find((o: ApprovalOption) => o.isDefault)?.id
  );
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Reset state when item changes
  useEffect(() => {
    setLocalSelectedOption(selectedOption || item.options.find((o: ApprovalOption) => o.isDefault)?.id);
    setIsRejecting(false);
    setRejectReason('');
  }, [item, selectedOption]);

  // Handle option selection
  const handleOptionSelect = (optionId: string) => {
    setLocalSelectedOption(optionId);
    onOptionSelect?.(optionId);
  };

  // Handle approve
  const handleApprove = useCallback(() => {
    onApprove(localSelectedOption);
  }, [onApprove, localSelectedOption]);

  // Handle reject
  const handleReject = useCallback(() => {
    if (isRejecting) {
      onReject(rejectReason || undefined);
    } else {
      setIsRejecting(true);
    }
  }, [isRejecting, onReject, rejectReason]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !isRejecting) {
        e.preventDefault();
        handleApprove();
      } else if (e.key === 'Escape') {
        if (isRejecting) {
          setIsRejecting(false);
        } else {
          handleReject();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleApprove, handleReject, isRejecting]);

  // Get agent initials
  const agentInitials = item.agentName
    .split(' ')
    .map((word: string) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="exec-approval-overlay">
      <div className="exec-approval">
        {/* Attention Bar */}
        <div className={`exec-approval__attention exec-approval__attention--${item.riskLevel}`}>
          <span className="exec-approval__attention-icon">
            <Icons.AlertTriangle />
          </span>
          <span>{getRiskLabel(item.riskLevel)}</span>
        </div>

        {/* Header */}
        <div className="exec-approval__header">
          <div className="exec-approval__agent">
            <div
              className="exec-approval__agent-avatar"
              style={{ background: 'linear-gradient(135deg, rgba(217, 160, 122, 0.4), rgba(217, 160, 122, 0.2))' }}
            >
              {agentInitials}
            </div>
            <div>
              <span className="exec-approval__agent-name">{item.agentName}</span>
              <span className="exec-approval__agent-label"> requests approval</span>
            </div>
          </div>
          <h2 className="exec-approval__title">{item.action}</h2>
          <p className="exec-approval__description">{item.description}</p>
        </div>

        {/* Context Section */}
        {item.context && (
          <div className="exec-approval__context">
            <div className="exec-approval__context-label">Context</div>
            <div className="exec-approval__context-content">
              {item.context}
            </div>
          </div>
        )}

        {/* Options Section */}
        {item.options.length > 0 && (
          <div className="exec-approval__options">
            <div className="exec-approval__options-label">Choose an option</div>
            {item.options.map((option) => (
              <div
                key={option.id}
                className={[
                  'exec-approval__option',
                  localSelectedOption === option.id && 'exec-approval__option--selected',
                  option.isDestructive && 'exec-approval__option--destructive',
                ].filter(Boolean).join(' ')}
                onClick={() => handleOptionSelect(option.id)}
              >
                <div className="exec-approval__option-radio" />
                <div className="exec-approval__option-content">
                  <div className="exec-approval__option-title">
                    {option.label}
                    {option.isDefault && (
                      <span className="exec-approval__option-badge exec-approval__option-badge--default">
                        Recommended
                      </span>
                    )}
                  </div>
                  {option.description && (
                    <div className="exec-approval__option-desc">{option.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reject Reason Input */}
        {isRejecting && (
          <div className="exec-approval__context">
            <div className="exec-approval__context-label">Reason for rejection (optional)</div>
            <textarea
              className="exec-approval__context-content"
              style={{
                resize: 'vertical',
                minHeight: '60px',
                outline: 'none',
                border: '1px solid var(--exec-border)',
                background: 'rgba(0, 0, 0, 0.3)',
              }}
              placeholder="Explain why you are rejecting this action..."
              value={rejectReason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectReason(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* Actions Footer */}
        <div className="exec-approval__footer">
          <button
            className="exec-approval__btn exec-approval__btn--reject"
            onClick={handleReject}
          >
            <span className="exec-approval__btn-icon">
              <Icons.X />
            </span>
            <span>{isRejecting ? 'Confirm Reject' : 'Reject'}</span>
          </button>

          {onModify && !isRejecting && (
            <button
              className="exec-approval__btn exec-approval__btn--modify"
              onClick={onModify}
            >
              <span className="exec-approval__btn-icon">
                <Icons.Settings />
              </span>
              <span>Modify</span>
            </button>
          )}

          {!isRejecting && (
            <button
              className="exec-approval__btn exec-approval__btn--approve"
              onClick={handleApprove}
            >
              <span className="exec-approval__btn-icon">
                <Icons.Check />
              </span>
              <span>Approve</span>
            </button>
          )}
        </div>

        {/* Keyboard Hints */}
        <div className="exec-approval__hints">
          <div className="exec-approval__hint">
            <span className="exec-approval__kbd">Enter</span>
            <span>to approve</span>
          </div>
          <div className="exec-approval__hint">
            <span className="exec-approval__kbd">Esc</span>
            <span>to {isRejecting ? 'cancel' : 'reject'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// APPROVAL QUEUE MANAGER - For multiple pending approvals
// ============================================================================

export interface ApprovalQueueManagerProps {
  items: ApprovalItem[];
  onApprove: (itemId: string, optionId?: string) => void;
  onReject: (itemId: string, reason?: string) => void;
  onModify?: (itemId: string) => void;
}

export const ApprovalQueueManager: React.FC<ApprovalQueueManagerProps> = ({
  items,
  onApprove,
  onReject,
  onModify,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset index when items change
  useEffect(() => {
    if (currentIndex >= items.length) {
      setCurrentIndex(Math.max(0, items.length - 1));
    }
  }, [items, currentIndex]);

  if (items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex];

  const handleApprove = (optionId?: string) => {
    onApprove(currentItem.id, optionId);
  };

  const handleReject = (reason?: string) => {
    onReject(currentItem.id, reason);
  };

  const handleModify = onModify ? () => onModify(currentItem.id) : undefined;

  return (
    <ApprovalQueue
      item={currentItem}
      onApprove={handleApprove}
      onReject={handleReject}
      onModify={handleModify}
    />
  );
};

export default ApprovalQueue;
