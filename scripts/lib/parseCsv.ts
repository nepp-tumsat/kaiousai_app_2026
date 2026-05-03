import { readFileSync } from 'node:fs'

/**
 * 最小限の CSV パーサ（RFC4180 風の引用フィールド・改行をざっくり扱う）。
 * ヘッダ行必須。セル内改行は未対応。
 */
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

export function parseCsv(text: string): Record<string, string>[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) return []
  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < header.length; j += 1) {
      row[header[j]] = (cells[j] ?? '').trim()
    }
    rows.push(row)
  }
  return rows
}

export function readCsvFile(path: string): Record<string, string>[] {
  return parseCsv(readFileSync(path, 'utf8'))
}
