/**
 * scripts/sources の JSON、または scripts/sources/csv の CSV、またはマスター xlsx を検証し、
 * src/data/generated に書き出す。
 *
 * 優先順位:
 * 1. `scripts/sources/海王祭アプリ2026マスターデータ.xlsx` があればそこから（CSV より優先）
 * 2. `scripts/sources/csv/` に areas.csv / locations.csv / events.csv がすべてある場合は CSV
 * 3. それ以外は従来どおり `scripts/sources/events.json` と `shops.json`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildFestivalEventsFromSources,
  festivalEventSourceListSchema,
  type FestivalEventSource,
} from '../src/data/schema/event'
import {
  csvRowsToFestivalEventSources,
  csvRowsToShopSources,
  parseCsvAreaRows,
  parseCsvEventRows,
  parseCsvLocationRows,
} from '../src/data/schema/csvIngest'
import { indoorMapsPayloadSchema } from '../src/data/schema/indoorMaps'
import {
  buildMapAreasPayload,
  emptyMapAreasPayload,
  DEFAULT_SHOP_PINS_MIN_ZOOM,
} from '../src/data/schema/mapAreas'
import { buildShopsFromSources, shopSourceListSchema, type ShopSource } from '../src/data/schema/shop'
import { readCsvFile } from './lib/parseCsv'
import { MASTER_XLSX_FILENAME, readMasterXlsx } from './lib/readMasterXlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const sourcesDir = join(root, 'scripts/sources')
const csvDir = join(sourcesDir, 'csv')
const outDir = join(root, 'src/data/generated')

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

function writeJson(filename: string, data: unknown): void {
  const text = `${JSON.stringify(data, null, 2)}\n`
  writeFileSync(join(outDir, filename), text, 'utf8')
}

mkdirSync(outDir, { recursive: true })

const csvNames = ['areas.csv', 'locations.csv', 'events.csv'] as const
const csvPaths = csvNames.map((n) => join(csvDir, n))
const allCsvPresent = csvPaths.every((p) => existsSync(p))
const anyCsvPresent = csvPaths.some((p) => existsSync(p))

const masterXlsxPath = join(sourcesDir, MASTER_XLSX_FILENAME)
const masterXlsxPresent = existsSync(masterXlsxPath)

if (anyCsvPresent && !allCsvPresent && !masterXlsxPresent) {
  throw new Error(
    `scripts/sources/csv/ に ${csvNames.join(' / ')} の3つすべてが必要です（欠けているファイルがあります）`,
  )
}

let shopSources: ShopSource[]
let eventSources: FestivalEventSource[]

let mapAreasPayload = emptyMapAreasPayload

if (masterXlsxPresent) {
  const xlsx = readMasterXlsx(readFileSync(masterXlsxPath))
  const areas = parseCsvAreaRows(xlsx.areas)
  const locations = parseCsvLocationRows(xlsx.locations)
  const eventRows = parseCsvEventRows(xlsx.events)
  eventSources = csvRowsToFestivalEventSources(areas, locations, eventRows)
  shopSources = csvRowsToShopSources(areas, locations)
  mapAreasPayload = buildMapAreasPayload(areas, locations, DEFAULT_SHOP_PINS_MIN_ZOOM, {
    outdoorMapImage: xlsx.outdoorMapImage,
    mapCatalog: xlsx.mapCatalog,
  })
  console.log(`ingest: source=xlsx (scripts/sources/${MASTER_XLSX_FILENAME})`)
} else if (allCsvPresent) {
  const areas = parseCsvAreaRows(readCsvFile(csvPaths[0]))
  const locations = parseCsvLocationRows(readCsvFile(csvPaths[1]))
  const eventRows = parseCsvEventRows(readCsvFile(csvPaths[2]))
  eventSources = csvRowsToFestivalEventSources(areas, locations, eventRows)
  shopSources = csvRowsToShopSources(areas, locations)
  mapAreasPayload = buildMapAreasPayload(areas, locations, DEFAULT_SHOP_PINS_MIN_ZOOM)
  console.log('ingest: source=csv (scripts/sources/csv/)')
} else {
  const shopsRaw = readJson(join(sourcesDir, 'shops.json'))
  shopSources = shopSourceListSchema.parse(shopsRaw)
  const eventsRaw = readJson(join(sourcesDir, 'events.json'))
  eventSources = festivalEventSourceListSchema.parse(eventsRaw)
  console.log('ingest: source=json (scripts/sources/*.json)')
}

const shops = buildShopsFromSources(shopSources)
writeJson('shops.json', shops)

const events = buildFestivalEventsFromSources(eventSources)
writeJson('events.json', events)

writeJson('map-areas.json', mapAreasPayload)

const indoorMapsPath = join(sourcesDir, 'indoor-maps.json')
if (!existsSync(indoorMapsPath)) {
  throw new Error('scripts/sources/indoor-maps.json が必要です（屋内マップ設定）')
}
const indoorMapsPayload = indoorMapsPayloadSchema.parse(readJson(indoorMapsPath))
writeJson('indoor-maps.json', indoorMapsPayload)

console.log(
  'ingest: wrote src/data/generated/shops.json, events.json, map-areas.json, indoor-maps.json',
)
