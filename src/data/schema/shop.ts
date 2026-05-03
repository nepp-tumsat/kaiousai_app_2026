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
  /** `image` は `public/images/` からの相対パス。模擬店写真は `shops/` 配下に置く。 */
  image: z.string().regex(/^shops\/[a-z0-9/_-]+\.(jpg|jpeg|png|webp)$/i, {
    message:
      'image must be a safe path under public/images/shops/ (e.g. shops/yakisoba.jpg)',
  }),
  category: shopCategorySchema,
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
