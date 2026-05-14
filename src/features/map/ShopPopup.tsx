'use client'

import '../../styles/popup.css'
import './ShopPopup.css'
import { useEffect, useState, type FC } from 'react'
import Image from 'next/image'
import type { Shop } from '../../data/loaders'
import { assetUrl } from '../../lib/assetUrl'
import LinkifiedText from '../../components/LinkifiedText'

interface ShopPopupProps {
  shop: Shop
  onClose: () => void
  isFav: boolean
  onToggleFav: () => void
}

const ShopPopup: FC<ShopPopupProps> = ({ shop, onClose, isFav, onToggleFav }) => {
  const imageSrc = assetUrl(`/images/${shop.image}`)
  const fallbackSrc = assetUrl('/images/shops/placeholder.png')
  const [currentSrc, setCurrentSrc] = useState(imageSrc)
  const organizationLabel = shop.organization.trim() !== '' ? shop.organization : '未設定'
  const venueLine = [shop.area, shop.location].filter((s) => s.trim() !== '').join(' ・ ')
  const showVenueLine =
    venueLine.trim() !== '' && venueLine.trim() !== shop.title.trim()

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
    <div className="popup-overlay" onClick={onClose}>
      <div
        className="popup-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-popup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="popup-header">
          <button
            className={`popup-fav${isFav ? ' popup-fav--active' : ''}`}
            onClick={onToggleFav}
            aria-label={isFav ? 'お気に入りから削除' : 'お気に入りに追加'}
            aria-pressed={isFav}
          >
            {isFav ? '★' : '☆'}
          </button>
          <button className="popup-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <Image
          src={currentSrc}
          alt={shop.title}
          width={1200}
          height={800}
          className="popup-image"
          onError={() => {
            setCurrentSrc((prev) => (prev === fallbackSrc ? prev : fallbackSrc))
          }}
        />
        <div className="popup-info shop-popup-info">
          <h2 id="shop-popup-title">{shop.title}</h2>
          {showVenueLine && <p className="shop-popup-venue">{venueLine}</p>}
          <p className="shop-popup-organization">{organizationLabel}</p>
          <p className="shop-popup-description"><LinkifiedText text={shop.description} /></p>
        </div>
      </div>
    </div>
  )
}

export default ShopPopup
