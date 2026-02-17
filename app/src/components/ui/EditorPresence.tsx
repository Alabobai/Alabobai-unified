/**
 * EditorPresence Component
 * Shows collaborator cursors and selections in code editors
 */

import { useEffect, useState, useMemo } from 'react'
import { usePresenceStore, UserPresence } from '@/stores/presenceStore'

interface EditorPresenceProps {
  filePath?: string
  editorRef?: React.RefObject<any>
  className?: string
}

/**
 * EditorPresence - Renders remote cursors and selections
 * This component is designed to overlay on Monaco Editor
 */
export default function EditorPresence({
  filePath,
  editorRef,
  className = '',
}: EditorPresenceProps) {
  const { users, getUsersViewingFile } = usePresenceStore()
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map())

  // Get users viewing this file
  const relevantUsers = useMemo(() => {
    if (filePath) {
      return getUsersViewingFile(filePath)
    }
    return users.filter(u => u.cursor || u.selection)
  }, [users, filePath, getUsersViewingFile])

  // Update cursor positions periodically for smooth animation
  useEffect(() => {
    const interval = setInterval(() => {
      const newCursors = new Map<string, CursorPosition>()

      relevantUsers.forEach(user => {
        if (user.cursor) {
          newCursors.set(user.id, {
            userId: user.id,
            userName: user.name,
            userColor: user.color,
            lineNumber: user.cursor.lineNumber || 1,
            column: user.cursor.column || 1,
            timestamp: user.cursor.timestamp,
          })
        }
      })

      setCursors(newCursors)
    }, 100)

    return () => clearInterval(interval)
  }, [relevantUsers])

  if (relevantUsers.length === 0) {
    return null
  }

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* Render cursors */}
      {Array.from(cursors.values()).map(cursor => (
        <RemoteCursor
          key={cursor.userId}
          cursor={cursor}
          editorRef={editorRef}
        />
      ))}

      {/* Render selections */}
      {relevantUsers
        .filter(u => u.selection)
        .map(user => (
          <RemoteSelection
            key={`selection-${user.id}`}
            user={user}
            editorRef={editorRef}
          />
        ))}
    </div>
  )
}

interface CursorPosition {
  userId: string
  userName: string
  userColor: string
  lineNumber: number
  column: number
  timestamp: Date
}

interface RemoteCursorProps {
  cursor: CursorPosition
  editorRef?: React.RefObject<any>
}

/**
 * RemoteCursor - Renders a single remote cursor with label
 */
function RemoteCursor({ cursor, editorRef }: RemoteCursorProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    // Calculate position based on line number and column
    // In a real implementation, this would use Monaco's coordinate APIs
    const lineHeight = 19 // Default Monaco line height
    const charWidth = 7.8 // Approximate character width

    const top = (cursor.lineNumber - 1) * lineHeight + 16 // Account for padding
    const left = (cursor.column - 1) * charWidth + 50 // Account for line numbers

    setPosition({ top, left })

    // Hide after inactivity
    const timeout = setTimeout(() => setIsVisible(false), 5000)
    setIsVisible(true)

    return () => clearTimeout(timeout)
  }, [cursor.lineNumber, cursor.column])

  if (!isVisible) return null

  return (
    <div
      className="absolute transition-all duration-150 ease-out"
      style={{
        top: position.top,
        left: position.left,
        zIndex: 10,
      }}
    >
      {/* Cursor line */}
      <div
        className="w-0.5 h-5 animate-pulse"
        style={{ backgroundColor: cursor.userColor }}
      />

      {/* Name label */}
      <div
        className="absolute left-0 -top-5 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shadow-sm animate-fade-in"
        style={{
          backgroundColor: cursor.userColor,
          color: getContrastColor(cursor.userColor),
        }}
      >
        {cursor.userName}
      </div>
    </div>
  )
}

interface RemoteSelectionProps {
  user: UserPresence
  editorRef?: React.RefObject<any>
}

/**
 * RemoteSelection - Renders a selection highlight
 */
function RemoteSelection({ user, editorRef }: RemoteSelectionProps) {
  if (!user.selection) return null

  const { startLine, startColumn, endLine, endColumn } = user.selection
  const lineHeight = 19
  const charWidth = 7.8

  // For single line selection
  if (startLine === endLine) {
    return (
      <div
        className="absolute transition-all duration-100"
        style={{
          top: (startLine - 1) * lineHeight + 16,
          left: (startColumn - 1) * charWidth + 50,
          width: (endColumn - startColumn) * charWidth,
          height: lineHeight,
          backgroundColor: user.color,
          opacity: 0.2,
          borderRadius: 2,
        }}
      />
    )
  }

  // For multi-line selection
  const lines = []
  for (let line = startLine; line <= endLine; line++) {
    const isFirst = line === startLine
    const isLast = line === endLine

    lines.push(
      <div
        key={line}
        className="absolute transition-all duration-100"
        style={{
          top: (line - 1) * lineHeight + 16,
          left: isFirst ? (startColumn - 1) * charWidth + 50 : 50,
          width: isLast
            ? (endColumn - (isFirst ? startColumn : 1)) * charWidth
            : 'calc(100% - 50px)',
          height: lineHeight,
          backgroundColor: user.color,
          opacity: 0.15,
        }}
      />
    )
  }

  return <>{lines}</>
}

/**
 * EditorPresenceBar - Shows who's editing at the top of the editor
 */
interface EditorPresenceBarProps {
  filePath?: string
  className?: string
}

export function EditorPresenceBar({
  filePath,
  className = '',
}: EditorPresenceBarProps) {
  const { users, getUsersViewingFile } = usePresenceStore()

  const relevantUsers = useMemo(() => {
    if (filePath) {
      return getUsersViewingFile(filePath)
    }
    return users.filter(u => u.activity === 'editing')
  }, [users, filePath, getUsersViewingFile])

  if (relevantUsers.length === 0) return null

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-1.5
        bg-dark-400/80 backdrop-blur-sm
        border-b border-white/10
        ${className}
      `}
    >
      <span className="text-xs text-white/40">Editing:</span>
      <div className="flex -space-x-1">
        {relevantUsers.slice(0, 5).map(user => (
          <div
            key={user.id}
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium border border-dark-400"
            style={{ backgroundColor: user.color }}
            title={user.name}
          >
            {user.name.charAt(0)}
          </div>
        ))}
        {relevantUsers.length > 5 && (
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium bg-dark-300 border border-white/20 text-white/60">
            +{relevantUsers.length - 5}
          </div>
        )}
      </div>
      {relevantUsers.some(u => u.isTyping && u.typingIn === 'editor') && (
        <span className="text-xs text-white/40 animate-pulse ml-2">
          Someone is typing...
        </span>
      )}
    </div>
  )
}

/**
 * Get contrasting text color for a background
 */
function getContrastColor(hexColor: string): string {
  // Convert hex to RGB
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}
