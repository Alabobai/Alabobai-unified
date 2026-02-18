/**
 * Loading Spinner Components
 * Multiple variants for different use cases with rose-gold styling
 * Includes branded Alabobai logo spinner for research and loading states
 */

import { ReactNode } from 'react'
import { BRAND } from '@/config/brand'

// Base props
interface LoadingProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  color?: 'rose-gold' | 'white' | 'current'
}

// Size mappings
const sizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12'
}

const borderSizes = {
  xs: 'border',
  sm: 'border-2',
  md: 'border-2',
  lg: 'border-[3px]',
  xl: 'border-4'
}

const dotSizes = {
  xs: 'w-1 h-1',
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
  xl: 'w-3 h-3'
}

// Color classes
const colors = {
  'rose-gold': 'text-rose-gold-400 border-rose-gold-400',
  'white': 'text-white border-white',
  'current': 'text-current border-current'
}

// Circular spinner
export function Spinner({
  size = 'md',
  color = 'rose-gold',
  className = ''
}: LoadingProps) {
  return (
    <div
      className={`${sizes[size]} rounded-full ${borderSizes[size]} border-transparent animate-spin ${className}`}
      style={{
        borderTopColor: color === 'rose-gold' ? 'var(--rose-gold)' : color === 'white' ? 'white' : 'currentColor',
        borderRightColor: color === 'rose-gold' ? 'rgba(217, 160, 122, 0.3)' : color === 'white' ? 'rgba(255,255,255,0.3)' : 'currentColor',
        borderBottomColor: color === 'rose-gold' ? 'rgba(217, 160, 122, 0.3)' : color === 'white' ? 'rgba(255,255,255,0.3)' : 'currentColor',
        borderLeftColor: color === 'rose-gold' ? 'rgba(217, 160, 122, 0.3)' : color === 'white' ? 'rgba(255,255,255,0.3)' : 'currentColor'
      }}
      role="status"
      aria-label="Loading"
    />
  )
}

// Bouncing dots
export function DotsLoader({
  size = 'md',
  color = 'rose-gold',
  className = ''
}: LoadingProps) {
  const colorClasses = color === 'rose-gold'
    ? 'bg-rose-gold-400'
    : color === 'white'
      ? 'bg-white'
      : 'bg-current'

  return (
    <div className={`flex items-center gap-1 ${className}`} role="status" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${dotSizes[size]} rounded-full ${colorClasses} animate-bounce-dot`}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

// Pulsing circle
export function PulseLoader({
  size = 'md',
  color = 'rose-gold',
  className = ''
}: LoadingProps) {
  return (
    <div className={`relative ${sizes[size]} ${className}`} role="status" aria-label="Loading">
      <div
        className={`absolute inset-0 rounded-full animate-ping opacity-75`}
        style={{
          backgroundColor: color === 'rose-gold' ? 'rgba(217, 160, 122, 0.4)' : color === 'white' ? 'rgba(255,255,255,0.4)' : 'currentColor'
        }}
      />
      <div
        className={`relative rounded-full ${sizes[size]}`}
        style={{
          backgroundColor: color === 'rose-gold' ? 'var(--rose-gold)' : color === 'white' ? 'white' : 'currentColor'
        }}
      />
    </div>
  )
}

// Linear progress bar
interface ProgressBarProps {
  progress?: number // 0-100, undefined for indeterminate
  size?: 'xs' | 'sm' | 'md'
  className?: string
  showLabel?: boolean
}

export function ProgressBar({
  progress,
  size = 'md',
  className = '',
  showLabel = false
}: ProgressBarProps) {
  const heights = {
    xs: 'h-1',
    sm: 'h-1.5',
    md: 'h-2'
  }

  const isIndeterminate = progress === undefined

  return (
    <div className={`w-full ${className}`}>
      <div className={`w-full bg-white/10 rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className={`${heights[size]} bg-gradient-to-r from-rose-gold-400 to-rose-gold-300 rounded-full transition-all duration-300 ease-out relative ${
            isIndeterminate ? 'animate-progress-indeterminate' : ''
          }`}
          style={!isIndeterminate ? { width: `${Math.min(100, Math.max(0, progress))}%` } : undefined}
        >
          <div className="absolute inset-0 skeleton-shimmer" />
        </div>
      </div>
      {showLabel && !isIndeterminate && (
        <div className="flex justify-end mt-1">
          <span className="text-xs text-rose-gold-400">{Math.round(progress)}%</span>
        </div>
      )}
    </div>
  )
}

// Full page loading overlay
interface LoadingOverlayProps {
  visible: boolean
  message?: string
  children?: ReactNode
}

export function LoadingOverlay({ visible, message, children }: LoadingOverlayProps) {
  if (!visible) return null

  return (
    <div className="absolute inset-0 bg-dark-500/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="text-center">
        <Spinner size="xl" className="mx-auto mb-4" />
        {message && (
          <p className="text-white/70 text-sm">{message}</p>
        )}
        {children}
      </div>
    </div>
  )
}

// Inline loading state with text
interface LoadingTextProps {
  text?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingText({
  text = 'Loading...',
  size = 'md',
  className = ''
}: LoadingTextProps) {
  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  const spinnerSizes = {
    sm: 'xs' as const,
    md: 'sm' as const,
    lg: 'md' as const
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Spinner size={spinnerSizes[size]} />
      <span className={`text-white/60 ${textSizes[size]}`}>{text}</span>
    </div>
  )
}

// Typing/thinking indicator (like AI typing)
export function ThinkingIndicator({
  size = 'md',
  className = ''
}: LoadingProps) {
  return (
    <div className={`typing-indicator ${className}`} role="status" aria-label="Thinking">
      <span />
      <span />
      <span />
    </div>
  )
}

// Gradient spinner with glow effect
export function GlowSpinner({
  size = 'md',
  className = ''
}: LoadingProps) {
  return (
    <div className={`relative ${sizes[size]} ${className}`} role="status" aria-label="Loading">
      {/* Glow effect */}
      <div
        className="absolute inset-0 rounded-full animate-pulse opacity-50"
        style={{
          boxShadow: '0 0 20px rgba(217, 160, 122, 0.5), 0 0 40px rgba(217, 160, 122, 0.3)'
        }}
      />
      {/* Spinner */}
      <div
        className={`${sizes[size]} rounded-full ${borderSizes[size]} border-transparent animate-spin`}
        style={{
          borderTopColor: 'var(--rose-gold)',
          borderRightColor: 'transparent',
          borderBottomColor: 'rgba(217, 160, 122, 0.5)',
          borderLeftColor: 'transparent'
        }}
      />
    </div>
  )
}

// Skeleton loading button
export function LoadingButton({
  loading,
  children,
  className = '',
  disabled,
  ...props
}: {
  loading: boolean
  children: ReactNode
  className?: string
  disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`relative ${className} ${loading ? 'pointer-events-none' : ''}`}
      disabled={disabled || loading}
      {...props}
    >
      <span className={loading ? 'invisible' : ''}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" color="current" />
        </span>
      )}
    </button>
  )
}

// Content placeholder with loading state
interface ContentLoaderProps {
  loading: boolean
  children: ReactNode
  skeleton?: ReactNode
  className?: string
  minHeight?: string
}

export function ContentLoader({
  loading,
  children,
  skeleton,
  className = '',
  minHeight = '100px'
}: ContentLoaderProps) {
  if (loading) {
    return (
      <div className={`animate-pulse ${className}`} style={{ minHeight }}>
        {skeleton || (
          <div className="space-y-3 p-4">
            <div className="h-4 bg-white/10 rounded w-3/4" />
            <div className="h-4 bg-white/10 rounded w-1/2" />
            <div className="h-4 bg-white/10 rounded w-5/6" />
          </div>
        )}
      </div>
    )
  }

  return <>{children}</>
}

// Branded Alabobai logo spinner for research and loading states
interface BrandedLogoSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showGlow?: boolean
  pulseRing?: boolean
}

const logoSizePx = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80
}

const containerSizePx = {
  sm: 48,
  md: 72,
  lg: 96,
  xl: 120
}

export function BrandedLogoSpinner({
  size = 'md',
  className = '',
  showGlow = true,
  pulseRing = true
}: BrandedLogoSpinnerProps) {
  const logoSize = logoSizePx[size]
  const containerSize = containerSizePx[size]

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: containerSize, height: containerSize }}
      role="status"
      aria-label="Loading"
    >
      {/* Outer rotating ring */}
      {pulseRing && (
        <div
          className="absolute inset-0 rounded-full border-2 border-rose-gold-400/50 animate-spin"
          style={{ animationDuration: '3s' }}
        />
      )}

      {/* Secondary inner ring */}
      {pulseRing && (
        <div
          className="absolute rounded-full border border-rose-gold-400/30"
          style={{
            inset: 6,
            animationDuration: '2s',
            animation: 'spin 2s linear infinite reverse'
          }}
        />
      )}

      {/* Glow background circle */}
      {showGlow && (
        <div
          className="absolute rounded-full animate-pulse"
          style={{
            width: logoSize + 16,
            height: logoSize + 16,
            background: 'radial-gradient(circle, rgba(217, 160, 122, 0.3) 0%, rgba(217, 160, 122, 0.1) 50%, transparent 70%)',
            boxShadow: '0 0 40px rgba(217, 160, 122, 0.6), 0 0 80px rgba(217, 160, 122, 0.3)'
          }}
        />
      )}

      {/* Logo container with background */}
      <div
        className="relative rounded-full flex items-center justify-center overflow-visible"
        style={{
          width: logoSize + 8,
          height: logoSize + 8,
          background: 'radial-gradient(circle, rgba(26, 20, 16, 0.9) 0%, rgba(10, 8, 5, 0.95) 100%)',
          border: '2px solid rgba(217, 160, 122, 0.4)',
          boxShadow: 'inset 0 0 20px rgba(217, 160, 122, 0.2), 0 0 20px rgba(217, 160, 122, 0.3)'
        }}
      >
        {/* Logo image with pulse animation (not spin - logo stays upright) */}
        <img
          src={BRAND.assets.logo}
          alt={BRAND.name}
          style={{
            width: logoSize,
            height: logoSize,
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 12px rgba(217, 160, 122, 0.8))',
            animation: 'pulse 2s ease-in-out infinite'
          }}
        />
      </div>
    </div>
  )
}

// Research-specific loading with branded logo
interface ResearchLoadingProps {
  message?: string
  progress?: number
  className?: string
}

export function ResearchLoading({
  message = 'Researching...',
  progress,
  className = ''
}: ResearchLoadingProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <BrandedLogoSpinner size="lg" />
      <div className="text-center">
        <p className="text-white/70 text-sm">{message}</p>
        {progress !== undefined && (
          <div className="mt-2 w-48">
            <ProgressBar progress={progress} size="sm" showLabel />
          </div>
        )}
      </div>
    </div>
  )
}

export default Spinner
