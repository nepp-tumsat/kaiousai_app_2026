export type CsvTable = {
  headers: string[]
  rows: Record<string, string>[]
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        const next = line[i + 1]
        if (next === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function parseCsvWithHeaders(text: string): CsvTable {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = (cells[j] ?? '').trim()
    }
    rows.push(row)
  }
  return { headers, rows }
}

export function stringifyCsvWithHeaders(table: CsvTable): string {
  const lines: string[] = []
  lines.push(table.headers.map(escapeCsvCell).join(','))
  for (const row of table.rows) {
    lines.push(table.headers.map((h) => escapeCsvCell(row[h] ?? '')).join(','))
  }
  return `${lines.join('\n')}\n`
}
