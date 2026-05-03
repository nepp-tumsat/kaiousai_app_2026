import { z } from 'zod'

const latLngTuple = z.tuple([z.number(), z.number()])

/** 屋内フロア平面図（Leaflet ImageOverlay 用） */
export const indoorFloorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** `public/images/` からの相対パス（例: `map/indoor-floor-dummy-1.svg`） */
  image: z.string().regex(/^map\/[a-z0-9/_-]+\.(svg|png|webp|jpg|jpeg)$/i),
  /** [[南西 lat,lng], [北東 lat,lng]]（Leaflet の bounds と同じ順） */
  bounds: z.tuple([latLngTuple, latLngTuple]),
})

export const indoorMapAreaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  floors: z.array(indoorFloorSchema).min(1),
})

/** `areas` が空のときは屋内 UI は `map-areas.json` の `mapCatalog`（maps シート）のみを使う */
export const indoorMapsPayloadSchema = z.object({
  areas: z.array(indoorMapAreaSchema).default([]),
})

export type IndoorFloor = z.infer<typeof indoorFloorSchema>
export type IndoorMapArea = z.infer<typeof indoorMapAreaSchema>
export type IndoorMapsPayload = z.infer<typeof indoorMapsPayloadSchema>
