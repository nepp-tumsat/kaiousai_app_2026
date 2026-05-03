import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseCsvWithHeaders, stringifyCsvWithHeaders } from '@/lib/devCsv'

const adjustmentSchema = z.object({
  kind: z.enum(['shop', 'eventLocation', 'area']),
  id: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
})

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

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'development only' }, { status: 403 })
  }

  const parsed = requestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { adjustment } = parsed.data
  const root = process.cwd()
  const csvDir = join(root, 'scripts', 'sources', 'csv')
  const areasPath = join(csvDir, 'areas.csv')
  const locationsPath = join(csvDir, 'locations.csv')
  const outputAreasPath = join(csvDir, 'output_areas.csv')
  const outputLocationsPath = join(csvDir, 'output_locations.csv')

  try {
    if (adjustment.kind === 'area') {
      const areasText = readCsvForOutput(areasPath, outputAreasPath)
      const areasTable = parseCsvWithHeaders(areasText)
      const target = areasTable.rows.find((row) => (row.id ?? '').trim() === adjustment.id)
      if (!target) {
        return NextResponse.json({ error: `area id not found: ${adjustment.id}` }, { status: 404 })
      }
      target.lat = toFixedCoord(adjustment.lat)
      target.lng = toFixedCoord(adjustment.lng)
      writeFileSync(outputAreasPath, stringifyCsvWithHeaders(areasTable), 'utf8')
      return NextResponse.json({ ok: true, updated: { file: 'output_areas.csv', id: adjustment.id } })
    }

    const locationsText = readCsvForOutput(locationsPath, outputLocationsPath)
    const locationsTable = parseCsvWithHeaders(locationsText)
    const target = locationsTable.rows.find((row) => (row.id ?? '').trim() === adjustment.id)
    if (!target) {
      return NextResponse.json({ error: `location id not found: ${adjustment.id}` }, { status: 404 })
    }
    target.lat = toFixedCoord(adjustment.lat)
    target.lng = toFixedCoord(adjustment.lng)
    writeFileSync(outputLocationsPath, stringifyCsvWithHeaders(locationsTable), 'utf8')
    return NextResponse.json({ ok: true, updated: { file: 'output_locations.csv', id: adjustment.id } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
