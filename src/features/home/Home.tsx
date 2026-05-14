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
        <span className="home-menu-item home-menu-item--disabled">
          <span className="home-menu-label">アンケート</span>
        </span>
      </div>
      <p className="home-menu-notice" style={{ marginTop: '1rem', fontSize: '0.78rem', textAlign: 'center' }}>
        <Link href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>
          プライバシーポリシー
        </Link>
      </p>
      <p style={{ marginTop: '0.75rem', fontSize: '0.78rem', textAlign: 'center', color: 'var(--text-muted)', lineHeight: '1.6' }}>
        現在、店舗・イベント情報のデータを整備中です。<br />
        情報が不完全な場合がございますが、当日までに順次更新してまいります。<br />
        ご不便をおかけして申し訳ございません。
      </p>
    </section>
  )
}
