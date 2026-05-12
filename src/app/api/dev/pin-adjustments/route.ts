import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  OUTPUT_MASTER_XLSX_FILENAME,
  patchMasterXlsxAdjustment,
  patchMasterXlsxIndoorNormXY,
} from '@/lib/devMasterXlsxPatch'
import { parseCsvWithHeaders, stringifyCsvWithHeaders } from '@/lib/devCsv'

export const runtime = 'nodejs'

const finiteCoord = z.number().finite()

const adjustmentOutdoorSchema = z.object({
  kind: z.enum(['shop', 'eventLocation', 'area']),
  id: z.string().min(1),
  lat: finiteCoord,
  lng: finiteCoord,
})

const adjustmentIndoorSchema = z.object({
  kind: z.literal('indoorShop'),
  id: z.string().min(1),
  normX: finiteCoord,
  normY: finiteCoord,
})

const adjustmentSchema = z.union([adjustmentOutdoorSchema, adjustmentIndoorSchema])

const requestSchema = z.object({
  adjustment: adjustmentSchema,
})

function readCsvForOutput(basePath: string, outputPath: string): string {
  if (existsSync(outputPath)) return readFileSync(outputPath, 'utf8')
  return readFileSync(basePath, 'utf8')
}

function toFixedCoord(n: number): string {
  return n.toFixed(7)
}

function resolveHeaderKey(headers: string[], ...candidates: string[]): string | undefined {
  const map = new Map(headers.map((h) => [h.toLowerCase(), h]))
  for (const c of candidates) {
    const k = map.get(c.toLowerCase())
    if (k) return k
  }
  return undefined
}

/** locations.csv の屋内列（`indoor_x`/`indoor_y` または `x_position`/`y_position`）を更新 */
function patchLocationsCsvIndoorNorm(
  locationsPath: string,
  outputLocationsPath: string,
  id: string,
  normX: number,
  normY: number,
): boolean {
  if (!existsSync(locationsPath)) return false
  const locationsText = readCsvForOutput(locationsPath, outputLocationsPath)
  const locationsTable = parseCsvWithHeaders(locationsText)
  const target = locationsTable.rows.find((row) => (row.id ?? '').trim() === id)
  if (!target) return false
  const xStr = normX.toFixed(6)
  const yStr = normY.toFixed(6)
  const hx = resolveHeaderKey(locationsTable.headers, 'indoor_x', 'x_position')
  const hy = resolveHeaderKey(locationsTable.headers, 'indoor_y', 'y_position')
  if (!hx || !hy) return false
  target[hx] = xStr
  target[hy] = yStr
  mkdirSync(dirname(outputLocationsPath), { recursive: true })
  writeFileSync(outputLocationsPath, stringifyCsvWithHeaders(locationsTable), 'utf8')
  return true
}

function isPinAdjustApiAllowed(): boolean {
  if (process.env.NODE_ENV === 'development') return true
  /** `next build && next start` などでローカル検証するとき用（本番デプロイでは設定しないこと） */
  return process.env.ALLOW_MASTER_PIN_PATCH === '1'
}

export async function POST(request: Request) {
  if (!isPinAdjustApiAllowed()) {
    return NextResponse.json(
      {
        error:
          'development only（またはローカル検証用に ALLOW_MASTER_PIN_PATCH=1 を設定）',
      },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト本文が JSON ではありません' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: '入力が不正です',
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    )
  }

  const { adjustment } = parsed.data
  const root = process.cwd()
  const csvDir = join(root, 'scripts', 'sources', 'csv')
  const areasPath = join(csvDir, 'areas.csv')
  const locationsPath = join(csvDir, 'locations.csv')
  const outputAreasPath = join(csvDir, 'output_areas.csv')
  const outputLocationsPath = join(csvDir, 'output_locations.csv')

  try {
    if (adjustment.kind === 'indoorShop') {
      const xlsxResult = patchMasterXlsxIndoorNormXY(root, {
        id: adjustment.id,
        normX: adjustment.normX,
        normY: adjustment.normY,
      })
      if (xlsxResult.success) {
        return NextResponse.json({
          ok: true,
          updated: {
            format: 'xlsx' as const,
            file: `scripts/sources/${OUTPUT_MASTER_XLSX_FILENAME}`,
            sheet: xlsxResult.sheet,
            id: adjustment.id,
          },
        })
      }
      const csvOk = patchLocationsCsvIndoorNorm(
        locationsPath,
        outputLocationsPath,
        adjustment.id,
        adjustment.normX,
        adjustment.normY,
      )
      if (csvOk) {
        return NextResponse.json({
          ok: true,
          updated: {
            format: 'csv' as const,
            file: 'scripts/sources/csv/output_locations.csv',
            id: adjustment.id,
          },
        })
      }
      const detail =
        xlsxResult.reason === 'row_not_found'
          ? `xlsx: id が見つかりません（試行シート: ${xlsxResult.triedSheets.join(', ') || '(なし)'}）`
          : 'xlsx マスターがありません'
      return NextResponse.json(
        {
          error: `${detail}. CSV にも該当 id または屋内列（indoor_x/y または x_position/y_position）がありません`,
        },
        { status: 404 },
      )
    }

    const xlsxResult = patchMasterXlsxAdjustment(root, adjustment)
    if (xlsxResult.success) {
      return NextResponse.json({
        ok: true,
        updated: {
          format: 'xlsx' as const,
          file: `scripts/sources/${OUTPUT_MASTER_XLSX_FILENAME}`,
          sheet: xlsxResult.sheet,
          id: adjustment.id,
        },
      })
    }

    /** xlsx が無い／該当行が無いときは従来どおり CSV を試す */
    if (adjustment.kind === 'area') {
      if (!existsSync(areasPath)) {
        const detail =
          xlsxResult.reason === 'row_not_found'
            ? `xlsx: id が見つかりません（試行シート: ${xlsxResult.triedSheets.join(', ') || '(なし)'}）`
            : 'xlsx マスターがありません'
        return NextResponse.json({ error: `${detail}. scripts/sources/csv/areas.csv もありません` }, { status: 404 })
      }
      const areasText = readCsvForOutput(areasPath, outputAreasPath)
      const areasTable = parseCsvWithHeaders(areasText)
      const target = areasTable.rows.find((row) => (row.id ?? '').trim() === adjustment.id)
      if (!target) {
        const xlsxHint =
          xlsxResult.reason === 'row_not_found'
            ? ` xlsx でも未検出（${xlsxResult.triedSheets.join(', ')}）`
            : ''
        return NextResponse.json({ error: `area id not found in CSV: ${adjustment.id}.${xlsxHint}` }, { status: 404 })
      }
      target.lat = toFixedCoord(adjustment.lat)
      target.lng = toFixedCoord(adjustment.lng)
      mkdirSync(dirname(outputAreasPath), { recursive: true })
      writeFileSync(outputAreasPath, stringifyCsvWithHeaders(areasTable), 'utf8')
      return NextResponse.json({
        ok: true,
        updated: {
          format: 'csv' as const,
          file: 'scripts/sources/csv/output_areas.csv',
          id: adjustment.id,
        },
      })
    }

    if (!existsSync(locationsPath)) {
      const detail =
        xlsxResult.reason === 'row_not_found'
          ? `xlsx: id が見つかりません（試行シート: ${xlsxResult.triedSheets.join(', ') || '(なし)'}）`
          : 'xlsx マスターがありません'
      return NextResponse.json({ error: `${detail}. scripts/sources/csv/locations.csv もありません` }, { status: 404 })
    }

    const locationsText = readCsvForOutput(locationsPath, outputLocationsPath)
    const locationsTable = parseCsvWithHeaders(locationsText)
    const target = locationsTable.rows.find((row) => (row.id ?? '').trim() === adjustment.id)
    if (!target) {
      const xlsxHint =
        xlsxResult.reason === 'row_not_found'
          ? ` xlsx でも未検出（${xlsxResult.triedSheets.join(', ')}）`
          : ''
      return NextResponse.json({ error: `location id not found in CSV: ${adjustment.id}.${xlsxHint}` }, { status: 404 })
    }
    target.lat = toFixedCoord(adjustment.lat)
    target.lng = toFixedCoord(adjustment.lng)
    mkdirSync(dirname(outputLocationsPath), { recursive: true })
    writeFileSync(outputLocationsPath, stringifyCsvWithHeaders(locationsTable), 'utf8')
    return NextResponse.json({
      ok: true,
      updated: {
        format: 'csv' as const,
        file: 'scripts/sources/csv/output_locations.csv',
        id: adjustment.id,
      },
    })
  } catch (error) {
    console.error('[api/dev/pin-adjustments]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
