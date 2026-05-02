import rawEvents from './generated/events.json'
import rawIndoorMaps from './generated/indoor-maps.json'
import rawMapAreas from './generated/map-areas.json'
import rawShops from './generated/shops.json'
import { festivalEventListSchema, type FestivalEvent } from './schema/event'
import { indoorMapsPayloadSchema, type IndoorMapsPayload } from './schema/indoorMaps'
import { mapAreasPayloadSchema, type MapAreasPayload } from './schema/mapAreas'
import { shopListSchema, type Shop } from './schema/shop'

export type {
  FestivalEvent,
  IndoorFloor,
  IndoorMapArea,
  IndoorMapsPayload,
  MapAreasPayload,
  MapEventLocationPin,
  Shop,
  ShopCategory,
} from './schema'

let cachedShops: Shop[] | null = null
let cachedEvents: FestivalEvent[] | null = null
let cachedMapAreas: MapAreasPayload | null = null
let cachedIndoorMaps: IndoorMapsPayload | null = null

/** 模擬店・ピン用データ（Zod で検証済み） */
export function getShops(): Shop[] {
  if (cachedShops === null) {
    cachedShops = shopListSchema.parse(rawShops)
  }
  return cachedShops
}

/** マップのエリア集約ピン用（`map-areas.json`） */
export function getMapAreas(): MapAreasPayload {
  if (cachedMapAreas === null) {
    cachedMapAreas = mapAreasPayloadSchema.parse(rawMapAreas)
  }
  return cachedMapAreas
}

/** 屋内マップのエリア／階タブと平面図（`indoor-maps.json`） */
export function getIndoorMaps(): IndoorMapsPayload {
  if (cachedIndoorMaps === null) {
    cachedIndoorMaps = indoorMapsPayloadSchema.parse(rawIndoorMaps)
  }
  return cachedIndoorMaps
}

/** タイムテーブル用データ（公開中のみ。Zod で検証済み） */
export function getEvents(): FestivalEvent[] {
  if (cachedEvents === null) {
    cachedEvents = festivalEventListSchema
      .parse(rawEvents)
      .filter((event) => event.published)
  }
  return cachedEvents
}
