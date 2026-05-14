import { useCallback, useEffect, useState } from 'react'
import { getShops } from '../data/loaders'

const KEY = 'favorites'

type Favs = { shops: string[]; events: string[] }

function load(): Favs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { shops: [], events: [] }
    const d = JSON.parse(raw) as Partial<{ shops: unknown; events: unknown }>
    const validShopIds = new Set(getShops().map((s) => s.id))
    const shops: string[] = []
    if (Array.isArray(d.shops)) {
      for (const x of d.shops) {
        if (typeof x === 'string' && validShopIds.has(x)) shops.push(x)
      }
    }
    const events: string[] = []
    if (Array.isArray(d.events)) {
      for (const x of d.events) {
        if (typeof x === 'string') events.push(x)
        // 旧形式（number）を string に変換して引き継ぐ
        else if (typeof x === 'number' && Number.isFinite(x)) events.push(String(x))
      }
    }
    return { shops, events }
  } catch {
    return { shops: [], events: [] }
  }
}

function save(d: Favs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {}
}

export function useFavorites() {
  const [shopIds, setShopIds] = useState<Set<string>>(new Set())
  const [eventIds, setEventIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const d = load()
    setShopIds(new Set(d.shops))
    setEventIds(new Set(d.events))
  }, [])

  const toggleShop = useCallback((id: string) => {
    setShopIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      save({ ...load(), shops: [...next] })
      return next
    })
  }, [])

  const toggleEvent = useCallback((id: string) => {
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
