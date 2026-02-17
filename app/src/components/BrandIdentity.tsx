import React, { useState } from 'react'
import { BRAND } from '@/config/brand'

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg'
  glow?: boolean
  className?: string
}

const sizeMap = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
}

export function BrandMark({ size = 'md', glow = true, className = '' }: BrandMarkProps) {
  const [logoFailed, setLogoFailed] = useState(false)

  return (
    <div
      className={`${sizeMap[size]} flex items-center justify-center ${glow ? 'brand-halo-soft' : ''} ${className}`}
      aria-hidden="true"
    >
      {!logoFailed ? (
        <img
          src={BRAND.assets.logo}
          alt=""
          width={256}
          height={171}
          className="w-full h-full object-contain logo-render"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span className="font-bold">A</span>
      )}
    </div>
  )
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col leading-tight">
      <h1 className={`lux-title tracking-wide ${compact ? 'text-sm' : 'text-base'}`}>{BRAND.name}</h1>
      <p className={`lux-subtitle ${compact ? 'text-[10px]' : 'text-xs'}`}>{BRAND.tagline}</p>
    </div>
  )
}
