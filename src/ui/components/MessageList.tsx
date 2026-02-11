/**
 * MessageList Component
 * Displays chat messages with agent attribution
 */

import React from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  agentName?: string;
  agentIcon?: string;
  timestamp: Date;
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isLoading }) => {
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (message: Message) => {
    const isUser = message.role === 'user';
    const isAgent = message.role === 'agent';

    return (
      <div key={message.id} className={`message ${message.role}`}>
        {/* Avatar */}
        <div className="message-avatar">
          {isUser ? (
            <span className="user-avatar">You</span>
          ) : isAgent ? (
            <span className="agent-avatar">{message.agentIcon || '🤖'}</span>
          ) : (
            <span className="assistant-avatar">🌟</span>
          )}
        </div>

        {/* Content */}
        <div className="message-content">
          {/* Agent name if applicable */}
          {isAgent && message.agentName && (
            <div className="agent-name">{message.agentName}</div>
          )}

          {/* Message text */}
          <div className="message-text">
            {message.content.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}
                {i < message.content.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>

          {/* Timestamp */}
          <div className="message-time">{formatTime(message.timestamp)}</div>
        </div>

        <style>{`
          .message {
            display: flex;
            gap: 1rem;
            margin-bottom: 1.5rem;
            animation: fadeIn 0.3s ease;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .message.user {
            flex-direction: row-reverse;
          }

          .message-avatar {
            flex-shrink: 0;
          }

          .user-avatar,
          .agent-avatar,
          .assistant-avatar {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            font-size: 0.875rem;
            font-weight: 600;
          }

          .user-avatar {
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: #fff;
          }

          .agent-avatar {
            background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
            font-size: 1.25rem;
          }

          .assistant-avatar {
            background: linear-gradient(135deg, #f5a9b8 0%, #d4af37 100%);
            font-size: 1.25rem;
          }

          .message-content {
            max-width: 70%;
            padding: 1rem 1.25rem;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.1);
          }

          .message.user .message-content {
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            border-bottom-right-radius: 4px;
          }

          .message.assistant .message-content,
          .message.agent .message-content {
            background: rgba(255, 255, 255, 0.08);
            border-bottom-left-radius: 4px;
          }

          .agent-name {
            font-size: 0.75rem;
            font-weight: 600;
            color: #f5a9b8;
            margin-bottom: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .message-text {
            font-size: 0.9375rem;
            line-height: 1.6;
            color: rgba(255, 255, 255, 0.95);
          }

          .message-time {
            font-size: 0.6875rem;
            color: rgba(255, 255, 255, 0.4);
            margin-top: 0.5rem;
            text-align: right;
          }

          .message.user .message-time {
            color: rgba(255, 255, 255, 0.6);
          }
        `}</style>
      </div>
    );
  };

  return (
    <div className="message-list">
      {messages.map(renderMessage)}

      {/* Loading indicator */}
      {isLoading && (
        <div className="message assistant">
          <div className="message-avatar">
            <span className="assistant-avatar">🌟</span>
          </div>
          <div className="message-content">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .message-list {
          display: flex;
          flex-direction: column;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 4px;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.6);
          animation: bounce 1.4s ease-in-out infinite;
        }

        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes bounce {
          0%, 60%, 100% {
            transform: translateY(0);
          }
          30% {
            transform: translateY(-8px);
          }
        }
      `}</style>
    </div>
  );
};

export default MessageList;
