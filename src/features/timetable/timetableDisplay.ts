import type { FestivalEvent } from '../../data/loaders'

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
  if (selectedWeather === 'rainy' && event.locationRainy.trim() !== '') {
    return event.locationRainy
  }
  return event.location
}
