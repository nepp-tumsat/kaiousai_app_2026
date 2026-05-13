'use client'

import Link from 'next/link'

export default function AppFooter() {
  return (
    <footer className="app-footer">
      <nav className="app-footer-nav">
        <Link href="/map" className="app-footer-link">
          マップ
        </Link>
        <Link href="/timetable" className="app-footer-link">
          タイムテーブル
        </Link>
        <Link href="/events" className="app-footer-link">
          企画を探す
        </Link>
      </nav>
      <p style={{ textAlign: 'center', marginTop: '0.3rem' }}>
        <Link href="/privacy" className="app-footer-link" style={{ fontSize: '0.75rem' }}>
          プライバシーポリシー
        </Link>
      </p>
      <p className="app-footer-copyright">
        © 2026 海王祭実行委員会 / 東京海洋大学プログラミングサークルNePP
      </p>
    </footer>
  )
}
