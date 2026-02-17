/**
 * Data Analysis Service
 * Comprehensive data processing, statistics, and visualization utilities
 */

// ============================================================================
// Types
// ============================================================================

export type ColumnType = 'number' | 'string' | 'date' | 'boolean' | 'mixed'

export interface DataColumn {
  name: string
  type: ColumnType
  values: (string | number | boolean | Date | null)[]
  stats?: ColumnStats
}

export interface ColumnStats {
  count: number
  unique: number
  nullCount: number
  nullPercentage: number
  mean?: number
  median?: number
  mode?: string | number
  min?: number | string | Date
  max?: number | string | Date
  stdDev?: number
  variance?: number
  sum?: number
  q1?: number
  q3?: number
  iqr?: number
  skewness?: number
  kurtosis?: number
  // For string columns
  minLength?: number
  maxLength?: number
  avgLength?: number
  // Distribution
  histogram?: { bin: string; count: number }[]
  topValues?: { value: string | number; count: number; percentage: number }[]
}

export interface ParsedData {
  columns: DataColumn[]
  rowCount: number
  headers: string[]
  raw: Record<string, unknown>[]
  metadata?: {
    parseTime: number
    fileSize?: number
    fileName?: string
  }
}

export interface FilterCondition {
  column: string
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater' | 'less' | 'greater_equal' | 'less_equal' | 'between' | 'is_null' | 'not_null'
  value: string | number | null
  value2?: string | number | null  // For 'between' operator
}

export interface SortConfig {
  column: string
  direction: 'asc' | 'desc'
}

export interface CorrelationResult {
  column1: string
  column2: string
  correlation: number
  strength: 'none' | 'weak' | 'moderate' | 'strong' | 'very_strong'
}

export interface ChartSuggestion {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'area' | 'heatmap'
  confidence: number
  reason: string
  xAxis?: string
  yAxis?: string
}

// ============================================================================
// Sample Datasets
// ============================================================================

export const SAMPLE_DATASETS = {
  sales: {
    name: 'Sales Data',
    description: 'Monthly sales data with regional breakdown',
    data: `Month,Sales,Expenses,Profit,Region,Units,Growth
January,45000,32000,13000,North,150,0
February,52000,35000,17000,North,180,15.6
March,48000,31000,17000,South,165,7.8
April,61000,40000,21000,East,210,27.3
May,55000,36000,19000,West,190,10.9
June,67000,42000,25000,North,230,21.8
July,72000,45000,27000,South,245,7.5
August,68000,43000,25000,East,235,-5.6
September,59000,38000,21000,West,200,-13.2
October,63000,41000,22000,North,215,6.8
November,71000,46000,25000,South,240,12.7
December,85000,52000,33000,East,290,19.7`
  },
  weather: {
    name: 'Weather Data',
    description: 'Daily weather observations for a city',
    data: `Date,Temperature,Humidity,WindSpeed,Precipitation,Condition
2024-01-01,32,65,12,0,Clear
2024-01-02,28,72,8,0.2,Cloudy
2024-01-03,25,80,15,0.8,Rainy
2024-01-04,30,58,10,0,Clear
2024-01-05,35,45,5,0,Sunny
2024-01-06,38,40,7,0,Sunny
2024-01-07,36,55,12,0,Clear
2024-01-08,29,78,20,1.5,Rainy
2024-01-09,27,82,18,2.1,Stormy
2024-01-10,31,70,14,0.3,Cloudy
2024-01-11,34,52,9,0,Clear
2024-01-12,37,48,6,0,Sunny
2024-01-13,33,60,11,0.1,Cloudy
2024-01-14,28,75,16,0.9,Rainy
2024-01-15,26,85,22,2.5,Stormy`
  },
  stocks: {
    name: 'Stock Prices',
    description: 'Historical stock data for tech companies',
    data: `Date,Symbol,Open,High,Low,Close,Volume
2024-01-02,AAPL,185.50,187.20,184.80,186.90,45000000
2024-01-02,GOOGL,140.20,142.50,139.80,141.80,28000000
2024-01-02,MSFT,375.00,378.50,374.20,377.40,22000000
2024-01-03,AAPL,186.90,189.00,186.20,188.50,52000000
2024-01-03,GOOGL,141.80,144.00,141.20,143.50,31000000
2024-01-03,MSFT,377.40,380.00,376.80,379.20,24000000
2024-01-04,AAPL,188.50,190.20,187.90,189.80,48000000
2024-01-04,GOOGL,143.50,145.20,142.80,144.60,29000000
2024-01-04,MSFT,379.20,382.00,378.50,381.50,25000000
2024-01-05,AAPL,189.80,191.00,188.50,190.50,55000000
2024-01-05,GOOGL,144.60,146.00,143.90,145.20,32000000
2024-01-05,MSFT,381.50,384.00,380.20,383.00,27000000`
  },
  employees: {
    name: 'Employee Data',
    description: 'Employee information with performance metrics',
    data: `ID,Name,Department,Salary,Experience,Performance,JoinDate,Remote
E001,Alice Johnson,Engineering,95000,5,Excellent,2019-03-15,true
E002,Bob Smith,Marketing,72000,3,Good,2021-06-01,false
E003,Charlie Brown,Engineering,105000,8,Excellent,2016-01-10,true
E004,Diana Prince,Sales,68000,2,Good,2022-04-20,false
E005,Eve Wilson,Engineering,88000,4,Good,2020-08-15,true
E006,Frank Miller,HR,65000,6,Excellent,2018-11-30,false
E007,Grace Lee,Marketing,78000,4,Good,2020-02-14,false
E008,Henry Taylor,Sales,82000,7,Excellent,2017-07-22,true
E009,Ivy Chen,Engineering,92000,3,Good,2021-09-05,true
E010,Jack Davis,HR,58000,1,Fair,2023-01-10,false
E011,Kate Moore,Engineering,110000,10,Excellent,2014-05-18,true
E012,Leo Garcia,Sales,75000,5,Good,2019-12-01,false`
  },
  products: {
    name: 'Product Inventory',
    description: 'Product catalog with stock levels',
    data: `ProductID,Name,Category,Price,Stock,Rating,Reviews,LastRestocked
P001,Laptop Pro 15,Electronics,1299.99,45,4.5,1250,2024-01-10
P002,Wireless Mouse,Electronics,29.99,230,4.2,890,2024-01-08
P003,Office Chair Deluxe,Furniture,349.00,78,4.0,445,2024-01-05
P004,Standing Desk,Furniture,599.00,32,4.7,680,2024-01-12
P005,Notebook Set,Stationery,15.99,500,4.1,320,2024-01-15
P006,Mechanical Keyboard,Electronics,149.99,120,4.6,1100,2024-01-11
P007,27-inch Monitor,Electronics,399.00,65,4.4,750,2024-01-09
P008,LED Desk Lamp,Furniture,45.00,180,3.9,210,2024-01-07
P009,Premium Pen Pack,Stationery,8.99,800,4.0,180,2024-01-14
P010,Webcam HD,Electronics,79.00,95,4.3,520,2024-01-13`
  },
  customerSurvey: {
    name: 'Customer Survey',
    description: 'Customer satisfaction survey responses',
    data: `ResponseID,Age,Gender,Satisfaction,NPS,ProductQuality,ServiceQuality,WouldRecommend,Comments
R001,34,Female,4,9,5,4,Yes,Great product
R002,28,Male,3,6,4,3,Maybe,Average experience
R003,45,Female,5,10,5,5,Yes,Excellent service
R004,52,Male,4,8,4,5,Yes,Good value
R005,23,Female,2,4,3,2,No,Needs improvement
R006,41,Male,4,8,5,4,Yes,Reliable
R007,36,Female,5,10,5,5,Yes,Outstanding
R008,29,Male,3,5,3,4,Maybe,Okay
R009,55,Female,4,7,4,4,Yes,Satisfied
R010,31,Male,5,9,5,5,Yes,Will buy again
R011,48,Female,3,6,4,3,Maybe,Room for improvement
R012,26,Male,4,8,4,4,Yes,Good overall`
  }
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse CSV string to structured data
 */
export function parseCSV(csv: string, options?: { delimiter?: string; hasHeader?: boolean }): ParsedData {
  const startTime = performance.now()
  const delimiter = options?.delimiter || detectDelimiter(csv)
  const hasHeader = options?.hasHeader !== false

  const lines = csv.trim().split(/\r?\n/)
  if (lines.length < (hasHeader ? 2 : 1)) {
    throw new Error('CSV must have at least one data row')
  }

  // Parse headers
  const headers = hasHeader
    ? parseCSVLine(lines[0], delimiter).map(h => h.trim() || `Column_${Math.random().toString(36).slice(2, 6)}`)
    : Array.from({ length: parseCSVLine(lines[0], delimiter).length }, (_, i) => `Column_${i + 1}`)

  const dataStartIndex = hasHeader ? 1 : 0
  const rows: Record<string, unknown>[] = []

  for (let i = dataStartIndex; i < lines.length; i++) {
    if (!lines[i].trim()) continue

    const values = parseCSVLine(lines[i], delimiter)
    const row: Record<string, unknown> = {}

    headers.forEach((header, idx) => {
      const rawValue = values[idx]?.trim() ?? ''
      row[header] = parseValue(rawValue)
    })

    rows.push(row)
  }

  // Build columns with type detection
  const columns: DataColumn[] = headers.map(header => {
    const values = rows.map(row => row[header] as string | number | boolean | Date | null)
    const type = detectColumnType(values)
    return { name: header, type, values }
  })

  // Calculate statistics for each column
  columns.forEach(col => {
    col.stats = calculateColumnStats(col)
  })

  return {
    columns,
    rowCount: rows.length,
    headers,
    raw: rows,
    metadata: {
      parseTime: performance.now() - startTime,
      fileSize: new Blob([csv]).size
    }
  }
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

/**
 * Detect CSV delimiter
 */
function detectDelimiter(csv: string): string {
  const firstLine = csv.split(/\r?\n/)[0]
  const delimiters = [',', '\t', ';', '|']

  let maxCount = 0
  let detectedDelimiter = ','

  for (const delimiter of delimiters) {
    const count = (firstLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length
    if (count > maxCount) {
      maxCount = count
      detectedDelimiter = delimiter
    }
  }

  return detectedDelimiter
}

/**
 * Parse JSON string to structured data
 */
export function parseJSON(json: string): ParsedData {
  const startTime = performance.now()
  const parsed = JSON.parse(json)
  const rows = Array.isArray(parsed) ? parsed : [parsed]

  if (rows.length === 0) {
    throw new Error('JSON array is empty')
  }

  // Flatten nested objects if needed
  const flattenedRows = rows.map(row => flattenObject(row))

  // Get all unique keys
  const headersSet = new Set<string>()
  flattenedRows.forEach(row => {
    Object.keys(row).forEach(key => headersSet.add(key))
  })
  const headers = Array.from(headersSet)

  const columns: DataColumn[] = headers.map(header => {
    const values = flattenedRows.map(row => {
      const val = row[header]
      return val === undefined ? null : parseValue(String(val))
    })
    const type = detectColumnType(values)
    return { name: header, type, values }
  })

  columns.forEach(col => {
    col.stats = calculateColumnStats(col)
  })

  return {
    columns,
    rowCount: flattenedRows.length,
    headers,
    raw: flattenedRows,
    metadata: {
      parseTime: performance.now() - startTime,
      fileSize: new Blob([json]).size
    }
  }
}

/**
 * Flatten nested object with dot notation
 */
function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey))
    } else {
      result[newKey] = value
    }
  }

  return result
}

/**
 * Parse a string value to appropriate type
 */
function parseValue(value: string): string | number | boolean | Date | null {
  if (value === '' || value.toLowerCase() === 'null' || value.toLowerCase() === 'na' || value.toLowerCase() === 'n/a') {
    return null
  }

  // Boolean
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false

  // Number
  const numVal = Number(value.replace(/,/g, ''))
  if (!isNaN(numVal) && value.trim() !== '') {
    return numVal
  }

  // Date (ISO format or common formats)
  if (/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(value)) {
    const date = new Date(value)
    if (!isNaN(date.getTime())) {
      return date
    }
  }

  return value
}

/**
 * Auto-detect data format and parse
 */
export function parseData(input: string): ParsedData {
  const trimmed = input.trim()

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJSON(trimmed)
  }

  return parseCSV(trimmed)
}

// ============================================================================
// Type Detection
// ============================================================================

/**
 * Detect column type from values
 */
export function detectColumnType(values: (unknown)[]): ColumnType {
  const nonNull = values.filter(v => v !== null && v !== '' && v !== undefined)
  if (nonNull.length === 0) return 'mixed'

  const typeCount = { number: 0, string: 0, date: 0, boolean: 0 }

  for (const v of nonNull) {
    if (typeof v === 'number') typeCount.number++
    else if (typeof v === 'boolean') typeCount.boolean++
    else if (v instanceof Date) typeCount.date++
    else if (typeof v === 'string') {
      // Try to detect if it's a date string
      if (/^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(Date.parse(v))) {
        typeCount.date++
      } else {
        typeCount.string++
      }
    }
  }

  const total = nonNull.length
  const threshold = 0.8 // 80% of values should be of same type

  if (typeCount.number / total >= threshold) return 'number'
  if (typeCount.boolean / total >= threshold) return 'boolean'
  if (typeCount.date / total >= threshold) return 'date'
  if (typeCount.string / total >= threshold) return 'string'

  return 'mixed'
}

// ============================================================================
// Statistics Calculations
// ============================================================================

/**
 * Calculate comprehensive statistics for a column
 */
export function calculateColumnStats(column: DataColumn): ColumnStats {
  const values = column.values
  const nonNull = values.filter(v => v !== null && v !== '' && v !== undefined)
  const nullCount = values.length - nonNull.length

  const stats: ColumnStats = {
    count: values.length,
    unique: new Set(nonNull.map(v => String(v))).size,
    nullCount,
    nullPercentage: (nullCount / values.length) * 100
  }

  // Calculate mode
  const frequency = new Map<string, number>()
  nonNull.forEach(v => {
    const key = String(v)
    frequency.set(key, (frequency.get(key) || 0) + 1)
  })

  let maxFreq = 0
  frequency.forEach((count, value) => {
    if (count > maxFreq) {
      maxFreq = count
      stats.mode = isNaN(Number(value)) ? value : Number(value)
    }
  })

  // Top values distribution
  const sortedValues = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  stats.topValues = sortedValues.map(([value, count]) => ({
    value: isNaN(Number(value)) ? value : Number(value),
    count,
    percentage: (count / nonNull.length) * 100
  }))

  // Numeric statistics
  if (column.type === 'number') {
    const numbers = nonNull.filter(v => typeof v === 'number') as number[]
    if (numbers.length > 0) {
      stats.sum = numbers.reduce((a, b) => a + b, 0)
      stats.mean = stats.sum / numbers.length

      const sorted = [...numbers].sort((a, b) => a - b)
      stats.min = sorted[0]
      stats.max = sorted[sorted.length - 1]

      // Median
      const mid = Math.floor(sorted.length / 2)
      stats.median = sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2

      // Quartiles
      stats.q1 = sorted[Math.floor(sorted.length * 0.25)]
      stats.q3 = sorted[Math.floor(sorted.length * 0.75)]
      stats.iqr = stats.q3 - stats.q1

      // Variance and Standard Deviation
      const squaredDiffs = numbers.map(n => Math.pow(n - stats.mean!, 2))
      stats.variance = squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length
      stats.stdDev = Math.sqrt(stats.variance)

      // Skewness
      const cubedDiffs = numbers.map(n => Math.pow((n - stats.mean!) / stats.stdDev!, 3))
      stats.skewness = cubedDiffs.reduce((a, b) => a + b, 0) / numbers.length

      // Kurtosis
      const fourthDiffs = numbers.map(n => Math.pow((n - stats.mean!) / stats.stdDev!, 4))
      stats.kurtosis = fourthDiffs.reduce((a, b) => a + b, 0) / numbers.length - 3

      // Histogram
      stats.histogram = generateHistogram(numbers)
    }
  } else if (column.type === 'string') {
    const strings = nonNull.filter(v => typeof v === 'string') as string[]
    if (strings.length > 0) {
      const lengths = strings.map(s => s.length)
      stats.minLength = Math.min(...lengths)
      stats.maxLength = Math.max(...lengths)
      stats.avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length

      const sorted = [...strings].sort()
      stats.min = sorted[0]
      stats.max = sorted[sorted.length - 1]
    }
  } else if (column.type === 'date') {
    const dates = nonNull.filter(v => v instanceof Date) as Date[]
    if (dates.length > 0) {
      const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
      stats.min = sorted[0]
      stats.max = sorted[sorted.length - 1]
    }
  }

  return stats
}

/**
 * Generate histogram bins for numeric data
 */
function generateHistogram(numbers: number[], bins = 10): { bin: string; count: number }[] {
  if (numbers.length === 0) return []

  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  const range = max - min || 1
  const binWidth = range / bins

  const histogram: { bin: string; count: number }[] = []

  for (let i = 0; i < bins; i++) {
    const binStart = min + i * binWidth
    const binEnd = min + (i + 1) * binWidth
    const count = numbers.filter(n =>
      i === bins - 1 ? n >= binStart && n <= binEnd : n >= binStart && n < binEnd
    ).length

    histogram.push({
      bin: `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`,
      count
    })
  }

  return histogram
}

/**
 * Calculate basic statistics for an array of numbers
 */
export function calculateBasicStats(numbers: number[]): {
  count: number
  sum: number
  mean: number
  median: number
  mode: number
  min: number
  max: number
  range: number
  stdDev: number
  variance: number
} {
  if (numbers.length === 0) {
    return { count: 0, sum: 0, mean: 0, median: 0, mode: 0, min: 0, max: 0, range: 0, stdDev: 0, variance: 0 }
  }

  const sorted = [...numbers].sort((a, b) => a - b)
  const sum = numbers.reduce((a, b) => a + b, 0)
  const mean = sum / numbers.length
  const min = sorted[0]
  const max = sorted[sorted.length - 1]

  // Median
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

  // Mode
  const frequency = new Map<number, number>()
  numbers.forEach(n => frequency.set(n, (frequency.get(n) || 0) + 1))
  let mode = numbers[0]
  let maxFreq = 0
  frequency.forEach((count, value) => {
    if (count > maxFreq) {
      maxFreq = count
      mode = value
    }
  })

  // Variance and StdDev
  const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2))
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length
  const stdDev = Math.sqrt(variance)

  return { count: numbers.length, sum, mean, median, mode, min, max, range: max - min, stdDev, variance }
}

// ============================================================================
// Correlation Analysis
// ============================================================================

/**
 * Calculate Pearson correlation coefficient between two numeric columns
 */
export function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0

  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0)
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0)
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0)

  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

  return denominator === 0 ? 0 : numerator / denominator
}

/**
 * Get correlation strength label
 */
export function getCorrelationStrength(r: number): 'none' | 'weak' | 'moderate' | 'strong' | 'very_strong' {
  const abs = Math.abs(r)
  if (abs < 0.1) return 'none'
  if (abs < 0.3) return 'weak'
  if (abs < 0.5) return 'moderate'
  if (abs < 0.7) return 'strong'
  return 'very_strong'
}

/**
 * Calculate correlation matrix for all numeric columns
 */
export function calculateCorrelationMatrix(data: ParsedData): CorrelationResult[] {
  const numericColumns = data.columns.filter(c => c.type === 'number')
  const results: CorrelationResult[] = []

  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      const col1 = numericColumns[i]
      const col2 = numericColumns[j]

      // Get paired values (both non-null)
      const pairs: { x: number; y: number }[] = []
      for (let k = 0; k < col1.values.length; k++) {
        const v1 = col1.values[k]
        const v2 = col2.values[k]
        if (typeof v1 === 'number' && typeof v2 === 'number') {
          pairs.push({ x: v1, y: v2 })
        }
      }

      if (pairs.length >= 2) {
        const x = pairs.map(p => p.x)
        const y = pairs.map(p => p.y)
        const correlation = calculateCorrelation(x, y)

        results.push({
          column1: col1.name,
          column2: col2.name,
          correlation,
          strength: getCorrelationStrength(correlation)
        })
      }
    }
  }

  return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
}

// ============================================================================
// Data Filtering and Sorting
// ============================================================================

/**
 * Filter data based on conditions
 */
export function filterData(
  data: Record<string, unknown>[],
  filters: FilterCondition[]
): Record<string, unknown>[] {
  return data.filter(row => {
    return filters.every(filter => {
      const value = row[filter.column]
      const filterValue = filter.value

      switch (filter.operator) {
        case 'equals':
          return String(value).toLowerCase() === String(filterValue).toLowerCase()
        case 'not_equals':
          return String(value).toLowerCase() !== String(filterValue).toLowerCase()
        case 'contains':
          return String(value).toLowerCase().includes(String(filterValue).toLowerCase())
        case 'not_contains':
          return !String(value).toLowerCase().includes(String(filterValue).toLowerCase())
        case 'greater':
          return Number(value) > Number(filterValue)
        case 'less':
          return Number(value) < Number(filterValue)
        case 'greater_equal':
          return Number(value) >= Number(filterValue)
        case 'less_equal':
          return Number(value) <= Number(filterValue)
        case 'between':
          return Number(value) >= Number(filterValue) && Number(value) <= Number(filter.value2)
        case 'is_null':
          return value === null || value === undefined || value === ''
        case 'not_null':
          return value !== null && value !== undefined && value !== ''
        default:
          return true
      }
    })
  })
}

/**
 * Sort data by multiple columns
 */
export function sortData(
  data: Record<string, unknown>[],
  sorts: SortConfig[]
): Record<string, unknown>[] {
  return [...data].sort((a, b) => {
    for (const sort of sorts) {
      const aVal = a[sort.column]
      const bVal = b[sort.column]

      if (aVal === bVal) continue
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      let comparison: number
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal
      } else {
        comparison = String(aVal).localeCompare(String(bVal))
      }

      return sort.direction === 'desc' ? -comparison : comparison
    }
    return 0
  })
}

/**
 * Search across all columns
 */
export function searchData(
  data: Record<string, unknown>[],
  query: string
): Record<string, unknown>[] {
  const lowerQuery = query.toLowerCase()
  return data.filter(row =>
    Object.values(row).some(value =>
      String(value).toLowerCase().includes(lowerQuery)
    )
  )
}

// ============================================================================
// Chart Suggestions
// ============================================================================

/**
 * Suggest appropriate chart types based on data characteristics
 */
export function suggestCharts(data: ParsedData): ChartSuggestion[] {
  const suggestions: ChartSuggestion[] = []

  const numericCols = data.columns.filter(c => c.type === 'number')
  const categoricalCols = data.columns.filter(c => c.type === 'string')
  const dateCols = data.columns.filter(c => c.type === 'date')

  // Bar chart: categorical + numeric
  if (categoricalCols.length > 0 && numericCols.length > 0) {
    const catCol = categoricalCols.find(c => c.stats && c.stats.unique <= 15) || categoricalCols[0]
    if (catCol.stats && catCol.stats.unique <= 15) {
      suggestions.push({
        type: 'bar',
        confidence: 0.9,
        reason: `Compare ${numericCols[0].name} across ${catCol.name} categories`,
        xAxis: catCol.name,
        yAxis: numericCols[0].name
      })
    }
  }

  // Line chart: date/sequential + numeric
  if (dateCols.length > 0 && numericCols.length > 0) {
    suggestions.push({
      type: 'line',
      confidence: 0.95,
      reason: `Show ${numericCols[0].name} trend over time`,
      xAxis: dateCols[0].name,
      yAxis: numericCols[0].name
    })
  } else if (numericCols.length > 0 && data.rowCount > 5) {
    suggestions.push({
      type: 'line',
      confidence: 0.7,
      reason: `Show ${numericCols[0].name} progression`,
      xAxis: 'Row Index',
      yAxis: numericCols[0].name
    })
  }

  // Pie chart: categorical with few unique values
  if (categoricalCols.length > 0) {
    const catCol = categoricalCols.find(c => c.stats && c.stats.unique <= 8)
    if (catCol) {
      suggestions.push({
        type: 'pie',
        confidence: 0.8,
        reason: `Show distribution of ${catCol.name}`,
        xAxis: catCol.name
      })
    }
  }

  // Scatter plot: two numeric columns
  if (numericCols.length >= 2) {
    suggestions.push({
      type: 'scatter',
      confidence: 0.85,
      reason: `Explore relationship between ${numericCols[0].name} and ${numericCols[1].name}`,
      xAxis: numericCols[0].name,
      yAxis: numericCols[1].name
    })
  }

  // Histogram: single numeric column distribution
  if (numericCols.length > 0) {
    suggestions.push({
      type: 'histogram',
      confidence: 0.75,
      reason: `Show distribution of ${numericCols[0].name}`,
      xAxis: numericCols[0].name
    })
  }

  // Area chart: cumulative data
  if (dateCols.length > 0 && numericCols.length > 0) {
    suggestions.push({
      type: 'area',
      confidence: 0.7,
      reason: `Show cumulative ${numericCols[0].name} over time`,
      xAxis: dateCols[0].name,
      yAxis: numericCols[0].name
    })
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence)
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export data as CSV
 */
export function exportAsCSV(data: ParsedData, filteredRows?: Record<string, unknown>[]): string {
  const rows = filteredRows || data.raw
  const headers = data.headers.join(',')

  const csvRows = rows.map(row =>
    data.headers.map(h => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      const str = String(val)
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(',')
  )

  return [headers, ...csvRows].join('\n')
}

/**
 * Export data as JSON
 */
export function exportAsJSON(data: ParsedData, filteredRows?: Record<string, unknown>[]): string {
  return JSON.stringify(filteredRows || data.raw, null, 2)
}

/**
 * Export statistics summary as text
 */
export function exportStatsSummary(data: ParsedData): string {
  let summary = '# Data Analysis Summary\n\n'
  summary += `Total Rows: ${data.rowCount}\n`
  summary += `Total Columns: ${data.columns.length}\n\n`

  summary += '## Column Statistics\n\n'

  for (const col of data.columns) {
    summary += `### ${col.name} (${col.type})\n`
    if (col.stats) {
      summary += `- Count: ${col.stats.count}\n`
      summary += `- Unique: ${col.stats.unique}\n`
      summary += `- Missing: ${col.stats.nullCount} (${col.stats.nullPercentage.toFixed(1)}%)\n`

      if (col.type === 'number') {
        summary += `- Mean: ${col.stats.mean?.toFixed(2)}\n`
        summary += `- Median: ${col.stats.median?.toFixed(2)}\n`
        summary += `- Std Dev: ${col.stats.stdDev?.toFixed(2)}\n`
        summary += `- Min: ${col.stats.min}\n`
        summary += `- Max: ${col.stats.max}\n`
      }
    }
    summary += '\n'
  }

  return summary
}

// ============================================================================
// Data Transformation
// ============================================================================

/**
 * Aggregate data by a column
 */
export function aggregateBy(
  data: Record<string, unknown>[],
  groupByColumn: string,
  valueColumn: string,
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max'
): { label: string; value: number }[] {
  const groups = new Map<string, number[]>()

  data.forEach(row => {
    const key = String(row[groupByColumn] ?? 'Unknown')
    const value = Number(row[valueColumn])

    if (!isNaN(value)) {
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(value)
    }
  })

  const result: { label: string; value: number }[] = []

  groups.forEach((values, label) => {
    let aggregatedValue: number

    switch (aggregation) {
      case 'sum':
        aggregatedValue = values.reduce((a, b) => a + b, 0)
        break
      case 'avg':
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length
        break
      case 'count':
        aggregatedValue = values.length
        break
      case 'min':
        aggregatedValue = Math.min(...values)
        break
      case 'max':
        aggregatedValue = Math.max(...values)
        break
      default:
        aggregatedValue = values.reduce((a, b) => a + b, 0)
    }

    result.push({ label, value: aggregatedValue })
  })

  return result
}

/**
 * Pivot data
 */
export function pivotData(
  data: Record<string, unknown>[],
  rowField: string,
  columnField: string,
  valueField: string,
  aggregation: 'sum' | 'avg' | 'count' = 'sum'
): { headers: string[]; rows: Record<string, unknown>[] } {
  // Get unique column values
  const columnValues = [...new Set(data.map(row => String(row[columnField])))]

  // Group by row field
  const groups = new Map<string, Record<string, number[]>>()

  data.forEach(row => {
    const rowKey = String(row[rowField] ?? 'Unknown')
    const colKey = String(row[columnField] ?? 'Unknown')
    const value = Number(row[valueField])

    if (!groups.has(rowKey)) {
      groups.set(rowKey, {})
    }

    const rowGroup = groups.get(rowKey)!
    if (!rowGroup[colKey]) {
      rowGroup[colKey] = []
    }

    if (!isNaN(value)) {
      rowGroup[colKey].push(value)
    }
  })

  // Build result
  const rows: Record<string, unknown>[] = []

  groups.forEach((colValues, rowKey) => {
    const row: Record<string, unknown> = { [rowField]: rowKey }

    columnValues.forEach(colVal => {
      const values = colValues[colVal] || []
      let aggregatedValue: number

      switch (aggregation) {
        case 'sum':
          aggregatedValue = values.reduce((a, b) => a + b, 0)
          break
        case 'avg':
          aggregatedValue = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
          break
        case 'count':
          aggregatedValue = values.length
          break
        default:
          aggregatedValue = values.reduce((a, b) => a + b, 0)
      }

      row[colVal] = aggregatedValue
    })

    rows.push(row)
  })

  return {
    headers: [rowField, ...columnValues],
    rows
  }
}

// ============================================================================
// Missing Value Analysis
// ============================================================================

/**
 * Analyze missing values in dataset
 */
export function analyzeMissingValues(data: ParsedData): {
  totalMissing: number
  totalCells: number
  missingPercentage: number
  columnsMissing: { column: string; count: number; percentage: number }[]
  rowsWithMissing: number
  completeRows: number
} {
  const totalCells = data.rowCount * data.columns.length
  let totalMissing = 0

  const columnsMissing = data.columns.map(col => {
    const nullCount = col.values.filter(v => v === null || v === undefined || v === '').length
    totalMissing += nullCount
    return {
      column: col.name,
      count: nullCount,
      percentage: (nullCount / data.rowCount) * 100
    }
  }).filter(c => c.count > 0)

  // Count rows with any missing value
  let rowsWithMissing = 0
  for (let i = 0; i < data.rowCount; i++) {
    const hasMissing = data.columns.some(col => {
      const val = col.values[i]
      return val === null || val === undefined || val === ''
    })
    if (hasMissing) rowsWithMissing++
  }

  return {
    totalMissing,
    totalCells,
    missingPercentage: (totalMissing / totalCells) * 100,
    columnsMissing,
    rowsWithMissing,
    completeRows: data.rowCount - rowsWithMissing
  }
}

// ============================================================================
// Outlier Detection
// ============================================================================

/**
 * Detect outliers using IQR method
 */
export function detectOutliers(column: DataColumn): {
  outliers: { index: number; value: number }[]
  lowerBound: number
  upperBound: number
} {
  if (column.type !== 'number' || !column.stats) {
    return { outliers: [], lowerBound: 0, upperBound: 0 }
  }

  const q1 = column.stats.q1 ?? 0
  const q3 = column.stats.q3 ?? 0
  const iqr = column.stats.iqr ?? (q3 - q1)

  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr

  const outliers: { index: number; value: number }[] = []

  column.values.forEach((value, index) => {
    if (typeof value === 'number' && (value < lowerBound || value > upperBound)) {
      outliers.push({ index, value })
    }
  })

  return { outliers, lowerBound, upperBound }
}
