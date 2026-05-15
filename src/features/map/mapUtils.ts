import { useEffect, useState } from 'react'
import type {
  MapAmenityKind,
  MapAmenityPin,
  MapAreaPin,
  MapCatalogEntry,
  Shop,
} from '../../data/loaders'
import type { IndoorPlanGroup, MapFiltersState, PinKind, ShopLabelMode, ShopTag } from './mapTypes'

export const SHOP_EVENT_POPUP_MIN_ZOOM_DESKTOP = 21
export const MOBILE_ZOOM_OFFSET = 1
const MOBILE_BREAKPOINT_PX = 640
export const DEFAULT_MAP_CENTER: [number, number] = [35.666998, 139.792961]
export const DEFAULT_MAP_CENTER_MOBILE: [number, number] = [35.6672324, 139.791702]
export const INDOOR_PLAN_LAT_SPAN = 0.00105
export const SHOP_TAGS_ALL: readonly ShopTag[] = [
  'food',
  'drink',
  'exhibition',
  'activity',
  'facility',
]

export function shopMatchesTagFilters(shop: Shop, tagFilters: ReadonlySet<ShopTag>): boolean {
  if (tagFilters.size === 0) return true
  const hasAnyTag = shop.isFood || shop.isDrink || shop.isExhibition || shop.isActivity || shop.category === 'facility'
  if (!hasAnyTag) return true
  if (tagFilters.has('food') && shop.isFood) return true
  if (tagFilters.has('drink') && shop.isDrink) return true
  if (tagFilters.has('exhibition') && shop.isExhibition) return true
  if (tagFilters.has('activity') && shop.isActivity) return true
  if (tagFilters.has('facility') && shop.category === 'facility') return true
  return false
}

const MAP_FILTERS_STORAGE_KEY = 'map.filters'

export function shopEventPopupMinZoom(isMobile: boolean): number {
  return isMobile
    ? SHOP_EVENT_POPUP_MIN_ZOOM_DESKTOP - MOBILE_ZOOM_OFFSET
    : SHOP_EVENT_POPUP_MIN_ZOOM_DESKTOP
}

/** `(max-width: 640px)` メディアクエリと連動する mobile フラグ */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isMobile
}

export function buildPinKey(kind: PinKind, id: string | number): string {
  return `${kind}:${String(id)}`
}

/** `maps` シート由来の mapCatalog から、屋内用に `related_area` 付きの行だけ建物別にまとめる */
export function groupIndoorMapCatalogRows(catalog: MapCatalogEntry[]): IndoorPlanGroup[] {
  const by = new Map<string, MapCatalogEntry[]>()
  const order: string[] = []
  for (const row of catalog) {
    const aid = row.relatedAreaId.trim()
    if (aid === '') continue
    if (row.id.trim().toLowerCase() === 'campus') continue
    if (!by.has(aid)) {
      order.push(aid)
      by.set(aid, [])
    }
    by.get(aid)!.push(row)
  }
  return order.map((relatedAreaId) => ({
    relatedAreaId,
    floors: by.get(relatedAreaId)!,
  }))
}

export function buildingLabelFromPins(areaPins: MapAreaPin[], relatedAreaId: string): string {
  const pin = areaPins.find((a) => a.id === relatedAreaId)
  return pin?.name ?? `エリア ${relatedAreaId}`
}

export function centerForRelatedArea(
  areaPins: MapAreaPin[],
  relatedAreaId: string,
): [number, number] {
  const pin = areaPins.find((a) => a.id === relatedAreaId)
  return pin?.coordinates ?? DEFAULT_MAP_CENTER
}

export function boundsForImageAspect(
  center: [number, number],
  aspectWidthOverHeight: number,
  latSpan: number,
): [[number, number], [number, number]] {
  const [lat0, lng0] = center
  const cosLat = Math.cos((lat0 * Math.PI) / 180)
  const metersPerDegLat = 111_320
  const metersPerDegLng = 111_320 * Math.max(0.2, cosLat)
  const heightM = latSpan * metersPerDegLat
  const widthM = aspectWidthOverHeight * heightM
  const lngSpan = widthM / metersPerDegLng
  const halfLat = latSpan / 2
  const halfLng = lngSpan / 2
  return [
    [lat0 - halfLat, lng0 - halfLng],
    [lat0 + halfLat, lng0 + halfLng],
  ]
}

/**
 * 屋内平面図オーバーレイ上の座標 → 正規化 (nx, ny)。
 * `0〜1` は正規化、どちらかが `1` を超える場合はピクセルとして `imgW`×`imgH` で割る。
 */
export function indoorPlanNormFromXY(
  x: number,
  y: number,
  imgW: number,
  imgH: number,
): [number, number] {
  const norm = x >= 0 && y >= 0 && x <= 1 && y <= 1
  if (norm) return [x, y]
  return [
    Math.min(1, Math.max(0, x / Math.max(1, imgW))),
    Math.min(1, Math.max(0, y / Math.max(1, imgH))),
  ]
}

/**
 * 屋内平面図オーバーレイ上の正規化座標 → Leaflet lat/lng。
 * `bounds` は [[南西],[北東]]。画像は上が北（緯度大）、左が西。
 */
export function latLngFromIndoorPlanBounds(
  bounds: [[number, number], [number, number]],
  nx: number,
  ny: number,
): [number, number] {
  const [sw, ne] = bounds
  const lat = ne[0] - ny * (ne[0] - sw[0])
  const lng = sw[1] + nx * (ne[1] - sw[1])
  return [lat, lng]
}

/** Leaflet 上の屋内オーバーレイ座標 → 正規化 `(nx,ny)`（`latLngFromIndoorPlanBounds` の逆） */
export function normFromLatLngIndoorBounds(
  bounds: [[number, number], [number, number]],
  lat: number,
  lng: number,
): [number, number] {
  const [sw, ne] = bounds
  const dLat = ne[0] - sw[0]
  const dLng = ne[1] - sw[1]
  if (Math.abs(dLat) < 1e-14 || Math.abs(dLng) < 1e-14) return [0.5, 0.5]
  const ny = (ne[0] - lat) / dLat
  const nx = (lng - sw[1]) / dLng
  return [Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, ny))]
}

/** 選択モードに応じて店舗ピンの吹き出し文言を返す（団体名が空なら表示名へフォールバック） */
export function shopPopupLabelFor(shop: Shop, mode: ShopLabelMode): string {
  if (mode === 'organization') {
    const org = shop.organization.trim()
    if (org !== '') return org
  }
  return shop.title
}

export function isShopLabelMode(value: unknown): value is ShopLabelMode {
  return value === 'title' || value === 'organization'
}

export function isShopTag(value: unknown): value is ShopTag {
  return (
    value === 'food' ||
    value === 'drink' ||
    value === 'exhibition' ||
    value === 'activity' ||
    value === 'facility'
  )
}

export function isMapAmenityKind(value: unknown): value is MapAmenityKind {
  return value === 'toilet' || value === 'smoking' || value === 'aed'
}

/** 吹き出し用の建物名（新 `buildingName` / 旧 `name` の「…のトイレ」等） */
export function amenityBuildingLabel(pin: MapAmenityPin): string {
  const b = pin.buildingName.trim()
  if (b !== '') return b
  const legacy = (pin.name ?? '').trim()
  if (legacy === '') return ''
  return legacy.replace(/\s*の\s*(トイレ|AED)\s*$/, '').trim() || legacy
}

export function loadStoredFilters(): MapFiltersState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MAP_FILTERS_STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    const tags = Array.isArray(obj.shopTagFilters)
      ? obj.shopTagFilters.filter(isShopTag)
      : []
    let selectedAmenityKind: MapAmenityKind | null = null
    if (obj.selectedAmenity !== undefined && obj.selectedAmenity !== null) {
      if (isMapAmenityKind(obj.selectedAmenity)) selectedAmenityKind = obj.selectedAmenity
    } else if (Array.isArray(obj.amenities)) {
      const legacy = obj.amenities.filter(isMapAmenityKind)
      if (legacy.length === 1) selectedAmenityKind = legacy[0]!
    }
    return {
      shopTagFilters: new Set<ShopTag>(tags),
      selectedAmenityKind,
    }
  } catch {
    return null
  }
}

export function persistFilters(filters: MapFiltersState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      MAP_FILTERS_STORAGE_KEY,
      JSON.stringify({
        shopTagFilters: Array.from(filters.shopTagFilters),
        selectedAmenity: filters.selectedAmenityKind,
      }),
    )
  } catch {
    /* 永続化失敗は致命的ではない */
  }
}
