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
import { getMapAreas, getShops, type MapAreaPin, type MapCatalogEntry, type Shop, type ShopCategory } from '../../data/loaders'
import { assetUrl } from '../../lib/assetUrl'
import ShopPopup from './ShopPopup'

// Leaflet デフォルトアイコン（バンドラ用パッチ）
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet の型定義に _getIconUrl が無い
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: assetUrl('/images/map/leaflet/marker-icon-2x.png'),
  iconUrl: assetUrl('/images/map/leaflet/marker-icon.png'),
  shadowUrl: assetUrl('/images/map/leaflet/marker-shadow.png'),
})

/** 店舗・イベント会場ピン: このズーム未満はピンのみ、以上で Leaflet 吹き出し */
const SHOP_EVENT_POPUP_MIN_ZOOM = 21

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
    <button className="current-location-button" onClick={handleClick}>
      📍 現在地取得
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
    const z = Math.max(map.getZoom(), SHOP_EVENT_POPUP_MIN_ZOOM)
    map.setView(shop.coordinates, z, { animate: true })
    const t = window.setTimeout(() => {
      openShopDetail(shop)
    }, 450)
    return () => window.clearTimeout(t)
  }, [enabled, searchParams, shops, map, openShopDetail])

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
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  const [mapPayload] = useState(() => getMapAreas())
  /** areas があるとき: zoom < shopPinsMinZoom でエリア、zoom >= で店舗（location）。既定 20 → 19 までエリア */
  const showShopPins = mapPayload.areas.length === 0 || zoom >= mapPayload.shopPinsMinZoom
  /** 店舗・イベントピンは zoom 21 未満では吹き出しなし（ピンのみ） */
  const showShopEventPopups = zoom >= SHOP_EVENT_POPUP_MIN_ZOOM
  /** zoom 20: 店舗ピンに加え、地区名（エリア）の吹き出しを重ねる */
  const showAreaDistrictOverlay =
    showShopPins && !showShopEventPopups && mapPayload.areas.length > 0
  /** ズーム 17 以下ではエリア代表ピンは「正門」のみ（遠景のノイズ低減） */
  const areaPinsForZoom =
    zoom <= 17 ? mapPayload.areas.filter((a) => a.name === '正門') : mapPayload.areas

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
    return <div className="zoom-indicator">{zoom}</div>
  }

  return (
    <>
      <div className="zoom-indicator">{zoom}</div>
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
                className: 'category-marker-icon',
                html: `<div class="category-marker-dot${
                  shop.category === 'facility' ? ' category-marker-dot--facility' : ''
                }" style="background-color:${getCategoryColor(shop.category)}"></div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11],
              })}
            >
              {showShopEventPopups && (
                <Popup
                  className={`map-popup--shop map-popup--shop-${shop.category}`}
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
                    {shop.title}
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
              {showShopEventPopups && (
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
                <Popup
                  autoPan={false}
                  autoClose={false}
                  closeButton={false}
                  closeOnClick={false}
                  offset={[0, -10]}
                >
                  <div className="area-marker-popup">{area.name}</div>
                </Popup>
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
              <Popup
                autoPan={false}
                autoClose={false}
                closeButton={false}
                closeOnClick={false}
                offset={[0, -10]}
              >
                <div className="area-marker-popup">{area.name}</div>
              </Popup>
            </Marker>
          ))}
        </>
      )}
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
  const [devPinAdjustEnabled, setDevPinAdjustEnabled] = useState(false)
  const [devPinOverrides, setDevPinOverrides] = useState<Record<string, LatLngTuple>>({})
  const [latestPinMove, setLatestPinMove] = useState<DevPinMove | null>(null)
  const [devPinSaveState, setDevPinSaveState] = useState<DevPinSaveState>('idle')
  const [devPinSaveMessage, setDevPinSaveMessage] = useState('ドラッグすると output_*.csv に保存します')
  const markerRefs = useRef<MarkerRefMap>({})
  const mapZoomRef = useRef(18)
  const mapModeToggleRef = useRef<HTMLDivElement>(null)
  const isDev = process.env.NODE_ENV === 'development'

  const handleMapZoomChange = useCallback((z: number) => {
    mapZoomRef.current = z
  }, [])

  /** 店舗詳細を開いても Leaflet の既定クリックで吹き出しが閉じないよう、直後に再オープンする */
  const openShopDetail = useCallback((shop: Shop) => {
    setSelectedShop(shop)
    const key = `shop-${shop.id}`
    queueMicrotask(() => {
      if (mapZoomRef.current >= SHOP_EVENT_POPUP_MIN_ZOOM) {
        markerRefs.current[key]?.openPopup()
      }
    })
  }, [])

  useEffect(() => {
    setIsMapReady(true)
  }, [])

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

  const filteredShops = shops

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
      {selectedShop && (
        <ShopPopup
          shop={selectedShop}
          onClose={() => {
            const id = selectedShop.id
            setSelectedShop(null)
            queueMicrotask(() => {
              if (mapZoomRef.current >= SHOP_EVENT_POPUP_MIN_ZOOM) {
                markerRefs.current[`shop-${id}`]?.openPopup()
              }
            })
          }}
        />
      )}
    </div>
  )
}
