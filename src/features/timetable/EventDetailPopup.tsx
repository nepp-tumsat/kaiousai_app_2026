'use client'

import './EventDetailPopup.css'
import Image from 'next/image'
import { useEffect, useState, type FC } from 'react'
import type { FestivalEvent } from '../../data/loaders'
import { assetUrl } from '../../lib/assetUrl'
import {
  timetableEventDisplayArea,
  timetableEventDisplayLocation,
} from './timetableDisplay'

export interface EventDetailPopupProps {
  event: FestivalEvent
  selectedWeather: 'sunny' | 'rainy'
  /** 一覧と同じく「開催中」を出すか */
  showNowBadge: boolean
  onClose: () => void
}

function formatEventDay(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  if (!month || !day) return isoDate
  return `${Number(month)}/${Number(day)}`
}

const EventDetailPopup: FC<EventDetailPopupProps> = ({
  event,
  selectedWeather,
  showNowBadge,
  onClose,
}) => {
  const imageSrc = assetUrl(`/images/${event.image}`)
  const fallbackSrc = assetUrl('/images/events/placeholder.png')
  const [currentSrc, setCurrentSrc] = useState(imageSrc)
  const area = timetableEventDisplayArea(event, selectedWeather)
  const location = timetableEventDisplayLocation(event, selectedWeather)

  useEffect(() => {
    setCurrentSrc(imageSrc)
  }, [imageSrc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="event-detail-popup-overlay" onClick={onClose}>
      <div
        className="event-detail-popup-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-popup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="event-detail-popup-header">
          <button type="button" className="event-detail-popup-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <Image
          src={currentSrc}
          alt={event.title}
          width={1200}
          height={800}
          className="event-detail-popup-image"
          unoptimized
          onError={() => {
            setCurrentSrc((prev) => (prev === fallbackSrc ? prev : fallbackSrc))
          }}
        />
        <div className="event-detail-popup-info">
          <p className="event-detail-popup-schedule">
            {formatEventDay(event.day)} {event.startTime}–{event.endTime}
          </p>
          <h2 id="event-detail-popup-title">{event.title}</h2>
          {showNowBadge ? <span className="event-detail-popup-now-badge">開催中 (NOW)</span> : null}
          <p className="event-detail-popup-meta">
            {[area, location].filter((s) => s.trim() !== '').join(' ・ ')}
            {event.organization ? ` ・ ${event.organization}` : ''}
          </p>
          {selectedWeather === 'rainy' && event.needTicketWhenRainy ? (
            <p className="event-detail-popup-ticket">雨天は整理券が必要です</p>
          ) : null}
          {event.description.trim() !== '' ? (
            <p className="event-detail-popup-description">{event.description}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default EventDetailPopup
