import Link from 'next/link'

export default function AboutFeature() {
  return (
    <section className="home-menu">
      <h2 className="home-menu-title">お知らせ</h2>
      <p className="home-menu-notice">
        現在、お知らせはありません。最新情報はこのページで案内します。
      </p>
      <Link href="/" className="home-menu-item home-menu-item--inline">
        <span className="home-menu-label">トップへ</span>
      </Link>
    </section>
  )
}
