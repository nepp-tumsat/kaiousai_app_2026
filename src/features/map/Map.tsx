'use client'

import './Map.css'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import {
  getMapAreas,
  getShops,
  type MapAmenityKind,
  type MapAmenityPin,
  type MapAreaPin,
  type MapCatalogEntry,
  type Shop,
  type ShopCategory,
} from '../../data/loaders'
import { isStakeholderShopId } from '../../data/stakeholderShops'
import { assetUrl } from '../../lib/assetUrl'
import MapFilterPanel from './MapFilterPanel'
import ShopPopup from './ShopPopup'

// Leaflet デフォルトアイコン（バンドラ用パッチ）
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet の型定義に _getIconUrl が無い
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: assetUrl('/images/map/leaflet/marker-icon-2x.png'),
  iconUrl: assetUrl('/images/map/leaflet/marker-icon.png'),
  shadowUrl: assetUrl('/images/map/leaflet/marker-shadow.png'),
})

/**
 * 店舗・イベント会場ピン: このズーム未満はピンのみ、以上で Leaflet 吹き出し。
 * スマホは情報量が薄くなりやすいので、デスクトップより 1 段早く（低いズームから）情報を出す。
 * 同様に `mapPayload.shopPinsMinZoom` / エリアピン filter も `MOBILE_ZOOM_OFFSET` ぶんずらす。
 */
const SHOP_EVENT_POPUP_MIN_ZOOM_DESKTOP = 21
const MOBILE_ZOOM_OFFSET = 1
const MOBILE_BREAKPOINT_PX = 640

function shopEventPopupMinZoom(isMobile: boolean): number {
  return isMobile ? SHOP_EVENT_POPUP_MIN_ZOOM_DESKTOP - MOBILE_ZOOM_OFFSET : SHOP_EVENT_POPUP_MIN_ZOOM_DESKTOP
}

/** `(max-width: 640px)` メディアクエリと連動する mobile フラグ */
function useIsMobile(): boolean {
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

const DEFAULT_MAP_CENTER: [number, number] = [35.6672324, 139.791702]
/** 屋内平面図の緯度方向スパン（度）。経度幅は画像アスペクト比から算出する */
const INDOOR_PLAN_LAT_SPAN = 0.00105

type IndoorPlanGroup = {
  relatedAreaId: string
  floors: MapCatalogEntry[]
}

/** `maps` シート由来の mapCatalog から、屋内用に `related_area` 付きの行だけ建物別にまとめる */
function groupIndoorMapCatalogRows(catalog: MapCatalogEntry[]): IndoorPlanGroup[] {
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

function buildingLabelFromPins(areaPins: MapAreaPin[], relatedAreaId: string): string {
  const pin = areaPins.find((a) => a.id === relatedAreaId)
  return pin?.name ?? `エリア ${relatedAreaId}`
}

function centerForRelatedArea(areaPins: MapAreaPin[], relatedAreaId: string): [number, number] {
  const pin = areaPins.find((a) => a.id === relatedAreaId)
  return pin?.coordinates ?? DEFAULT_MAP_CENTER
}

function boundsForImageAspect(
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

function CurrentLocationButton({
  onLocationUpdate,
}: {
  onLocationUpdate?: (lat: number, lng: number) => void
}) {
  const handleClick = () => {
    if (!navigator.geolocation) {
      alert('このブラウザでは現在地を取得できません。')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        if (onLocationUpdate) {
          onLocationUpdate(latitude, longitude)
        }
      },
      () => {
        alert('現在地を取得できませんでした。位置情報の許可を確認してください。')
      },
    )
  }
  return (
    <button className="current-location-button" onClick={handleClick} aria-label="現在地を取得">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </button>
  )
}

function CampusSvgOverlay() {
  const svgBounds: L.LatLngBoundsExpression = [
    [35.66432, 139.78905],
    [35.669875, 139.796872],
  ]

  const { outdoorMapImage } = getMapAreas()
  const imageUrl = assetUrl(`/images/${outdoorMapImage}`)

  return (
    <ImageOverlay
      url={imageUrl}
      bounds={svgBounds}
      opacity={1}
      zIndex={500}
    />
  )
}

type IndoorPlaneDisplay = {
  /** この平面図が属する建物（`related_area`）。表示と entry が一致するときだけ fitBounds 等を適用 */
  buildingId: string
  image: string
  bounds: [[number, number], [number, number]]
}

/** 屋内: 画像の縦横比に合わせた地理 bounds で ImageOverlay（歪みなし） */
function IndoorMapPlanLayer({
  entry,
  areaPins,
}: {
  entry: MapCatalogEntry
  areaPins: MapAreaPin[]
}) {
  const map = useMap()
  const [plane, setPlane] = useState<IndoorPlaneDisplay | null>(null)
  const [planeOpacity, setPlaneOpacity] = useState(1)
  const lastFitBuildingRef = useRef<string | null>(null)
  const prevRelatedAreaRef = useRef<string | null>(null)

  useEffect(() => {
    const buildingId = entry.relatedAreaId
    const prevBuilding = prevRelatedAreaRef.current
    if (prevBuilding !== null && prevBuilding !== buildingId) {
      setPlaneOpacity(0)
    }
    prevRelatedAreaRef.current = buildingId

    let cancelled = false
    const url = assetUrl(`/images/${entry.image}`)
    const center = centerForRelatedArea(areaPins, buildingId)
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (w <= 0 || h <= 0) return
      const aspect = w / h
      const bounds = boundsForImageAspect(center, aspect, INDOOR_PLAN_LAT_SPAN)
      setPlane({ buildingId, image: entry.image, bounds })
      requestAnimationFrame(() => {
        if (!cancelled) setPlaneOpacity(1)
      })
    }
    img.onerror = () => {
      if (!cancelled) setPlaneOpacity(1)
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [entry.id, entry.image, entry.relatedAreaId, areaPins])

  useEffect(() => {
    if (!plane) return
    if (plane.buildingId !== entry.relatedAreaId) return
    const sw = plane.bounds[0]
    const ne = plane.bounds[1]
    const b = L.latLngBounds(L.latLng(sw[0], sw[1]), L.latLng(ne[0], ne[1]))
    if (!b.isValid()) return
    const buildingId = plane.buildingId
    const sameBuildingAsLastFit = lastFitBuildingRef.current === buildingId

    const id = window.setTimeout(() => {
      map.invalidateSize()
      if (!sameBuildingAsLastFit) {
        map.fitBounds(b, { padding: [20, 20], maxZoom: 21, animate: false })
        lastFitBuildingRef.current = buildingId
      }
    }, 60)
    return () => window.clearTimeout(id)
  }, [map, plane, entry.relatedAreaId])

  if (!plane) return null
  return (
    <ImageOverlay
      key="indoor-floor-plan"
      url={assetUrl(`/images/${plane.image}`)}
      bounds={plane.bounds}
      opacity={planeOpacity}
      zIndex={400}
      interactive={false}
    />
  )
}

function MapViewResizeSync({ viewMode }: { viewMode: 'outdoor' | 'indoor' }) {
  const map = useMap()
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 0)
    return () => window.clearTimeout(t)
  }, [map, viewMode])
  return null
}

/** 開発時のみ: 地図を右クリックした位置の lat / lng を表示（本番ビルドでは無効） */
function DevMapRightClickCoords() {
  const [hint, setHint] = useState<{
    latText: string
    lngText: string
    csvLine: string
  } | null>(null)
  const dismissTimerRef = useRef<number | undefined>(undefined)

  useMapEvents({
    contextmenu(e) {
      if (process.env.NODE_ENV !== 'development') return
      e.originalEvent.preventDefault()
      const { lat, lng } = e.latlng
      const latText = lat.toFixed(7)
      const lngText = lng.toFixed(7)
      const csvLine = `${latText},${lngText}`
      if (dismissTimerRef.current !== undefined) {
        window.clearTimeout(dismissTimerRef.current)
      }
      setHint({ latText, lngText, csvLine })
      dismissTimerRef.current = window.setTimeout(() => {
        setHint(null)
        dismissTimerRef.current = undefined
      }, 15000)
    },
  })

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== undefined) {
        window.clearTimeout(dismissTimerRef.current)
      }
    }
  }, [])

  if (process.env.NODE_ENV !== 'development') return null
  if (!hint) return null

  return (
    <div className="map-dev-coords-hint" role="status">
      <div className="map-dev-coords-hint__title">右クリック座標（DEV）</div>
      <div className="map-dev-coords-hint__row">
        <span className="map-dev-coords-hint__label">lat</span>
        <code>{hint.latText}</code>
      </div>
      <div className="map-dev-coords-hint__row">
        <span className="map-dev-coords-hint__label">lng</span>
        <code>{hint.lngText}</code>
      </div>
      <div className="map-dev-coords-hint__actions">
        <button
          type="button"
          className="map-dev-coords-hint__copy"
          onClick={() => {
            void navigator.clipboard?.writeText(hint.csvLine)
          }}
        >
          コピー
        </button>
        <button
          type="button"
          className="map-dev-coords-hint__close"
          onClick={() => {
            if (dismissTimerRef.current !== undefined) {
              window.clearTimeout(dismissTimerRef.current)
              dismissTimerRef.current = undefined
            }
            setHint(null)
          }}
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
    </div>
  )
}

type MarkerRefMap = Record<string, L.Marker | null>
type PinKind = 'shop' | 'eventLocation' | 'area'
type LatLngTuple = [number, number]

/** 店舗ピンの吹き出しに表示するテキストの種類 */
type ShopLabelMode = 'title' | 'organization'

const SHOP_LABEL_MODE_STORAGE_KEY = 'map.shopLabelMode'

function isShopLabelMode(value: unknown): value is ShopLabelMode {
  return value === 'title' || value === 'organization'
}

const SHOP_CATEGORIES_ALL: readonly ShopCategory[] = [
  'food',
  'stage',
  'experience',
  'facility',
]

function isShopCategory(value: unknown): value is ShopCategory {
  return (
    value === 'food' ||
    value === 'stage' ||
    value === 'experience' ||
    value === 'facility'
  )
}

function isMapAmenityKind(value: unknown): value is MapAmenityKind {
  return value === 'toilet' || value === 'smoking' || value === 'aed'
}

const AMENITY_KIND_LABEL: Record<MapAmenityKind, string> = {
  smoking: '喫煙所',
  toilet: 'トイレ',
  aed: 'AED',
  fire_extinguisher: '消火器',
}

/** 吹き出し用の建物名（新 `buildingName` / 旧 `name` の「…のトイレ」等） */
function amenityBuildingLabel(pin: MapAmenityPin): string {
  const b = pin.buildingName.trim()
  if (b !== '') return b
  const legacy = (pin.name ?? '').trim()
  if (legacy === '') return ''
  return legacy.replace(/\s*の\s*(トイレ|AED)\s*$/, '').trim() || legacy
}

const MAP_FILTERS_STORAGE_KEY = 'map.filters'

type MapFiltersState = {
  shopCategories: ReadonlySet<ShopCategory>
  /** 付帯設備: 1 種類のみ。`null` のとき付帯設備ピンは出さない */
  selectedAmenityKind: MapAmenityKind | null
}

const DEFAULT_FILTERS: MapFiltersState = {
  shopCategories: new Set<ShopCategory>(SHOP_CATEGORIES_ALL),
  selectedAmenityKind: null,
}

function loadStoredFilters(): MapFiltersState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MAP_FILTERS_STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    const shops = Array.isArray(obj.shopCategories)
      ? obj.shopCategories.filter(isShopCategory)
      : SHOP_CATEGORIES_ALL
    let selectedAmenityKind: MapAmenityKind | null = null
    if (obj.selectedAmenity !== undefined && obj.selectedAmenity !== null) {
      if (isMapAmenityKind(obj.selectedAmenity)) selectedAmenityKind = obj.selectedAmenity
    } else if (Array.isArray(obj.amenities)) {
      const legacy = obj.amenities.filter(isMapAmenityKind)
      if (legacy.length === 1) selectedAmenityKind = legacy[0]!
    }
    return {
      shopCategories: new Set<ShopCategory>(shops),
      selectedAmenityKind,
    }
  } catch {
    return null
  }
}

function persistFilters(filters: MapFiltersState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      MAP_FILTERS_STORAGE_KEY,
      JSON.stringify({
        shopCategories: Array.from(filters.shopCategories),
        selectedAmenity: filters.selectedAmenityKind,
      }),
    )
  } catch {
    /* 永続化失敗は致命的ではない */
  }
}

/** 選択モードに応じて店舗ピンの吹き出し文言を返す（団体名が空なら表示名へフォールバック） */
function shopPopupLabelFor(shop: Shop, mode: ShopLabelMode): string {
  if (mode === 'organization') {
    const org = shop.organization.trim()
    if (org !== '') return org
  }
  return shop.title
}

type DevPinMove = {
  key: string
  kind: PinKind
  id: string | number
  csvId: string
  label: string
  coordinates: LatLngTuple
}

type DevPinSaveState = 'idle' | 'saving' | 'saved' | 'error'

function buildPinKey(kind: PinKind, id: string | number): string {
  return `${kind}:${String(id)}`
}

function DevPinAdjustPanel({
  latestMove,
  saveState,
  saveMessage,
  onClear,
}: {
  latestMove: DevPinMove | null
  saveState: DevPinSaveState
  saveMessage: string
  onClear: () => void
}) {
  if (process.env.NODE_ENV !== 'development' || latestMove === null) return null

  const [lat, lng] = latestMove.coordinates
  const latText = lat.toFixed(7)
  const lngText = lng.toFixed(7)
  const csvLine = `${latestMove.kind},${latestMove.id},${latText},${lngText}`

  return (
    <div className="map-dev-pin-adjust-panel" role="status">
      <div className="map-dev-pin-adjust-panel__title">ピン調整（DEV）</div>
      <div className="map-dev-pin-adjust-panel__meta">
        <code>{latestMove.kind}</code>
        <code>{latestMove.id}</code>
      </div>
      <div className="map-dev-pin-adjust-panel__label">{latestMove.label}</div>
      <div className="map-dev-pin-adjust-panel__row">
        <span>lat</span>
        <code>{latText}</code>
      </div>
      <div className="map-dev-pin-adjust-panel__row">
        <span>lng</span>
        <code>{lngText}</code>
      </div>
      <div className="map-dev-pin-adjust-panel__actions">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(csvLine)
          }}
        >
          CSV行コピー
        </button>
        <button type="button" onClick={onClear} aria-label="閉じる">
          ×
        </button>
      </div>
      <div className={`map-dev-pin-adjust-panel__status map-dev-pin-adjust-panel__status--${saveState}`}>
        {saveMessage}
      </div>
    </div>
  )
}

/** `/map?shop=` から該当ピンへズームし詳細を開く */
function MapFocusShopFromQuery({
  shops,
  openShopDetail,
  enabled,
}: {
  shops: Shop[]
  openShopDetail: (shop: Shop) => void
  /** 屋外マップで店舗ピンが有効なときのみ実行 */
  enabled: boolean
}) {
  const searchParams = useSearchParams()
  const map = useMap()
  const isMobile = useIsMobile()
  const doneForShopParamRef = useRef('')

  useEffect(() => {
    if (!enabled) return
    const raw = searchParams.get('shop') ?? ''
    if (!raw) {
      doneForShopParamRef.current = ''
      return
    }
    if (doneForShopParamRef.current === raw) return
    const id = Number.parseInt(raw, 10)
    if (!Number.isFinite(id)) return
    const shop = shops.find((s) => s.id === id)
    if (!shop) return
    doneForShopParamRef.current = raw
    const z = Math.max(map.getZoom(), shopEventPopupMinZoom(isMobile))
    map.setView(shop.coordinates, z, { animate: true })
    const t = window.setTimeout(() => {
      openShopDetail(shop)
    }, 450)
    return () => window.clearTimeout(t)
  }, [enabled, searchParams, shops, map, openShopDetail, isMobile])

  return null
}

function MapZoomAndMarkers({
  shops,
  isMapReady,
  markerRefs,
  setSelectedShop,
  getCategoryColor,
  devPinAdjustEnabled,
  devPinOverrides,
  onDevPinMove,
  onZoomChange,
  pinsEnabled = true,
  shopLabelMode,
  amenityPins,
  amenityFocusMode,
}: {
  shops: Shop[]
  isMapReady: boolean
  markerRefs: MutableRefObject<MarkerRefMap>
  setSelectedShop: (shop: Shop) => void
  getCategoryColor: (category: ShopCategory) => string
  devPinAdjustEnabled: boolean
  devPinOverrides: Record<string, LatLngTuple>
  onDevPinMove: (move: DevPinMove) => void
  onZoomChange?: (zoom: number) => void
  /** 屋外マップのときのみ店舗・エリアピンを描画（屋内は平面図のみ） */
  pinsEnabled?: boolean
  /** 店舗ピンの吹き出しに表示するテキスト種別 */
  shopLabelMode: ShopLabelMode
  /** 表示中の付帯設備ピン（フィルタで選ばれた kind のみ） */
  amenityPins: MapAmenityPin[]
  /** 付帯設備が選択されている間は他カテゴリの吹き出しを出さない */
  amenityFocusMode: boolean
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  const [mapPayload] = useState(() => getMapAreas())
  const isMobile = useIsMobile()
  /** スマホは閾値を 1 段下げて、同じズームで PC より 1 段「進んだ」情報を出す */
  const zoomOffset = isMobile ? MOBILE_ZOOM_OFFSET : 0
  const effectiveShopPinsMinZoom = mapPayload.shopPinsMinZoom - zoomOffset
  const effectiveShopEventPopupMinZoom = shopEventPopupMinZoom(isMobile)
  /** areas があるとき: zoom < shopPinsMinZoom でエリア、zoom >= で店舗（location） */
  const showShopPins = mapPayload.areas.length === 0 || zoom >= effectiveShopPinsMinZoom
  /** 店舗・イベントピンは閾値未満では吹き出しなし（ピンのみ） */
  const showShopEventPopups = zoom >= effectiveShopEventPopupMinZoom
  /** 店舗ピン表示中・店舗吹き出し未表示の中間ズーム: 地区名（エリア）の吹き出しを重ねる */
  const showAreaDistrictOverlay =
    showShopPins && !showShopEventPopups && mapPayload.areas.length > 0
  /**
   * ズーム別エリア代表ピン（モバイルは zoomOffset で 1 段早めに展開）:
   * - 17 - offset 以下: 「正門」のみ（遠景のノイズ低減）
   * - 18 - offset:     海王祭エリア（id が `AR-` で始まる）のみ。号館・建物（数字 id）は出さない。
   * - それ以降:         全エリア（建物含む）
   */
  const areaPinsForZoom =
    zoom <= 17 - zoomOffset
      ? mapPayload.areas.filter((a) => a.name === '正門')
      : zoom === 18 - zoomOffset
        ? mapPayload.areas.filter((a) => a.id.startsWith('AR-'))
        : mapPayload.areas

  useEffect(() => {
    onZoomChange?.(zoom)
  }, [zoom, onZoomChange])

  useMapEvents({
    zoomend(e) {
      setZoom(e.target.getZoom())
    },
    load(e) {
      setZoom(e.target.getZoom())
    },
  })

  /**
   * エリアのみ表示: 全エリア吹き出しを開く。
   * 店舗表示かつ zoom 21+: 店舗・イベントの吹き出しを開く。
   * 店舗表示かつ zoom 20: 店舗はピンのみ、地区名はエリア重ねピンのみ開く。
   */
  useEffect(() => {
    if (!pinsEnabled || !isMapReady) return
    let timeoutId: number | undefined
    const syncPopups = () => {
      timeoutId = window.setTimeout(() => {
        const entries = Object.entries(markerRefs.current)
        if (amenityFocusMode) {
          entries.forEach(([, marker]) => marker?.closePopup())
          return
        }
        if (showShopPins) {
          if (showShopEventPopups) {
            entries.forEach(([, marker]) => marker?.openPopup())
          } else if (showAreaDistrictOverlay) {
            entries.forEach(([, marker]) => marker?.closePopup())
            entries.forEach(([key, marker]) => {
              if (key.startsWith('area-')) marker?.openPopup()
            })
          } else {
            entries.forEach(([, marker]) => marker?.closePopup())
          }
        } else {
          entries.forEach(([, marker]) => marker?.openPopup())
        }
      }, 120)
    }
    map.whenReady(syncPopups)
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [
    pinsEnabled,
    isMapReady,
    amenityFocusMode,
    map,
    showShopPins,
    showShopEventPopups,
    showAreaDistrictOverlay,
    devPinAdjustEnabled,
    areaPinsForZoom.length,
    mapPayload.eventLocationPins.length,
    mapPayload.areas.length,
    markerRefs,
  ])

  if (!pinsEnabled) {
    return process.env.NODE_ENV === 'development' ? <div className="zoom-indicator">{zoom}</div> : null
  }

  return (
    <>
      {process.env.NODE_ENV === 'development' && <div className="zoom-indicator">{zoom}</div>}
      {showShopPins ? (
        <>
          {shops.map((shop) => (
            <Marker
              key={`shop-${shop.id}`}
              position={devPinOverrides[buildPinKey('shop', shop.id)] ?? shop.coordinates}
              draggable={devPinAdjustEnabled}
              ref={(marker) => {
                const key = `shop-${shop.id}`
                if (marker) markerRefs.current[key] = marker
                else delete markerRefs.current[key]
              }}
              eventHandlers={{
                click: () => setSelectedShop(shop),
                dragend: (e) => {
                  if (!devPinAdjustEnabled) return
                  const marker = e.target as L.Marker
                  const next = marker.getLatLng()
                  onDevPinMove({
                    key: buildPinKey('shop', shop.id),
                    kind: 'shop',
                    id: shop.id,
                    csvId: shop.sourceLocationId ?? '',
                    label: shop.title,
                    coordinates: [next.lat, next.lng],
                  })
                },
              }}
              icon={L.divIcon({
                className: `category-marker-icon${
                  isStakeholderShopId(shop.sourceLocationId)
                    ? ' category-marker-icon--stakeholder'
                    : ''
                }`,
                html: `<div class="category-marker-dot${
                  shop.category === 'facility' ? ' category-marker-dot--facility' : ''
                }${
                  isStakeholderShopId(shop.sourceLocationId)
                    ? ' category-marker-dot--stakeholder'
                    : ''
                }" style="background-color:${getCategoryColor(shop.category)}"></div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11],
              })}
            >
              {showShopEventPopups && !amenityFocusMode && (
                <Popup
                  className={`map-popup--shop map-popup--shop-${shop.category}${
                    isStakeholderShopId(shop.sourceLocationId)
                      ? ' map-popup--stakeholder'
                      : ''
                  }`}
                  autoPan={false}
                  autoClose={false}
                  closeOnClick={false}
                  offset={[0, -10]}
                >
                  <div
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedShop(shop)
                    }}
                  >
                    {shopPopupLabelFor(shop, shopLabelMode)}
                  </div>
                </Popup>
              )}
            </Marker>
          ))}
          {mapPayload.eventLocationPins.map((pin) => (
            <Marker
              key={`evloc-${pin.id}`}
              position={devPinOverrides[buildPinKey('eventLocation', pin.id)] ?? pin.coordinates}
              draggable={devPinAdjustEnabled}
              ref={(marker) => {
                const key = `evloc-${pin.id}`
                if (marker) markerRefs.current[key] = marker
                else delete markerRefs.current[key]
              }}
              eventHandlers={{
                dragend: (e) => {
                  if (!devPinAdjustEnabled) return
                  const marker = e.target as L.Marker
                  const next = marker.getLatLng()
                  onDevPinMove({
                    key: buildPinKey('eventLocation', pin.id),
                    kind: 'eventLocation',
                    id: pin.id,
                    csvId: pin.id,
                    label: pin.label,
                    coordinates: [next.lat, next.lng],
                  })
                },
              }}
              icon={L.divIcon({
                className: 'event-location-marker-icon',
                html: '<div class="event-location-marker-diamond"></div>',
                iconSize: [22, 22],
                iconAnchor: [11, 11],
              })}
            >
              {showShopEventPopups && !amenityFocusMode && (
                <Popup
                  className="map-popup--event-location"
                  autoPan={false}
                  autoClose={false}
                  closeOnClick={false}
                  offset={[0, -10]}
                >
                  <div className="event-location-marker-popup">{pin.label}</div>
                </Popup>
              )}
            </Marker>
          ))}
          {showAreaDistrictOverlay &&
            areaPinsForZoom.map((area) => (
              <Marker
                key={`area-overlay-${area.id}`}
                position={devPinOverrides[buildPinKey('area', area.id)] ?? area.coordinates}
                zIndexOffset={devPinAdjustEnabled ? 800 : -400}
                interactive={devPinAdjustEnabled}
                draggable={devPinAdjustEnabled}
                ref={(marker) => {
                  const key = `area-${area.id}`
                  if (marker) markerRefs.current[key] = marker
                  else delete markerRefs.current[key]
                }}
                eventHandlers={{
                  dragend: (e) => {
                    if (!devPinAdjustEnabled) return
                    const marker = e.target as L.Marker
                    const next = marker.getLatLng()
                    onDevPinMove({
                      key: buildPinKey('area', area.id),
                      kind: 'area',
                      id: area.id,
                      csvId: area.id,
                      label: area.name,
                      coordinates: [next.lat, next.lng],
                    })
                  },
                }}
                icon={L.divIcon({
                  className: 'area-marker-icon',
                  html: '<div class="area-marker-disc"></div>',
                  iconSize: [28, 28],
                  iconAnchor: [14, 14],
                })}
              >
                {!amenityFocusMode && (
                <Popup
                  autoPan={false}
                  autoClose={false}
                  closeButton={false}
                  closeOnClick={false}
                  offset={[0, -10]}
                >
                  <div className="area-marker-popup">{area.name}</div>
                </Popup>
                )}
              </Marker>
            ))}
          {devPinAdjustEnabled &&
            showShopPins &&
            showShopEventPopups &&
            mapPayload.areas.length > 0 &&
            mapPayload.areas.map((area) => (
              <Marker
                key={`area-dev-${area.id}`}
                position={devPinOverrides[buildPinKey('area', area.id)] ?? area.coordinates}
                zIndexOffset={900}
                interactive
                draggable
                ref={(marker) => {
                  const key = `area-${area.id}`
                  if (marker) markerRefs.current[key] = marker
                  else delete markerRefs.current[key]
                }}
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target as L.Marker
                    const next = marker.getLatLng()
                    onDevPinMove({
                      key: buildPinKey('area', area.id),
                      kind: 'area',
                      id: area.id,
                      csvId: area.id,
                      label: area.name,
                      coordinates: [next.lat, next.lng],
                    })
                  },
                }}
                icon={L.divIcon({
                  className: 'area-marker-icon',
                  html: '<div class="area-marker-disc"></div>',
                  iconSize: [28, 28],
                  iconAnchor: [14, 14],
                })}
              >
                <Tooltip permanent direction="top" offset={[0, -10]} opacity={0.92}>
                  {area.name}
                </Tooltip>
              </Marker>
            ))}
        </>
      ) : (
        <>
          {areaPinsForZoom.map((area) => (
            <Marker
              key={`area-${area.id}`}
              position={devPinOverrides[buildPinKey('area', area.id)] ?? area.coordinates}
              zIndexOffset={devPinAdjustEnabled ? 800 : 0}
              interactive
              draggable={devPinAdjustEnabled}
              ref={(marker) => {
                const key = `area-${area.id}`
                if (marker) markerRefs.current[key] = marker
                else delete markerRefs.current[key]
              }}
              eventHandlers={{
                dragend: (e) => {
                  if (!devPinAdjustEnabled) return
                  const marker = e.target as L.Marker
                  const next = marker.getLatLng()
                  onDevPinMove({
                    key: buildPinKey('area', area.id),
                    kind: 'area',
                    id: area.id,
                    csvId: area.id,
                    label: area.name,
                    coordinates: [next.lat, next.lng],
                  })
                },
              }}
              icon={L.divIcon({
                className: 'area-marker-icon',
                html: '<div class="area-marker-disc"></div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              })}
            >
              {!amenityFocusMode && (
              <Popup
                autoPan={false}
                autoClose={false}
                closeButton={false}
                closeOnClick={false}
                offset={[0, -10]}
              >
                <div className="area-marker-popup">{area.name}</div>
              </Popup>
              )}
            </Marker>
          ))}
        </>
      )}
      {amenityPins.map((pin) => {
        const glyph =
          pin.kind === 'smoking' ? '🚬'
          : pin.kind === 'toilet' ? '🚻'
          : pin.kind === 'fire_extinguisher' ? '🧯'
          : '＋'
        return (
        <Marker
          key={`amenity-${pin.kind}-${pin.id}`}
          position={pin.coordinates}
          zIndexOffset={700}
          icon={L.divIcon({
            className: `amenity-marker-icon amenity-marker-icon--${pin.kind}`,
            html: `<div class="amenity-marker-badge amenity-marker-badge--${pin.kind}">${glyph}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          })}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -10]}
            opacity={0.98}
            className={`amenity-popup amenity-popup--${pin.kind}`}
          >
            <div className={`amenity-marker-popup amenity-marker-popup--${pin.kind}`}>
              <div className="amenity-marker-popup__building">{amenityBuildingLabel(pin)}</div>
              {amenityBuildingLabel(pin) !== AMENITY_KIND_LABEL[pin.kind] && (
                <div className="amenity-marker-popup__kind">{AMENITY_KIND_LABEL[pin.kind]}</div>
              )}
            </div>
          </Tooltip>
        </Marker>
        )
      })}
    </>
  )
}

export default function MapFeature() {
  const searchParams = useSearchParams()
  const [isMapReady, setIsMapReady] = useState(false)
  const [shops] = useState<Shop[]>(() => getShops())
  const mapPayload = useMemo(() => getMapAreas(), [])
  const indoorPlanGroups = useMemo(
    () => groupIndoorMapCatalogRows(mapPayload.mapCatalog),
    [mapPayload],
  )
  const indoorAvailable = indoorPlanGroups.length > 0
  const [indoorBuildingKey, setIndoorBuildingKey] = useState(
    () => indoorPlanGroups[0]?.relatedAreaId ?? '',
  )
  const [indoorMapRowId, setIndoorMapRowId] = useState(() => indoorPlanGroups[0]?.floors[0]?.id ?? '')
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [viewMode, setViewMode] = useState<'outdoor' | 'indoor'>('outdoor')
  const [shopLabelMode, setShopLabelMode] = useState<ShopLabelMode>('title')
  const [filters, setFilters] = useState<MapFiltersState>(DEFAULT_FILTERS)
  const [devPinAdjustEnabled, setDevPinAdjustEnabled] = useState(false)
  const [devPinOverrides, setDevPinOverrides] = useState<Record<string, LatLngTuple>>({})
  const [latestPinMove, setLatestPinMove] = useState<DevPinMove | null>(null)
  const [devPinSaveState, setDevPinSaveState] = useState<DevPinSaveState>('idle')
  const [devPinSaveMessage, setDevPinSaveMessage] = useState('ドラッグすると output_*.csv に保存します')
  const markerRefs = useRef<MarkerRefMap>({})
  const mapZoomRef = useRef(18)
  const mapModeToggleRef = useRef<HTMLDivElement>(null)
  const isDev = process.env.NODE_ENV === 'development'
  const isMobile = useIsMobile()
  const popupMinZoom = shopEventPopupMinZoom(isMobile)

  const handleMapZoomChange = useCallback((z: number) => {
    mapZoomRef.current = z
  }, [])

  /** 店舗詳細を開いても Leaflet の既定クリックで吹き出しが閉じないよう、直後に再オープンする */
  const openShopDetail = useCallback(
    (shop: Shop) => {
      setSelectedShop(shop)
      const key = `shop-${shop.id}`
      queueMicrotask(() => {
        if (mapZoomRef.current >= popupMinZoom) {
          markerRefs.current[key]?.openPopup()
        }
      })
    },
    [popupMinZoom],
  )

  useEffect(() => {
    setIsMapReady(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem(SHOP_LABEL_MODE_STORAGE_KEY)
      if (isShopLabelMode(saved)) setShopLabelMode(saved)
    } catch {
      /* localStorage が使えない環境はデフォルトのまま */
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SHOP_LABEL_MODE_STORAGE_KEY, shopLabelMode)
    } catch {
      /* 永続化失敗は致命的ではないので無視 */
    }
  }, [shopLabelMode])

  useEffect(() => {
    const saved = loadStoredFilters()
    if (saved) setFilters(saved)
  }, [])

  useEffect(() => {
    persistFilters(filters)
  }, [filters])

  const toggleShopCategory = useCallback((category: ShopCategory) => {
    setFilters((prev) => {
      const next = new Set(prev.shopCategories)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return { ...prev, shopCategories: next }
    })
  }, [])

  const selectAmenityKind = useCallback((kind: MapAmenityKind | null) => {
    setFilters((prev) => ({ ...prev, selectedAmenityKind: kind }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setShopLabelMode('title')
  }, [])

  const availableAmenities = useMemo(() => {
    const set = new Set<MapAmenityKind>()
    for (const a of mapPayload.amenities) set.add(a.kind)
    return set
  }, [mapPayload])

  useEffect(() => {
    const raw = searchParams.get('shop')
    if (!raw) return
    const id = Number.parseInt(raw, 10)
    if (!Number.isFinite(id)) return
    if (shops.some((s) => s.id === id)) {
      setViewMode('outdoor')
    }
  }, [searchParams, shops])

  const getCategoryColor = (category: ShopCategory) => {
    switch (category) {
      case 'food':
        return '#ff7043'
      case 'stage':
        return '#ab47bc'
      case 'facility':
        return '#42a5f5'
      case 'experience':
      default:
        return '#66bb6a'
    }
  }

  const filteredShops = useMemo(
    () => shops.filter((s) => filters.shopCategories.has(s.category)),
    [shops, filters.shopCategories],
  )

  const visibleAmenityPins = useMemo(() => {
    const k = filters.selectedAmenityKind
    if (k === null) return []
    return mapPayload.amenities.filter((a) => a.kind === k)
  }, [mapPayload, filters.selectedAmenityKind])

  const selectedIndoorGroup = indoorPlanGroups.find((g) => g.relatedAreaId === indoorBuildingKey)
  const selectedPlanEntry = useMemo(() => {
    const g = selectedIndoorGroup ?? indoorPlanGroups[0]
    if (!g) return null
    return g.floors.find((f) => f.id === indoorMapRowId) ?? g.floors[0] ?? null
  }, [selectedIndoorGroup, indoorPlanGroups, indoorMapRowId])

  const selectIndoorBuilding = useCallback(
    (relatedAreaId: string) => {
      setIndoorBuildingKey(relatedAreaId)
      const g = indoorPlanGroups.find((x) => x.relatedAreaId === relatedAreaId)
      setIndoorMapRowId(g?.floors[0]?.id ?? '')
    },
    [indoorPlanGroups],
  )

  useEffect(() => {
    if (!indoorAvailable) return
    if (!indoorPlanGroups.some((g) => g.relatedAreaId === indoorBuildingKey)) {
      const g0 = indoorPlanGroups[0]
      setIndoorBuildingKey(g0.relatedAreaId)
      setIndoorMapRowId(g0.floors[0]?.id ?? '')
      return
    }
    const g = indoorPlanGroups.find((x) => x.relatedAreaId === indoorBuildingKey)
    if (g && !g.floors.some((f) => f.id === indoorMapRowId)) {
      setIndoorMapRowId(g.floors[0]?.id ?? '')
    }
  }, [indoorAvailable, indoorPlanGroups, indoorBuildingKey, indoorMapRowId])

  useEffect(() => {
    const root = mapModeToggleRef.current
    if (!root) return
    const active = root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (!active) return
    active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [viewMode])

  return (
    <div className={`map-container${viewMode === 'indoor' ? ' map-container--indoor' : ''}`}>
      <div className="map-top-bar">
        <div className="map-mode-bar">
          <div
            ref={mapModeToggleRef}
            className="map-mode-toggle"
            role="tablist"
            aria-label="マップの種類"
          >
            <button
              type="button"
              role="tab"
              id="map-tab-outdoor"
              aria-selected={viewMode === 'outdoor'}
              tabIndex={viewMode === 'outdoor' ? 0 : -1}
              className={`map-mode-button ${viewMode === 'outdoor' ? 'active' : ''}`}
              onClick={() => setViewMode('outdoor')}
            >
              屋外マップ
            </button>
            <button
              type="button"
              role="tab"
              id="map-tab-indoor"
              aria-selected={viewMode === 'indoor'}
              tabIndex={viewMode === 'indoor' ? 0 : -1}
              className={`map-mode-button ${viewMode === 'indoor' ? 'active' : ''}`}
              disabled={!indoorAvailable}
              title={!indoorAvailable ? '屋内用の maps データがありません' : undefined}
              onClick={() => {
                if (indoorAvailable) setViewMode('indoor')
              }}
            >
              屋内マップ
            </button>
          </div>
          {isDev && (
            <div className="map-mode-dev">
              <button
                type="button"
                className={`map-mode-button ${devPinAdjustEnabled ? 'active' : ''}`}
                onClick={() => {
                  setDevPinAdjustEnabled((prev) => !prev)
                }}
              >
                ピン調整
              </button>
            </div>
          )}
        </div>
        {viewMode === 'indoor' && indoorAvailable && (
          <div className="indoor-map-selector" role="navigation" aria-label="屋内マップの建物と階">
            <div className="indoor-map-selector__row">
              <span className="indoor-map-selector__hint">建物</span>
              <div className="indoor-map-selector__tabs indoor-map-selector__tabs--primary" role="tablist">
                {indoorPlanGroups.map((group) => (
                  <button
                    key={group.relatedAreaId}
                    type="button"
                    role="tab"
                    aria-selected={indoorBuildingKey === group.relatedAreaId}
                    className={`indoor-map-tab indoor-map-tab--primary ${
                      indoorBuildingKey === group.relatedAreaId ? 'active' : ''
                    }`}
                    onClick={() => selectIndoorBuilding(group.relatedAreaId)}
                  >
                    {buildingLabelFromPins(mapPayload.areas, group.relatedAreaId)}
                  </button>
                ))}
              </div>
            </div>
            {selectedIndoorGroup && (
              <div className="indoor-map-selector__row">
                <span className="indoor-map-selector__hint">階</span>
                <div
                  className="indoor-map-selector__tabs indoor-map-selector__tabs--secondary"
                  role="tablist"
                >
                  {selectedIndoorGroup.floors.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      role="tab"
                      aria-selected={selectedPlanEntry?.id === row.id}
                      className={`indoor-map-tab indoor-map-tab--secondary ${
                        selectedPlanEntry?.id === row.id ? 'active' : ''
                      }`}
                      onClick={() => setIndoorMapRowId(row.id)}
                    >
                      {row.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {isMapReady && (
        <MapContainer
          center={[35.6672324, 139.791702]}
          zoom={18}
          maxZoom={21}
          style={
            viewMode === 'indoor'
              ? { flex: '1 1 0', minHeight: 0, width: '100%', height: 'auto' }
              : { height: '100%', width: '100%' }
          }
          closePopupOnClick={false}
          zoomControl={false}
        >
          <ZoomControl position="bottomright" />
          <MapZoomAndMarkers
            pinsEnabled={viewMode === 'outdoor'}
            shops={filteredShops}
            isMapReady={isMapReady}
            markerRefs={markerRefs}
            setSelectedShop={openShopDetail}
            getCategoryColor={getCategoryColor}
            onZoomChange={handleMapZoomChange}
            shopLabelMode={shopLabelMode}
            amenityPins={viewMode === 'outdoor' ? visibleAmenityPins : []}
            amenityFocusMode={filters.selectedAmenityKind !== null}
            devPinAdjustEnabled={isDev && devPinAdjustEnabled}
            devPinOverrides={devPinOverrides}
            onDevPinMove={(move) => {
              setDevPinOverrides((prev) => ({
                ...prev,
                [move.key]: move.coordinates,
              }))
              setLatestPinMove(move)
              if (!isDev) return
              if (move.csvId.trim() === '') {
                setDevPinSaveState('error')
                setDevPinSaveMessage('このピンは source id がないため CSV 保存できません')
                return
              }
              setDevPinSaveState('saving')
              setDevPinSaveMessage('保存中...')
              void fetch('/api/dev/pin-adjustments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  adjustment: {
                    kind: move.kind,
                    id: move.csvId,
                    lat: move.coordinates[0],
                    lng: move.coordinates[1],
                  },
                }),
              })
                .then(async (res) => {
                  if (!res.ok) {
                    const payload = (await res.json().catch(() => null)) as { error?: string } | null
                    throw new Error(payload?.error ?? `HTTP ${res.status}`)
                  }
                  setDevPinSaveState('saved')
                  setDevPinSaveMessage(`保存済み: ${move.kind} ${move.csvId}`)
                })
                .catch((error) => {
                  setDevPinSaveState('error')
                  setDevPinSaveMessage(
                    `保存失敗: ${error instanceof Error ? error.message : String(error)}`,
                  )
                })
            }}
          />
          <MapFocusShopFromQuery
            shops={filteredShops}
            openShopDetail={openShopDetail}
            enabled={viewMode === 'outdoor'}
          />
          <MapViewResizeSync viewMode={viewMode} />
          <DevMapRightClickCoords />
          <DevPinAdjustPanel
            latestMove={latestPinMove}
            saveState={devPinSaveState}
            saveMessage={devPinSaveMessage}
            onClear={() => {
              setLatestPinMove(null)
            }}
          />
          {viewMode === 'outdoor' && (
            <>
              <TileLayer
                attribution="&copy; OpenStreetMap"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxNativeZoom={19}
                maxZoom={21}
                opacity={0.4}
              />
              <CampusSvgOverlay />
            </>
          )}
          {viewMode === 'indoor' && selectedPlanEntry && (
            <IndoorMapPlanLayer entry={selectedPlanEntry} areaPins={mapPayload.areas} />
          )}
          {viewMode === 'outdoor' && userLocation && (
            <>
              <CircleMarker
                center={userLocation}
                radius={10}
                pathOptions={{
                  color: 'red',
                  weight: 3,
                  fillColor: 'transparent',
                  fillOpacity: 0,
                }}
              >
                <Popup autoPan={false} autoClose={false} closeOnClick={false} offset={[0, -10]}>
                  あなたの現在地
                </Popup>
              </CircleMarker>
              <CircleMarker
                center={userLocation}
                radius={4}
                pathOptions={{
                  color: 'red',
                  weight: 1,
                  fillColor: 'red',
                  fillOpacity: 1,
                }}
              />
            </>
          )}
          {viewMode === 'outdoor' && (
            <CurrentLocationButton
              onLocationUpdate={(lat, lng) => setUserLocation([lat, lng])}
            />
          )}
        </MapContainer>
      )}
      {viewMode === 'outdoor' && (
        <MapFilterPanel
          shopCategories={filters.shopCategories}
          selectedAmenityKind={filters.selectedAmenityKind}
          availableAmenities={availableAmenities}
          onToggleShopCategory={toggleShopCategory}
          onSelectAmenityKind={selectAmenityKind}
          shopLabelMode={shopLabelMode}
          onSetShopLabelMode={setShopLabelMode}
          onReset={resetFilters}
        />
      )}
      {selectedShop && (
        <ShopPopup
          shop={selectedShop}
          onClose={() => {
            const id = selectedShop.id
            setSelectedShop(null)
            queueMicrotask(() => {
              if (mapZoomRef.current >= popupMinZoom) {
                markerRefs.current[`shop-${id}`]?.openPopup()
              }
            })
          }}
        />
      )}
    </div>
  )
}
