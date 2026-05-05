import { z } from 'zod'
import { areaDisplayLabel, type CsvAreaRow, type CsvLocationRow } from './csvIngest'

/** マップ上のエリア代表ピン（拡大が低いときのみ表示） */
export const mapAreaPinSchema = z.object({
  id: z.string(),
  name: z.string(),
  coordinates: z.tuple([z.number(), z.number()]),
})

/** `is_event_location` の location をマップに出すピン（座標は `areas.csv` のエリア中心／centroid） */
export const mapEventLocationPinSchema = z.object({
  id: z.string(),
  label: z.string(),
  coordinates: z.tuple([z.number(), z.number()]),
})

/** マスター `maps` シート由来の1枚（屋内フロア図など将来用・参照用） */
export const mapCatalogEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().default(''),
  relatedAreaId: z.string().default(''),
  image: z.string().regex(/^map\/[a-z0-9/_-]+\.(png|jpg|jpeg|webp)$/i),
})

export type MapCatalogEntry = z.infer<typeof mapCatalogEntrySchema>

/** 付帯設備ピン（フィルターで種類を 1 つ選ぶと表示）。`areas` シートのフラグから ingest 時に作る */
export const mapAmenityKindSchema = z.enum(['toilet', 'smoking', 'aed'])
export const mapAmenityPinSchema = z.object({
  kind: mapAmenityKindSchema,
  /** 一意 ID（例: `AR-07-smoking` / `13-toilet`） */
  id: z.string().min(1),
  /** 建物・エリア名（吹き出しの主表示） */
  buildingName: z.string().default(''),
  /**
   * 旧データ互換: `buildingName` が無い JSON ではここを建物名として使う。
   * 新規 ingest では `buildingName` のみ出力する。
   */
  name: z.string().optional(),
  coordinates: z.tuple([z.number(), z.number()]),
})

export type MapAmenityKind = z.infer<typeof mapAmenityKindSchema>
export type MapAmenityPin = z.infer<typeof mapAmenityPinSchema>

const outdoorMapImageSchema = z
  .string()
  .regex(/^map\/[a-z0-9/_-]+\.(png|jpg|jpeg|webp)$/i)
  .default('map/campus-map.png')

export const mapAreasPayloadSchema = z.object({
  /**
   * Leaflet の zoom がこの値**以上**のとき店舗（location）ピン、**未満**のときエリアピン。
   * 例: 20 なら zoom 19 までエリア、20 以上で店舗。
   */
  shopPinsMinZoom: z.number(),
  areas: z.array(mapAreaPinSchema),
  eventLocationPins: z.array(mapEventLocationPinSchema).default([]),
  /** 屋外 OSM 上の学内図 ImageOverlay（`public/images/` からの相対パス） */
  outdoorMapImage: outdoorMapImageSchema,
  /** `maps` シートの掲載行（ingest 時に xlsx から埋まる） */
  mapCatalog: z.array(mapCatalogEntrySchema).default([]),
  /** 付帯設備（トイレ／喫煙所等）ピン。フィルタチェック時のみ描画 */
  amenities: z.array(mapAmenityPinSchema).default([]),
})

export type MapAreaPin = z.infer<typeof mapAreaPinSchema>
export type MapEventLocationPin = z.infer<typeof mapEventLocationPinSchema>
export type MapAreasPayload = z.infer<typeof mapAreasPayloadSchema>

export type BuildMapAreasExtras = {
  outdoorMapImage?: string
  mapCatalog?: MapCatalogEntry[]
  amenities?: MapAmenityPin[]
}

export const DEFAULT_SHOP_PINS_MIN_ZOOM = 20

function centroidForArea(
  areaId: string,
  locations: CsvLocationRow[],
): [number, number] | null {
  const pts = locations.filter(
    (l) => l.outdoor_area_id === areaId && l.lat !== undefined && l.lng !== undefined,
  )
  if (pts.length === 0) return null
  const lat = pts.reduce((s, p) => s + p.lat!, 0) / pts.length
  const lng = pts.reduce((s, p) => s + p.lng!, 0) / pts.length
  return [lat, lng]
}

/**
 * イベント会場（`is_event_location`）のマップ座標。
 * CSV の `lat`/`lng` がある場合は最優先。なければ `area_id`（ingest 後 `event_pin_area_id`）を
 * `areas.csv` の id とみなし、エリア center または他 location からの centroid を使う。
 */
export function resolveEventLocationPinCoordinates(
  areas: CsvAreaRow[],
  allLocations: CsvLocationRow[],
  loc: CsvLocationRow,
): [number, number] | null {
  if (!loc.is_event_location) return null
  if (loc.lat !== undefined && loc.lng !== undefined) {
    return [loc.lat, loc.lng]
  }
  const aid = loc.event_pin_area_id.trim()
  if (aid === '') return null
  const areaRow = areas.find((a) => a.id === aid)
  if (!areaRow) return null
  const lat = areaRow.center_lat
  const lng = areaRow.center_lng
  if (lat !== undefined && lng !== undefined) return [lat, lng]
  return centroidForArea(aid, allLocations)
}

/** CSV の areas / locations からマップ用ペイロードを組み立てる */
export function buildMapAreasPayload(
  areas: CsvAreaRow[],
  locations: CsvLocationRow[],
  shopPinsMinZoom: number = DEFAULT_SHOP_PINS_MIN_ZOOM,
  extras?: BuildMapAreasExtras,
): MapAreasPayload {
  const pins: MapAreaPin[] = []
  for (const a of areas) {
    let lat = a.center_lat
    let lng = a.center_lng
    if (lat === undefined || lng === undefined) {
      const c = centroidForArea(a.id, locations)
      if (!c) continue
      ;[lat, lng] = c
    }
    pins.push({
      id: a.id,
      name: areaDisplayLabel(a),
      coordinates: [lat, lng],
    })
  }

  const eventLocationPins: MapEventLocationPin[] = []
  for (const loc of locations) {
    if (!loc.on_map || !loc.is_event_location) continue
    const coords = resolveEventLocationPinCoordinates(areas, locations, loc)
    if (!coords) {
      throw new Error(
        `locations.csv: is_event_location=true だが area_id（event_pin）から座標を決められません (location ${loc.id}, event_pin_area_id=${loc.event_pin_area_id || '(空)'})`,
      )
    }
    const label = loc.display_title.trim() !== '' ? loc.display_title.trim() : loc.name
    eventLocationPins.push({
      id: loc.id,
      label,
      coordinates: coords,
    })
  }

  const outdoorMapImage =
    extras?.outdoorMapImage !== undefined && String(extras.outdoorMapImage).trim() !== ''
      ? String(extras.outdoorMapImage).trim()
      : 'map/campus-map.png'
  const mapCatalog = extras?.mapCatalog ?? []
  const amenities = extras?.amenities ?? []

  return mapAreasPayloadSchema.parse({
    shopPinsMinZoom,
    areas: pins,
    eventLocationPins,
    outdoorMapImage,
    mapCatalog,
    amenities,
  })
}

export const emptyMapAreasPayload: MapAreasPayload = {
  shopPinsMinZoom: DEFAULT_SHOP_PINS_MIN_ZOOM,
  areas: [],
  eventLocationPins: [],
  outdoorMapImage: 'map/campus-map.png',
  mapCatalog: [],
  amenities: [],
}
