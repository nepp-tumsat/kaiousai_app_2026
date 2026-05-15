import L from 'leaflet'
import type { Shop } from '../../data/loaders'
import { isStakeholderShopId } from '../../data/stakeholderShops'

export const SHOP_TAG_COLORS = {
  food:       '#ff7043',
  drink:      '#ff7043',
  activity:   '#66bb6a',
  exhibition: '#ab47bc',
  facility:   '#78909c',
} as const

/** タグに基づくピン色（施設はグレー、複数タグは food > drink > activity > exhibition の優先順） */
export function getShopTagColor(shop: Shop): string {
  if (shop.category === 'facility') return SHOP_TAG_COLORS.facility
  if (shop.isFood)       return SHOP_TAG_COLORS.food
  if (shop.isDrink)      return SHOP_TAG_COLORS.drink
  if (shop.isActivity)   return SHOP_TAG_COLORS.activity
  if (shop.isExhibition) return SHOP_TAG_COLORS.exhibition
  return SHOP_TAG_COLORS.facility
}

export function shopPopupTagClass(shop: Shop): string {
  if (shop.category === 'facility') return 'map-popup--tag-facility'
  if (shop.isFood || shop.isDrink)  return 'map-popup--tag-food'
  if (shop.isActivity)              return 'map-popup--tag-activity'
  if (shop.isExhibition)            return 'map-popup--tag-exhibition'
  return 'map-popup--tag-facility'
}

export function buildCategoryMarkerIcon(shop: Shop, isFav = false): L.DivIcon {
  const isStakeholder = isStakeholderShopId(shop.sourceLocationId)
  const color = getShopTagColor(shop)
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
    }" style="background-color:${color}">${
      isFav ? '<span class="category-marker-star">★</span>' : ''
    }</div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
  })
}
