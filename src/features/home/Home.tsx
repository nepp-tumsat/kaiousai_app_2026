import Link from 'next/link'

const ENQUETE_URL = 'https://forms.gle/placeholder'

export default function HomeFeature() {
  return (
    <section className="home-menu">
      <h2 className="home-menu-title">メニュー</h2>
      <div className="home-menu-grid">
        <Link href="/map" className="home-menu-item">
          <span className="home-menu-label">マップ</span>
        </Link>
        <Link href="/timetable" className="home-menu-item">
          <span className="home-menu-label">タイムテーブル</span>
        </Link>
        <Link href="/events" className="home-menu-item">
          <span className="home-menu-label">企画を探す</span>
        </Link>
        <a
          href={ENQUETE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="home-menu-item"
        >
          <span className="home-menu-label">アンケート</span>
        </a>
      </div>
    </section>
  )
}
