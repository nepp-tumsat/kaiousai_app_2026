import { z } from 'zod'

export const shopCategorySchema = z.enum(['food', 'stage', 'facility', 'experience'])

const shopFieldsSchema = z.object({
  sourceLocationId: z.string().optional(),
  organization: z.string().default(''),
  title: z.string(),
  description: z.string(),
  area: z.string().default(''),
  location: z.string(),
  coordinates: z.tuple([z.number(), z.number()]),
  /**
   * `image` は `public/images/` からの相対パス。模擬店写真は `shops/` 配下に置く。
   * 日本語や半角括弧・スペース等の Unicode を含むファイル名も許可する（パストラバーサル `/` `\` は禁止）。
   */
  image: z.string().regex(/^shops\/[^/\\]+\.(jpg|jpeg|png|webp)$/i, {
    message:
      'image must be a safe path under public/images/shops/ (e.g. shops/yakisoba.jpg)',
  }),
  category: shopCategorySchema,
  /**
   * 屋外キャンパスマップにピンを出すか。屋内フロア用マスタ（Excel `map` が campus 以外）では false。
   * 欠落時は true（旧 JSON / CSV 互換）。
   */
  showOnCampusMap: z.boolean().default(true),
  /** `maps` シートのフロア id（例 `1-1`）。屋内ピン用。屋外のみの店は空 */
  indoorPlanMapId: z.string().default(''),
  /**
   * 屋内平面図上の位置。画像左上原点。`0〜1` は正規化座標、いずれかが `1` 超ならピクセルとして img サイズで割る。
   */
  indoorX: z.number().optional(),
  indoorY: z.number().optional(),
})

export const shopSourceSchema = shopFieldsSchema

export const shopSourceListSchema = z.array(shopSourceSchema)

export type ShopSource = z.infer<typeof shopSourceSchema>

export const shopSchema = shopFieldsSchema.extend({
  id: z.number().int().positive(),
})

export const shopListSchema = z.array(shopSchema)

export type Shop = z.infer<typeof shopSchema>
export type ShopCategory = z.infer<typeof shopCategorySchema>

export function buildShopsFromSources(
  sources: z.infer<typeof shopSourceListSchema>,
): z.infer<typeof shopListSchema> {
  return sources.map((shop, index) =>
    shopSchema.parse({ ...shop, id: index + 1 }),
  )
}
