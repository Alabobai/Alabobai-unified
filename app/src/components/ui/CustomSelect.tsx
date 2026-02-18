/**
 * Custom Select Component
 *
 * A luxurious dropdown select following Alabobai's rose-gold brand guidelines.
 * Replaces native <select> elements with a styled custom dropdown.
 */

import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  description?: string
  icon?: React.ReactNode
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  label,
  disabled = false,
  className = '',
  size = 'md'
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(opt => opt.value === value)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex(prev =>
            prev < options.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex(prev =>
            prev > 0 ? prev - 1 : options.length - 1
          )
          break
        case 'Enter':
          e.preventDefault()
          if (highlightedIndex >= 0) {
            onChange(options[highlightedIndex].value)
            setIsOpen(false)
          }
          break
        case 'Escape':
          setIsOpen(false)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, highlightedIndex, options, onChange])

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option]')
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex, isOpen])

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-sm',
    md: 'px-3 py-2.5 text-sm',
    lg: 'px-4 py-3 text-base'
  }

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen)
      if (!isOpen) {
        const currentIndex = options.findIndex(opt => opt.value === value)
        setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0)
      }
    }
  }

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm text-white/60 mb-2">{label}</label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2 rounded-xl
          bg-gradient-to-br from-dark-200/80 to-dark-300/60
          border border-white/10 hover:border-rose-gold-400/30
          text-white text-left
          transition-all duration-200 ease-out
          focus:outline-none focus:ring-2 focus:ring-rose-gold-400/30 focus:border-rose-gold-400/50
          disabled:opacity-50 disabled:cursor-not-allowed
          ${sizeClasses[size]}
          ${isOpen ? 'border-rose-gold-400/50 ring-2 ring-rose-gold-400/20' : ''}
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`flex-1 truncate ${!selectedOption ? 'text-white/40' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-rose-gold-400/70 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={listRef}
          className="
            absolute z-50 w-full mt-2
            bg-gradient-to-br from-dark-100 via-dark-200 to-dark-300
            border border-white/10 rounded-xl
            shadow-2xl shadow-black/50
            backdrop-blur-xl
            overflow-hidden
            animate-in fade-in slide-in-from-top-2 duration-200
          "
          role="listbox"
        >
          {/* Decorative gradient border */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-rose-gold-400/20 via-transparent to-rose-gold-400/10 pointer-events-none" />

          <div className="relative max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-rose-gold-400/20 scrollbar-track-transparent">
            {options.map((option, index) => {
              const isSelected = option.value === value
              const isHighlighted = index === highlightedIndex

              return (
                <div
                  key={option.value}
                  data-option
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    relative flex items-center gap-3 px-3 py-2.5 cursor-pointer
                    transition-all duration-150
                    ${isHighlighted ? 'bg-rose-gold-400/15' : 'hover:bg-white/5'}
                    ${isSelected ? 'text-rose-gold-400' : 'text-white'}
                  `}
                  role="option"
                  aria-selected={isSelected}
                >
                  {/* Selection indicator glow */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-gradient-to-r from-rose-gold-400/10 to-transparent pointer-events-none" />
                  )}

                  {/* Icon */}
                  {option.icon && (
                    <span className={`flex-shrink-0 ${isSelected ? 'text-rose-gold-400' : 'text-white/60'}`}>
                      {option.icon}
                    </span>
                  )}

                  {/* Label & Description */}
                  <div className="flex-1 min-w-0 relative">
                    <div className={`truncate font-medium ${isSelected ? 'text-rose-gold-400' : ''}`}>
                      {option.label}
                    </div>
                    {option.description && (
                      <div className="text-xs text-white/40 truncate mt-0.5">
                        {option.description}
                      </div>
                    )}
                  </div>

                  {/* Check mark */}
                  {isSelected && (
                    <Check className="w-4 h-4 text-rose-gold-400 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Bottom gradient fade */}
          <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-dark-300 to-transparent pointer-events-none" />
        </div>
      )}
    </div>
  )
}

export default CustomSelect
