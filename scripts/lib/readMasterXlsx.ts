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

function isTruthyPublishStatus(status: string): boolean {
  const s = cellToString(status).toLowerCase()
  if (s === 'draft' || s === 'hidden' || s === 'unpublished') return false
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

export type MasterXlsxRows = {
  areas: Record<string, string>[]
  locations: Record<string, string>[]
  events: Record<string, string>[]
}

/**
 * 海王祭マスター Excel（シート: maps / areas / facilities / shops / stage_timetable）を
 * `parseCsv*` が受け取る行配列に変換する。
 */
export function readMasterXlsx(buf: Buffer): MasterXlsxRows {
  const wb = XLSX.read(buf, { type: 'buffer' })

  const areasWs = wb.Sheets.areas
  const facilitiesWs = wb.Sheets.facilities
  const shopsWs = wb.Sheets.shops
  const timetableWs = wb.Sheets.stage_timetable
  if (!areasWs || !facilitiesWs || !shopsWs || !timetableWs) {
    throw new Error(
      'マスター xlsx に必須シートがありません（areas / facilities / shops / stage_timetable）',
    )
  }

  const areasRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(areasWs, {
    defval: '',
    raw: true,
  })
  const areas: Record<string, string>[] = []
  for (const row of areasRaw) {
    const id = normalizeAreaId(cellToString(row.id))
    const name = cellToString(row.name)
    if (id === '' || name === '') continue
    if (!isTruthyPublishStatus(cellToString(row.publish_status))) continue
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
    let pub = isTruthyPublishStatus(cellToString(row.publish_status))
    if (!hasLatLng(row.lat, row.lng)) pub = false
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
      area_id: '',
      lat: cellToString(row.lat),
      lng: cellToString(row.lng),
      indoor_x: cellToString(row.x_position),
      indoor_y: cellToString(row.y_position),
      img_name: '',
    })
  }

  for (const row of shopsRaw) {
    const id = cellToString(row.id)
    const name = cellToString(row.name)
    if (id === '' || name === '') continue
    let pub = isTruthyPublishStatus(cellToString(row.publish_status))
    if (!hasLatLng(row.lat, row.lng)) pub = false
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
      area_id: '',
      lat: cellToString(row.lat),
      lng: cellToString(row.lng),
      indoor_x: cellToString(row.x_position),
      indoor_y: cellToString(row.y_position),
      img_name: '',
    })
  }

  const timetableRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(timetableWs, {
    defval: '',
    raw: true,
  })

  const stageLocationId =
    facilitiesRaw
      .map((r) => ({
        id: cellToString(r.id),
        name: cellToString(r.name),
      }))
      .find((r) => r.id !== '' && r.name.includes('ステージ'))?.id ?? ''

  const events: Record<string, string>[] = []
  for (const row of timetableRaw) {
    const id = cellToString(row.id)
    const title = cellToString(row.name)
    if (id === '' || title === '') continue
    if (!isTruthyPublishStatus(cellToString(row.publish_status))) continue

    const day = dayCellToYmd(row.day)
    const start_time = excelTimeFractionToHm(row.start_time)
    const end_time = excelTimeFractionToHm(row.end_time)

    const locId = stageLocationId
    if (locId === '') {
      throw new Error(
        'stage_timetable 用のステージ施設（facilities で名前に「ステージ」を含む行）が見つかりません',
      )
    }

    events.push({
      public: 'TRUE',
      id,
      need_ticket_when_rainy: cellToString(row.need_ticket_when_rainy) || 'FALSE',
      sunny_location_id: locId,
      rainy_location_id: locId,
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

  return { areas, locations, events }
}
