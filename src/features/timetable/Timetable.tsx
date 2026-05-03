'use client'

import './Timetable.css'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getEvents, type FestivalEvent } from '../../data/loaders'
import { assetUrl } from '../../lib/assetUrl'

const weatherLabels: Record<'sunny' | 'rainy', string> = {
  sunny: '青天',
  rainy: '雨天',
}

const RED_LINE_START_MINUTES = 9 * 60
const RED_LINE_END_MINUTES = 18 * 60

function parseTimeToMinutes(time: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour * 60 + minute
}

function nowInJstMinutes(): number {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

function todayInJstIsoDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** 今日が開催日ならその日、それ以外は開催日の先頭 */
function getDefaultSelectedDay(festivalDays: string[]): string {
  const sorted = [...new Set(festivalDays)].sort()
  if (sorted.length === 0) return ''
  const today = todayInJstIsoDate()
  if (sorted.includes(today)) return today
  return sorted[0]
}

function formatFestivalDayButtonLabel(isoDate: string, index: number): string {
  const [, month, day] = isoDate.split('-')
  return `${index + 1}日目 (${month}/${day})`
}

function formatMinutesAsTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const hour = Math.floor(normalized / 60)
  const minute = normalized % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function eventMatchesWeather(event: FestivalEvent, selectedWeather: 'sunny' | 'rainy'): boolean {
  return event.weatherMode === '' || event.weatherMode === selectedWeather
}

function eventDisplayArea(
  event: FestivalEvent,
  selectedWeather: 'sunny' | 'rainy',
): string {
  if (selectedWeather === 'rainy' && event.areaRainy.trim() !== '') {
    return event.areaRainy
  }
  return event.area
}

function eventDisplayLocation(
  event: FestivalEvent,
  selectedWeather: 'sunny' | 'rainy',
): string {
  if (selectedWeather === 'rainy' && event.locationRainy.trim() !== '') {
    return event.locationRainy
  }
  return event.location
}

function resolveEndMinutes(
  event: { startMinutes: number; endMinutes: number | null },
  nextStartMinutes: number | undefined,
): number {
  if (event.endMinutes !== null) return event.endMinutes
  if (nextStartMinutes !== undefined) return nextStartMinutes
  return event.startMinutes + 60
}

function getCurrentLineIndex(
  locationEvents: Array<{
    startMinutes: number | null
    endMinutes: number | null
  }>,
  currentMinutes: number,
): number | null {
  const timedEvents = locationEvents.filter(
    (event): event is { startMinutes: number; endMinutes: number | null } =>
      event.startMinutes !== null,
  )
  if (timedEvents.length === 0) return null

  const firstStart = timedEvents[0].startMinutes
  if (currentMinutes < firstStart) return 0

  for (let i = 0; i < timedEvents.length; i += 1) {
    const start = timedEvents[i].startMinutes
    const nextStart = timedEvents[i + 1]?.startMinutes
    const end = resolveEndMinutes(
      { startMinutes: start, endMinutes: timedEvents[i].endMinutes },
      nextStart,
    )
    if (currentMinutes >= start && currentMinutes < end) {
      return i + 1
    }
  }

  return timedEvents.length
}

export default function TimetableFeature() {
  const searchParams = useSearchParams()
  const events: FestivalEvent[] = getEvents()
  const appliedDayFromUrl = useRef(false)
  const scrollTargetHandledRef = useRef<number | null>(null)
  const prevEventParamRef = useRef<string | null>(null)
  const [currentMinutes, setCurrentMinutes] = useState<number>(() => nowInJstMinutes())
  const [selectedDay, setSelectedDay] = useState<string>(() =>
    getDefaultSelectedDay(getEvents().map((e) => e.day)),
  )
  const [selectedWeather, setSelectedWeather] = useState<'sunny' | 'rainy'>('sunny')
  const [selectedArea, setSelectedArea] = useState<string>('all')

  const festivalDayList = useMemo(
    () => [...new Set(events.map((e) => e.day))].sort(),
    [events],
  )

  useEffect(() => {
    if (festivalDayList.length > 0 && !festivalDayList.includes(selectedDay)) {
      setSelectedDay(getDefaultSelectedDay(festivalDayList))
    }
  }, [festivalDayList, selectedDay])

  useEffect(() => {
    if (appliedDayFromUrl.current) return
    const dayParam = searchParams.get('day')
    if (dayParam && festivalDayList.includes(dayParam)) {
      setSelectedDay(dayParam)
    }
    appliedDayFromUrl.current = true
  }, [searchParams, festivalDayList])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentMinutes(nowInJstMinutes())
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  const eventsWithMinutes = useMemo(
    () =>
      events
        .map((event) => ({
          ...event,
          startMinutes: parseTimeToMinutes(event.startTime),
          endMinutes: parseTimeToMinutes(event.endTime),
        }))
        .sort((a, b) => {
          const aMinutes = a.startMinutes ?? Number.MAX_SAFE_INTEGER
          const bMinutes = b.startMinutes ?? Number.MAX_SAFE_INTEGER
          return aMinutes - bMinutes
        }),
    [events],
  )

  const dayWeatherEvents = useMemo(
    () =>
      eventsWithMinutes.filter(
        (event) => event.day === selectedDay && eventMatchesWeather(event, selectedWeather),
      ),
    [eventsWithMinutes, selectedDay, selectedWeather],
  )

  const areas = useMemo(
    () =>
      Array.from(
        new Set(dayWeatherEvents.map((e) => eventDisplayArea(e, selectedWeather))),
      ),
    [dayWeatherEvents, selectedWeather],
  )

  useEffect(() => {
    if (selectedArea !== 'all' && !areas.includes(selectedArea)) {
      setSelectedArea('all')
    }
  }, [areas, selectedArea])

  const filteredEvents = useMemo(
    () =>
      selectedArea === 'all'
        ? dayWeatherEvents
        : dayWeatherEvents.filter(
            (e) => eventDisplayArea(e, selectedWeather) === selectedArea,
          ),
    [dayWeatherEvents, selectedArea, selectedWeather],
  )

  const currentEventId = useMemo(() => {
    for (let i = 0; i < filteredEvents.length; i += 1) {
      const event = filteredEvents[i]
      if (event.startMinutes === null) continue
      const next = filteredEvents[i + 1]
      const end = resolveEndMinutes(
        { startMinutes: event.startMinutes, endMinutes: event.endMinutes },
        next?.startMinutes ?? undefined,
      )
      if (currentMinutes >= event.startMinutes && currentMinutes < end) {
        return event.id
      }
    }
    return null
  }, [currentMinutes, filteredEvents])

  const groupedByArea = useMemo(() => {
    const grouped = new Map<string, typeof filteredEvents>()
    filteredEvents.forEach((event) => {
      const a = eventDisplayArea(event, selectedWeather)
      const list = grouped.get(a) ?? []
      list.push(event)
      grouped.set(a, list)
    })
    return grouped
  }, [filteredEvents, selectedWeather])

  const currentTimeLabel = useMemo(
    () => formatMinutesAsTime(currentMinutes),
    [currentMinutes],
  )
  const shouldShowNowLine =
    currentMinutes >= RED_LINE_START_MINUTES &&
    currentMinutes <= RED_LINE_END_MINUTES

  useEffect(() => {
    const raw = searchParams.get('event')
    if (raw !== prevEventParamRef.current) {
      prevEventParamRef.current = raw
      scrollTargetHandledRef.current = null
    }
    if (!raw) return
    const id = Number.parseInt(raw, 10)
    if (!Number.isFinite(id)) return
    if (scrollTargetHandledRef.current === id) return
    const el = document.getElementById(`timetable-event-${id}`)
    if (!el) return
    scrollTargetHandledRef.current = id
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
    return () => window.clearTimeout(t)
  }, [searchParams, selectedDay, filteredEvents])

  return (
    <div className="timetable-container">
      <h2>タイムテーブル</h2>
      <p className="timetable-current-time">現在時刻: {currentTimeLabel}</p>
      <div className="timetable-controls">
        <div className="timetable-filter-row">
          {festivalDayList.map((day, index) => (
            <button
              key={day}
              type="button"
              className={`timetable-filter-button ${selectedDay === day ? 'active' : ''}`}
              onClick={() => setSelectedDay(day)}
            >
              {formatFestivalDayButtonLabel(day, index)}
            </button>
          ))}
        </div>
        <div className="timetable-filter-row">
          {(['sunny', 'rainy'] as const).map((weather) => (
            <button
              key={weather}
              type="button"
              className={`timetable-filter-button ${selectedWeather === weather ? 'active' : ''}`}
              onClick={() => setSelectedWeather(weather)}
            >
              {weatherLabels[weather]}
            </button>
          ))}
        </div>
        <div className="timetable-filter-row timetable-location-row">
          <button
            type="button"
            className={`timetable-filter-button ${selectedArea === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedArea('all')}
          >
            すべてのエリア
          </button>
          {areas.map((area) => (
            <button
              key={area}
              type="button"
              className={`timetable-filter-button ${selectedArea === area ? 'active' : ''}`}
              onClick={() => setSelectedArea(area)}
            >
              {area}
            </button>
          ))}
        </div>
      </div>

      {groupedByArea.size === 0 ? (
        <p className="timetable-empty">該当する企画はありません。</p>
      ) : (
        <div className="timetable-group-list">
          {Array.from(groupedByArea.entries()).map(([area, locationEvents]) => (
            <section key={area} className="timetable-location-group">
              <h3 className="timetable-location-title">{area}</h3>
              <div className="timetable-list">
                {(() => {
                  const currentLineIndex = shouldShowNowLine
                    ? getCurrentLineIndex(locationEvents, currentMinutes)
                    : null
                  return (
                    <>
                      {locationEvents.map((event, index) => (
                        <div key={event.id}>
                          {currentLineIndex === index && (
                            <div className="timetable-now-line" aria-label={`現在時刻 ${currentTimeLabel}`}>
                              <span>{currentTimeLabel}</span>
                            </div>
                          )}
                          <div
                            id={`timetable-event-${event.id}`}
                            className={`timetable-item ${currentEventId === event.id ? 'now' : ''}`}
                          >
                            <Image
                              src={assetUrl(`/images/${event.image}`)}
                              alt={event.title}
                              width={88}
                              height={56}
                              className="timetable-event-thumb"
                              unoptimized
                            />
                            <div className="timetable-item-text">
                              <div className="timetable-time">
                                {event.startTime}–{event.endTime}
                              </div>
                              <div className="timetable-content">
                                <h3>{event.title}</h3>
                                {currentEventId === event.id && <span className="now-badge">開催中 (NOW)</span>}
                                <p className="timetable-venue">
                                  {eventDisplayLocation(event, selectedWeather)}
                                  {event.organization ? ` ・ ${event.organization}` : ''}
                                  {selectedWeather === 'rainy' && event.needTicketWhenRainy ? (
                                    <span className="timetable-need-ticket">（雨天は整理券が必要です）</span>
                                  ) : null}
                                </p>
                                <p>{event.description}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {currentLineIndex === locationEvents.length && (
                        <div className="timetable-now-line" aria-label={`現在時刻 ${currentTimeLabel}`}>
                          <span>{currentTimeLabel}</span>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
