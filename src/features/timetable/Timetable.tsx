'use client'

import './Timetable.css'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getEvents, type FestivalEvent } from '../../data/loaders'
import { eventThumbUrl } from '../../lib/assetUrl'
import EventDetailPopup from './EventDetailPopup'
import { useFavorites } from '@/lib/favorites'
import { trackEvent } from '@/lib/gtag'
import {
  formatEventDay,
  timetableEventDisplayLocation,
} from './timetableDisplay'

/** タイムテーブル行のイベント画像（横長・一覧よりコンパクトだが従来より少し大きめ） */
const TIMETABLE_EVENT_THUMB_W = 112
const TIMETABLE_EVENT_THUMB_H = 72

const weatherLabels: Record<'sunny' | 'rainy', string> = {
  sunny: '青天',
  rainy: '雨天',
}

const RED_LINE_START_MINUTES = 9 * 60
const RED_LINE_END_MINUTES = 18 * 60

type EventWithMinutes = FestivalEvent & { startMinutes: number | null; endMinutes: number | null }

function FavEventList({
  events,
  favEventIds,
  onToggleFav,
  onOpenDetail,
}: {
  events: EventWithMinutes[]
  favEventIds: Set<string>
  onToggleFav: (id: string) => void
  onOpenDetail: (e: FestivalEvent) => void
}) {
  const favEvents = events.filter((e) => favEventIds.has(e.id))
  if (favEvents.length === 0) {
    return <p className="timetable-empty">お気に入りはまだありません。<br />☆ ボタンで追加できます。</p>
  }
  return (
    <div className="timetable-group-list">
      <div className="timetable-list">
        {favEvents.map((event) => (
          <div key={event.id} className="timetable-item-wrap">
            <div className="timetable-item-row">
              <button
                type="button"
                className="timetable-item timetable-item--fav"
                aria-label={`${event.title}の詳細を表示`}
                onClick={() => onOpenDetail(event)}
              >
                <Image
                  src={eventThumbUrl(event.image)}
                  alt={event.title}
                  width={TIMETABLE_EVENT_THUMB_W}
                  height={TIMETABLE_EVENT_THUMB_H}
                  className="timetable-event-thumb"
                  unoptimized
                  loading="lazy"
                />
                <div className="timetable-item-text">
                  <div className="timetable-time">{formatEventDay(event.day)} {event.startTime}–{event.endTime}</div>
                  <div className="timetable-content">
                    <h3>{event.title}</h3>
                    <p className="timetable-venue">{event.location}{event.organization ? ` ・ ${event.organization}` : ''}</p>
                  </div>
                </div>
              </button>
              <button
                className="timetable-fav-btn timetable-fav-btn--active"
                onClick={(e) => { e.stopPropagation(); onToggleFav(event.id) }}
                aria-label="お気に入りから削除"
                aria-pressed
              >
                ★
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

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
  const events = useMemo(() => getEvents(), [])
  const appliedDayFromUrl = useRef(false)
  const scrollTargetHandledRef = useRef<string | null>(null)
  const prevEventParamRef = useRef<string | null>(null)
  const openedAutoDetailForEventParamRef = useRef<string | null>(null)
  const [currentMinutes, setCurrentMinutes] = useState<number>(() => nowInJstMinutes())
  const [selectedDay, setSelectedDay] = useState<string>(() =>
    getDefaultSelectedDay(getEvents().map((e) => e.day)),
  )
  const [selectedWeather, setSelectedWeather] = useState<'sunny' | 'rainy'>('sunny')
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const [detailEvent, setDetailEvent] = useState<FestivalEvent | null>(null)
  const [showFavs, setShowFavs] = useState(false)
  const { eventIds: favEventIds, toggleEvent: toggleFavEvent } = useFavorites()

  function handleToggleFav(id: string, title: string, isFav: boolean) {
    trackEvent('fav_toggle', { fav_type: 'event', fav_action: isFav ? 'remove' : 'add', item_id: id, item_title: title })
    toggleFavEvent(id)
  }

  function handleOpenDetail(ev: FestivalEvent) {
    trackEvent('event_detail_open', { event_id: String(ev.id), event_title: ev.title })
    setDetailEvent(ev)
  }

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

  /** 現在の日・天気で存在する場所の一覧（出現順を保持） */
  const areaList = useMemo(
    () => [...new Set(dayWeatherEvents.map((e) => timetableEventDisplayLocation(e, selectedWeather)))],
    [dayWeatherEvents, selectedWeather],
  )

  const ALL_AREAS = '__all__'

  /** 日・天気が変わったとき、選択場所が存在しなくなったら「全て」に戻す */
  useEffect(() => {
    if (areaList.length === 0) return
    if (selectedArea !== null && selectedArea !== ALL_AREAS && !areaList.includes(selectedArea)) {
      setSelectedArea(ALL_AREAS)
    }
  }, [areaList, selectedArea])

  const activeArea = selectedArea ?? ALL_AREAS

  const filteredEvents = useMemo(
    () =>
      activeArea === ALL_AREAS
        ? dayWeatherEvents
        : dayWeatherEvents.filter(
            (e) => timetableEventDisplayLocation(e, selectedWeather) === activeArea,
          ),
    [dayWeatherEvents, selectedWeather, activeArea],
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
    const id = raw
    if (scrollTargetHandledRef.current === id) return
    const el = document.getElementById(`timetable-event-${id}`)
    if (!el) return
    scrollTargetHandledRef.current = id
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
    return () => window.clearTimeout(t)
  }, [searchParams, selectedDay, filteredEvents])

  /** `/timetable?event=` から来たとき、そのイベントのエリアに自動切り替えしてから詳細を開く */
  useEffect(() => {
    const raw = searchParams.get('event')
    if (!raw) {
      openedAutoDetailForEventParamRef.current = null
      return
    }
    if (openedAutoDetailForEventParamRef.current === raw) return
    const id = raw
    const ev = events.find((e) => e.id === id)
    if (!ev) return
    if (ev.day !== selectedDay) return
    if (!eventMatchesWeather(ev, selectedWeather)) return
    if (activeArea !== ALL_AREAS) {
      const evArea = timetableEventDisplayLocation(ev, selectedWeather)
      if (evArea !== activeArea) {
        setSelectedArea(evArea)
        return
      }
    }
    openedAutoDetailForEventParamRef.current = raw
    const t = window.setTimeout(() => setDetailEvent(ev), 280)
    return () => window.clearTimeout(t)
  }, [searchParams, selectedDay, selectedWeather, events, activeArea])

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
              className={`timetable-filter-button ${!showFavs && selectedDay === day ? 'active' : ''}`}
              onClick={() => { setShowFavs(false); setSelectedDay(day) }}
            >
              {formatFestivalDayButtonLabel(day, index)}
            </button>
          ))}
          <button
            type="button"
            className={`timetable-filter-button ${showFavs ? 'active' : ''}`}
            onClick={() => setShowFavs((v) => !v)}
          >
            ★{favEventIds.size > 0 ? ` ${favEventIds.size}` : ''}
          </button>
        </div>
        {!showFavs && (
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
        )}
        {!showFavs && areaList.length > 0 && (
          <div className="timetable-filter-row">
            <button
              type="button"
              className={`timetable-filter-button ${activeArea === ALL_AREAS ? 'active' : ''}`}
              onClick={() => setSelectedArea(ALL_AREAS)}
            >
              全て
            </button>
            {areaList.map((area) => (
              <button
                key={area || '__default'}
                type="button"
                className={`timetable-filter-button ${activeArea === area ? 'active' : ''}`}
                onClick={() => setSelectedArea(area)}
              >
                {area.trim() !== '' ? area : '場所未定'}
              </button>
            ))}
          </div>
        )}
      </div>

      {showFavs ? (
        <FavEventList
          events={eventsWithMinutes}
          favEventIds={favEventIds}
          onToggleFav={(id) => {
            const ev = eventsWithMinutes.find((e) => e.id === id)
            if (ev) handleToggleFav(id, ev.title, favEventIds.has(id))
          }}
          onOpenDetail={handleOpenDetail}
        />
      ) : filteredEvents.length === 0 ? (
        <p className="timetable-empty">該当する企画はありません。</p>
      ) : (
        <div className="timetable-list">
          {(() => {
            const currentLineIndex = shouldShowNowLine
              ? getCurrentLineIndex(filteredEvents, currentMinutes)
              : null
            return (
              <>
                {filteredEvents.map((event, index) => {
                  const needsTicket = selectedWeather === 'rainy' && event.needTicketWhenRainy
                  const isFav = favEventIds.has(event.id)
                  const isNow = currentEventId === event.id
                  return (
                    <div key={event.id} className="timetable-item-wrap">
                      {currentLineIndex === index && (
                        <div className="timetable-now-line" aria-label={`現在時刻 ${currentTimeLabel}`}>
                          <span>{currentTimeLabel}</span>
                        </div>
                      )}
                      <div className="timetable-item-row">
                        <button
                          type="button"
                          id={`timetable-event-${event.id}`}
                          className={[
                            'timetable-item',
                            isNow ? 'now' : '',
                            needsTicket ? 'timetable-item--needs-ticket' : '',
                            isFav && !isNow ? 'timetable-item--fav' : '',
                          ].filter(Boolean).join(' ')}
                          aria-label={`${event.title}の詳細を表示`}
                          onClick={() => handleOpenDetail(event)}
                        >
                          <Image
                            src={eventThumbUrl(event.image)}
                            alt={event.title}
                            width={TIMETABLE_EVENT_THUMB_W}
                            height={TIMETABLE_EVENT_THUMB_H}
                            className="timetable-event-thumb"
                            unoptimized
                            loading="lazy"
                          />
                          <div className="timetable-item-text">
                            <div className="timetable-time">{event.startTime}–{event.endTime}</div>
                            <div className="timetable-content">
                              <h3>{event.title}</h3>
                              {isNow && <span className="now-badge">開催中 (NOW)</span>}
                              <p className="timetable-venue">
                                {timetableEventDisplayLocation(event, selectedWeather)}
                                {event.organization ? ` ・ ${event.organization}` : ''}
                                {needsTicket ? (
                                  <span className="timetable-need-ticket">（雨天は整理券が必要です）</span>
                                ) : null}
                              </p>
                            </div>
                          </div>
                        </button>
                        <button
                          className={`timetable-fav-btn${isFav ? ' timetable-fav-btn--active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleToggleFav(event.id, event.title, isFav) }}
                          aria-label={isFav ? 'お気に入りから削除' : 'お気に入りに追加'}
                          aria-pressed={isFav}
                        >
                          {isFav ? '★' : '☆'}
                        </button>
                      </div>
                    </div>
                  )
                })}
                {currentLineIndex === filteredEvents.length && (
                  <div className="timetable-now-line" aria-label={`現在時刻 ${currentTimeLabel}`}>
                    <span>{currentTimeLabel}</span>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
      {detailEvent ? (
        <EventDetailPopup
          event={detailEvent}
          selectedWeather={selectedWeather}
          showNowBadge={currentEventId === detailEvent.id}
          isFav={favEventIds.has(detailEvent.id)}
          onToggleFav={() => handleToggleFav(detailEvent.id, detailEvent.title, favEventIds.has(detailEvent.id))}
          onClose={() => setDetailEvent(null)}
        />
      ) : null}
    </div>
  )
}
