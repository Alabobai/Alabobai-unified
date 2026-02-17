/**
 * Skeleton Loader Components
 * Professional loading states with rose-gold shimmer effect
 */

import { ReactNode, CSSProperties } from 'react'

// Base skeleton with shimmer animation
interface SkeletonProps {
  className?: string
  children?: ReactNode
  style?: CSSProperties
}

export function Skeleton({ className = '', children, style }: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden rounded bg-white/5 ${className}`}
      style={style}
    >
      <div className="absolute inset-0 skeleton-shimmer" />
      {children}
    </div>
  )
}

// Text skeleton with different size variants
interface SkeletonTextProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  width?: string | number
  lines?: number
  className?: string
}

export function SkeletonText({
  size = 'md',
  width = '100%',
  lines = 1,
  className = ''
}: SkeletonTextProps) {
  const heights = {
    xs: 'h-3',
    sm: 'h-4',
    md: 'h-5',
    lg: 'h-6',
    xl: 'h-8'
  }

  const widths = [100, 95, 80, 70, 90, 85, 75]

  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`${heights[size]} rounded-md`}
          style={{
            width: i === lines - 1 && lines > 1
              ? `${widths[i % widths.length]}%`
              : typeof width === 'number' ? `${width}px` : width
          }}
        />
      ))}
    </div>
  )
}

// Avatar skeleton
interface SkeletonAvatarProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'circle' | 'rounded' | 'square'
  className?: string
}

export function SkeletonAvatar({
  size = 'md',
  shape = 'circle',
  className = ''
}: SkeletonAvatarProps) {
  const sizes = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  }

  const shapes = {
    circle: 'rounded-full',
    rounded: 'rounded-xl',
    square: 'rounded-none'
  }

  return (
    <Skeleton className={`${sizes[size]} ${shapes[shape]} ${className}`} />
  )
}

// Card skeleton
interface SkeletonCardProps {
  hasImage?: boolean
  hasAvatar?: boolean
  lines?: number
  className?: string
}

export function SkeletonCard({
  hasImage = false,
  hasAvatar = false,
  lines = 3,
  className = ''
}: SkeletonCardProps) {
  return (
    <div className={`morphic-card p-4 rounded-xl space-y-4 ${className}`}>
      {hasImage && (
        <Skeleton className="w-full h-40 rounded-lg" />
      )}

      <div className="flex items-start gap-3">
        {hasAvatar && <SkeletonAvatar size="md" />}

        <div className="flex-1 space-y-3">
          <SkeletonText size="lg" width="70%" />
          <SkeletonText size="sm" lines={lines} />
        </div>
      </div>
    </div>
  )
}

// Button skeleton
interface SkeletonButtonProps {
  size?: 'sm' | 'md' | 'lg'
  width?: string | number
  className?: string
}

export function SkeletonButton({
  size = 'md',
  width,
  className = ''
}: SkeletonButtonProps) {
  const sizes = {
    sm: 'h-8 w-20',
    md: 'h-10 w-24',
    lg: 'h-12 w-32'
  }

  return (
    <Skeleton
      className={`${sizes[size]} rounded-xl ${className}`}
      style={width ? { width: typeof width === 'number' ? `${width}px` : width } : undefined}
    />
  )
}

// Chat message skeleton
export function SkeletonChatMessage({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse ml-12' : 'mr-12'}`}>
      <SkeletonAvatar size="sm" shape="rounded" />
      <div className={`flex-1 morphic-card p-4 rounded-xl ${isUser ? 'bg-rose-gold-400/5' : ''}`}>
        <SkeletonText lines={3} />
      </div>
    </div>
  )
}

// List item skeleton
export function SkeletonListItem({ hasIcon = true }: { hasIcon?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
      {hasIcon && <Skeleton className="w-4 h-4 rounded" />}
      <SkeletonText size="sm" width="80%" />
    </div>
  )
}

// Table row skeleton
interface SkeletonTableRowProps {
  columns?: number
}

export function SkeletonTableRow({ columns = 4 }: SkeletonTableRowProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="flex-1">
          <SkeletonText size="sm" width={`${60 + Math.random() * 30}%`} />
        </div>
      ))}
    </div>
  )
}

// Code block skeleton
export function SkeletonCodeBlock({ lines = 8 }: { lines?: number }) {
  return (
    <div className="rounded-lg overflow-hidden border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-rose-gold-400/10 border-b border-white/10">
        <SkeletonText size="xs" width="60px" />
        <SkeletonButton size="sm" width="50px" />
      </div>

      {/* Code lines */}
      <div className="p-4 bg-black/30 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex gap-2">
            <SkeletonText size="xs" width="20px" />
            <SkeletonText
              size="xs"
              width={`${20 + Math.random() * 60}%`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// Research source skeleton
export function SkeletonSource() {
  return (
    <div className="morphic-card p-3 rounded-lg space-y-2">
      <div className="flex items-start gap-2">
        <SkeletonAvatar size="xs" shape="circle" />
        <div className="flex-1 min-w-0">
          <SkeletonText size="xs" width="90%" />
          <SkeletonText size="xs" width="60%" className="mt-1" />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Skeleton className="h-1 w-16 rounded-full" />
        <SkeletonText size="xs" width="30px" />
      </div>
    </div>
  )
}

// Panel skeleton with header and content
interface SkeletonPanelProps {
  hasHeader?: boolean
  contentLines?: number
  className?: string
}

export function SkeletonPanel({
  hasHeader = true,
  contentLines = 5,
  className = ''
}: SkeletonPanelProps) {
  return (
    <div className={`morphic-panel rounded-xl overflow-hidden ${className}`}>
      {hasHeader && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <SkeletonAvatar size="sm" shape="rounded" />
          <div className="flex-1">
            <SkeletonText size="md" width="50%" />
            <SkeletonText size="xs" width="30%" className="mt-1" />
          </div>
          <SkeletonButton size="sm" />
        </div>
      )}

      <div className="p-4 space-y-3">
        <SkeletonText lines={contentLines} />
      </div>
    </div>
  )
}

// Workspace loading skeleton
export function SkeletonWorkspace() {
  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonButton key={i} size="sm" width="70px" />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <SkeletonCodeBlock lines={12} />
      </div>
    </div>
  )
}

// Sidebar chat list skeleton
export function SkeletonChatList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </div>
  )
}

// Deep research skeleton
export function SkeletonResearchReport() {
  return (
    <div className="space-y-6 p-6">
      {/* Title */}
      <div>
        <SkeletonText size="xl" width="70%" />
        <div className="flex items-center gap-4 mt-2">
          <SkeletonText size="xs" width="80px" />
          <SkeletonText size="xs" width="60px" />
          <SkeletonText size="xs" width="70px" />
        </div>
      </div>

      {/* Summary section */}
      <SkeletonCard lines={4} className="!p-6" />

      {/* Key findings */}
      <div className="morphic-card p-6 rounded-xl space-y-3">
        <SkeletonText size="lg" width="40%" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <SkeletonAvatar size="xs" />
            <SkeletonText size="sm" width={`${70 + Math.random() * 20}%`} />
          </div>
        ))}
      </div>

      {/* Detailed analysis */}
      <SkeletonCard lines={8} className="!p-6" />
    </div>
  )
}

export default Skeleton
