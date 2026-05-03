import { z } from 'zod'
import { shopCategorySchema, type ShopCategory } from '../data/schema/shop'

/**
 * 地点に付くカテゴリタグ（マーカー色など既存の shop カテゴリと揃える）。
 * 将来「exhibit」などを足す場合は `shopCategorySchema` を拡張する。
 */
export type LocationCategory = ShopCategory

export const locationCategorySchema = shopCategorySchema

// --- 1. エリア

export type AppArea = {
  id: string
  name: string
  lat?: number
  lng?: number
  building: boolean
}

// --- 2. イベント（`day` は持たない。`start_time` から導出）

export const appEventApiSchema = z.object({
  id: z.string(),
  /** 結合後もトレース用に保持してよい */
  location_id: z.string(),
  title: z.string(),
  organization: z.string().optional(),
  department: z.string().optional(),
  description: z.string().optional(),
  /** 省略時は true（青天タブ） */
  when_sunny: z.boolean().default(true),
  /** 省略時は true（雨天タブ） */
  when_rainy: z.boolean().default(true),
  /** 日付＋時刻想定（ISO）。日付タブは `deriveEventDayJst` で Asia/Tokyo の暦日を取る */
  start_time: z.string(),
  end_time: z.string(),
  /** 画像はパス想定（プレフィックス等は後で調整） */
  img_name: z.string().optional(),
})

export type AppEvent = z.infer<typeof appEventApiSchema>

/** API / スプシ取り込み時に天候フラグのデフォルトを適用 */
export function parseAppEvent(raw: unknown): AppEvent {
  return appEventApiSchema.parse(raw)
}

// --- 3. ロケーション

export const appLocationApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  area_id: z.string().optional(),
  coordinates: z.tuple([z.number(), z.number()]),
  indoor_position: z.object({ x: z.number(), y: z.number() }).optional(),
  organization: z.string().optional(),
  department: z.string().optional(),
  description: z.string().optional(),
  img_name: z.string().optional(),
  is_event_location: z.boolean(),
  categories: z.array(locationCategorySchema),
})

export type AppLocation = z.infer<typeof appLocationApiSchema>

export function parseAppLocation(raw: unknown): AppLocation {
  return appLocationApiSchema.parse(raw)
}

// --- 4. 結合型（UI が受け取る形）

export type JoinedLocation = AppLocation & {
  areaInfo?: AppArea
  /** `location.id` に紐づく企画（呼び出し側で時間順ソート推奨） */
  events: AppEvent[]
}

// --- 表示用（3: イベント優先）

export function resolveOrganization(event: AppEvent, location: AppLocation): string | undefined {
  const v = event.organization ?? location.organization
  return v !== undefined && v.trim() !== '' ? v : undefined
}

export function resolveDepartment(event: AppEvent, location: AppLocation): string | undefined {
  const v = event.department ?? location.department
  return v !== undefined && v.trim() !== '' ? v : undefined
}

/** `start_time` を JST の暦日 `YYYY-MM-DD` に正規化。パース不能なら null */
export function deriveEventDayJst(isoDateTime: string): string | null {
  const d = new Date(isoDateTime)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
