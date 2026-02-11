/**
 * Alabobai Chat Interface
 * The main chat component - like ChatGPT but connected to your AI cabinet
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageList } from './MessageList.js';
import { AgentActivity } from './AgentActivity.js';
import { ApprovalModal } from './ApprovalModal.js';
import { VoiceInput } from './VoiceInput.js';

// Types
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  agentName?: string;
  agentIcon?: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
}

interface Agent {
  id: string;
  name: string;
  icon: string;
  status: 'idle' | 'working' | 'waiting-approval';
  currentTask?: string;
}

interface ApprovalRequest {
  id: string;
  agentName: string;
  action: string;
  description: string;
  details: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface ChatInterfaceProps {
  apiUrl?: string;
  wsUrl?: string;
  userId?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  apiUrl = 'http://localhost:8888/api',
  wsUrl = 'ws://localhost:8888',
  userId = 'default',
}) => {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // WebSocket connection
  useEffect(() => {
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);

    const ws = new WebSocket(`${wsUrl}?sessionId=${newSessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Chat] WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (e) {
        console.error('[Chat] Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      console.log('[Chat] WebSocket disconnected');
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('[Chat] WebSocket error:', error);
    };

    // Add welcome message
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Welcome to Alabobai! I'm your AI operating system with a team of specialized agents ready to help you.\n\nI can:\n- Give you advice on finance, business, health, and more\n- Control your computer and automate tasks\n- Build apps and websites for you\n- Research any topic\n\nWhat would you like to accomplish today?`,
        timestamp: new Date(),
      },
    ]);

    return () => {
      ws.close();
    };
  }, [wsUrl]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((data: { event: string; data: unknown }) => {
    switch (data.event) {
      case 'connected':
        const connData = data.data as { agents: Agent[] };
        setAgents(connData.agents);
        break;

      case 'chat-response':
        const response = data.data as Message;
        setMessages((prev) => [
          ...prev,
          {
            ...response,
            role: response.agentName ? 'agent' : 'assistant',
            timestamp: new Date(),
          },
        ]);
        setIsLoading(false);
        break;

      case 'agent-started':
        const startData = data.data as { agentId: string; taskId: string };
        setAgents((prev) =>
          prev.map((a) =>
            a.id === startData.agentId ? { ...a, status: 'working' } : a
          )
        );
        break;

      case 'agent-completed':
        const completeData = data.data as { agentId: string };
        setAgents((prev) =>
          prev.map((a) =>
            a.id === completeData.agentId ? { ...a, status: 'idle' } : a
          )
        );
        break;

      case 'approval-requested':
        const approvalData = data.data as ApprovalRequest;
        setPendingApproval(approvalData);
        break;

      case 'approval-resolved':
        setPendingApproval(null);
        break;

      default:
        console.log('[Chat] Unknown event:', data.event);
    }
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const sendMessage = async () => {
    const content = input.trim();
    if (!content || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
      status: 'sending',
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Send via WebSocket or REST
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat',
          content,
          userId,
        })
      );
    } else {
      // Fallback to REST
      try {
        const response = await fetch(`${apiUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, userId, content }),
        });
        const data = await response.json();
        setMessages((prev) => [
          ...prev,
          {
            ...data.message,
            role: data.message.agentName ? 'agent' : 'assistant',
            timestamp: new Date(),
          },
        ]);
      } catch (error) {
        console.error('[Chat] Failed to send message:', error);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.',
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Handle approval response
  const handleApproval = async (approved: boolean, reason?: string) => {
    if (!pendingApproval) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'approve',
          approvalId: pendingApproval.id,
          approved,
          reason,
        })
      );
    }

    setPendingApproval(null);
  };

  // Handle voice input
  const handleVoiceTranscript = (transcript: string) => {
    setInput(transcript);
    setIsVoiceActive(false);
    // Auto-send after voice
    setTimeout(() => sendMessage(), 100);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="alabobai-chat">
      {/* Header */}
      <header className="chat-header">
        <div className="logo">
          <span className="logo-icon">🌟</span>
          <span className="logo-text">Alabobai</span>
        </div>
        <div className="status">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="chat-main">
        {/* Agent Activity Sidebar */}
        <aside className="agent-sidebar">
          <AgentActivity agents={agents} />
        </aside>

        {/* Chat Area */}
        <div className="chat-area">
          <MessageList messages={messages} isLoading={isLoading} />
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="chat-input-area">
        <div className="input-container">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything or tell me what to do..."
            rows={1}
            disabled={isLoading}
          />
          <div className="input-actions">
            <VoiceInput
              isActive={isVoiceActive}
              onStart={() => setIsVoiceActive(true)}
              onStop={() => setIsVoiceActive(false)}
              onTranscript={handleVoiceTranscript}
            />
            <button
              className="send-button"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <span className="loading-spinner" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <div className="input-hint">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>

      {/* Approval Modal */}
      {pendingApproval && (
        <ApprovalModal
          approval={pendingApproval}
          onApprove={() => handleApproval(true)}
          onReject={(reason: string | undefined) => handleApproval(false, reason)}
        />
      )}

      {/* Styles */}
      <style>{`
        .alabobai-chat {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .logo-icon {
          font-size: 1.5rem;
        }

        .logo-text {
          font-size: 1.25rem;
          font-weight: 600;
          background: linear-gradient(135deg, #f5a9b8 0%, #d4af37 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.7);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-dot.connected {
          background: #4ade80;
          box-shadow: 0 0 8px #4ade80;
        }

        .status-dot.disconnected {
          background: #ef4444;
        }

        .chat-main {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .agent-sidebar {
          width: 280px;
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          overflow-y: auto;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.2);
        }

        .chat-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }

        .chat-input-area {
          padding: 1rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .input-container {
          display: flex;
          gap: 0.75rem;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 0.75rem 1rem;
        }

        .input-container textarea {
          flex: 1;
          background: transparent;
          border: none;
          color: #fff;
          font-size: 1rem;
          resize: none;
          outline: none;
          min-height: 24px;
          max-height: 200px;
        }

        .input-container textarea::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .input-actions {
          display: flex;
          gap: 0.5rem;
          align-items: flex-end;
        }

        .send-button {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f5a9b8 0%, #d4af37 100%);
          border: none;
          color: #1a1a2e;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, opacity 0.2s;
        }

        .send-button:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .send-button svg {
          width: 20px;
          height: 20px;
        }

        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .input-hint {
          text-align: center;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 0.5rem;
        }

        @media (max-width: 768px) {
          .agent-sidebar {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};

export default ChatInterface;
