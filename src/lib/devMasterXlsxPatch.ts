import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'

/** `scripts/sources/` 直下のマスター（`readMasterXlsx.ts` と同じ既定名） */
export const MASTER_XLSX_FILENAME = '海王祭アプリ2026マスターデータ.xlsx'
/** ドラッグ調整の書き出し先（元ファイルは書き換えない） */
export const OUTPUT_MASTER_XLSX_FILENAME = `output_${MASTER_XLSX_FILENAME}`

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return ''
    return Number.isInteger(v) ? String(v) : String(v)
  }
  return String(v).trim()
}

/** `readMasterXlsx` と同じエリア id 正規化（`AR_01` → `AR-01`） */
function normalizeAreaId(raw: string): string {
  const s = cellToString(raw)
  return /^AR_\d+/i.test(s) ? s.replace(/^AR_/i, 'AR-') : s
}

function sheetNameInsensitive(wb: XLSX.WorkBook, want: string): string | undefined {
  const key = want.toLowerCase()
  return wb.SheetNames.find((n) => n.toLowerCase() === key)
}

function headerIndices(headerRow: unknown[]): {
  idIdx: number
  latIdx: number
  lngIdx: number
} | null {
  const labels = headerRow.map((h) => String(h ?? '').trim().toLowerCase())
  const idIdx = labels.findIndex((h) => h === 'id')
  const latIdx = labels.findIndex((h) => h === 'lat')
  const lngIdx = labels.findIndex((h) => h === 'lng')
  if (idIdx < 0 || latIdx < 0 || lngIdx < 0) return null
  return { idIdx, latIdx, lngIdx }
}

function patchSheetLatLng(
  wb: XLSX.WorkBook,
  resolvedSheetName: string,
  mode: 'area' | 'location',
  matchId: string,
  lat: number,
  lng: number,
): boolean {
  const ws = wb.Sheets[resolvedSheetName]
  if (!ws) return false

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  if (aoa.length < 2) return false
  const idx = headerIndices(aoa[0] as unknown[])
  if (!idx) {
    console.warn(`[devMasterXlsxPatch] ${resolvedSheetName}: lat/lng/id 列が見つかりません`)
    return false
  }
  const { idIdx, latIdx, lngIdx } = idx
  const latStr = lat.toFixed(7)
  const lngStr = lng.toFixed(7)

  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] as unknown[]
    const cellId = row[idIdx]
    let ok = false
    if (mode === 'area') {
      const a = normalizeAreaId(cellToString(cellId))
      const b = normalizeAreaId(matchId)
      ok = a !== '' && b !== '' && a === b
    } else {
      ok = cellToString(cellId) === matchId.trim()
    }
    if (!ok) continue
    row[latIdx] = latStr
    row[lngIdx] = lngStr
    wb.Sheets[resolvedSheetName] = XLSX.utils.aoa_to_sheet(aoa)
    return true
  }
  return false
}

export type PatchMasterResult =
  | { success: true; sheet: string }
  | { success: false; reason: 'no_master_file' }
  | { success: false; reason: 'row_not_found'; triedSheets: string[] }

/**
 * マスター xlsx（または既存の output コピー）の該当行の lat/lng を更新し、`output_*.xlsx` に保存する。
 */
export function patchMasterXlsxAdjustment(
  rootDir: string,
  adj: { kind: 'shop' | 'eventLocation' | 'area'; id: string; lat: number; lng: number },
): PatchMasterResult {
  const sourcesDir = join(rootDir, 'scripts', 'sources')
  const masterPath = join(sourcesDir, MASTER_XLSX_FILENAME)
  const outputPath = join(sourcesDir, OUTPUT_MASTER_XLSX_FILENAME)

  const masterExists = existsSync(masterPath)
  const outputExists = existsSync(outputPath)
  if (!masterExists && !outputExists) {
    return { success: false, reason: 'no_master_file' }
  }

  /** 元マスタが無くても、過去に書き出した output があればそこから累積パッチできる */
  const inputPath = outputExists ? outputPath : masterPath
  const wb = XLSX.read(readFileSync(inputPath), { type: 'buffer' })

  const triedSheets: string[] = []

  const tryPatch = (sheetKey: string, mode: 'area' | 'location'): string | null => {
    const name = sheetNameInsensitive(wb, sheetKey)
    if (!name) return null
    triedSheets.push(name)
    if (patchSheetLatLng(wb, name, mode, adj.id, adj.lat, adj.lng)) return name
    return null
  }

  let sheetUsed = ''

  if (adj.kind === 'area') {
    const n = tryPatch('areas', 'area')
    if (n) sheetUsed = n
  } else if (adj.kind === 'shop') {
    const n = tryPatch('shops', 'location') ?? tryPatch('facilities', 'location')
    if (n) sheetUsed = n
  } else {
    const n = tryPatch('facilities', 'location') ?? tryPatch('shops', 'location')
    if (n) sheetUsed = n
  }

  if (sheetUsed === '') {
    return { success: false, reason: 'row_not_found', triedSheets }
  }

  XLSX.writeFile(wb, outputPath, { bookType: 'xlsx' })
  return { success: true, sheet: sheetUsed }
}

function headerIndicesPosition(headerRow: unknown[]): {
  idIdx: number
  xIdx: number
  yIdx: number
} | null {
  const labels = headerRow.map((h) => String(h ?? '').trim().toLowerCase())
  const idIdx = labels.findIndex((h) => h === 'id')
  const xIdx = labels.findIndex((h) => h === 'x_position')
  const yIdx = labels.findIndex((h) => h === 'y_position')
  if (idIdx < 0 || xIdx < 0 || yIdx < 0) return null
  return { idIdx, xIdx, yIdx }
}

function patchSheetNormXY(
  wb: XLSX.WorkBook,
  resolvedSheetName: string,
  matchId: string,
  normX: number,
  normY: number,
): boolean {
  const ws = wb.Sheets[resolvedSheetName]
  if (!ws) return false

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  if (aoa.length < 2) return false
  const idx = headerIndicesPosition(aoa[0] as unknown[])
  if (!idx) {
    console.warn(`[devMasterXlsxPatch] ${resolvedSheetName}: x_position/y_position/id 列が見つかりません`)
    return false
  }
  const { idIdx, xIdx, yIdx } = idx
  const xStr = normX.toFixed(6)
  const yStr = normY.toFixed(6)

  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] as unknown[]
    if (cellToString(row[idIdx]) !== matchId.trim()) continue
    row[xIdx] = xStr
    row[yIdx] = yStr
    wb.Sheets[resolvedSheetName] = XLSX.utils.aoa_to_sheet(aoa)
    return true
  }
  return false
}

/**
 * 屋内ピン: `shops` / `facilities` の `x_position`・`y_position` を正規化座標で更新（0〜1 推奨）。
 */
export function patchMasterXlsxIndoorNormXY(
  rootDir: string,
  adj: { id: string; normX: number; normY: number },
): PatchMasterResult {
  const sourcesDir = join(rootDir, 'scripts', 'sources')
  const masterPath = join(sourcesDir, MASTER_XLSX_FILENAME)
  const outputPath = join(sourcesDir, OUTPUT_MASTER_XLSX_FILENAME)

  const masterExists = existsSync(masterPath)
  const outputExists = existsSync(outputPath)
  if (!masterExists && !outputExists) {
    return { success: false, reason: 'no_master_file' }
  }

  const inputPath = outputExists ? outputPath : masterPath
  const wb = XLSX.read(readFileSync(inputPath), { type: 'buffer' })

  const triedSheets: string[] = []

  const tryPatch = (sheetKey: string): string | null => {
    const name = sheetNameInsensitive(wb, sheetKey)
    if (!name) return null
    triedSheets.push(name)
    if (patchSheetNormXY(wb, name, adj.id, adj.normX, adj.normY)) return name
    return null
  }

  const sheetUsed = tryPatch('shops') ?? tryPatch('facilities')

  if (!sheetUsed) {
    return { success: false, reason: 'row_not_found', triedSheets }
  }

  XLSX.writeFile(wb, outputPath, { bookType: 'xlsx' })
  return { success: true, sheet: sheetUsed }
}
