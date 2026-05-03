'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const MapFeature = dynamic(() => import('@/features/map/Map'), {
  ssr: false,
})

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="map-container" style={{ padding: '1rem' }}>
          読み込み中…
        </div>
      }
    >
      <MapFeature />
    </Suspense>
  )
}

