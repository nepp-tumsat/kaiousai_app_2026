import { z } from 'zod'

/** 開催日（カレンダー日）。例: 2026-05-16 */
export const eventDaySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'day must be YYYY-MM-DD')

export const eventWeatherModeSourceSchema = z.union([
  z.literal(''),
  z.enum(['sunny', 'rainy']),
])

const festivalEventFieldsSchema = z.object({
  day: eventDaySchema,
  weatherMode: eventWeatherModeSourceSchema,
  startTime: z.string(),
  endTime: z.string(),
  title: z.string(),
  /** 青天（または会場が1つだけのとき）のエリアラベル */
  area: z.string(),
  /** 雨天のエリア。空のときは `area` */
  areaRainy: z.string().default(''),
  /** 会場名（通常は晴天会場） */
  location: z.string(),
  /** 雨天会場。空のときは `location` */
  locationRainy: z.string().default(''),
  /** 雨天時に整理券等が必要なとき true（CSV: need_ticket_when_rainy） */
  needTicketWhenRainy: z.boolean().default(false),
  description: z.string(),
  organization: z.string().default(''),
  /** false のとき一覧・タイムテーブルに出さない（データには残す） */
  published: z.boolean().default(true),
  /** `public/images/` からの相対パス（例: events/foo.jpg） */
  image: z.string().regex(/^events\/[a-z0-9/_-]+\.(jpg|jpeg|png|webp)$/i, {
    message: 'image must be under public/images/events/ (e.g. events/opening.jpg)',
  }),
})

export const festivalEventSourceSchema = festivalEventFieldsSchema

export const festivalEventSourceListSchema = z.array(festivalEventSourceSchema)

export type FestivalEventSource = z.infer<typeof festivalEventSourceSchema>

export const festivalEventSchema = festivalEventFieldsSchema.extend({
  id: z.number().int().positive(),
})

export const festivalEventListSchema = z.array(festivalEventSchema)

export type FestivalEvent = z.infer<typeof festivalEventSchema>

export function buildFestivalEventsFromSources(
  sources: z.infer<typeof festivalEventSourceListSchema>,
): z.infer<typeof festivalEventListSchema> {
  return sources.map((event, index) =>
    festivalEventSchema.parse({ ...event, id: index + 1 }),
  )
}
