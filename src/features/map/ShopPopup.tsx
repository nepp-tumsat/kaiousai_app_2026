'use client'

import './ShopPopup.css'
import { useEffect, useState, type FC } from 'react'
import Image from 'next/image'
import type { Shop } from '../../data/loaders'
import { assetUrl } from '../../lib/assetUrl'

interface ShopPopupProps {
  shop: Shop
  onClose: () => void
}

const ShopPopup: FC<ShopPopupProps> = ({ shop, onClose }) => {
  const imageSrc = assetUrl(`/images/${shop.image}`)
  const fallbackSrc = assetUrl('/images/shops/placeholder.png')
  const [currentSrc, setCurrentSrc] = useState(imageSrc)
  const organizationLabel = shop.organization.trim() !== '' ? shop.organization : '未設定'
  const venueLine = [shop.area, shop.location].filter((s) => s.trim() !== '').join(' ・ ')
  /** CSV 由来では display_title 空のとき title と location が同じ name になりがち */
  const showVenueLine =
    venueLine.trim() !== '' && venueLine.trim() !== shop.title.trim()

  useEffect(() => {
    setCurrentSrc(imageSrc)
  }, [imageSrc])

  return (
    <div className="shop-popup-overlay" onClick={onClose}>
      <div className="shop-popup-content" onClick={(e) => e.stopPropagation()}>
        <button className="shop-popup-close" onClick={onClose}>
          ×
        </button>
        <Image
          src={currentSrc}
          alt={shop.title}
          width={1200}
          height={800}
          className="shop-popup-image"
          onError={() => {
            setCurrentSrc((prev) => (prev === fallbackSrc ? prev : fallbackSrc))
          }}
        />
        <div className="shop-popup-info">
          <h2>{shop.title}</h2>
          {showVenueLine && <p className="shop-popup-venue">{venueLine}</p>}
          <p className="shop-popup-organization">{organizationLabel}</p>
          <p className="shop-popup-description">{shop.description}</p>
        </div>
      </div>
    </div>
  )
}

export default ShopPopup

