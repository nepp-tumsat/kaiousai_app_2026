'use client'

import './Events.css'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { getEvents, getShops, type FestivalEvent, type Shop, type ShopCategory } from '../../data/loaders'
import { eventThumbUrl, shopThumbUrl } from '../../lib/assetUrl'
import { formatEventDay } from '../timetable/timetableDisplay'
import { useFavorites } from '@/lib/favorites'
import { trackEvent } from '@/lib/gtag'

const EVENT_CARD_THUMB_PX = 96
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
  return [e.title, e.organization, e.description, e.location, e.locationRainy, e.area, e.areaRainy]
    .join(' ')
    .toLowerCase()
}

function shopSearchText(s: Shop): string {
  return [s.title, s.organization, s.description, s.location, s.area, shopCategoryLabels[s.category]]
    .join(' ')
    .toLowerCase()
}

function FavBtn({ active, onToggle }: { active: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <button
      className={`events-fav-btn${active ? ' events-fav-btn--active' : ''}`}
      onClick={onToggle}
      aria-label={active ? 'お気に入りから削除' : 'お気に入りに追加'}
      aria-pressed={active}
    >
      {active ? '★' : '☆'}
    </button>
  )
}

function EventsResultList({
  events,
  q,
  favEventIds,
  onToggleEvent,
}: {
  events: FestivalEvent[]
  q: string
  favEventIds: Set<string>
  onToggleEvent: (id: string) => void
}) {
  if (events.length === 0) {
    return (
      <p className="events-empty">
        {q ? 'キーワードに一致する企画が見つかりませんでした。' : '公開中のステージ企画がありません。'}
      </p>
    )
  }
  return (
    <div className="events-list">
      {events.map((event) => (
        <div key={event.id} className="events-card-wrap">
          <Link
            href={`/timetable?day=${encodeURIComponent(event.day)}&event=${event.id}`}
            className={`events-card${favEventIds.has(event.id) ? ' events-card--fav' : ''}`}
          >
            <div className="events-card-row">
              <Image
                src={eventThumbUrl(event.image)}
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
                {event.description ? <p className="events-card-desc">{event.description}</p> : null}
              </div>
            </div>
          </Link>
          <FavBtn
            active={favEventIds.has(event.id)}
            onToggle={(e) => {
              e.preventDefault()
              trackEvent('fav_toggle', { fav_type: 'event', fav_action: favEventIds.has(event.id) ? 'remove' : 'add', item_id: String(event.id), item_title: event.title })
              onToggleEvent(event.id)
            }}
          />
        </div>
      ))}
    </div>
  )
}

function ShopsResultList({
  shops,
  q,
  favShopIds,
  onToggleShop,
}: {
  shops: Shop[]
  q: string
  favShopIds: Set<string>
  onToggleShop: (id: string) => void
}) {
  if (shops.length === 0) {
    return (
      <p className="events-empty">
        {q ? 'キーワードに一致する場所が見つかりませんでした。' : 'データがありません。'}
      </p>
    )
  }
  return (
    <div className="events-list">
      {shops.map((shop) => (
        <div key={shop.id} className="events-card-wrap">
          <Link
            href={`/map?shop=${encodeURIComponent(shop.id)}`}
            className={`events-card${favShopIds.has(shop.id) ? ' events-card--fav' : ''}`}
          >
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
                {shop.description ? <p className="events-card-desc">{shop.description}</p> : null}
              </div>
            </div>
          </Link>
          <FavBtn
            active={favShopIds.has(shop.id)}
            onToggle={(e) => {
              e.preventDefault()
              trackEvent('fav_toggle', { fav_type: 'shop', fav_action: favShopIds.has(shop.id) ? 'remove' : 'add', item_id: shop.id, item_title: shop.title })
              onToggleShop(shop.id)
            }}
          />
        </div>
      ))}
    </div>
  )
}

export default function EventsFeature() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'events' | 'shops' | 'favs'>('events')
  const { shopIds: favShopIds, eventIds: favEventIds, toggleShop, toggleEvent } = useFavorites()

  const events = useMemo(() => getEvents(), [])
  const shops = useMemo(() => getShops(), [])

  const q = normalizeForSearch(query)

  const filteredEvents = useMemo(
    () => (!q ? events : events.filter((e) => eventSearchText(e).includes(q))),
    [events, q],
  )

  const filteredShops = useMemo(
    () => (!q ? shops : shops.filter((s) => shopSearchText(s).includes(q))),
    [shops, q],
  )

  const favEvents = useMemo(
    () => events.filter((e) => favEventIds.has(e.id) && (!q || eventSearchText(e).includes(q))),
    [events, favEventIds, q],
  )

  const favShops = useMemo(
    () => shops.filter((s) => favShopIds.has(s.id) && (!q || shopSearchText(s).includes(q))),
    [shops, favShopIds, q],
  )

  const favTotal = favShopIds.size + favEventIds.size

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
          onClick={() => { trackEvent('events_tab_switch', { tab: 'events' }); setTab('events') }}
        >
          ステージ企画
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shops'}
          className={`events-tab ${tab === 'shops' ? 'active' : ''}`}
          onClick={() => { trackEvent('events_tab_switch', { tab: 'shops' }); setTab('shops') }}
        >
          模擬店・会場
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'favs'}
          className={`events-tab ${tab === 'favs' ? 'active' : ''}`}
          aria-label={`お気に入り${favTotal > 0 ? ` (${favTotal}件)` : ''}`}
          onClick={() => { trackEvent('events_tab_switch', { tab: 'favs' }); setTab('favs') }}
        >
          ★{favTotal > 0 ? ` ${favTotal}` : ''}
        </button>
      </div>

      {tab !== 'favs' && (
        <p className="events-hint" aria-live="polite">
          {tab === 'events' ? `表示: ${filteredEvents.length} 件` : `表示: ${filteredShops.length} 件`}
        </p>
      )}

      {tab === 'events' && (
        <EventsResultList events={filteredEvents} q={q} favEventIds={favEventIds} onToggleEvent={toggleEvent} />
      )}
      {tab === 'shops' && (
        <ShopsResultList shops={filteredShops} q={q} favShopIds={favShopIds} onToggleShop={toggleShop} />
      )}
      {tab === 'favs' && (
        <div>
          {favTotal === 0 ? (
            <p className="events-empty">お気に入りはまだありません。<br />☆ ボタンで追加できます。</p>
          ) : (
            <>
              {favShops.length > 0 && (
                <>
                  <p className="events-fav-section-label">模擬店・会場</p>
                  <ShopsResultList shops={favShops} q={q} favShopIds={favShopIds} onToggleShop={toggleShop} />
                </>
              )}
              {favEvents.length > 0 && (
                <>
                  <p className="events-fav-section-label">ステージ企画</p>
                  <EventsResultList events={favEvents} q={q} favEventIds={favEventIds} onToggleEvent={toggleEvent} />
                </>
              )}
            </>
          )}
        </div>
      )}

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
