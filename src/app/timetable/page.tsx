'use client'

import TimetableFeature from '@/features/timetable/Timetable'
import { Suspense } from 'react'

export default function TimetablePage() {
  return (
    <Suspense fallback={<div style={{ padding: '1rem' }}>読み込み中…</div>}>
      <TimetableFeature />
    </Suspense>
  )
}

