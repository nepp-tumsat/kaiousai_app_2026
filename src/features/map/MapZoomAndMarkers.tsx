'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { useSearchParams } from 'next/navigation'
import { Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { MapAmenityKind, MapAmenityPin, MapAreaPin, Shop, ShopCategory } from '../../data/loaders'
import { getMapAreas } from '../../data/loaders'
import { isStakeholderShopId } from '../../data/stakeholderShops'
import type { DevPinMove, LatLngTuple, MarkerRefMap, ShopLabelMode } from './mapTypes'
import {
  amenityBuildingLabel,
  buildPinKey,
  MOBILE_ZOOM_OFFSET,
  shopEventPopupMinZoom,
  shopPopupLabelFor,
  useIsMobile,
} from './mapUtils'
import { buildCategoryMarkerIcon } from './categoryMarkerIcon'

const AMENITY_KIND_LABEL: Record<MapAmenityKind, string> = {
  smoking: '喫煙所',
  toilet: 'トイレ',
  aed: 'AED',
  fire_extinguisher: '消火器',
}

export function MapViewResizeSync({ viewMode }: { viewMode: 'outdoor' | 'indoor' }) {
  const map = useMap()
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 0)
    return () => window.clearTimeout(t)
  }, [map, viewMode])
  return null
}

function shopIdFromMapQuery(raw: string): string {
  try {
    return decodeURIComponent(raw.trim())
  } catch {
    return raw.trim()
  }
}

/** `/map?shop=` から該当ピンへズームし詳細を開く */
export function MapFocusShopFromQuery({
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
    const id = shopIdFromMapQuery(raw)
    if (id === '') return
    const shop = shops.find((s) => s.id === id)
    if (!shop) return
    doneForShopParamRef.current = raw
    if (shop.showOnCampusMap) {
      const z = Math.max(map.getZoom(), shopEventPopupMinZoom(isMobile))
      map.setView(shop.coordinates, z, { animate: true })
    }
    const delay = shop.showOnCampusMap ? 450 : 0
    const t = window.setTimeout(() => {
      openShopDetail(shop)
    }, delay)
    return () => window.clearTimeout(t)
  }, [enabled, searchParams, shops, map, openShopDetail, isMobile])

  return null
}

export default function MapZoomAndMarkers({
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
  onBuildingPinClickAtMaxZoom,
  pinnedCampusShopId = null,
  favShopIds = new Set(),
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
  pinsEnabled?: boolean
  shopLabelMode: ShopLabelMode
  amenityPins: MapAmenityPin[]
  amenityFocusMode: boolean
  onBuildingPinClickAtMaxZoom: (relatedAreaId: string) => void
  pinnedCampusShopId?: string | null
  favShopIds?: Set<string>
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
   * - それ以上（最大拡大・店舗吹き出し表示も含む）: 全エリア（AR・建物とも表示）
   */
  const areaPinsForZoom = (() => {
    if (zoom <= 17 - zoomOffset) {
      return mapPayload.areas.filter((a) => a.name === '正門')
    }
    if (zoom === 18 - zoomOffset) {
      return mapPayload.areas.filter((a) => a.id.startsWith('AR-'))
    }
    return mapPayload.areas
  })()

  /** 通常はズームに応じて全店舗 or 非表示。お気に入り・詳細オープン中の店舗はズームアウト時も常時表示 */
  const visibleCampusShops = useMemo(() => {
    if (showShopPins) return shops
    return shops.filter((s) => favShopIds.has(s.id) || s.id === pinnedCampusShopId)
  }, [shops, showShopPins, favShopIds, pinnedCampusShopId])

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
   * エリア／建物ピンのクリック挙動:
   * - 最大拡大未満なら、そのエリア中心へパン＆最大拡大度までズームイン。
   * - 最大拡大済みかつ建物ピン（非 AR）なら、対応する屋内マップへ遷移する。
   * - dev のピン調整モード中は何もしない（ドラッグを優先）。
   */
  const handleAreaPinClick = useCallback(
    (area: MapAreaPin) => {
      if (devPinAdjustEnabled) return
      const maxZoom = map.getMaxZoom()
      if (map.getZoom() < maxZoom) {
        map.setView(area.coordinates, maxZoom, { animate: true })
        return
      }
      if (!area.id.startsWith('AR-')) {
        onBuildingPinClickAtMaxZoom(area.id)
      }
    },
    [map, devPinAdjustEnabled, onBuildingPinClickAtMaxZoom],
  )

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
    visibleCampusShops.length,
  ])

  if (!pinsEnabled) {
    return process.env.NODE_ENV === 'development' ? <div className="zoom-indicator">{zoom}</div> : null
  }

  return (
    <>
      {process.env.NODE_ENV === 'development' && <div className="zoom-indicator">{zoom}</div>}
      {visibleCampusShops.map((shop) => (
        <Marker
          key={`shop-${shop.id}`}
          position={devPinOverrides[buildPinKey('shop', shop.id)] ?? shop.coordinates}
          zIndexOffset={favShopIds.has(shop.id) ? 300 : !showShopPins ? 650 : 0}
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
          icon={buildCategoryMarkerIcon(shop, getCategoryColor, favShopIds.has(shop.id))}
        >
          {showShopEventPopups && !amenityFocusMode && (
            <Popup
              className={`map-popup--shop map-popup--shop-${shop.category}${
                isStakeholderShopId(shop.sourceLocationId) ? ' map-popup--stakeholder' : ''
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
      {showShopPins ? (
        <>
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
          {(showAreaDistrictOverlay || (showShopEventPopups && !devPinAdjustEnabled)) &&
            areaPinsForZoom.map((area) => (
              <Marker
                key={`area-overlay-${area.id}`}
                position={devPinOverrides[buildPinKey('area', area.id)] ?? area.coordinates}
                zIndexOffset={devPinAdjustEnabled ? 800 : -400}
                interactive
                draggable={devPinAdjustEnabled}
                ref={(marker) => {
                  const key = `area-${area.id}`
                  if (marker) markerRefs.current[key] = marker
                  else delete markerRefs.current[key]
                }}
                eventHandlers={{
                  click: () => handleAreaPinClick(area),
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
                    <div
                      className="area-marker-popup"
                      style={{ cursor: devPinAdjustEnabled ? 'default' : 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAreaPinClick(area)
                      }}
                    >
                      {area.name}
                    </div>
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
                click: () => handleAreaPinClick(area),
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
                  <div
                    className="area-marker-popup"
                    style={{ cursor: devPinAdjustEnabled ? 'default' : 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAreaPinClick(area)
                    }}
                  >
                    {area.name}
                  </div>
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
        const buildingLabel = amenityBuildingLabel(pin)
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
                <div className="amenity-marker-popup__building">{buildingLabel}</div>
                {buildingLabel !== AMENITY_KIND_LABEL[pin.kind] && (
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
