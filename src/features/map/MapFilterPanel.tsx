'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import type { MapAmenityKind } from '../../data/loaders'
import { SHOP_TAG_COLORS } from './categoryMarkerIcon'
import type { ShopTag } from './mapTypes'

const SHOP_TAG_FILTER_ITEMS: { key: ShopTag; label: string; color: string }[] = [
  { key: 'food',       label: '食べ物', color: SHOP_TAG_COLORS.food       },
  { key: 'drink',      label: '飲み物', color: SHOP_TAG_COLORS.drink      },
  { key: 'exhibition', label: '展示・販売等', color: SHOP_TAG_COLORS.exhibition },
  { key: 'activity',   label: '体験',   color: SHOP_TAG_COLORS.activity   },
  { key: 'facility',   label: '施設',   color: SHOP_TAG_COLORS.facility   },
]

const AMENITY_LABELS: Record<MapAmenityKind, string> = {
  smoking: '喫煙所',
  toilet: 'トイレ',
  aed: 'AED',
  fire_extinguisher: '消火器',
}

const AMENITY_ICONS: Record<MapAmenityKind, string> = {
  smoking: '🚬',
  toilet: '🚻',
  aed: '＋',
  fire_extinguisher: '🧯',
}

const AMENITY_ORDER: readonly MapAmenityKind[] = ['toilet', 'smoking', 'aed', 'fire_extinguisher']

type ShopLabelMode = 'title' | 'organization'

interface MapFilterPanelProps {
  shopTagFilters: ReadonlySet<ShopTag>
  /** 付帯設備: 1 種類のみ選択。`null` は何も表示しない */
  selectedAmenityKind: MapAmenityKind | null
  onToggleShopTag: (tag: ShopTag) => void
  onSelectAmenityKind: (kind: MapAmenityKind | null) => void
  /** 利用可能な amenity 種類（generated データに 1 つも該当が無い場合は出さない） */
  availableAmenities: ReadonlySet<MapAmenityKind>
  shopLabelMode: ShopLabelMode
  onSetShopLabelMode: (mode: ShopLabelMode) => void
  onReset: () => void
}

const MapFilterPanel: FC<MapFilterPanelProps> = ({
  shopTagFilters,
  selectedAmenityKind,
  onToggleShopTag,
  onSelectAmenityKind,
  availableAmenities,
  shopLabelMode,
  onSetShopLabelMode,
  onReset,
}) => {
  const isFiltered =
    shopTagFilters.size > 0 ||
    selectedAmenityKind !== null ||
    shopLabelMode !== 'title'
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: PointerEvent) => {
      const node = rootRef.current
      if (!node) return
      if (e.target instanceof Node && node.contains(e.target)) return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const visibleAmenities = AMENITY_ORDER.filter((k) => availableAmenities.has(k))

  return (
    <div className="map-filter-root" ref={rootRef}>
      <button
        type="button"
        className={`map-filter-fab${open ? ' map-filter-fab--open' : ''}${isFiltered ? ' map-filter-fab--active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="マップの表示フィルター"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="map-filter-fab__icon" aria-hidden="true">
          ⚙
        </span>
        <span className="map-filter-fab__label">表示</span>
        {isFiltered && <span className="map-filter-fab__dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="map-filter-panel" role="dialog" aria-label="表示フィルター">
          {isFiltered && (
            <div className="map-filter-panel__reset-row">
              <button
                type="button"
                className="map-filter-reset"
                onClick={() => { onReset(); setOpen(false) }}
              >
                フィルターをリセット
              </button>
            </div>
          )}
          <div className="map-filter-panel__group">
            <div className="map-filter-panel__group-title">ピンの表示名</div>
            <div className="map-filter-segment" role="radiogroup" aria-label="ピンの表示名">
              <label className={`map-filter-segment__option${shopLabelMode === 'title' ? ' map-filter-segment__option--active' : ''}`}>
                <input type="radio" name="map-shop-label-mode" checked={shopLabelMode === 'title'} onChange={() => onSetShopLabelMode('title')} />
                企画名
              </label>
              <label className={`map-filter-segment__option${shopLabelMode === 'organization' ? ' map-filter-segment__option--active' : ''}`}>
                <input type="radio" name="map-shop-label-mode" checked={shopLabelMode === 'organization'} onChange={() => onSetShopLabelMode('organization')} />
                団体名
              </label>
            </div>
          </div>
          <div className="map-filter-panel__group">
            <div className="map-filter-panel__group-title">模擬店・会場</div>
            {SHOP_TAG_FILTER_ITEMS.map(({ key, label, color }) => (
              <label key={key} className="map-filter-row">
                <input
                  type="checkbox"
                  checked={shopTagFilters.has(key)}
                  onChange={() => onToggleShopTag(key)}
                />
                <span className="map-filter-swatch" style={{ backgroundColor: color }} />
                <span className="map-filter-row__label">{label}</span>
              </label>
            ))}
          </div>
          {visibleAmenities.length > 0 && (
            <div className="map-filter-panel__group">
              <div className="map-filter-panel__group-title">設備を探す（いずれか 1 つ）</div>
              <div className="map-filter-radio-group" role="radiogroup" aria-label="付帯設備の表示">
                <label className="map-filter-row map-filter-row--amenity-none">
                  <input
                    type="radio"
                    name="map-amenity-kind"
                    checked={selectedAmenityKind === null}
                    onChange={() => onSelectAmenityKind(null)}
                  />
                  <span className="map-filter-row__label">表示しない</span>
                </label>
                {visibleAmenities.map((kind) => (
                  <label
                    key={kind}
                    className={`map-filter-row map-filter-row--amenity-${kind}`}
                  >
                    <input
                      type="radio"
                      name="map-amenity-kind"
                      checked={selectedAmenityKind === kind}
                      onChange={() => onSelectAmenityKind(kind)}
                    />
                    <span className={`map-filter-swatch map-filter-swatch--amenity-${kind}`}>
                      {AMENITY_ICONS[kind]}
                    </span>
                    <span className="map-filter-row__label">{AMENITY_LABELS[kind]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MapFilterPanel
