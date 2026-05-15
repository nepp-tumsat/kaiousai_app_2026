'use client'

import '../../styles/popup.css'
import '../../features/timetable/EventDetailPopup.css'
import './ShopDetailPopup.css'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, type FC } from 'react'
import type { Shop } from '../../data/loaders'
import { assetUrl, shopThumbUrl } from '../../lib/assetUrl'
import LinkifiedText from '../../components/LinkifiedText'

export interface ShopDetailPopupProps {
  shop: Shop
  onClose: () => void
  isFav?: boolean
  onToggleFav?: () => void
}

const ShopDetailPopup: FC<ShopDetailPopupProps> = ({ shop, onClose, isFav = false, onToggleFav }) => {
  const imageSrc = shopThumbUrl(shop.image)
  const fallbackSrc = assetUrl('/images/shops/placeholder.png')
  const [currentSrc, setCurrentSrc] = useState(imageSrc)

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

  const meta = [
    shop.location,
    shop.organization,
  ].filter(Boolean).join(' ・ ')

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div
        className="popup-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-detail-popup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="popup-header">
          {onToggleFav && (
            <button
              type="button"
              className={`popup-fav${isFav ? ' popup-fav--active' : ''}`}
              onClick={onToggleFav}
              aria-label={isFav ? 'お気に入りから削除' : 'お気に入りに追加'}
              aria-pressed={isFav}
            >
              {isFav ? '★' : '☆'}
            </button>
          )}
          <button type="button" className="popup-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <Image
          src={currentSrc}
          alt={shop.title}
          width={1200}
          height={800}
          className="popup-image"
          unoptimized
          onError={() => setCurrentSrc((prev) => (prev === fallbackSrc ? prev : fallbackSrc))}
        />
        <div className="popup-info event-detail-popup-info">
          <h2 id="shop-detail-popup-title">{shop.title}</h2>
          {meta ? <p className="event-detail-popup-meta">{meta}</p> : null}
          {shop.description.trim() !== '' ? (
            <p className="event-detail-popup-description"><LinkifiedText text={shop.description} /></p>
          ) : null}
          <Link
            href={`/map?shop=${encodeURIComponent(shop.id)}`}
            className="shop-detail-popup-map-link"
            onClick={onClose}
          >
            📍 マップで場所を見る
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ShopDetailPopup
