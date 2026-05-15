import { z } from 'zod'

export const shopCategorySchema = z.enum(['food', 'stage', 'facility', 'experience'])

/** マスター locations の `id`（例 `mogi_01`, `00`）。URL クエリにも使うため ASCII のみ */
export const shopStableIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/, {
    message: 'shop id must be ASCII letters, digits, underscore, hyphen (master locations.id)',
  })

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
  isFood: z.boolean().default(false),
  isDrink: z.boolean().default(false),
  isExhibition: z.boolean().default(false),
  isActivity: z.boolean().default(false),
})

export const shopSourceSchema = shopFieldsSchema

export const shopSourceListSchema = z.array(shopSourceSchema)

export type ShopSource = z.infer<typeof shopSourceSchema>

export const shopSchema = shopFieldsSchema.extend({
  id: shopStableIdSchema,
})

export const shopListSchema = z.array(shopSchema)

export type Shop = z.infer<typeof shopSchema>
export type ShopCategory = z.infer<typeof shopCategorySchema>

export function buildShopsFromSources(
  sources: z.infer<typeof shopSourceListSchema>,
): z.infer<typeof shopListSchema> {
  const seen = new Set<string>()
  const out: z.infer<typeof shopListSchema> = []
  for (const shop of sources) {
    const rawId = shop.sourceLocationId?.trim()
    if (!rawId) {
      throw new Error(
        '店舗に sourceLocationId（マスター locations の id）が無い行があります。Excel / CSV の id 列を確認してください。',
      )
    }
    if (seen.has(rawId)) {
      throw new Error(`重複した店舗 id（sourceLocationId）: ${rawId}`)
    }
    seen.add(rawId)
    out.push(shopSchema.parse({ ...shop, id: rawId }))
  }
  return out
}
