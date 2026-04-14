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
        <Link href="/about" className="app-footer-link">
          お知らせ
        </Link>
      </nav>
      <p className="app-footer-copyright">
        © 2026 東京海洋大学 海王祭実行委員会 / 東京海洋大学プログラミングサークルNePP
      </p>
    </footer>
  )
}
