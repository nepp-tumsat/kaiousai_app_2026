'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { GA_MEASUREMENT_ID } from '@/lib/gtag'

export default function GAPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || typeof window === 'undefined' || !window.gtag) return
    const query = searchParams.toString()
    const url = pathname + (query ? `?${query}` : '')
    window.gtag('config', GA_MEASUREMENT_ID, { page_path: url })
  }, [pathname, searchParams])

  return null
}
