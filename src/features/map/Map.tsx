'use client'

import './Map.css'
import 'leaflet/dist/leaflet.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ImageOverlay, MapContainer, Marker, Popup, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import {
  getMapAreas,
  getShops,
  type MapAmenityKind,
  type Shop,
  type ShopCategory,
} from '../../data/loaders'
import { assetUrl } from '../../lib/assetUrl'
import {
  buildingLabelFromPins,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_CENTER_MOBILE,
  groupIndoorMapCatalogRows,
  isShopLabelMode,
  loadStoredFilters,
  persistFilters,
  SHOP_CATEGORIES_ALL,
  shopEventPopupMinZoom,
  useIsMobile,
} from './mapUtils'
import type {
  DevPinMove,
  DevPinSaveState,
  MapFiltersState,
  MarkerRefMap,
  ShopLabelMode,
} from './mapTypes'
import IndoorMapPlanLayer from './IndoorMapPlanLayer'
import MapZoomAndMarkers, { MapFocusShopFromQuery, MapViewResizeSync } from './MapZoomAndMarkers'
import { DevMapRightClickCoords, DevPinAdjustPanel } from './DevMapTools'
import MapFilterPanel from './MapFilterPanel'
import ShopPopup from './ShopPopup'
import { trackEvent } from '@/lib/gtag'
import { useFavorites } from '@/lib/favorites'

// Leaflet デフォルトアイコン（バンドラ用パッチ）
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet の型定義に _getIconUrl が無い
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: assetUrl('/images/map/leaflet/marker-icon-2x.png'),
  iconUrl: assetUrl('/images/map/leaflet/marker-icon.png'),
  shadowUrl: assetUrl('/images/map/leaflet/marker-shadow.png'),
})

const SHOP_LABEL_MODE_STORAGE_KEY = 'map.shopLabelMode'

const DEFAULT_FILTERS: MapFiltersState = {
  shopCategories: new Set<ShopCategory>(SHOP_CATEGORIES_ALL),
  selectedAmenityKind: null,
}

const getCategoryColor = (category: ShopCategory): string => {
  switch (category) {
    case 'food': return '#ff7043'
    case 'stage': return '#ab47bc'
    case 'facility': return '#42a5f5'
    case 'experience':
    default: return '#66bb6a'
  }
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

function CurrentLocationButton({
  onLocationUpdate,
}: {
  onLocationUpdate?: (lat: number, lng: number) => void
}) {
  const [isLocating, setIsLocating] = useState(false)

  const handleClick = () => {
    if (!navigator.geolocation) {
      alert('このブラウザでは現在地を取得できません。')
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setIsLocating(false)
        if (onLocationUpdate) {
          onLocationUpdate(latitude, longitude)
        }
      },
      () => {
        setIsLocating(false)
        alert('現在地を取得できませんでした。位置情報の許可を確認してください。')
      },
    )
  }
  return (
    <button
      className="current-location-button"
      onClick={handleClick}
      aria-label={isLocating ? '現在地を取得中...' : '現在地を取得'}
      disabled={isLocating}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </button>
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
  const [devPinOverrides, setDevPinOverrides] = useState<Record<string, [number, number]>>({})
  const [latestPinMove, setLatestPinMove] = useState<DevPinMove | null>(null)
  const [devPinSaveState, setDevPinSaveState] = useState<DevPinSaveState>('idle')
  const [devPinSaveMessage, setDevPinSaveMessage] = useState(
    'ドラッグでマスター xlsx / csv に直接保存（屋外=lat/lng · 屋内=x/y 正規化）',
  )
  const { shopIds: favShopIds, toggleShop: toggleFavShop } = useFavorites()
  const [showOnlyFavs, setShowOnlyFavs] = useState(false)
  const markerRefs = useRef<MarkerRefMap>({})
  const mapZoomRef = useRef(18)
  const mapModeToggleRef = useRef<HTMLDivElement>(null)
  const isDev = process.env.NODE_ENV === 'development'
  const isMobile = useIsMobile()
  const popupMinZoom = shopEventPopupMinZoom(isMobile)
  let mapCenter: [number, number]
  if (isMobile) {
    mapCenter = DEFAULT_MAP_CENTER_MOBILE
  } else {
    mapCenter = DEFAULT_MAP_CENTER
  }

  const handleMapZoomChange = useCallback((z: number) => {
    mapZoomRef.current = z
  }, [])

  /** 店舗詳細を開いても Leaflet の既定クリックで吹き出しが閉じないよう、直後に再オープンする */
  const openShopDetail = useCallback(
    (shop: Shop) => {
      setSelectedShop(shop)
      trackEvent('map_spot_tap', {
        shop_id: String(shop.id),
        shop_name: shop.title,
        shop_category: shop.category,
      })
      const key = `shop-${shop.id}`
      queueMicrotask(() => {
        if (mapZoomRef.current >= popupMinZoom) {
          markerRefs.current[key]?.openPopup()
        }
      })
    },
    [popupMinZoom],
  )

  const handleDevPinMove = useCallback(
    (move: DevPinMove) => {
      setDevPinOverrides((prev) => ({
        ...prev,
        [move.key]: move.coordinates,
      }))
      setLatestPinMove(move)
      if (!isDev) return
      if (move.csvId.trim() === '') {
        setDevPinSaveState('error')
        setDevPinSaveMessage('このピンは source id がないため保存できません')
        return
      }

      const adjustment =
        move.kind === 'indoorShop'
          ? move.indoorNorm
            ? {
                kind: 'indoorShop' as const,
                id: move.csvId.trim(),
                normX: move.indoorNorm.x,
                normY: move.indoorNorm.y,
              }
            : null
          : {
              kind: move.kind,
              id: move.csvId.trim(),
              lat: move.coordinates[0],
              lng: move.coordinates[1],
            }

      if (!adjustment) {
        setDevPinSaveState('error')
        setDevPinSaveMessage('屋内の正規化座標を算出できませんでした')
        return
      }

      if (adjustment.kind === 'indoorShop') {
        if (
          !Number.isFinite(adjustment.normX) ||
          !Number.isFinite(adjustment.normY)
        ) {
          setDevPinSaveState('error')
          setDevPinSaveMessage(
            '保存できません: 屋内座標（正規化 x/y）が無効です。マップを再表示してから再度ドラッグしてください',
          )
          return
        }
      } else if (
        !Number.isFinite(adjustment.lat) ||
        !Number.isFinite(adjustment.lng)
      ) {
        setDevPinSaveState('error')
        setDevPinSaveMessage(
          '保存できません: lat/lng が無効です。マップを再表示してから再度ドラッグしてください',
        )
        return
      }

      setDevPinSaveState('saving')
      setDevPinSaveMessage('保存中...')
      void fetch('/api/dev/pin-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustment }),
      })
        .then(async (res) => {
          const payload = (await res.json().catch(() => null)) as {
            updated?: { file?: string; sheet?: string; format?: string }
            error?: unknown
            issues?: unknown
          } | null
          if (!res.ok) {
            let errMsg: string
            if (typeof payload?.error === 'string') {
              errMsg = payload.error
              if (
                payload.issues !== undefined &&
                payload.issues !== null &&
                typeof payload.issues === 'object'
              ) {
                errMsg += ` · ${JSON.stringify(payload.issues)}`
              }
              errMsg += ` [HTTP ${res.status}]`
            } else {
              errMsg = JSON.stringify(payload ?? `(HTTP ${res.status})`)
            }
            throw new Error(errMsg)
          }
          setDevPinSaveState('saved')
          const u = payload?.updated
          const loc = u?.file ?? ''
          const sh = u?.sheet ? ` · ${u.sheet}` : ''
          setDevPinSaveMessage(
            `保存済み (${u?.format ?? '?'}): ${loc}${sh} · id=${move.csvId}`,
          )
        })
        .catch((error) => {
          setDevPinSaveState('error')
          setDevPinSaveMessage(
            `保存失敗: ${error instanceof Error ? error.message : String(error)}`,
          )
        })
    },
    [isDev],
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
      const action = next.has(category) ? 'remove' : 'add'
      if (action === 'remove') next.delete(category)
      else next.add(category)
      trackEvent('map_filter_category', { category, action })
      return { ...prev, shopCategories: next }
    })
  }, [])

  const selectAmenityKind = useCallback((kind: MapAmenityKind | null) => {
    if (kind !== null) trackEvent('map_filter_amenity', { amenity_kind: kind })
    setFilters((prev) => ({ ...prev, selectedAmenityKind: kind }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setShopLabelMode('title')
    setShowOnlyFavs(false)
  }, [])

  const availableAmenities = useMemo(() => {
    const set = new Set<MapAmenityKind>()
    for (const a of mapPayload.amenities) set.add(a.kind)
    return set
  }, [mapPayload])

  useEffect(() => {
    const raw = searchParams.get('shop')?.trim() ?? ''
    if (raw === '') return
    let id = raw
    try {
      id = decodeURIComponent(raw)
    } catch {
      /* 生の raw のまま照合 */
    }
    if (shops.some((s) => s.id === id)) {
      setViewMode('outdoor')
    }
  }, [searchParams, shops])

  const filteredShops = useMemo(
    () => shops.filter((s) => filters.shopCategories.has(s.category)),
    [shops, filters.shopCategories],
  )

  const campusMapShops = useMemo(
    () => filteredShops.filter((s) => s.showOnCampusMap && (!showOnlyFavs || favShopIds.has(s.id))),
    [filteredShops, showOnlyFavs, favShopIds],
  )

  /** 屋内平面図用（`maps` のフロア id が付いた行。屋外にも出す店もここに含め各フロアでピン表示） */
  const indoorMapShops = useMemo(
    () => filteredShops.filter((s) => s.indoorPlanMapId.trim() !== ''),
    [filteredShops],
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
          <button
            type="button"
            className={`map-mode-button map-fav-toggle${showOnlyFavs ? ' active' : ''}`}
            aria-pressed={showOnlyFavs}
            aria-label={showOnlyFavs ? 'お気に入りのみ表示中（解除）' : 'お気に入りのみ表示'}
            onClick={() => setShowOnlyFavs((v) => !v)}
          >
            ★ お気に入り
          </button>
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
      {!isMapReady && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          マップを読み込み中…
        </div>
      )}
      {isMapReady && (
        <MapContainer
          center={mapCenter}
          zoom={18}
          maxZoom={21}
          style={
            viewMode === 'indoor'
              ? { flex: '1 1 0', minHeight: 0, width: '100%', height: 'auto' }
              : { height: '100%', width: '100%' }
          }
          closePopupOnClick={false}
          zoomControl={false}
          /* モバイルで「タップ判定の遅延」がクリックとピンチに干渉することがあるため無効化 */
          tap={false}
        >
          <ZoomControl position="bottomright" />
          <MapZoomAndMarkers
            pinsEnabled={viewMode === 'outdoor'}
            shops={campusMapShops}
            isMapReady={isMapReady}
            markerRefs={markerRefs}
            setSelectedShop={openShopDetail}
            getCategoryColor={getCategoryColor}
            onZoomChange={handleMapZoomChange}
            shopLabelMode={shopLabelMode}
            amenityPins={viewMode === 'outdoor' ? visibleAmenityPins : []}
            amenityFocusMode={filters.selectedAmenityKind !== null}
            onBuildingPinClickAtMaxZoom={(relatedAreaId) => {
              const group = indoorPlanGroups.find((g) => g.relatedAreaId === relatedAreaId)
              if (!group) return
              setViewMode('indoor')
              selectIndoorBuilding(relatedAreaId)
            }}
            devPinAdjustEnabled={isDev && devPinAdjustEnabled}
            devPinOverrides={devPinOverrides}
            onDevPinMove={handleDevPinMove}
            pinnedCampusShopId={selectedShop?.id ?? null}
            favShopIds={favShopIds}
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
            <CampusSvgOverlay />
          )}
          {viewMode === 'indoor' && selectedPlanEntry && (
            <IndoorMapPlanLayer
              entry={selectedPlanEntry}
              areaPins={mapPayload.areas}
              shops={indoorMapShops}
              shopLabelMode={shopLabelMode}
              getCategoryColor={getCategoryColor}
              onSelectShop={openShopDetail}
              amenityFocusMode={filters.selectedAmenityKind !== null}
              devPinAdjustEnabled={isDev && devPinAdjustEnabled}
              devPinOverrides={devPinOverrides}
              onDevPinMove={handleDevPinMove}
            />
          )}
          {viewMode === 'outdoor' && userLocation && (
            <Marker
              position={userLocation}
              zIndexOffset={1500}
              icon={L.divIcon({
                className: 'user-location-marker-icon',
                html: '<div class="user-location-marker"><span class="user-location-marker__ring" aria-hidden="true"></span><span class="user-location-marker__core" aria-hidden="true"></span></div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              })}
            >
              <Popup autoPan={false} autoClose={false} closeOnClick={false} offset={[0, -10]}>
                あなたの現在地
              </Popup>
            </Marker>
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
          isFav={favShopIds.has(selectedShop.id)}
          onToggleFav={() => toggleFavShop(selectedShop.id)}
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
