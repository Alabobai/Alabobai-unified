/**
 * Accessible Button Component
 *
 * A reusable button component with built-in accessibility features:
 * - Proper ARIA labels for icon-only buttons
 * - Focus indicators
 * - Loading states with announcements
 * - Keyboard interaction support
 */

import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface AccessibleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual content of the button (icon or text) */
  children: ReactNode
  /** Accessible label for screen readers (required for icon-only buttons) */
  ariaLabel?: string
  /** Shows loading spinner and disables button */
  isLoading?: boolean
  /** Loading state announcement for screen readers */
  loadingText?: string
  /** Variant style */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
  /** Size */
  size?: 'sm' | 'md' | 'lg'
  /** Additional class names */
  className?: string
  /** Tooltip text shown on hover */
  tooltip?: string
}

const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  (
    {
      children,
      ariaLabel,
      isLoading = false,
      loadingText = 'Loading',
      variant = 'primary',
      size = 'md',
      className = '',
      tooltip,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-400 disabled:opacity-50 disabled:cursor-not-allowed'

    // Variant styles
    const variantStyles = {
      primary: 'bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 hover:from-rose-gold-300 hover:to-rose-gold-500 shadow-glow-sm',
      secondary: 'bg-dark-400 border border-white/10 text-white/80 hover:bg-white/5 hover:text-white hover:border-white/20',
      ghost: 'text-white/60 hover:text-rose-gold-400 hover:bg-rose-gold-400/10',
      danger: 'bg-rose-gold-500/10 border border-rose-gold-400/20 text-rose-gold-400 hover:bg-rose-gold-500/20',
      icon: 'text-white/50 hover:text-rose-gold-400 hover:bg-rose-gold-400/10'
    }

    // Size styles
    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
      md: 'px-4 py-2 text-sm rounded-xl gap-2',
      lg: 'px-6 py-3 text-base rounded-xl gap-2'
    }

    // Icon-only size styles
    const iconSizeStyles = {
      sm: 'p-1.5 rounded-lg',
      md: 'p-2 rounded-xl',
      lg: 'p-3 rounded-xl'
    }

    const computedClassName = [
      baseStyles,
      variantStyles[variant],
      variant === 'icon' ? iconSizeStyles[size] : sizeStyles[size],
      className
    ].join(' ')

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={computedClassName}
        aria-label={isLoading ? loadingText : ariaLabel}
        aria-busy={isLoading}
        aria-disabled={disabled || isLoading}
        title={tooltip}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            {variant !== 'icon' && <span className="sr-only">{loadingText}</span>}
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

AccessibleButton.displayName = 'AccessibleButton'

export default AccessibleButton

// ============================================================================
// Icon Button Variant (for convenience)
// ============================================================================

interface IconButtonProps extends Omit<AccessibleButtonProps, 'variant' | 'children'> {
  /** Icon component to render */
  icon: ReactNode
  /** Required accessible label */
  ariaLabel: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, ariaLabel, size = 'md', ...props }, ref) => {
    return (
      <AccessibleButton
        ref={ref}
        variant="icon"
        size={size}
        ariaLabel={ariaLabel}
        {...props}
      >
        {icon}
      </AccessibleButton>
    )
  }
)

IconButton.displayName = 'IconButton'
