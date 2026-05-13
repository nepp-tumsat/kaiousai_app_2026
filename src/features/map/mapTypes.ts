import type L from 'leaflet'
import type { MapAmenityKind, MapCatalogEntry, ShopCategory } from '../../data/loaders'

export type LatLngTuple = [number, number]

export type PinKind = 'shop' | 'eventLocation' | 'area' | 'indoorShop'

export type DevPinMove = {
  key: string
  kind: PinKind
  id: string | number
  csvId: string
  label: string
  coordinates: LatLngTuple
  /** 屋内マップ調整時の正規化座標（マスター `x_position` / `y_position` 用） */
  indoorNorm?: { x: number; y: number }
}

/** 店舗ピンの吹き出しに表示するテキストの種類 */
export type ShopLabelMode = 'title' | 'organization'

export type MarkerRefMap = Record<string, L.Marker | null>

export type MapFiltersState = {
  shopCategories: ReadonlySet<ShopCategory>
  /** 付帯設備: 1 種類のみ。`null` のとき付帯設備ピンは出さない */
  selectedAmenityKind: MapAmenityKind | null
}

export type DevPinSaveState = 'idle' | 'saving' | 'saved' | 'error'

export type IndoorPlanGroup = {
  relatedAreaId: string
  floors: MapCatalogEntry[]
}
