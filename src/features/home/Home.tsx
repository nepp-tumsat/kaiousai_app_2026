import Link from 'next/link'

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
          href="https://docs.google.com/forms/d/e/1FAIpQLSef7-7FPlBjWyuRUmU3ikTwNC4_9KxF-viLx7D9aRvriM6Xdg/viewform?usp=dialog"
          target="_blank"
          rel="noopener noreferrer"
          className="home-menu-item"
        >
          <span className="home-menu-label">アンケート</span>
        </a>
      </div>
      <p className="home-menu-notice" style={{ marginTop: '1rem', fontSize: '0.78rem', textAlign: 'center' }}>
        <Link href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>
          プライバシーポリシー
        </Link>
      </p>
    </section>
  )
}
