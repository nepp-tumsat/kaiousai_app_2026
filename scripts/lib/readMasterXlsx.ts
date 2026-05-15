import * as XLSX from 'xlsx'

/** `scripts/sources/海王祭アプリ2026マスターデータ.xlsx` の既定ファイル名 */
export const MASTER_XLSX_FILENAME = '海王祭アプリ2026マスターデータ.xlsx'

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return ''
    return Number.isInteger(v) ? String(v) : String(v)
  }
  return String(v).trim()
}

/** マスタのエリア id（`AR_01`）をアプリ側の `AR-01` 形式に揃える */
function normalizeAreaId(raw: string): string {
  const s = cellToString(raw)
  return /^AR_\d+/i.test(s) ? s.replace(/^AR_/i, 'AR-') : s
}

/**
 * マスター Excel の `publish_status` を解釈する。
 * `not_published` / `wip` など明示の非掲載は除外し、空欄は施設シート等との互換のため掲載扱い。
 */
function isTruthyPublishStatus(status: string): boolean {
  const s = cellToString(status).toLowerCase().replace(/[\s-]+/g, '_')
  if (s === '') return true

  const falsy = new Set([
    'draft',
    'hidden',
    'unpublished',
    'not_published',
    'nopublish',
    'no_publish',
    'false',
    '0',
    'no',
    'n',
    'private',
    'wip',
    'in_progress',
    'archive',
    'archived',
    '非公開',
    '下書き',
    '未公開',
  ])
  if (falsy.has(s)) return false

  const truthy = new Set([
    'published',
    'publish',
    'true',
    '1',
    'yes',
    'y',
    't',
    '公開',
    '掲載',
  ])
  if (truthy.has(s)) return true

  // 想定外の値は誤掲載を避けて非掲載
  return false
}

/**
 * 行の掲載可否を判定する。
 * 新形式（`is_published`: boolean / 文字列）を優先し、無ければ旧形式（`publish_status`: 文字列）にフォールバック。
 * どちらの列も存在しない行は互換のため掲載扱い。
 */
function isRowPublished(row: Record<string, unknown>): boolean {
  if ('is_published' in row) {
    const v = row.is_published
    if (typeof v === 'boolean') return v
    return isTruthyPublishStatus(cellToString(v))
  }
  if ('publish_status' in row) {
    return isTruthyPublishStatus(cellToString(row.publish_status))
  }
  return true
}

function hasLatLng(lat: unknown, lng: unknown): boolean {
  const la = cellToString(lat)
  const ln = cellToString(lng)
  if (la === '' || ln === '') return false
  return !Number.isNaN(Number(la)) && !Number.isNaN(Number(ln))
}

/** Excel 日付シリアル（1900 年基準）→ JST の `YYYY-MM-DD`（`XLSX.SSF` はバンドルにより未定義のことがあるため自前変換） */
function excelSerialToYmd(serial: number): string {
  const d = new Date((serial - 25569) * 86400 * 1000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Excel の日付シリアルまたは文字列 → `YYYY-MM-DD` */
function dayCellToYmd(v: unknown): string {
  if (typeof v === 'number' && !Number.isNaN(v)) return excelSerialToYmd(v)
  const s = cellToString(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // 文字列の「2026/5/16」「2026/05/16」等（Excel 表示形式のコピー等）
  const slash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s)
  if (slash) {
    const y = slash[1]
    const mo = String(Number(slash[2])).padStart(2, '0')
    const d = String(Number(slash[3])).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  throw new Error(`日付セルを解釈できません: ${String(v)}`)
}

/** 0〜1 の時刻（1日の小数）→ `HH:mm` */
function excelTimeFractionToHm(v: unknown): string {
  if (typeof v === 'number' && !Number.isNaN(v)) {
    const totalMinutes = Math.round(v * 24 * 60)
    const h = Math.floor(totalMinutes / 60) % 24
    const m = totalMinutes % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const s = cellToString(v)
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const m = s.match(/^(\d{1,2}):(\d{2})$/)
    if (m) return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`
  }
  throw new Error(`時刻セルを解釈できません: ${String(v)}`)
}

export type MasterXlsxMapCatalogEntry = {
  id: string
  name: string
  relatedAreaId: string
  image: string
}

export type MasterXlsxAmenityKind = 'toilet' | 'smoking' | 'aed' | 'fire_extinguisher'

export type MasterXlsxAmenity = {
  kind: MasterXlsxAmenityKind
  id: string
  /** `areas` シートの建物・エリア名（吹き出しの主表示） */
  buildingName: string
  coordinates: [number, number]
}

export type MasterXlsxRows = {
  areas: Record<string, string>[]
  locations: Record<string, string>[]
  events: Record<string, string>[]
  /** `id` が `campus` の掲載行の画像。無ければ ingest 側で既定を使う */
  outdoorMapImage?: string
  /** `maps` シートの掲載行（屋外キャンパス＋屋内フロア図など） */
  mapCatalog: MasterXlsxMapCatalogEntry[]
  /** 付帯設備ピン（areas シートの has_toilet / 喫煙所等から組み立て） */
  amenities: MasterXlsxAmenity[]
}

/**
 * 海王祭マスター Excel（シート: maps / areas / facilities / shops / stage_timetable）を
 * `parseCsv*` が受け取る行配列に変換する。
 *
 * - `facilities` / `shops` の **`map`**: `maps` シートの `id`（屋外は `campus`、屋内フロアは `1-1` 等）。
 *   `related_area` と突き合わせて `outdoor_area_id` を埋める。座標が空ならそのエリアの代表 lat/lng にフォールバックする。
 *   **`map` が `campus`（または空）以外**の行は `show_on_campus_map=false`（屋外キャンパスマップではピン非表示。一覧・詳細は従来どおり）。
 *   **`x_position` / `y_position`**: 屋内マップのピン位置（画像左上原点）。`0〜1` は正規化、それを超える値はピクセルとして画像サイズで割る。
 */
function sheetByNameInsensitive(wb: XLSX.WorkBook, want: string): XLSX.WorkSheet | undefined {
  const key = want.toLowerCase()
  const name = wb.SheetNames.find((n) => n.toLowerCase() === key)
  return name ? wb.Sheets[name] : undefined
}

/**
 * `img_name` → `public/images/` からの相対パス（例 `map/campus-map.webp`）。
 * 配信は WebP に統一しているので、xlsx 側が `.png` でも出力時に `.webp` 拡張子に正規化する。
 * 実体は `scripts/lib/generateThumbnails.ts` が `public/images/map/` に WebP を生成する。
 */
function normalizeMapsSheetImage(raw: unknown): string {
  let t = cellToString(raw)
  if (t === '') return ''
  t = t.replace(/^\//, '')
  if (/^map\//i.test(t)) t = t.slice(4)
  if (!/^[a-z0-9._-]+\.(png|jpg|jpeg|webp)$/i.test(t)) {
    throw new Error(`maps シート img_name が不正（英数字・._- と拡張子のみ）: ${cellToString(raw)}`)
  }
  const webp = t.replace(/\.(png|jpe?g|webp)$/i, '.webp')
  return `map/${webp}`
}

/** `maps` シートの `id`（例 `1-1`, `campus`）→ `related_area` を正規化した屋外エリア id */
function buildMapIdToOutdoorAreaId(catalog: MasterXlsxMapCatalogEntry[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of catalog) {
    const rid = e.relatedAreaId.trim()
    if (e.id === '' || rid === '') continue
    m.set(e.id, normalizeAreaId(rid))
  }
  return m
}

/**
 * facilities / shops の `map` セルから屋外エリア id を求める。
 * - 空・`campus`（大小無視）→ 屋外エリア紐付けなし
 * - それ以外 → maps カタログの `related_area`
 */
function outdoorAreaIdFromMapCell(
  mapRaw: unknown,
  mapIdToOutdoorAreaId: Map<string, string>,
  sheet: 'facilities' | 'shops',
  rowId: string,
): string {
  const mapKey = cellToString(mapRaw).trim()
  if (mapKey === '' || mapKey.toLowerCase() === 'campus') return ''
  const resolved = mapIdToOutdoorAreaId.get(mapKey)
  if (resolved === undefined) {
    throw new Error(
      `${sheet} シート: map が maps シートの id と一致しません (行 id=${rowId}, map="${mapKey}")`,
    )
  }
  return resolved
}

/** `areas` シート上のエリア中心 lat/lng（屋内マップのみで座標が空の行のフォールバック用） */
function outdoorAreaCenterFromAreasSheet(
  areasRaw: Record<string, unknown>[],
  outdoorAreaId: string,
): { lat: string; lng: string } | null {
  const want = normalizeAreaId(outdoorAreaId)
  for (const row of areasRaw) {
    const id = normalizeAreaId(cellToString(row.id))
    if (id !== want) continue
    if (!hasLatLng(row.lat, row.lng)) return null
    return { lat: cellToString(row.lat), lng: cellToString(row.lng) }
  }
  return null
}

/**
 * `areas` シートの生データから付帯設備ピン（amenities）を抽出する。
 * - `has_toilet=TRUE` のエリア座標 → トイレピン
 * - `has_aed=TRUE` のエリア座標 → AED ピン
 * - `name` に「喫煙」を含む（AR_07 喫煙所など） → 喫煙所ピン
 *
 * 喫煙所は `publish_status=not_published` でも採用する（チェックボックスで明示表示するため）。
 * AED は緊急設備のため `has_aed=TRUE` なら `publish_status` に関係なく採用する（例: 先端科学技術研究センター）。
 * トイレは `publish_status` を尊重する（非公開エリアの設備は出さない）。
 */
function readAmenitiesFromAreas(
  areasRaw: Record<string, unknown>[],
): MasterXlsxAmenity[] {
  const out: MasterXlsxAmenity[] = []
  for (const row of areasRaw) {
    const id = normalizeAreaId(cellToString(row.id))
    const name = cellToString(row.name)
    if (id === '' || name === '') continue
    const lat = Number(cellToString(row.lat))
    const lng = Number(cellToString(row.lng))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const isPublished = isRowPublished(row)
    const hasToilet = String(cellToString(row.has_toilet)).toLowerCase() === 'true'
    const hasAed = String(cellToString(row.has_aed)).toLowerCase() === 'true'
    const hasFireExtinguisher = String(cellToString(row.has_fire_extinguisher)).toLowerCase() === 'true'
    const isSmoking = name.includes('喫煙')

    if (isSmoking) {
      out.push({
        kind: 'smoking',
        id: `${id}-smoking`,
        buildingName: name,
        coordinates: [lat, lng],
      })
    }
    if (hasToilet && isPublished) {
      out.push({
        kind: 'toilet',
        id: `${id}-toilet`,
        buildingName: name,
        coordinates: [lat, lng],
      })
    }
    if (hasAed) {
      out.push({
        kind: 'aed',
        id: `${id}-aed`,
        buildingName: name,
        coordinates: [lat, lng],
      })
    }
    if (hasFireExtinguisher) {
      out.push({
        kind: 'fire_extinguisher',
        id: `${id}-fire_extinguisher`,
        buildingName: name,
        coordinates: [lat, lng],
      })
    }
  }
  return out
}

function readMapsSheet(wb: XLSX.WorkBook): {
  outdoorMapImage?: string
  mapCatalog: MasterXlsxMapCatalogEntry[]
} {
  const ws = sheetByNameInsensitive(wb, 'maps')
  if (!ws) return { mapCatalog: [] }

  const mapsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: true,
  })

  const mapCatalog: MasterXlsxMapCatalogEntry[] = []
  let outdoorMapImage: string | undefined

  for (const row of mapsRaw) {
    const id = cellToString(row.id)
    const name = cellToString(row.name)
    if (id === '') continue
    if (!isRowPublished(row)) continue
    const image = normalizeMapsSheetImage(row.img_name)
    if (image === '') continue
    const relatedAreaId = normalizeAreaId(cellToString(row.related_area))
    mapCatalog.push({ id, name: name !== '' ? name : id, relatedAreaId, image })
    if (id.toLowerCase() === 'campus') {
      outdoorMapImage = image
    }
  }

  return { outdoorMapImage, mapCatalog }
}

export function readMasterXlsx(buf: Buffer): MasterXlsxRows {
  const wb = XLSX.read(buf, { type: 'buffer' })

  const areasWs = sheetByNameInsensitive(wb, 'areas')
  const facilitiesWs = sheetByNameInsensitive(wb, 'facilities')
  const shopsWs = sheetByNameInsensitive(wb, 'shops')
  const timetableWs = sheetByNameInsensitive(wb, 'stage_timetable')
  if (!areasWs || !facilitiesWs || !shopsWs || !timetableWs) {
    const have = wb.SheetNames.join(', ')
    throw new Error(
      `マスター xlsx に必須シートがありません（areas / facilities / shops / stage_timetable）。実際のシート: ${have}`,
    )
  }

  const { outdoorMapImage, mapCatalog } = readMapsSheet(wb)
  const mapIdToOutdoorAreaId = buildMapIdToOutdoorAreaId(mapCatalog)

  const areasRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(areasWs, {
    defval: '',
    raw: true,
  })
  const amenities = readAmenitiesFromAreas(areasRaw)
  const areas: Record<string, string>[] = []
  for (const row of areasRaw) {
    const id = normalizeAreaId(cellToString(row.id))
    const name = cellToString(row.name)
    if (id === '' || name === '') continue
    if (!isRowPublished(row)) continue
    areas.push({
      id,
      name,
      lat: cellToString(row.lat),
      lng: cellToString(row.lng),
      separated_map: '',
      num_map: '',
    })
  }

  const facilitiesRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(facilitiesWs, {
    defval: '',
    raw: true,
  })
  const shopsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(shopsWs, {
    defval: '',
    raw: true,
  })

  const locations: Record<string, string>[] = []

  for (const row of facilitiesRaw) {
    const id = cellToString(row.id)
    const name = cellToString(row.name)
    if (id === '' || name === '') continue
    const mapKey = cellToString(row.map).trim()
    const outdoor_area_id = outdoorAreaIdFromMapCell(row.map, mapIdToOutdoorAreaId, 'facilities', id)
    const show_on_campus_map = mapKey === '' || mapKey.toLowerCase() === 'campus' ? 'true' : 'false'
    let lat = cellToString(row.lat)
    let lng = cellToString(row.lng)
    if (!hasLatLng(lat, lng) && outdoor_area_id !== '') {
      const fb = outdoorAreaCenterFromAreasSheet(areasRaw, outdoor_area_id)
      if (fb) {
        lat = fb.lat
        lng = fb.lng
      }
    }
    let pub = isRowPublished(row)
    if (!hasLatLng(lat, lng)) pub = false
    const isStage = name.includes('ステージ')
    locations.push({
      public: pub ? 'TRUE' : 'FALSE',
      id,
      is_event_location: isStage ? 'TRUE' : 'FALSE',
      is_facility: 'TRUE',
      is_shop: 'FALSE',
      is_exhibit: 'FALSE',
      name,
      organization: '',
      department: '',
      description: cellToString(row.description),
      outdoor_area_id,
      area_id: '',
      indoor_plan_map_id:
        mapKey !== '' && mapKey.toLowerCase() !== 'campus' ? mapKey : '',
      lat,
      lng,
      indoor_x: cellToString(row.x_position),
      indoor_y: cellToString(row.y_position),
      img_name: cellToString(row.img_name),
      show_on_campus_map,
    })
  }

  for (const row of shopsRaw) {
    const id = cellToString(row.id)
    const name = cellToString(row.name)
    if (id === '' || name === '') continue
    const mapKey = cellToString(row.map).trim()
    const outdoor_area_id = outdoorAreaIdFromMapCell(row.map, mapIdToOutdoorAreaId, 'shops', id)
    const show_on_campus_map = mapKey === '' || mapKey.toLowerCase() === 'campus' ? 'true' : 'false'
    let lat = cellToString(row.lat)
    let lng = cellToString(row.lng)
    if (!hasLatLng(lat, lng) && outdoor_area_id !== '') {
      const fb = outdoorAreaCenterFromAreasSheet(areasRaw, outdoor_area_id)
      if (fb) {
        lat = fb.lat
        lng = fb.lng
      }
    }
    let pub = isRowPublished(row)
    if (!hasLatLng(lat, lng)) pub = false
    locations.push({
      public: pub ? 'TRUE' : 'FALSE',
      id,
      is_event_location: 'FALSE',
      is_facility: 'FALSE',
      is_shop: 'TRUE',
      is_exhibit: 'FALSE',
      name,
      organization: cellToString(row.organization),
      department: '',
      description: cellToString(row.description),
      outdoor_area_id,
      area_id: '',
      indoor_plan_map_id:
        mapKey !== '' && mapKey.toLowerCase() !== 'campus' ? mapKey : '',
      lat,
      lng,
      indoor_x: cellToString(row.x_position),
      indoor_y: cellToString(row.y_position),
      img_name: cellToString(row.img_name),
      show_on_campus_map,
      is_food: cellToString(row.is_food) || 'FALSE',
      is_drink: cellToString(row.is_drink) || 'FALSE',
      is_exhibition: cellToString(row.is_exhibition) || 'FALSE',
      is_activity: cellToString(row.is_activity) || 'FALSE',
    })
  }

  const timetableRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(timetableWs, {
    defval: '',
    raw: true,
  })

  // facilities の name → id マップを構築。name が完全一致しない場合は仮 id を生成してロケーションに追加する。
  const facilityNameToId = new Map<string, string>()
  for (const r of facilitiesRaw) {
    const fid = cellToString(r.id)
    const fname = cellToString(r.name)
    if (fid !== '' && fname !== '') facilityNameToId.set(fname, fid)
  }

  function resolveOrCreateLocationId(name: string): string {
    const existing = facilityNameToId.get(name)
    if (existing !== undefined) return existing
    // facilities に存在しない会場名: 仮エントリを追加してタイムテーブルから参照できるようにする
    const syntheticId = `_loc_${facilityNameToId.size}`
    facilityNameToId.set(name, syntheticId)
    locations.push({
      public: 'FALSE',
      id: syntheticId,
      is_event_location: 'TRUE',
      is_facility: 'FALSE',
      is_shop: 'FALSE',
      is_exhibit: 'FALSE',
      name,
      organization: '',
      department: '',
      description: '',
      outdoor_area_id: '',
      area_id: '',
      indoor_plan_map_id: '',
      lat: '',
      lng: '',
      indoor_x: '',
      indoor_y: '',
      img_name: '',
      show_on_campus_map: 'false',
    })
    return syntheticId
  }

  const events: Record<string, string>[] = []
  for (const row of timetableRaw) {
    const id = cellToString(row.id)
    const title = cellToString(row.name)
    if (id === '' || title === '') continue
    if (!isRowPublished(row)) continue

    const day = dayCellToYmd(row.day)
    const start_time = excelTimeFractionToHm(row.start_time)
    const end_time = excelTimeFractionToHm(row.end_time)

    const sunnyLocName = cellToString(row.sunny_loc)
    const rainyLocName = cellToString(row.rainy_loc)

    if (sunnyLocName === '') {
      throw new Error(
        `stage_timetable: sunny_loc が空です (id=${id})。会場名を入力してください。`,
      )
    }

    const sunnyId = resolveOrCreateLocationId(sunnyLocName)
    const rainyId = rainyLocName !== '' ? resolveOrCreateLocationId(rainyLocName) : sunnyId

    events.push({
      public: 'TRUE',
      id,
      need_ticket_when_rainy: cellToString(row.need_ticket_when_rainy) || 'FALSE',
      sunny_location_id: sunnyId,
      rainy_location_id: rainyId,
      title,
      organization: cellToString(row.organization),
      department: '',
      description: cellToString(row.description),
      day,
      when_sunny: 'TRUE',
      when_rainy: 'TRUE',
      start_time,
      end_time,
      img_name: cellToString(row.img_name),
    })
  }

  return { areas, locations, events, outdoorMapImage, mapCatalog, amenities }
}
