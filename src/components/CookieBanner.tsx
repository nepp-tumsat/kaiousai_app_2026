'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'cookie_notice_dismissed'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'var(--text)',
      color: 'var(--bg)',
      padding: '0.75rem 1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      zIndex: 999,
      fontSize: '0.8rem',
      flexWrap: 'wrap',
    }}>
      <span>
        このサイトはGoogle Analytics（GA4）を使用して匿名の利用状況を収集しています。
        詳細は
        <Link href="/privacy" style={{ color: 'var(--surface)', marginLeft: '0.25rem' }}>
          プライバシーポリシー
        </Link>
        をご覧ください。
      </span>
      <button
        onClick={dismiss}
        style={{
          padding: '0.35rem 0.9rem',
          borderRadius: '6px',
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--bg)',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontSize: '0.8rem',
        }}
      >
        OK
      </button>
    </div>
  )
}
