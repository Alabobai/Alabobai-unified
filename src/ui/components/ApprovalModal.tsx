/**
 * ApprovalModal Component
 * The "President Approval" interface - agents present, you decide
 */

import React, { useState } from 'react';

interface ApprovalRequest {
  id: string;
  agentName?: string;
  action: string;
  description: string;
  details: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface ApprovalModalProps {
  approval: ApprovalRequest;
  onApprove: () => void;
  onReject: (reason?: string) => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  approval,
  onApprove,
  onReject,
}) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical':
        return '#ef4444';
      case 'high':
        return '#f97316';
      case 'medium':
        return '#fbbf24';
      default:
        return '#4ade80';
    }
  };

  const handleReject = () => {
    if (showRejectInput) {
      onReject(rejectReason);
    } else {
      setShowRejectInput(true);
    }
  };

  return (
    <div className="approval-overlay">
      <div className="approval-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="header-icon">⚡</div>
          <h2>Approval Required</h2>
        </div>

        {/* Risk Badge */}
        <div
          className="risk-badge"
          style={{ backgroundColor: `${getRiskColor(approval.riskLevel)}20`, color: getRiskColor(approval.riskLevel) }}
        >
          {approval.riskLevel.toUpperCase()} RISK
        </div>

        {/* Agent Info */}
        {approval.agentName && (
          <div className="agent-info">
            <span className="agent-label">Agent:</span>
            <span className="agent-value">{approval.agentName}</span>
          </div>
        )}

        {/* Action Description */}
        <div className="action-section">
          <h3>Requested Action</h3>
          <p className="action-description">{approval.description}</p>
        </div>

        {/* Details */}
        {Object.keys(approval.details).length > 0 && (
          <div className="details-section">
            <h3>Details</h3>
            <div className="details-grid">
              {Object.entries(approval.details).map(([key, value]) => (
                <div key={key} className="detail-item">
                  <span className="detail-key">{key}:</span>
                  <span className="detail-value">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reject Reason Input */}
        {showRejectInput && (
          <div className="reject-reason">
            <textarea
              placeholder="Why are you rejecting this? (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
            />
          </div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          <button className="btn-reject" onClick={handleReject}>
            {showRejectInput ? 'Confirm Reject' : 'Reject'}
          </button>
          <button className="btn-approve" onClick={onApprove}>
            Approve
          </button>
        </div>

        {/* Keyboard Hints */}
        <div className="keyboard-hints">
          <span>Press <kbd>Enter</kbd> to approve</span>
          <span>Press <kbd>Esc</kbd> to reject</span>
        </div>
      </div>

      <style>{`
        .approval-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .approval-modal {
          background: linear-gradient(135deg, #1e1e2f 0%, #2d2d44 100%);
          border-radius: 20px;
          padding: 2rem;
          max-width: 480px;
          width: 90%;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .header-icon {
          font-size: 1.5rem;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #fff;
        }

        .risk-badge {
          display: inline-block;
          padding: 0.375rem 0.75rem;
          border-radius: 20px;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin-bottom: 1.25rem;
        }

        .agent-info {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .agent-label {
          color: rgba(255, 255, 255, 0.5);
        }

        .agent-value {
          color: #f5a9b8;
          font-weight: 500;
        }

        .action-section,
        .details-section {
          margin-bottom: 1.25rem;
        }

        .action-section h3,
        .details-section h3 {
          font-size: 0.6875rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0 0 0.5rem 0;
        }

        .action-description {
          margin: 0;
          font-size: 0.9375rem;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.9);
        }

        .details-grid {
          display: grid;
          gap: 0.5rem;
        }

        .detail-item {
          display: flex;
          gap: 0.5rem;
          font-size: 0.8125rem;
        }

        .detail-key {
          color: rgba(255, 255, 255, 0.5);
        }

        .detail-value {
          color: rgba(255, 255, 255, 0.9);
          word-break: break-all;
        }

        .reject-reason {
          margin-bottom: 1rem;
        }

        .reject-reason textarea {
          width: 100%;
          padding: 0.75rem;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: 0.875rem;
          resize: none;
          outline: none;
        }

        .reject-reason textarea:focus {
          border-color: rgba(255, 255, 255, 0.2);
        }

        .modal-actions {
          display: flex;
          gap: 0.75rem;
        }

        .btn-approve,
        .btn-reject {
          flex: 1;
          padding: 0.875rem 1.5rem;
          border-radius: 10px;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .btn-approve {
          background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
          color: #000;
        }

        .btn-approve:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(74, 222, 128, 0.3);
        }

        .btn-reject {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .btn-reject:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
        }

        .keyboard-hints {
          display: flex;
          justify-content: center;
          gap: 1.5rem;
          margin-top: 1rem;
          font-size: 0.6875rem;
          color: rgba(255, 255, 255, 0.4);
        }

        .keyboard-hints kbd {
          display: inline-block;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.1);
          font-family: inherit;
        }
      `}</style>
    </div>
  );
};

export default ApprovalModal;
