import { useCallback, useEffect, useState } from 'react'

const KEY = 'favorites'

type Favs = { shops: number[]; events: number[] }

function load(): Favs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { shops: [], events: [] }
    const d = JSON.parse(raw) as Partial<Favs>
    return {
      shops: Array.isArray(d.shops) ? d.shops.filter(Number.isFinite) : [],
      events: Array.isArray(d.events) ? d.events.filter(Number.isFinite) : [],
    }
  } catch {
    return { shops: [], events: [] }
  }
}

function save(d: Favs) {
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch {}
}

export function useFavorites() {
  const [shopIds, setShopIds] = useState<Set<number>>(new Set())
  const [eventIds, setEventIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    const d = load()
    setShopIds(new Set(d.shops))
    setEventIds(new Set(d.events))
  }, [])

  const toggleShop = useCallback((id: number) => {
    setShopIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      save({ ...load(), shops: [...next] })
      return next
    })
  }, [])

  const toggleEvent = useCallback((id: number) => {
    setEventIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      save({ ...load(), events: [...next] })
      return next
    })
  }, [])

  return { shopIds, eventIds, toggleShop, toggleEvent }
}
