'use client'

import { useEffect, useRef, useState } from 'react'
import { useMapEvents } from 'react-leaflet'
import type { DevPinMove, DevPinSaveState } from './mapTypes'

export function DevMapRightClickCoords() {
  const [hint, setHint] = useState<{
    latText: string
    lngText: string
    csvLine: string
  } | null>(null)
  const dismissTimerRef = useRef<number | undefined>(undefined)

  useMapEvents({
    contextmenu(e) {
      if (process.env.NODE_ENV !== 'development') return
      e.originalEvent.preventDefault()
      const { lat, lng } = e.latlng
      const latText = lat.toFixed(7)
      const lngText = lng.toFixed(7)
      const csvLine = `${latText},${lngText}`
      if (dismissTimerRef.current !== undefined) {
        window.clearTimeout(dismissTimerRef.current)
      }
      setHint({ latText, lngText, csvLine })
      dismissTimerRef.current = window.setTimeout(() => {
        setHint(null)
        dismissTimerRef.current = undefined
      }, 15000)
    },
  })

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== undefined) {
        window.clearTimeout(dismissTimerRef.current)
      }
    }
  }, [])

  if (process.env.NODE_ENV !== 'development') return null
  if (!hint) return null

  return (
    <div className="map-dev-coords-hint" role="status">
      <div className="map-dev-coords-hint__title">右クリック座標（DEV）</div>
      <div className="map-dev-coords-hint__row">
        <span className="map-dev-coords-hint__label">lat</span>
        <code>{hint.latText}</code>
      </div>
      <div className="map-dev-coords-hint__row">
        <span className="map-dev-coords-hint__label">lng</span>
        <code>{hint.lngText}</code>
      </div>
      <div className="map-dev-coords-hint__actions">
        <button
          type="button"
          className="map-dev-coords-hint__copy"
          onClick={() => {
            void navigator.clipboard?.writeText(hint.csvLine)
          }}
        >
          コピー
        </button>
        <button
          type="button"
          className="map-dev-coords-hint__close"
          onClick={() => {
            if (dismissTimerRef.current !== undefined) {
              window.clearTimeout(dismissTimerRef.current)
              dismissTimerRef.current = undefined
            }
            setHint(null)
          }}
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export function DevPinAdjustPanel({
  latestMove,
  saveState,
  saveMessage,
  onClear,
}: {
  latestMove: DevPinMove | null
  saveState: DevPinSaveState
  saveMessage: string
  onClear: () => void
}) {
  if (process.env.NODE_ENV !== 'development' || latestMove === null) return null

  const [lat, lng] = latestMove.coordinates
  const latText = lat.toFixed(7)
  const lngText = lng.toFixed(7)
  const csvLine =
    latestMove.kind === 'indoorShop' && latestMove.indoorNorm
      ? `indoorShop,${latestMove.csvId},${latestMove.indoorNorm.x.toFixed(6)},${latestMove.indoorNorm.y.toFixed(6)}`
      : `${latestMove.kind},${latestMove.id},${latText},${lngText}`

  return (
    <div className="map-dev-pin-adjust-panel" role="status">
      <div className="map-dev-pin-adjust-panel__title">ピン調整（DEV）</div>
      <div className="map-dev-pin-adjust-panel__meta">
        <code>{latestMove.kind}</code>
        <code>{latestMove.id}</code>
      </div>
      <div className="map-dev-pin-adjust-panel__label">{latestMove.label}</div>
      {latestMove.kind === 'indoorShop' && latestMove.indoorNorm ? (
        <>
          <div className="map-dev-pin-adjust-panel__row">
            <span>x（正規化）</span>
            <code>{latestMove.indoorNorm.x.toFixed(6)}</code>
          </div>
          <div className="map-dev-pin-adjust-panel__row">
            <span>y（正規化）</span>
            <code>{latestMove.indoorNorm.y.toFixed(6)}</code>
          </div>
        </>
      ) : (
        <>
          <div className="map-dev-pin-adjust-panel__row">
            <span>lat</span>
            <code>{latText}</code>
          </div>
          <div className="map-dev-pin-adjust-panel__row">
            <span>lng</span>
            <code>{lngText}</code>
          </div>
        </>
      )}
      <div className="map-dev-pin-adjust-panel__actions">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(csvLine)
          }}
        >
          CSV行コピー
        </button>
        <button type="button" onClick={onClear} aria-label="閉じる">
          ×
        </button>
      </div>
      <div className={`map-dev-pin-adjust-panel__status map-dev-pin-adjust-panel__status--${saveState}`}>
        {saveMessage}
      </div>
    </div>
  )
}
