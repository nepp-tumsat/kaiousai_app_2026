'use client'

import './Map.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { getMapAreas, getShops, type Shop, type ShopCategory } from '../../data/loaders'
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

function MapZoomAndMarkers({
  shops,
  isMapReady,
  markerRefs,
  setSelectedShop,
  getCategoryColor,
}: {
  shops: Shop[]
  isMapReady: boolean
  markerRefs: MutableRefObject<MarkerRefMap>
  setSelectedShop: (shop: Shop) => void
  getCategoryColor: (category: ShopCategory) => string
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  const [mapPayload] = useState(() => getMapAreas())
  /** areas があるとき: zoom < shopPinsMinZoom でエリア、zoom >= で店舗（location）。既定 20 → 19 までエリア */
  const showShopPins = mapPayload.areas.length === 0 || zoom >= mapPayload.shopPinsMinZoom
  /** ズーム 17 以下ではエリア代表ピンは「正門」のみ（遠景のノイズ低減） */
  const areaPinsForZoom =
    zoom <= 17 ? mapPayload.areas.filter((a) => a.name === '正門') : mapPayload.areas

  useMapEvents({
    zoomend(e) {
      setZoom(e.target.getZoom())
    },
    load(e) {
      setZoom(e.target.getZoom())
    },
  })

  /** 初期表示・エリア／店舗の切替後に、すべてのマーカーで Popup を開く */
  useEffect(() => {
    if (!isMapReady) return
    let timeoutId: number | undefined
    const openAllPopups = () => {
      timeoutId = window.setTimeout(() => {
        Object.values(markerRefs.current).forEach((marker) => {
          marker?.openPopup()
        })
      }, 120)
    }
    map.whenReady(openAllPopups)
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [
    isMapReady,
    map,
    showShopPins,
    areaPinsForZoom.length,
    mapPayload.eventLocationPins.length,
    markerRefs,
  ])

  return (
    <>
      <div className="zoom-indicator">{zoom}</div>
      {showShopPins ? (
        <>
          {shops.map((shop) => (
            <Marker
              key={`shop-${shop.id}`}
              position={shop.coordinates}
              ref={(marker) => {
                const key = `shop-${shop.id}`
                if (marker) markerRefs.current[key] = marker
                else delete markerRefs.current[key]
              }}
              eventHandlers={{
                click: () => setSelectedShop(shop),
              }}
              icon={L.divIcon({
                className: 'category-marker-icon',
                html: `<div class="category-marker-dot" style="background-color:${getCategoryColor(shop.category)}"></div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11],
              })}
            >
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
            </Marker>
          ))}
          {mapPayload.eventLocationPins.map((pin) => (
            <Marker
              key={`evloc-${pin.id}`}
              position={pin.coordinates}
              ref={(marker) => {
                const key = `evloc-${pin.id}`
                if (marker) markerRefs.current[key] = marker
                else delete markerRefs.current[key]
              }}
              icon={L.divIcon({
                className: 'event-location-marker-icon',
                html: '<div class="event-location-marker-diamond"></div>',
                iconSize: [22, 22],
                iconAnchor: [11, 11],
              })}
            >
              <Popup
                className="map-popup--event-location"
                autoPan={false}
                autoClose={false}
                closeOnClick={false}
                offset={[0, -10]}
              >
                <div className="event-location-marker-popup">{pin.label}</div>
              </Popup>
            </Marker>
          ))}
        </>
      ) : (
        <>
          {areaPinsForZoom.map((area) => (
            <Marker
              key={`area-${area.id}`}
              position={area.coordinates}
              ref={(marker) => {
                const key = `area-${area.id}`
                if (marker) markerRefs.current[key] = marker
                else delete markerRefs.current[key]
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
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [viewMode, setViewMode] = useState<'outdoor' | 'indoor'>('outdoor')
  const markerRefs = useRef<MarkerRefMap>({})

  /** 店舗詳細を開いても Leaflet の既定クリックで吹き出しが閉じないよう、直後に再オープンする */
  const openShopDetail = useCallback((shop: Shop) => {
    setSelectedShop(shop)
    const key = `shop-${shop.id}`
    queueMicrotask(() => {
      markerRefs.current[key]?.openPopup()
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

  return (
    <div className="map-container">
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
            shops={filteredShops}
            isMapReady={isMapReady}
            markerRefs={markerRefs}
            setSelectedShop={openShopDetail}
            getCategoryColor={getCategoryColor}
          />
          <DevMapRightClickCoords />
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
          {viewMode === 'indoor' && <CampusSvgOverlay />}
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
              markerRefs.current[`shop-${id}`]?.openPopup()
            })
          }}
        />
      )}
    </div>
  )
}
