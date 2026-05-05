'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import type { MapAmenityKind, ShopCategory } from '../../data/loaders'

const SHOP_CATEGORY_LABELS: Record<ShopCategory, string> = {
  food: 'フード',
  stage: 'ステージ',
  experience: '体験・展示',
  facility: '施設',
}

const AMENITY_LABELS: Record<MapAmenityKind, string> = {
  smoking: '喫煙所',
  toilet: 'トイレ',
  aed: 'AED',
}

const AMENITY_ICONS: Record<MapAmenityKind, string> = {
  smoking: '🚬',
  toilet: '🚻',
  aed: '＋',
}

const SHOP_CATEGORY_ORDER: readonly ShopCategory[] = [
  'food',
  'stage',
  'experience',
  'facility',
]

const AMENITY_ORDER: readonly MapAmenityKind[] = ['smoking', 'toilet', 'aed']

interface MapFilterPanelProps {
  shopCategories: ReadonlySet<ShopCategory>
  /** 付帯設備: 1 種類のみ選択。`null` は何も表示しない */
  selectedAmenityKind: MapAmenityKind | null
  onToggleShopCategory: (category: ShopCategory) => void
  onSelectAmenityKind: (kind: MapAmenityKind | null) => void
  /** 利用可能な amenity 種類（generated データに 1 つも該当が無い場合は出さない） */
  availableAmenities: ReadonlySet<MapAmenityKind>
}

const MapFilterPanel: FC<MapFilterPanelProps> = ({
  shopCategories,
  selectedAmenityKind,
  onToggleShopCategory,
  onSelectAmenityKind,
  availableAmenities,
}) => {
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
        className={`map-filter-fab${open ? ' map-filter-fab--open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="マップの表示フィルター"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="map-filter-fab__icon" aria-hidden="true">
          ⚙
        </span>
        <span className="map-filter-fab__label">表示</span>
      </button>
      {open && (
        <div className="map-filter-panel" role="dialog" aria-label="表示フィルター">
          <div className="map-filter-panel__group">
            <div className="map-filter-panel__group-title">模擬店カテゴリ</div>
            {SHOP_CATEGORY_ORDER.map((cat) => (
              <label
                key={cat}
                className={`map-filter-row map-filter-row--shop-${cat}`}
              >
                <input
                  type="checkbox"
                  checked={shopCategories.has(cat)}
                  onChange={() => onToggleShopCategory(cat)}
                />
                <span className={`map-filter-swatch map-filter-swatch--shop-${cat}`} />
                <span className="map-filter-row__label">{SHOP_CATEGORY_LABELS[cat]}</span>
              </label>
            ))}
          </div>
          {visibleAmenities.length > 0 && (
            <div className="map-filter-panel__group">
              <div className="map-filter-panel__group-title">付帯設備（いずれか 1 つ）</div>
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
