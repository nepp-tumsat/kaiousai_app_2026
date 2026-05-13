import type { FestivalEvent } from '../../data/loaders'

/** ステージ企画タイムテーブル: 雨天時は会場を講堂に統一（マスタの location_rainy は参照しない） */
export const RAINY_STAGE_VENUE_LABEL = '講堂'

/** ISO日付（YYYY-MM-DD）を「M/D」形式にフォーマット */
export function formatEventDay(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  if (!month || !day) return isoDate
  return `${Number(month)}/${Number(day)}`
}

export function timetableEventDisplayArea(
  event: FestivalEvent,
  selectedWeather: 'sunny' | 'rainy',
): string {
  if (selectedWeather === 'rainy' && event.areaRainy.trim() !== '') {
    return event.areaRainy
  }
  return event.area
}

export function timetableEventDisplayLocation(
  event: FestivalEvent,
  selectedWeather: 'sunny' | 'rainy',
): string {
  if (selectedWeather === 'rainy') return RAINY_STAGE_VENUE_LABEL
  return event.location
}
