/**
 * ============================================================================
 * EXECUTION PREVIEW PANEL COMPONENT
 * Live view of AI agents working - Browser, Terminal, and Editor views
 * ============================================================================
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type {
  ViewMode,
  ExecutionPreviewPanelProps,
} from './execution-preview-spec.js';
import { Icons } from './execution-preview-spec.js';

// ============================================================================
// BROWSER VIEW SUBCOMPONENT
// ============================================================================

interface BrowserViewProps {
  url?: string;
  stream?: MediaStream | string;
  cursorPosition?: { x: number; y: number };
  isClicking?: boolean;
}

const BrowserView: React.FC<BrowserViewProps> = ({
  url = 'about:blank',
  stream,
  cursorPosition,
  isClicking = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream instanceof MediaStream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="exec-browser">
      <div className="exec-browser__toolbar">
        <div className="exec-browser__traffic-lights">
          <span className="exec-browser__traffic-light exec-browser__traffic-light--close" />
          <span className="exec-browser__traffic-light exec-browser__traffic-light--minimize" />
          <span className="exec-browser__traffic-light exec-browser__traffic-light--maximize" />
        </div>
        <div className="exec-browser__address-bar">
          <span className="exec-browser__address-icon">
            <Icons.Lock />
          </span>
          <span className="exec-browser__address-text">{url}</span>
        </div>
      </div>
      <div className="exec-browser__viewport">
        {typeof stream === 'string' ? (
          <img
            src={stream}
            alt="Browser preview"
            className="exec-browser__stream"
          />
        ) : stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="exec-browser__stream"
          />
        ) : (
          <div className="exec-browser__placeholder">
            <Icons.Globe />
            <span>Waiting for browser activity...</span>
          </div>
        )}
        {cursorPosition && (
          <div className="exec-browser__cursor-overlay">
            <div
              className="exec-browser__cursor"
              style={{
                transform: `translate(${cursorPosition.x}px, ${cursorPosition.y}px)`,
              }}
            >
              <div className="exec-browser__cursor-dot" />
              {isClicking && <div className="exec-browser__click-indicator" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// TERMINAL VIEW SUBCOMPONENT
// ============================================================================

interface TerminalLine {
  type: 'command' | 'result' | 'error' | 'prompt';
  content: string;
}

interface TerminalViewProps {
  output?: string[];
  currentPath?: string;
}

const TerminalView: React.FC<TerminalViewProps> = ({
  output = [],
  currentPath = '~',
}) => {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const parseOutput = (lines: string[]): TerminalLine[] => {
    return lines.map((line) => {
      if (line.startsWith('$')) {
        return { type: 'command', content: line.substring(1).trim() };
      } else if (line.startsWith('ERROR:') || line.startsWith('error:')) {
        return { type: 'error', content: line };
      } else {
        return { type: 'result', content: line };
      }
    });
  };

  const parsedOutput = parseOutput(output);

  return (
    <div className="exec-terminal">
      <div className="exec-terminal__header">
        <span className="exec-terminal__title">Terminal</span>
        <span className="exec-terminal__path">{currentPath}</span>
      </div>
      <div className="exec-terminal__output" ref={outputRef}>
        {parsedOutput.map((line, index) => (
          <div key={index} className="exec-terminal__line">
            {line.type === 'command' && (
              <>
                <span className="exec-terminal__prompt">$</span>
                <span className="exec-terminal__command">{line.content}</span>
              </>
            )}
            {line.type === 'result' && (
              <span className="exec-terminal__result">{line.content}</span>
            )}
            {line.type === 'error' && (
              <span className="exec-terminal__error">{line.content}</span>
            )}
          </div>
        ))}
        <div className="exec-terminal__line">
          <span className="exec-terminal__prompt">$</span>
          <span className="exec-terminal__cursor" />
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// EDITOR VIEW SUBCOMPONENT
// ============================================================================

interface EditorFile {
  name: string;
  content: string;
  language: string;
  isModified?: boolean;
}

interface EditorViewProps {
  files?: EditorFile[];
  activeFile?: number;
  highlightedLines?: number[];
}

const EditorView: React.FC<EditorViewProps> = ({
  files = [],
  activeFile = 0,
  highlightedLines = [],
}) => {
  const currentFile = files[activeFile];
  const lines = currentFile?.content.split('\n') || [];

  const getFileIcon = (language: string) => {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return <Icons.FileCode />;
      default:
        return <Icons.FileCode />;
    }
  };

  return (
    <div className="exec-editor">
      <div className="exec-editor__header">
        <div className="exec-editor__tabs">
          {files.map((file, index) => (
            <button
              key={index}
              className={`exec-editor__tab ${index === activeFile ? 'exec-editor__tab--active' : ''}`}
            >
              <span className="exec-editor__tab-icon">{getFileIcon(file.language)}</span>
              <span>{file.name}</span>
              {file.isModified && <span className="exec-editor__tab-modified" />}
            </button>
          ))}
        </div>
      </div>
      <div className="exec-editor__content">
        <div className="exec-editor__line-numbers">
          {lines.map((_, index) => (
            <div
              key={index}
              className={`exec-editor__line-number ${highlightedLines.includes(index + 1) ? 'exec-editor__line-number--highlighted' : ''}`}
            >
              {index + 1}
            </div>
          ))}
        </div>
        <div className="exec-editor__code">
          {lines.map((line, index) => (
            <div
              key={index}
              className={highlightedLines.includes(index + 1) ? 'exec-editor__highlight' : ''}
            >
              {tokenizeLine(line, currentFile?.language || 'text')}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Simple syntax tokenizer
function tokenizeLine(line: string, language: string): React.ReactNode {
  if (language === 'text' || !line.trim()) {
    return <span>{line || ' '}</span>;
  }

  // Very basic tokenization - in production, use a proper syntax highlighter
  const tokens: React.ReactNode[] = [];
  const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'export', 'from', 'async', 'await', 'class', 'extends', 'interface', 'type'];
  const words = line.split(/(\s+|[{}()[\];,:.=<>!&|+\-*/])/);

  words.forEach((word, i) => {
    if (keywords.includes(word)) {
      tokens.push(<span key={i} className="exec-token--keyword">{word}</span>);
    } else if (/^["'`].*["'`]$/.test(word)) {
      tokens.push(<span key={i} className="exec-token--string">{word}</span>);
    } else if (/^\d+$/.test(word)) {
      tokens.push(<span key={i} className="exec-token--number">{word}</span>);
    } else if (word.startsWith('//')) {
      tokens.push(<span key={i} className="exec-token--comment">{word}</span>);
    } else {
      tokens.push(<span key={i}>{word}</span>);
    }
  });

  return <>{tokens}</>;
}

// ============================================================================
// MAIN EXECUTION PREVIEW PANEL COMPONENT
// ============================================================================

export const ExecutionPreviewPanel: React.FC<ExecutionPreviewPanelProps> = ({
  activeView,
  onViewChange,
  isFullscreen = false,
  isPip = false,
  onToggleFullscreen,
  onTogglePip,
  browserUrl,
  browserStream,
  terminalOutput,
  editorFiles,
  activeEditorFile,
  cursorPosition,
  isLoading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pipPosition, setPipPosition] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // PIP dragging logic
  const handlePipDragStart = useCallback((e: React.MouseEvent) => {
    if (!isPip) return;
    setIsDragging(true);
  }, [isPip]);

  const handlePipDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !panelRef.current) return;
    setPipPosition((prev) => ({
      x: prev.x + e.movementX,
      y: prev.y + e.movementY,
    }));
  }, [isDragging]);

  const handlePipDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handlePipDrag);
      window.addEventListener('mouseup', handlePipDragEnd);
      return () => {
        window.removeEventListener('mousemove', handlePipDrag);
        window.removeEventListener('mouseup', handlePipDragEnd);
      };
    }
  }, [isDragging, handlePipDrag, handlePipDragEnd]);

  const panelClasses = [
    'exec-panel',
    isFullscreen && 'exec-panel--fullscreen',
    isPip && 'exec-panel--pip',
  ].filter(Boolean).join(' ');

  const pipStyles = isPip ? {
    transform: `translate(${pipPosition.x}px, ${pipPosition.y}px)`,
  } : undefined;

  const views: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'browser', label: 'Browser', icon: <Icons.Browser /> },
    { id: 'terminal', label: 'Terminal', icon: <Icons.Terminal /> },
    { id: 'editor', label: 'Editor', icon: <Icons.Editor /> },
  ];

  return (
    <div
      ref={panelRef}
      className={panelClasses}
      style={pipStyles}
    >
      {/* Header with tabs and controls */}
      <div
        className="exec-panel__header"
        onMouseDown={handlePipDragStart}
      >
        {!isPip ? (
          <div className="exec-panel__tabs">
            {views.map((view) => (
              <button
                key={view.id}
                className={`exec-panel__tab ${activeView === view.id ? 'exec-panel__tab--active' : ''}`}
                onClick={() => onViewChange(view.id)}
              >
                <span className="exec-panel__tab-icon">{view.icon}</span>
                <span>{view.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="exec-panel__tab-indicator">
            {views.find((v) => v.id === activeView)?.icon}
            <span>{views.find((v) => v.id === activeView)?.label}</span>
          </div>
        )}

        <div className="exec-panel__controls">
          {onTogglePip && (
            <button
              className={`exec-panel__control-btn ${isPip ? 'exec-panel__control-btn--active' : ''}`}
              onClick={onTogglePip}
              title="Picture-in-Picture"
            >
              <Icons.Pip />
            </button>
          )}
          {onToggleFullscreen && (
            <button
              className={`exec-panel__control-btn ${isFullscreen ? 'exec-panel__control-btn--active' : ''}`}
              onClick={onToggleFullscreen}
              title="Fullscreen"
            >
              <Icons.Fullscreen />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="exec-panel__content">
        {isLoading && (
          <div className="exec-panel__loading">
            <div className="exec-panel__loading-spinner" />
            <span className="exec-panel__loading-text">Connecting to agent...</span>
          </div>
        )}

        <div className={`exec-view ${activeView === 'browser' ? 'exec-view--active' : ''}`}>
          <BrowserView
            url={browserUrl}
            stream={browserStream}
            cursorPosition={cursorPosition}
          />
        </div>

        <div className={`exec-view ${activeView === 'terminal' ? 'exec-view--active' : ''}`}>
          <TerminalView output={terminalOutput} />
        </div>

        <div className={`exec-view ${activeView === 'editor' ? 'exec-view--active' : ''}`}>
          <EditorView
            files={editorFiles}
            activeFile={activeEditorFile}
          />
        </div>
      </div>
    </div>
  );
};

export default ExecutionPreviewPanel;
