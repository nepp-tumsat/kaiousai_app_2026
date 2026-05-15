'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageOverlay, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { MapAreaPin, MapCatalogEntry, Shop } from '../../data/loaders'
import { isStakeholderShopId } from '../../data/stakeholderShops'
import { assetUrl } from '../../lib/assetUrl'
import type { DevPinMove, LatLngTuple, ShopLabelMode } from './mapTypes'
import {
  boundsForImageAspect,
  buildPinKey,
  centerForRelatedArea,
  INDOOR_PLAN_LAT_SPAN,
  indoorPlanNormFromXY,
  latLngFromIndoorPlanBounds,
  normFromLatLngIndoorBounds,
  shopPopupLabelFor,
} from './mapUtils'
import { buildCategoryMarkerIcon, shopPopupTagClass } from './categoryMarkerIcon'

type IndoorPlaneDisplay = {
  buildingId: string
  floorId: string
  image: string
  bounds: [[number, number], [number, number]]
  imgWidth: number
  imgHeight: number
}

export default function IndoorMapPlanLayer({
  entry,
  areaPins,
  shops,
  shopLabelMode,

  onSelectShop,
  amenityFocusMode,
  devPinAdjustEnabled,
  devPinOverrides,
  onDevPinMove,
  isMobile = false,
}: {
  entry: MapCatalogEntry
  areaPins: MapAreaPin[]
  shops: Shop[]
  shopLabelMode: ShopLabelMode
  onSelectShop: (shop: Shop) => void
  amenityFocusMode: boolean
  devPinAdjustEnabled: boolean
  devPinOverrides: Record<string, LatLngTuple>
  onDevPinMove: (move: DevPinMove) => void
  isMobile?: boolean
}) {
  const map = useMap()
  const [plane, setPlane] = useState<IndoorPlaneDisplay | null>(null)
  const [planeOpacity, setPlaneOpacity] = useState(1)
  const lastFitFloorKeyRef = useRef<string | null>(null)
  const prevRelatedAreaRef = useRef<string | null>(null)
  const indoorShopMarkerRefs = useRef<Record<string, L.Marker | null>>({})

  const floorShops = useMemo(
    () => shops.filter((s) => s.indoorPlanMapId === entry.id),
    [shops, entry.id],
  )

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
      setPlane({
        buildingId,
        floorId: entry.id,
        image: entry.image,
        bounds,
        imgWidth: w,
        imgHeight: h,
      })
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
  }, [entry.id, entry.image, entry.relatedAreaId, areaPins, isMobile])

  useEffect(() => {
    if (!plane) return
    if (plane.buildingId !== entry.relatedAreaId || plane.floorId !== entry.id) return
    const sw = plane.bounds[0]
    const ne = plane.bounds[1]
    const b = L.latLngBounds(L.latLng(sw[0], sw[1]), L.latLng(ne[0], ne[1]))
    if (!b.isValid()) return
    const floorKey = `${plane.buildingId}:${plane.floorId}`

    const id = window.setTimeout(() => {
      map.invalidateSize()
      if (lastFitFloorKeyRef.current !== floorKey) {
        map.fitBounds(b, { padding: [20, 20], maxZoom: 21, animate: false })
        if (isMobile && map.getZoom() < 19) {
          map.setZoom(19, { animate: false })
        }
        lastFitFloorKeyRef.current = floorKey
      }
    }, 60)
    return () => window.clearTimeout(id)
  }, [map, plane, entry.relatedAreaId, entry.id, isMobile])

  useEffect(() => {
    if (!plane || amenityFocusMode) return
    let timeoutId: number | undefined
    const syncIndoorShopPopups = () => {
      timeoutId = window.setTimeout(() => {
        Object.values(indoorShopMarkerRefs.current).forEach((m) => m?.openPopup())
      }, 60)
    }
    map.whenReady(syncIndoorShopPopups)
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [map, plane, entry.id, amenityFocusMode, floorShops])

  useMapEvents({
    zoomend() {
      if (!plane || amenityFocusMode) return
      requestAnimationFrame(() => {
        Object.values(indoorShopMarkerRefs.current).forEach((m) => m?.openPopup())
      })
    },
  })

  if (!plane) return null

  const positionForShop = (shop: Shop): LatLngTuple => {
    const oKey = buildPinKey('indoorShop', shop.id)
    const overridden = devPinOverrides[oKey]
    if (overridden) return overridden
    if (shop.indoorX !== undefined && shop.indoorY !== undefined) {
      const [nx, ny] = indoorPlanNormFromXY(shop.indoorX, shop.indoorY, plane.imgWidth, plane.imgHeight)
      return latLngFromIndoorPlanBounds(plane.bounds, nx, ny)
    }
    return latLngFromIndoorPlanBounds(plane.bounds, 0.5, 0.5)
  }

  return (
    <>
      <ImageOverlay
        key="indoor-floor-plan"
        url={assetUrl(`/images/${plane.image}`)}
        bounds={plane.bounds}
        opacity={planeOpacity}
        zIndex={400}
        interactive={false}
      />
      {!amenityFocusMode &&
        floorShops.map((shop) => {
          const position = positionForShop(shop)
          return (
            <Marker
              key={`indoor-shop-${shop.id}`}
              position={position}
              zIndexOffset={600}
              draggable={devPinAdjustEnabled}
              ref={(marker) => {
                const key = String(shop.id)
                if (marker) indoorShopMarkerRefs.current[key] = marker
                else delete indoorShopMarkerRefs.current[key]
              }}
              eventHandlers={{
                click: () => {
                  if (!devPinAdjustEnabled) onSelectShop(shop)
                },
                dragend: (e) => {
                  if (!devPinAdjustEnabled) return
                  const marker = e.target as L.Marker
                  const ll = marker.getLatLng()
                  const lat = ll.lat
                  const lng = ll.lng
                  const [nx, ny] = normFromLatLngIndoorBounds(plane.bounds, lat, lng)
                  onDevPinMove({
                    key: buildPinKey('indoorShop', shop.id),
                    kind: 'indoorShop',
                    id: shop.id,
                    csvId: shop.sourceLocationId ?? '',
                    label: shop.title,
                    coordinates: [lat, lng],
                    indoorNorm: { x: nx, y: ny },
                  })
                },
              }}
              icon={buildCategoryMarkerIcon(shop)}
            >
              <Popup
                className={`map-popup--shop ${shopPopupTagClass(shop)}${
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
                    if (!devPinAdjustEnabled) onSelectShop(shop)
                  }}
                >
                  {shopPopupLabelFor(shop, shopLabelMode)}
                </div>
              </Popup>
            </Marker>
          )
        })}
    </>
  )
}
