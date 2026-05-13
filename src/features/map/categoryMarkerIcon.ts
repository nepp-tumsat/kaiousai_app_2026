import L from 'leaflet'
import type { Shop, ShopCategory } from '../../data/loaders'
import { isStakeholderShopId } from '../../data/stakeholderShops'

/** 店舗・屋内ショップ共通のカテゴリマーカーアイコンを生成する */
export function buildCategoryMarkerIcon(
  shop: Shop,
  getCategoryColor: (category: ShopCategory) => string,
): L.DivIcon {
  const isStakeholder = isStakeholderShopId(shop.sourceLocationId)
  return L.divIcon({
    className: `category-marker-icon${isStakeholder ? ' category-marker-icon--stakeholder' : ''}`,
    html: `<div class="category-marker-dot${
      shop.category === 'facility' ? ' category-marker-dot--facility' : ''
    }${
      isStakeholder ? ' category-marker-dot--stakeholder' : ''
    }" style="background-color:${getCategoryColor(shop.category)}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}
