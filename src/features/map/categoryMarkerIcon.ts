import L from 'leaflet'
import type { Shop, ShopCategory } from '../../data/loaders'
import { isStakeholderShopId } from '../../data/stakeholderShops'

/** 店舗・屋内ショップ共通のカテゴリマーカーアイコンを生成する */
export function buildCategoryMarkerIcon(
  shop: Shop,
  getCategoryColor: (category: ShopCategory) => string,
  isFav = false,
): L.DivIcon {
  const isStakeholder = isStakeholderShopId(shop.sourceLocationId)
  const size = isFav ? 30 : 22
  const anchor = size / 2
  return L.divIcon({
    className: [
      'category-marker-icon',
      isStakeholder ? 'category-marker-icon--stakeholder' : '',
      isFav ? 'category-marker-icon--fav' : '',
    ].filter(Boolean).join(' '),
    html: `<div class="category-marker-dot${
      shop.category === 'facility' ? ' category-marker-dot--facility' : ''
    }${
      isStakeholder ? ' category-marker-dot--stakeholder' : ''
    }" style="background-color:${getCategoryColor(shop.category)}">${
      isFav ? '<span class="category-marker-star">★</span>' : ''
    }</div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
  })
}
