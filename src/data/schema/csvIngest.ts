import { z } from 'zod'
import {
  eventDaySchema,
  festivalEventSourceSchema,
  type FestivalEventSource,
} from './event'
import { shopCategorySchema, shopSourceSchema, type ShopSource } from './shop'

function parseBoolString(s: string): boolean {
  const v = s.trim().toLowerCase()
  if (v === '' || v === 'null') return false
  if (['false', '0', 'no', 'n', 'f'].includes(v)) return false
  return ['true', '1', 'yes', 'y', 't'].includes(v)
}

/** スプレッドシートの空欄・文字列 null・ハイフンのみを空として扱う */
export function sanitizeCsvCell(s: string | undefined): string {
  if (s === undefined) return ''
  const t = s.trim()
  if (t === '' || t.toLowerCase() === 'null' || t === '-') return ''
  return t
}

const optionalNumber = z
  .string()
  .transform((s) => {
    const t = s.trim()
    if (t === '') return undefined
    const n = Number(t)
    if (Number.isNaN(n)) throw new Error(`数値にできません: ${s}`)
    return n
  })
  .optional()

const boolFromCsv = z.string().transform((s) => parseBoolString(s))

/**
 * スプレッドシート由来の列名ゆらぎを吸収する。
 * - `lat` / `lng` → `center_lat` / `center_lng`（旧ヘッダ互換）
 * - `indoor` → `building`（屋内エリアなら true）
 */
export function normalizeAreaCsvRow(raw: Record<string, string>): Record<string, string> {
  const pick = (keys: string[]) => {
    for (const k of keys) {
      const v = sanitizeCsvCell(raw[k])
      if (v !== '') return v
    }
    return ''
  }
  return {
    id: sanitizeCsvCell(raw.id).replace(/^\ufeff/, ''),
    name: sanitizeCsvCell(raw.name),
    center_lat: pick(['center_lat', 'lat']),
    center_lng: pick(['center_lng', 'lng']),
    building: pick(['building', 'indoor']),
  }
}

/** locations / events など任意 CSV 行のセルに sanitize を掛ける */
function normalizeCsvRowCells(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    let s = sanitizeCsvCell(v)
    if (k === 'id') s = s.replace(/^\ufeff/, '')
    out[k] = s
  }
  return out
}

function pickFirstNonEmptyCell(r: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = sanitizeCsvCell(r[k])
    if (v !== '') return v
  }
  return ''
}

/** 列なし・空欄は「キャンパスにピン表示」（true）。明示の false のみ非表示 */
function normalizeShowOnCampusMapCell(r: Record<string, string>): string {
  if (!('show_on_campus_map' in r)) return 'true'
  const v = sanitizeCsvCell(r.show_on_campus_map)
  if (v === '') return 'true'
  return parseBoolString(v) ? 'true' : 'false'
}

/**
 * マスター（Excel 等）由来のファイル名が NFD のことがあり、Linux 上の実ファイル（多くは NFC）と一致しない。
 * ブラウザが要求する URL パスを OS と揃える。
 */
function normalizeMediaPathUnicode(path: string): string {
  return path.normalize('NFC')
}

/** `img_name` がファイル名のみのとき `shops/` を付ける */
function normalizeLocationImageField(raw: string): string {
  const t = sanitizeCsvCell(raw)
  if (t === '') return ''
  const rel =
    t.startsWith('shops/') || t.startsWith('events/') ? t : `shops/${t}`
  return normalizeMediaPathUnicode(rel)
}

/**
 * 旧形式（`public` なし）と新形式（`public` 列あり）を正規化し、
 * 新形式では CSV の `area_id` を `indoor_area_id` に、屋外は `outdoor_area_id` 系列から取る。
 */
export function normalizeLocationCsvRow(raw: Record<string, string>): Record<string, string> {
  const r = normalizeCsvRowCells(raw)
  const id = sanitizeCsvCell(r.id).replace(/^\ufeff/, '')
  const nameRaw = sanitizeCsvCell(r.name)
  const org = sanitizeCsvCell(r.organization)
  const name = nameRaw !== '' ? nameRaw : org !== '' ? org : id
  const description = sanitizeCsvCell(r.description)
  const displayTitle = sanitizeCsvCell(r.display_title)

  const isNewShape = 'public' in r

  if (isNewShape) {
    const rawAreaId = sanitizeCsvCell(r.area_id)
    const evLoc = parseBoolString(sanitizeCsvCell(r.is_event_location))
    return {
      id,
      name,
      outdoor_area_id: pickFirstNonEmptyCell(r, ['outdoor_area_id', 'festival_area_id', 'map_area_id']),
      /** イベント会場でないときのみ屋内用。イベント会場のときは `area_id` を屋外エリア id として `event_pin_area_id` に使う */
      indoor_area_id: evLoc ? '' : rawAreaId,
      event_pin_area_id: evLoc ? rawAreaId : '',
      organization: org,
      department: sanitizeCsvCell(r.department),
      description,
      display_title: displayTitle,
      lat: sanitizeCsvCell(r.lat),
      lng: sanitizeCsvCell(r.lng),
      indoor_x: sanitizeCsvCell(r.indoor_x),
      indoor_y: sanitizeCsvCell(r.indoor_y),
      image: normalizeLocationImageField(r.img_name ?? r.image),
      on_map: sanitizeCsvCell(r.public),
      categories: sanitizeCsvCell(r.categories),
      is_shop: sanitizeCsvCell(r.is_shop),
      is_event_location: sanitizeCsvCell(r.is_event_location),
      is_facility: sanitizeCsvCell(r.is_facility),
      is_exhibit: sanitizeCsvCell(r.is_exhibit),
      show_on_campus_map: normalizeShowOnCampusMapCell(r),
      indoor_plan_map_id: sanitizeCsvCell(r.indoor_plan_map_id),
    }
  }

  const legacyAreaId = sanitizeCsvCell(r.area_id)
  const legacyEvLoc = parseBoolString(sanitizeCsvCell(r.is_event_location ?? ''))
  return {
    id,
    name,
    outdoor_area_id: legacyAreaId,
    indoor_area_id: '',
    event_pin_area_id: legacyEvLoc ? legacyAreaId : '',
    organization: org,
    department: '',
    description,
    display_title: displayTitle,
    lat: sanitizeCsvCell(r.lat),
    lng: sanitizeCsvCell(r.lng),
    indoor_x: '',
    indoor_y: '',
    image: normalizeLocationImageField(r.image),
    on_map: sanitizeCsvCell(r.on_map),
    categories: sanitizeCsvCell(r.categories),
    is_shop: sanitizeCsvCell(r.categories) !== '' ? 'true' : 'false',
    is_event_location: sanitizeCsvCell(r.is_event_location ?? 'false'),
    is_facility: 'false',
    is_exhibit: 'false',
    show_on_campus_map: 'true',
    indoor_plan_map_id: '',
  }
}

/**
 * scripts/sources/csv/areas.csv の1行
 * - `name` が空（sanitize 後）の行は `parseCsvAreaRows` で捨て、ingest 対象に含めない
 */
export const csvAreaRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(''),
  center_lat: optionalNumber,
  center_lng: optionalNumber,
  building: boolFromCsv,
})

export type CsvAreaRow = z.infer<typeof csvAreaRowSchema>

/** タイムテーブル・マップのラベル。ingest 済みエリアは常に name あり（空は CSV から除外） */
export function areaDisplayLabel(area: Pick<CsvAreaRow, 'id' | 'name'>): string {
  const n = area.name.trim()
  return n !== '' ? n : area.id
}

/**
 * scripts/sources/csv/locations.csv
 * - **旧形式**: `on_map`, `area_id`（= 屋外 `areas.csv` の id）, `categories`, …
 * - **新形式**（`public` 列あり）: `public`→掲載/マップ,
 *   `is_event_location=true` のとき CSV `area_id` は **屋外 `areas.csv` の id**（マップピン座標用 `event_pin_area_id`）。それ以外の行では `area_id`→屋内用 `indoor_area_id`。
 *   屋外エリア（店舗ラベル等）は任意列 `outdoor_area_id` / `festival_area_id` / `map_area_id`
 * - `show_on_campus_map`: 屋外キャンパス上の店舗ピン。屋内フロア専用なら false（省略時 true）
 * - `indoor_plan_map_id`: 屋内ピンを置く `maps` の行 id（`1-1` 等）。屋外のみなら空
 */
export const csvLocationRowSchema = z.object({
  id: z.string().min(1),
  /** 屋外マップ・店舗の「エリア」表示・centroid 用（`areas.csv` の id） */
  outdoor_area_id: z.string().default(''),
  /** 屋内マップ用のゾーン等（新形式では CSV の `area_id` をここに入れる） */
  indoor_area_id: z.string().default(''),
  /**
   * `is_event_location` のとき CSV `area_id`（= `areas.csv` の id）を入れ、lat/lng 空のときマップ座標解決に使う。
   */
  event_pin_area_id: z.string().default(''),
  /** 会場の細かい名称（タイムテーブルの「場所」・店の `location`） */
  name: z.string().min(1),
  /** マップ・店舗の見出し。空なら `name` をタイトルに使う */
  display_title: z.string().default(''),
  description: z.string().default(''),
  organization: z.string().default(''),
  department: z.string().default(''),
  lat: optionalNumber,
  lng: optionalNumber,
  indoor_x: optionalNumber,
  indoor_y: optionalNumber,
  image: z.string().default(''),
  on_map: boolFromCsv,
  /** カンマ区切り。模擬店カテゴリ。空のときは `is_facility` / `is_exhibit` から推定 */
  categories: z.string().default(''),
  /** 新形式: CSV の `is_shop`。旧形式では normalize 時に categories の有無で決める */
  is_shop: boolFromCsv,
  is_event_location: boolFromCsv,
  is_facility: boolFromCsv,
  is_exhibit: boolFromCsv,
  show_on_campus_map: boolFromCsv,
  indoor_plan_map_id: z.string().default(''),
})

export type CsvLocationRow = z.infer<typeof csvLocationRowSchema>

function inferShopCategoriesWhenEmpty(loc: CsvLocationRow): z.infer<typeof shopCategorySchema>[] {
  if (loc.is_facility) return ['facility']
  if (loc.is_exhibit) return ['experience']
  return ['food']
}

/** JST の YYYY-MM-DD */
export function deriveDayJstFromIso(isoDateTime: string): string {
  const d = new Date(isoDateTime)
  if (Number.isNaN(d.getTime())) throw new Error(`日時として解釈できません: ${isoDateTime}`)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** JST の HH:mm */
export function deriveHmJstFromIso(isoDateTime: string): string {
  const d = new Date(isoDateTime)
  if (Number.isNaN(d.getTime())) throw new Error(`日時として解釈できません: ${isoDateTime}`)
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

/** `9:30` または ISO 日時 → timetable 用 HH:mm */
function normalizeTimeHmForEvent(raw: string): string {
  const t = sanitizeCsvCell(raw)
  if (t === '') throw new Error('時刻が空です')
  if (t.includes('T')) return deriveHmJstFromIso(t)
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) throw new Error(`時刻の形式が不正です（H:mm または ISO）: ${raw}`)
  const h = Number(m[1])
  const min = m[2]
  if (h < 0 || h > 23 || Number(min) > 59) throw new Error(`時刻が範囲外です: ${raw}`)
  return `${String(h).padStart(2, '0')}:${min}`
}

/** イベント画像: 空はプレースホルダ、ファイル名のみは `events/` を付与 */
function normalizeEventCsvImageField(raw: string): string {
  const t = sanitizeCsvCell(raw)
  if (t === '') return 'events/placeholder.png'
  const rel = t.startsWith('events/') ? t : `events/${t.replace(/^\//, '')}`
  return normalizeMediaPathUnicode(rel)
}

function whenFlagsToWeatherMode(sunnyRaw: string, rainyRaw: string): 'sunny' | 'rainy' | 'both' {
  const s = parseBoolString(sunnyRaw)
  const r = parseBoolString(rainyRaw)
  if (s && r) return 'both'
  if (s) return 'sunny'
  if (r) return 'rainy'
  return 'both'
}

/**
 * 旧 events.csv（ISO `start_time` / `weather_mode` / `published`）と
 * 新形式（`public`, `sunny_location_id`/`rainy_location_id` または `location_id`, …）を正規化する。
 */
export function normalizeEventCsvRow(raw: Record<string, string>): Record<string, string> {
  const r = normalizeCsvRowCells(raw)
  const id = sanitizeCsvCell(r.id).replace(/^\ufeff/, '')
  const title = sanitizeCsvCell(r.title)
  const organization = sanitizeCsvCell(r.organization)
  const description = sanitizeCsvCell(r.description)

  const isNewShape = 'public' in r

  if (isNewShape) {
    const day = sanitizeCsvCell(r.day)
    const st = normalizeTimeHmForEvent(r.start_time)
    const et = normalizeTimeHmForEvent(r.end_time)
    const wm = whenFlagsToWeatherMode(r.when_sunny ?? '', r.when_rainy ?? '')
    const location_id = sanitizeCsvCell(r.location_id)
    const sunnyId = sanitizeCsvCell(r.sunny_location_id)
    const rainyId = sanitizeCsvCell(r.rainy_location_id)
    const hasSplitVenues = sunnyId !== '' && rainyId !== ''
    return {
      id,
      location_id: hasSplitVenues ? '' : location_id !== '' ? location_id : sunnyId,
      sunny_location_id: hasSplitVenues ? sunnyId : '',
      rainy_location_id: hasSplitVenues ? rainyId : '',
      need_ticket_when_rainy: sanitizeCsvCell(r.need_ticket_when_rainy),
      title,
      organization,
      department: sanitizeCsvCell(r.department),
      description,
      day,
      start_time: st,
      end_time: et,
      weather_mode: wm,
      published: sanitizeCsvCell(r.public),
      image: normalizeEventCsvImageField(r.img_name ?? r.image),
    }
  }

  const location_id = sanitizeCsvCell(r.location_id)
  const isoStart = sanitizeCsvCell(r.start_time)
  const isoEnd = sanitizeCsvCell(r.end_time)
  return {
    id,
    location_id,
    sunny_location_id: '',
    rainy_location_id: '',
    need_ticket_when_rainy: 'false',
    title,
    organization,
    department: '',
    description,
    day: deriveDayJstFromIso(isoStart),
    start_time: normalizeTimeHmForEvent(isoStart),
    end_time: normalizeTimeHmForEvent(isoEnd),
    weather_mode: sanitizeCsvCell(r.weather_mode).toLowerCase(),
    published: sanitizeCsvCell(r.published),
    image: normalizeEventCsvImageField(r.image),
  }
}

const weatherModeCsv = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.enum(['sunny', 'rainy', 'both']))

/**
 * scripts/sources/csv/events.csv の1行（`normalizeEventCsvRow` 後の形）
 * - 新形式: 会場 id は `sunny_location_id`+`rainy_location_id` または単一 `location_id`
 * - 旧形式: ISO `start_time`/`end_time`, `weather_mode`, `published`, `image`
 */
export const csvEventRowSchema = z
  .object({
    id: z.string().min(1),
    location_id: z.string().default(''),
    sunny_location_id: z.string().default(''),
    rainy_location_id: z.string().default(''),
    need_ticket_when_rainy: boolFromCsv,
    title: z.string().min(1),
    organization: z.string().default(''),
    department: z.string().default(''),
    description: z.string().default(''),
    day: eventDaySchema,
    start_time: z.string().min(1),
    end_time: z.string().min(1),
    weather_mode: weatherModeCsv,
    published: boolFromCsv,
    image: z.string().min(1),
  })
  .refine(
    (row) => {
      const pair = row.sunny_location_id.trim() !== '' && row.rainy_location_id.trim() !== ''
      const single = row.location_id.trim() !== ''
      return pair || single
    },
    { message: 'location_id、または sunny_location_id と rainy_location_id のいずれかが必要' },
  )

export type CsvEventRow = z.infer<typeof csvEventRowSchema>

function parseCategories(raw: string): z.infer<typeof shopCategorySchema>[] {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const out: z.infer<typeof shopCategorySchema>[] = []
  for (const p of parts) {
    const r = shopCategorySchema.safeParse(p)
    if (r.success) out.push(r.data)
  }
  return out
}

function weatherModeFromCsv(mode: CsvEventRow['weather_mode']): '' | 'sunny' | 'rainy' {
  if (mode === 'both') return ''
  return mode
}

function areaLabelForLocation(
  areaById: Map<string, CsvAreaRow>,
  loc: CsvLocationRow,
): string {
  const outdoor = loc.outdoor_area_id.trim()
  const pin = loc.event_pin_area_id.trim()
  const idForArea = outdoor !== '' ? outdoor : pin
  const a = idForArea !== '' ? areaById.get(idForArea) : undefined
  return a ? areaDisplayLabel(a) : ''
}

export function csvRowsToFestivalEventSources(
  areas: CsvAreaRow[],
  locations: CsvLocationRow[],
  events: CsvEventRow[],
): FestivalEventSource[] {
  const areaById = new Map(areas.map((a) => [a.id, a]))
  const locById = new Map(locations.map((l) => [l.id, l]))

  const out: FestivalEventSource[] = []
  for (const ev of events) {
    const descriptionParts = [ev.description.trim(), ev.department.trim()].filter(Boolean)
    const description =
      descriptionParts.length > 0 ? descriptionParts.join('\n') : ev.description

    const hasSplit =
      ev.sunny_location_id.trim() !== '' && ev.rainy_location_id.trim() !== ''
    if (hasSplit) {
      const locS = locById.get(ev.sunny_location_id)
      const locR = locById.get(ev.rainy_location_id)
      if (!locS) {
        throw new Error(
          `events.csv: sunny_location_id が不明です: ${ev.sunny_location_id} (event ${ev.id})`,
        )
      }
      if (!locR) {
        throw new Error(
          `events.csv: rainy_location_id が不明です: ${ev.rainy_location_id} (event ${ev.id})`,
        )
      }
      const row = {
        id: ev.id,
        day: ev.day,
        weatherMode: weatherModeFromCsv(ev.weather_mode),
        startTime: ev.start_time,
        endTime: ev.end_time,
        title: ev.title,
        area: areaLabelForLocation(areaById, locS),
        areaRainy: areaLabelForLocation(areaById, locR),
        location: locS.name,
        locationRainy: locR.name,
        needTicketWhenRainy: ev.need_ticket_when_rainy,
        description,
        organization: ev.organization,
        published: ev.published,
        image: ev.image,
      }
      out.push(festivalEventSourceSchema.parse(row))
      continue
    }

    const loc = locById.get(ev.location_id)
    if (!loc) throw new Error(`events.csv: location_id が不明です: ${ev.location_id} (event ${ev.id})`)
    const areaLabel = areaLabelForLocation(areaById, loc)

    const row = {
      id: ev.id,
      day: ev.day,
      weatherMode: weatherModeFromCsv(ev.weather_mode),
      startTime: ev.start_time,
      endTime: ev.end_time,
      title: ev.title,
      area: areaLabel,
      areaRainy: '',
      location: loc.name,
      locationRainy: '',
      needTicketWhenRainy: ev.need_ticket_when_rainy,
      description,
      organization: ev.organization,
      published: ev.published,
      image: ev.image,
    }
    out.push(festivalEventSourceSchema.parse(row))
  }
  return out
}

export function csvRowsToShopSources(areas: CsvAreaRow[], locations: CsvLocationRow[]): ShopSource[] {
  const areaById = new Map(areas.map((a) => [a.id, a]))
  const out: ShopSource[] = []

  for (const loc of locations) {
    if (!loc.on_map) continue
    const showAsShopOrFacility = loc.is_shop || loc.is_facility
    if (!showAsShopOrFacility) continue
    /** `is_event_location` のみ（模擬店でない）は `map-areas.json` の菱形ピンで表示するため、円ピンは二重にしない */
    if (loc.is_event_location && !loc.is_shop) continue
    let cats = parseCategories(loc.categories)
    if (cats.length === 0) cats = inferShopCategoriesWhenEmpty(loc)
    const area =
      loc.outdoor_area_id.trim() !== '' ? areaById.get(loc.outdoor_area_id) : undefined
    const areaLabel = area ? areaDisplayLabel(area) : ''

    if (loc.lat === undefined || loc.lng === undefined) {
      throw new Error(
        `locations.csv: on_map=true かつ is_shop / is_facility だが lat/lng がありません (location ${loc.id})`,
      )
    }

    const title = loc.display_title.trim() !== '' ? loc.display_title.trim() : loc.name
    const image =
      loc.image.trim() !== ''
        ? loc.image.trim()
        : 'shops/placeholder.png'

    const row = {
      sourceLocationId: loc.id,
      organization: loc.organization,
      title,
      description: loc.description.trim() !== '' ? loc.description : title,
      area: areaLabel,
      location: loc.name,
      coordinates: [loc.lat, loc.lng] as [number, number],
      image,
      category: cats[0],
      showOnCampusMap: loc.show_on_campus_map,
      indoorPlanMapId: loc.indoor_plan_map_id.trim(),
      indoorX: loc.indoor_x,
      indoorY: loc.indoor_y,
    }
    out.push(shopSourceSchema.parse(row))
  }
  return out
}

export function parseCsvAreaRows(raw: Record<string, string>[]): CsvAreaRow[] {
  const out: CsvAreaRow[] = []
  for (let i = 0; i < raw.length; i++) {
    try {
      const row = csvAreaRowSchema.parse(normalizeAreaCsvRow(raw[i]))
      if (row.name.trim() === '') continue
      out.push(row)
    } catch (e) {
      throw new Error(`areas.csv ${i + 2} 行目: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}

export function parseCsvLocationRows(raw: Record<string, string>[]): CsvLocationRow[] {
  return raw.map((r, i) => {
    try {
      return csvLocationRowSchema.parse(normalizeLocationCsvRow(r))
    } catch (e) {
      throw new Error(`locations.csv ${i + 2} 行目: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}

export function parseCsvEventRows(raw: Record<string, string>[]): CsvEventRow[] {
  return raw.map((r, i) => {
    try {
      return csvEventRowSchema.parse(normalizeEventCsvRow(r))
    } catch (e) {
      throw new Error(`events.csv ${i + 2} 行目: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}
