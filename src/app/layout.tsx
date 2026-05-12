import type { ReactNode } from 'react'
import type { Viewport } from 'next'
import '@/styles/globals.css'
import '@/styles/App.css'
import 'leaflet/dist/leaflet.css'
import AppFooter from '@/components/AppFooter'
import Link from 'next/link'

export const metadata = {
  title: '海王祭Webアプリ',
  description: '東京海洋大学 海王祭のインタラクティブマップとタイムテーブル',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.ico' },
}

/** モバイル地図のピンチ／タッチとノッチ周りの挙動を安定させる */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className="app">
          <Link href="/" className="app-header-link">
            <header className="app-header">
              <h1>海王祭</h1>
            </header>
          </Link>
          <main className="app-main">{children}</main>
          <AppFooter />
        </div>
      </body>
    </html>
  )
}

