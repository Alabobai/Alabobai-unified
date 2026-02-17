/**
 * Canvas-based Image Editor Component
 * Features:
 * - Basic filters (brightness, contrast, saturation, blur)
 * - Crop and resize
 * - Text overlays with customization
 * - Drawing/annotation tools
 * - Undo/redo stack
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Undo2, Redo2, Download, Copy, RotateCcw, Type, Pencil,
  Square, Circle, Eraser, Move, Crop, Sun, Contrast, Droplet,
  Palette, ZoomIn, ZoomOut, Pipette, Trash2, Check, X,
  ChevronDown, MousePointer, Minus, PaintBucket
} from 'lucide-react'

interface ImageEditorProps {
  imageUrl: string
  onSave?: (dataUrl: string) => void
  onClose?: () => void
  width?: number
  height?: number
}

interface Filter {
  brightness: number
  contrast: number
  saturation: number
  blur: number
  sepia: number
  grayscale: number
  hueRotate: number
  invert: number
}

interface TextOverlay {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  fontFamily: string
  color: string
  bold: boolean
  italic: boolean
  rotation: number
}

interface DrawingPath {
  type: 'path' | 'rect' | 'circle' | 'line' | 'text'
  points?: { x: number; y: number }[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  color: string
  lineWidth: number
  text?: string
  fontSize?: number
}

interface HistoryState {
  imageData: ImageData | null
  filter: Filter
  textOverlays: TextOverlay[]
}

type Tool = 'select' | 'draw' | 'rect' | 'circle' | 'line' | 'text' | 'eraser' | 'crop' | 'eyedropper' | 'fill'

const FONTS = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Courier New',
  'Impact',
  'Comic Sans MS',
  'Trebuchet MS',
  'Palatino Linotype'
]

const DEFAULT_FILTER: Filter = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  hueRotate: 0,
  invert: 0
}

export default function ImageEditor({
  imageUrl,
  onSave,
  onClose,
  width = 800,
  height = 600
}: ImageEditorProps) {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // State
  const [isLoading, setIsLoading] = useState(true)
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null)
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#ffffff')
  const [lineWidth, setLineWidth] = useState(4)
  const [fontSize, setFontSize] = useState(32)
  const [fontFamily, setFontFamily] = useState('Arial')
  const [textInput, setTextInput] = useState('')
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // History for undo/redo
  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState<DrawingPath | null>(null)
  const [drawingPaths, setDrawingPaths] = useState<DrawingPath[]>([])

  // Crop state
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [isCropping, setIsCropping] = useState(false)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setOriginalImage(img)
      setIsLoading(false)
    }
    img.onerror = () => {
      console.error('Failed to load image')
      setIsLoading(false)
    }
    img.src = imageUrl
  }, [imageUrl])

  // Render canvas when image or filter changes
  useEffect(() => {
    if (!originalImage || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match image
    canvas.width = originalImage.naturalWidth
    canvas.height = originalImage.naturalHeight

    // Apply filters
    ctx.filter = `
      brightness(${filter.brightness}%)
      contrast(${filter.contrast}%)
      saturate(${filter.saturation}%)
      blur(${filter.blur}px)
      sepia(${filter.sepia}%)
      grayscale(${filter.grayscale}%)
      hue-rotate(${filter.hueRotate}deg)
      invert(${filter.invert}%)
    `

    // Draw image
    ctx.drawImage(originalImage, 0, 0)

    // Reset filter for drawing paths
    ctx.filter = 'none'

    // Draw paths
    for (const path of drawingPaths) {
      drawPath(ctx, path)
    }

    // Draw text overlays
    for (const overlay of textOverlays) {
      drawTextOverlay(ctx, overlay)
    }
  }, [originalImage, filter, drawingPaths, textOverlays])

  // Draw a path on canvas
  const drawPath = (ctx: CanvasRenderingContext2D, path: DrawingPath) => {
    ctx.strokeStyle = path.color
    ctx.fillStyle = path.color
    ctx.lineWidth = path.lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    switch (path.type) {
      case 'path':
        if (!path.points || path.points.length < 2) return
        ctx.beginPath()
        ctx.moveTo(path.points[0].x, path.points[0].y)
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y)
        }
        ctx.stroke()
        break

      case 'rect':
        if (!path.start || !path.end) return
        ctx.strokeRect(
          path.start.x,
          path.start.y,
          path.end.x - path.start.x,
          path.end.y - path.start.y
        )
        break

      case 'circle':
        if (!path.start || !path.end) return
        const radius = Math.sqrt(
          Math.pow(path.end.x - path.start.x, 2) +
          Math.pow(path.end.y - path.start.y, 2)
        )
        ctx.beginPath()
        ctx.arc(path.start.x, path.start.y, radius, 0, Math.PI * 2)
        ctx.stroke()
        break

      case 'line':
        if (!path.start || !path.end) return
        ctx.beginPath()
        ctx.moveTo(path.start.x, path.start.y)
        ctx.lineTo(path.end.x, path.end.y)
        ctx.stroke()
        break
    }
  }

  // Draw text overlay
  const drawTextOverlay = (ctx: CanvasRenderingContext2D, overlay: TextOverlay) => {
    ctx.save()
    ctx.translate(overlay.x, overlay.y)
    ctx.rotate((overlay.rotation * Math.PI) / 180)

    const fontStyle = `${overlay.italic ? 'italic ' : ''}${overlay.bold ? 'bold ' : ''}${overlay.fontSize}px ${overlay.fontFamily}`
    ctx.font = fontStyle
    ctx.fillStyle = overlay.color
    ctx.textBaseline = 'top'

    // Draw text with shadow for better visibility
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
    ctx.fillText(overlay.text, 0, 0)

    ctx.restore()
  }

  // Get mouse position relative to canvas
  const getCanvasPosition = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPosition(e)

    if (tool === 'eyedropper') {
      pickColor(pos.x, pos.y)
      return
    }

    if (tool === 'text') {
      // Create text overlay at click position
      if (textInput.trim()) {
        const newOverlay: TextOverlay = {
          id: crypto.randomUUID(),
          text: textInput,
          x: pos.x,
          y: pos.y,
          fontSize,
          fontFamily,
          color,
          bold: false,
          italic: false,
          rotation: 0
        }
        setTextOverlays(prev => [...prev, newOverlay])
        saveToHistory()
      }
      return
    }

    if (tool === 'crop') {
      setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 })
      setIsCropping(true)
      return
    }

    if (['draw', 'eraser', 'rect', 'circle', 'line'].includes(tool)) {
      setIsDrawing(true)

      const pathType = tool === 'draw' || tool === 'eraser' ? 'path' : tool as DrawingPath['type']
      const pathColor = tool === 'eraser' ? '#000000' : color

      setCurrentPath({
        type: pathType,
        points: pathType === 'path' ? [pos] : undefined,
        start: pathType !== 'path' ? pos : undefined,
        color: pathColor,
        lineWidth: tool === 'eraser' ? lineWidth * 3 : lineWidth
      })
    }
  }

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getCanvasPosition(e)

    if (isCropping && cropRect) {
      setCropRect(prev => prev ? {
        ...prev,
        w: pos.x - prev.x,
        h: pos.y - prev.y
      } : null)
      return
    }

    if (!isDrawing || !currentPath) return

    if (currentPath.type === 'path') {
      setCurrentPath(prev => prev ? {
        ...prev,
        points: [...(prev.points || []), pos]
      } : null)
    } else {
      setCurrentPath(prev => prev ? {
        ...prev,
        end: pos
      } : null)
    }

    // Draw current path on overlay canvas
    const overlayCanvas = overlayCanvasRef.current
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        if (currentPath) {
          drawPath(ctx, currentPath)
        }
      }
    }
  }

  // Handle mouse up
  const handleMouseUp = () => {
    if (isCropping && cropRect) {
      setIsCropping(false)
      return
    }

    if (isDrawing && currentPath) {
      setDrawingPaths(prev => [...prev, currentPath])
      setCurrentPath(null)
      saveToHistory()
    }
    setIsDrawing(false)

    // Clear overlay canvas
    const overlayCanvas = overlayCanvasRef.current
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d')
      ctx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
    }
  }

  // Pick color from canvas
  const pickColor = (x: number, y: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pixel = ctx.getImageData(x, y, 1, 1).data
    const hex = '#' + [pixel[0], pixel[1], pixel[2]]
      .map(c => c.toString(16).padStart(2, '0'))
      .join('')
    setColor(hex)
    setTool('draw')
  }

  // Save current state to history
  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      return [...newHistory, {
        imageData,
        filter: { ...filter },
        textOverlays: [...textOverlays]
      }]
    })
    setHistoryIndex(prev => prev + 1)
  }, [filter, textOverlays, historyIndex])

  // Undo
  const handleUndo = () => {
    if (historyIndex <= 0) return

    const prevState = history[historyIndex - 1]
    if (prevState) {
      setFilter(prevState.filter)
      setTextOverlays(prevState.textOverlays)

      if (prevState.imageData) {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (ctx && prevState.imageData) {
          ctx.putImageData(prevState.imageData, 0, 0)
        }
      }

      setHistoryIndex(prev => prev - 1)
    }
  }

  // Redo
  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return

    const nextState = history[historyIndex + 1]
    if (nextState) {
      setFilter(nextState.filter)
      setTextOverlays(nextState.textOverlays)

      if (nextState.imageData) {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (ctx && nextState.imageData) {
          ctx.putImageData(nextState.imageData, 0, 0)
        }
      }

      setHistoryIndex(prev => prev + 1)
    }
  }

  // Reset filters
  const handleReset = () => {
    setFilter(DEFAULT_FILTER)
    setDrawingPaths([])
    setTextOverlays([])
    saveToHistory()
  }

  // Apply crop
  const applyCrop = () => {
    if (!cropRect || !canvasRef.current || !originalImage) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Normalize crop rect (handle negative dimensions)
    const x = cropRect.w < 0 ? cropRect.x + cropRect.w : cropRect.x
    const y = cropRect.h < 0 ? cropRect.y + cropRect.h : cropRect.y
    const w = Math.abs(cropRect.w)
    const h = Math.abs(cropRect.h)

    if (w < 10 || h < 10) {
      setCropRect(null)
      return
    }

    // Get cropped image data
    const imageData = ctx.getImageData(x, y, w, h)

    // Resize canvas
    canvas.width = w
    canvas.height = h

    // Put cropped data
    ctx.putImageData(imageData, 0, 0)

    setCropRect(null)
    setTool('select')
    saveToHistory()
  }

  // Cancel crop
  const cancelCrop = () => {
    setCropRect(null)
    setTool('select')
  }

  // Export image
  const handleExport = (format: 'png' | 'jpg' | 'webp' = 'png') => {
    const canvas = canvasRef.current
    if (!canvas) return

    const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`
    const quality = format === 'jpg' ? 0.92 : undefined
    const dataUrl = canvas.toDataURL(mimeType, quality)

    onSave?.(dataUrl)

    // Download
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `edited-image.${format}`
    link.click()
  }

  // Copy to clipboard
  const handleCopy = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(blob)
          else reject(new Error('Failed to create blob'))
        }, 'image/png')
      })

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // Filter slider component
  const FilterSlider = ({
    label,
    value,
    min,
    max,
    onChange,
    icon: Icon
  }: {
    label: string
    value: number
    min: number
    max: number
    onChange: (v: number) => void
    icon: React.ElementType
  }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-white/60">
          <Icon className="w-3 h-3" />
          {label}
        </div>
        <span className="text-white/80">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-gold-400"
      />
    </div>
  )

  // Tool button component
  const ToolButton = ({
    toolName,
    icon: Icon,
    label
  }: {
    toolName: Tool
    icon: React.ElementType
    label: string
  }) => (
    <button
      onClick={() => setTool(toolName)}
      title={label}
      className={`p-2 rounded-lg transition-all ${
        tool === toolName
          ? 'bg-rose-gold-400/30 text-rose-gold-400'
          : 'text-white/60 hover:text-white hover:bg-white/10'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 bg-dark-500 rounded-xl">
        <div className="animate-spin w-8 h-8 border-2 border-rose-gold-400 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-dark-500 rounded-xl overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-white/10 bg-dark-400/50">
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-2 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-white/10 mx-2" />

          {/* Tools */}
          <ToolButton toolName="select" icon={MousePointer} label="Select" />
          <ToolButton toolName="draw" icon={Pencil} label="Draw" />
          <ToolButton toolName="line" icon={Minus} label="Line" />
          <ToolButton toolName="rect" icon={Square} label="Rectangle" />
          <ToolButton toolName="circle" icon={Circle} label="Circle" />
          <ToolButton toolName="text" icon={Type} label="Text" />
          <ToolButton toolName="eraser" icon={Eraser} label="Eraser" />
          <ToolButton toolName="crop" icon={Crop} label="Crop" />
          <ToolButton toolName="eyedropper" icon={Pipette} label="Color Picker" />

          <div className="w-px h-6 bg-white/10 mx-2" />

          {/* Color picker */}
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-white/20"
            />
            <input
              type="number"
              value={lineWidth}
              onChange={(e) => setLineWidth(Math.max(1, Number(e.target.value)))}
              min={1}
              max={50}
              className="w-14 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs"
              title="Line width"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button
            onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
            className="p-2 text-white/60 hover:text-white"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/60 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(z => Math.min(4, z + 0.25))}
            className="p-2 text-white/60 hover:text-white"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-white/10 mx-2" />

          {/* Reset */}
          <button
            onClick={handleReset}
            className="p-2 text-white/60 hover:text-white"
            title="Reset"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-2 text-white/60 hover:text-white"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>

          {/* Export dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1 px-3 py-1.5 bg-rose-gold-400/20 text-rose-gold-400 rounded-lg hover:bg-rose-gold-400/30">
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 py-1 bg-dark-400 border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button
                onClick={() => handleExport('png')}
                className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-white/10"
              >
                Download as PNG
              </button>
              <button
                onClick={() => handleExport('jpg')}
                className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-white/10"
              >
                Download as JPG
              </button>
              <button
                onClick={() => handleExport('webp')}
                className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-white/10"
              >
                Download as WebP
              </button>
            </div>
          </div>

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-white/60 hover:text-white"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Filters */}
        <div className="w-56 p-4 border-r border-white/10 space-y-4 overflow-y-auto bg-dark-400/30">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Palette className="w-4 h-4 text-rose-gold-400" />
            Filters
          </h3>

          <FilterSlider
            label="Brightness"
            value={filter.brightness}
            min={0}
            max={200}
            onChange={(v) => setFilter(f => ({ ...f, brightness: v }))}
            icon={Sun}
          />

          <FilterSlider
            label="Contrast"
            value={filter.contrast}
            min={0}
            max={200}
            onChange={(v) => setFilter(f => ({ ...f, contrast: v }))}
            icon={Contrast}
          />

          <FilterSlider
            label="Saturation"
            value={filter.saturation}
            min={0}
            max={200}
            onChange={(v) => setFilter(f => ({ ...f, saturation: v }))}
            icon={Droplet}
          />

          <FilterSlider
            label="Blur"
            value={filter.blur}
            min={0}
            max={20}
            onChange={(v) => setFilter(f => ({ ...f, blur: v }))}
            icon={Circle}
          />

          <FilterSlider
            label="Sepia"
            value={filter.sepia}
            min={0}
            max={100}
            onChange={(v) => setFilter(f => ({ ...f, sepia: v }))}
            icon={Palette}
          />

          <FilterSlider
            label="Grayscale"
            value={filter.grayscale}
            min={0}
            max={100}
            onChange={(v) => setFilter(f => ({ ...f, grayscale: v }))}
            icon={Contrast}
          />

          <FilterSlider
            label="Hue Rotate"
            value={filter.hueRotate}
            min={0}
            max={360}
            onChange={(v) => setFilter(f => ({ ...f, hueRotate: v }))}
            icon={RotateCcw}
          />

          <FilterSlider
            label="Invert"
            value={filter.invert}
            min={0}
            max={100}
            onChange={(v) => setFilter(f => ({ ...f, invert: v }))}
            icon={Contrast}
          />

          <button
            onClick={() => setFilter(DEFAULT_FILTER)}
            className="w-full py-2 text-xs text-white/60 hover:text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
          >
            Reset Filters
          </button>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto p-4 flex items-center justify-center bg-dark-400"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'10\' height=\'10\' fill=\'%23222\'/%3E%3Crect x=\'10\' y=\'10\' width=\'10\' height=\'10\' fill=\'%23222\'/%3E%3C/svg%3E")'
          }}
        >
          <div
            className="relative"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="max-w-full max-h-full shadow-2xl cursor-crosshair"
              style={{ maxWidth: width, maxHeight: height }}
            />
            <canvas
              ref={overlayCanvasRef}
              width={originalImage?.naturalWidth || width}
              height={originalImage?.naturalHeight || height}
              className="absolute top-0 left-0 pointer-events-none"
            />

            {/* Crop overlay */}
            {cropRect && (
              <div
                className="absolute border-2 border-dashed border-rose-gold-400 bg-rose-gold-400/10"
                style={{
                  left: cropRect.w < 0 ? cropRect.x + cropRect.w : cropRect.x,
                  top: cropRect.h < 0 ? cropRect.y + cropRect.h : cropRect.y,
                  width: Math.abs(cropRect.w),
                  height: Math.abs(cropRect.h)
                }}
              >
                <div className="absolute -top-8 left-0 flex gap-1">
                  <button
                    onClick={applyCrop}
                    className="p-1 bg-rose-gold-500 rounded text-white"
                    title="Apply crop"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={cancelCrop}
                    className="p-1 bg-rose-gold-500 rounded text-white"
                    title="Cancel crop"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar - Text tool options */}
        {tool === 'text' && (
          <div className="w-56 p-4 border-l border-white/10 space-y-4 overflow-y-auto bg-dark-400/30">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Type className="w-4 h-4 text-rose-gold-400" />
              Text Options
            </h3>

            <div className="space-y-2">
              <label className="text-xs text-white/60">Text</label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter text..."
                className="w-full h-20 p-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-rose-gold-400/50 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-white/60">Font</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full p-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm"
              >
                {FONTS.map(font => (
                  <option key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-white/60">Font Size</label>
              <input
                type="range"
                min={12}
                max={144}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-gold-400"
              />
              <div className="text-xs text-white/60 text-right">{fontSize}px</div>
            </div>

            <p className="text-xs text-white/40">
              Click on the canvas to place text
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
