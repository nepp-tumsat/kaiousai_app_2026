'use client'

import './Events.css'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { getEvents, getShops, type FestivalEvent, type Shop, type ShopCategory } from '../../data/loaders'
import { assetUrl, shopThumbUrl } from '../../lib/assetUrl'

/** ステージ企画カードのサムネイル（正方形） */
const EVENT_CARD_THUMB_PX = 96
/** 模擬店カードは WebP サムネのまま従来サイズ */
const SHOP_CARD_THUMB_PX = 72

const shopCategoryLabels: Record<ShopCategory, string> = {
  food: '飲食・模擬店',
  stage: 'ステージ',
  facility: '施設・案内',
  experience: '体験',
}

function normalizeForSearch(s: string): string {
  return s.trim().toLowerCase()
}

function eventSearchText(e: FestivalEvent): string {
  return [
    e.title,
    e.organization,
    e.description,
    e.location,
    e.locationRainy,
    e.area,
    e.areaRainy,
  ]
    .join(' ')
    .toLowerCase()
}

function shopSearchText(s: Shop): string {
  return [s.title, s.organization, s.description, s.location, s.area, shopCategoryLabels[s.category]]
    .join(' ')
    .toLowerCase()
}

function formatEventDay(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  if (!month || !day) return isoDate
  return `${Number(month)}/${Number(day)}`
}

export default function EventsFeature() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'events' | 'shops'>('events')

  const events = useMemo(() => getEvents(), [])
  const shops = useMemo(() => getShops(), [])

  const q = normalizeForSearch(query)

  const filteredEvents = useMemo(() => {
    if (!q) return events
    return events.filter((e) => eventSearchText(e).includes(q))
  }, [events, q])

  const filteredShops = useMemo(() => {
    if (!q) return shops
    return shops.filter((s) => shopSearchText(s).includes(q))
  }, [shops, q])

  const list =
    tab === 'events' ? (
      filteredEvents.length === 0 ? (
        <p className="events-empty">
          {q ? 'キーワードに一致する企画が見つかりませんでした。' : '公開中のステージ企画がありません。'}
        </p>
      ) : (
        <div className="events-list">
          {filteredEvents.map((event) => (
            <Link
              key={event.id}
              href={`/timetable?day=${encodeURIComponent(event.day)}&event=${event.id}`}
              className="events-card"
            >
              <div className="events-card-row">
                <Image
                  src={assetUrl(`/images/${event.image}`)}
                  alt={event.title}
                  width={EVENT_CARD_THUMB_PX}
                  height={EVENT_CARD_THUMB_PX}
                  className="events-event-thumb"
                  unoptimized
                  loading="lazy"
                />
                <div className="events-card-body">
                  <p className="events-card-title">{event.title}</p>
                  <p className="events-card-meta">
                    {formatEventDay(event.day)} {event.startTime}–{event.endTime}
                    {event.location ? ` ・ ${event.location}` : ''}
                    {event.organization ? ` ・ ${event.organization}` : ''}
                  </p>
                  {event.description ? (
                    <p className="events-card-desc">{event.description}</p>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )
    ) : filteredShops.length === 0 ? (
      <p className="events-empty">
        {q ? 'キーワードに一致する場所が見つかりませんでした。' : 'データがありません。'}
      </p>
    ) : (
      <div className="events-list">
        {filteredShops.map((shop) => (
          <Link key={shop.id} href={`/map?shop=${shop.id}`} className="events-card">
            <div className="events-card-row">
              <Image
                src={shopThumbUrl(shop.image)}
                alt={shop.title}
                width={SHOP_CARD_THUMB_PX}
                height={SHOP_CARD_THUMB_PX}
                className="events-shop-thumb"
                unoptimized
                loading="lazy"
              />
              <div className="events-card-body">
                <p className="events-card-title">{shop.title}</p>
                <p className="events-card-meta">
                  {shopCategoryLabels[shop.category]}
                  {shop.location ? ` ・ ${shop.location}` : ''}
                  {shop.organization ? ` ・ ${shop.organization}` : ''}
                </p>
                {shop.description ? (
                  <p className="events-card-desc">{shop.description}</p>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    )

  return (
    <section className="events-container">
      <h2>企画を探す</h2>
      <p className="events-intro">
        ステージの企画名・模擬店・会場名などで検索できます。結果からタイムテーブルやマップへ移動できます。
      </p>
      <label htmlFor="events-search-input" className="visually-hidden">
        キーワード検索
      </label>
      <input
        id="events-search-input"
        type="search"
        className="events-search"
        placeholder="企画名・場所・団体名などで検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <div className="events-tabs" role="tablist" aria-label="検索の対象">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'events'}
          className={`events-tab ${tab === 'events' ? 'active' : ''}`}
          onClick={() => setTab('events')}
        >
          ステージ・時間割（{events.length}）
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shops'}
          className={`events-tab ${tab === 'shops' ? 'active' : ''}`}
          onClick={() => setTab('shops')}
        >
          模擬店・会場（{shops.length}）
        </button>
      </div>
      <p className="events-hint" aria-live="polite">
        {tab === 'events'
          ? `表示: ${filteredEvents.length} 件`
          : `表示: ${filteredShops.length} 件`}
      </p>
      {list}
      <p className="events-footer-links">
        <Link href="/timetable" className="app-footer-link">
          タイムテーブルへ
        </Link>
        {' ・ '}
        <Link href="/map" className="app-footer-link">
          マップへ
        </Link>
      </p>
    </section>
  )
}
