'use client'

import './Map.css'
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
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import {
  getIndoorMaps,
  getMapAreas,
  getShops,
  type IndoorFloor,
  type Shop,
  type ShopCategory,
} from '../../data/loaders'
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

  const imageUrl = assetUrl('/images/map/campus-map.png')

  return (
    <ImageOverlay
      url={imageUrl}
      bounds={svgBounds}
      opacity={1}
      zIndex={500}
    />
  )
}

/** 屋内フロア平面図（ImageOverlay） */
function IndoorFloorImageOverlay({
  floor,
}: {
  floor: IndoorFloor
}) {
  const bounds: L.LatLngBoundsExpression = [
    [floor.bounds[0][0], floor.bounds[0][1]],
    [floor.bounds[1][0], floor.bounds[1][1]],
  ]
  return (
    <ImageOverlay
      url={assetUrl(`/images/${floor.image}`)}
      bounds={bounds}
      opacity={1}
      zIndex={550}
    />
  )
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
  const [isMapReady, setIsMapReady] = useState(false)
  const [shops] = useState<Shop[]>(() => getShops())
  const indoorMapsConfig = useMemo(() => getIndoorMaps(), [])
  const [indoorAreaId, setIndoorAreaId] = useState(() => indoorMapsConfig.areas[0]?.id ?? '')
  const [indoorFloorId, setIndoorFloorId] = useState(
    () => indoorMapsConfig.areas[0]?.floors[0]?.id ?? '',
  )
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

  const selectedIndoorArea = indoorMapsConfig.areas.find((a) => a.id === indoorAreaId)
  const selectedIndoorFloor =
    selectedIndoorArea?.floors.find((f) => f.id === indoorFloorId) ?? selectedIndoorArea?.floors[0]

  const selectIndoorArea = useCallback(
    (areaId: string) => {
      setIndoorAreaId(areaId)
      const next = indoorMapsConfig.areas.find((a) => a.id === areaId)
      if (next?.floors[0]) setIndoorFloorId(next.floors[0].id)
    },
    [indoorMapsConfig.areas],
  )

  return (
    <div className="map-container">
      <div className="map-top-bar">
        <div className="map-mode-toggle">
          <button
            type="button"
            className={`map-mode-button ${viewMode === 'outdoor' ? 'active' : ''}`}
            onClick={() => setViewMode('outdoor')}
          >
            屋外マップ
          </button>
          <button
            type="button"
            className={`map-mode-button ${viewMode === 'indoor' ? 'active' : ''}`}
            onClick={() => setViewMode('indoor')}
          >
            屋内マップ
          </button>
          {isDev && (
            <button
              type="button"
              className={`map-mode-button ${devPinAdjustEnabled ? 'active' : ''}`}
              onClick={() => {
                setDevPinAdjustEnabled((prev) => !prev)
              }}
            >
              ピン調整
            </button>
          )}
        </div>
        {viewMode === 'indoor' && (
          <div className="indoor-map-selector" role="navigation" aria-label="屋内マップの建物と階">
            <div className="indoor-map-selector__row">
              <span className="indoor-map-selector__hint">建物</span>
              <div className="indoor-map-selector__tabs indoor-map-selector__tabs--primary" role="tablist">
                {indoorMapsConfig.areas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    role="tab"
                    aria-selected={indoorAreaId === area.id}
                    className={`indoor-map-tab indoor-map-tab--primary ${
                      indoorAreaId === area.id ? 'active' : ''
                    }`}
                    onClick={() => selectIndoorArea(area.id)}
                  >
                    {area.label}
                  </button>
                ))}
              </div>
            </div>
            {selectedIndoorArea && (
              <div className="indoor-map-selector__row">
                <span className="indoor-map-selector__hint">階</span>
                <div
                  className="indoor-map-selector__tabs indoor-map-selector__tabs--secondary"
                  role="tablist"
                >
                  {selectedIndoorArea.floors.map((floor) => (
                    <button
                      key={`${selectedIndoorArea.id}-${floor.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selectedIndoorFloor?.id === floor.id}
                      className={`indoor-map-tab indoor-map-tab--secondary ${
                        selectedIndoorFloor?.id === floor.id ? 'active' : ''
                      }`}
                      onClick={() => setIndoorFloorId(floor.id)}
                    >
                      {floor.label}
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
          style={{ height: '100%', width: '100%' }}
          closePopupOnClick={false}
        >
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
          {viewMode === 'indoor' && selectedIndoorFloor && (
            <>
              <TileLayer
                attribution="&copy; OpenStreetMap"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxNativeZoom={19}
                maxZoom={21}
                opacity={0.22}
              />
              <IndoorFloorImageOverlay floor={selectedIndoorFloor} />
            </>
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
