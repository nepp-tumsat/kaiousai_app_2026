import Link from 'next/link'

export default function PrivacyFeature() {
  return (
    <article style={{ padding: '1.5rem 1rem', maxWidth: 640, margin: '0 auto', lineHeight: 1.8 }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: 'var(--primary)' }}>
        プライバシーポリシー
      </h2>

      <Section title="1. 運営者">
        <p>東京海洋大学プログラミングサークルNePP</p>
        <p>本サービスは海王祭実行委員会との連携のもと、海王祭の運営支援を目的として提供しています。</p>
      </Section>

      <Section title="2. 収集する情報">
        <p>本サービスでは、以下の情報を収集します。</p>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>来場者属性（来場者タイプ・志望分野・来場きっかけ）の匿名回答</li>
          <li>ページ閲覧履歴・滞在時間・ボタン操作などの行動情報</li>
          <li>デバイス種別・ブラウザ情報・IPアドレス（匿名化済み）</li>
        </ul>
      </Section>

      <Section title="3. 利用目的">
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>来場者傾向の分析および海王祭の運営改善</li>
          <li>来年度以降の運営改善・企画立案のための参考データ収集</li>
        </ul>
        <p>収集したデータは個人を特定する目的では使用しません。</p>
      </Section>

      <Section title="4. Google Analytics（GA4）の利用">
        <p>
          本サービスはGoogle LLC が提供するGoogle Analytics 4（GA4）を使用しています。
          GA4はCookieを使用してデータを収集しますが、IPアドレスは匿名化されており
          個人を特定することはできません。収集されたデータはGoogle のサーバーに最大2年間保持されます。
        </p>
        <p>
          Googleによるデータ利用については
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--primary)' }}
          >
            Googleプライバシーポリシー
          </a>
          をご覧ください。
        </p>
        <p>
          Google Analyticsによるデータ収集を無効にしたい場合は、
          <a
            href="https://tools.google.com/dlpage/gaoptout"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--primary)' }}
          >
            Google Analytics オプトアウトアドオン
          </a>
          をご利用ください。
        </p>
      </Section>

      <Section title="5. 第三者提供">
        <p>
          収集したデータは、法令に基づく場合を除き、第三者に提供・販売することはありません。
          ただし、海王祭実行委員会に対して運営改善を目的として集計・匿名化されたデータを提供することがあります。
        </p>
      </Section>

      <Section title="6. お問い合わせ">
        <p>プライバシーに関するお問い合わせは東京海洋大学プログラミングサークルNePP(nepp.kaiyodai@gmail.com)までご連絡ください。</p>
      </Section>

      <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        制定：2026年5月13日
      </p>

      <p style={{ marginTop: '1rem' }}>
        <Link href="/" style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>
          ← トップに戻る
        </Link>
      </p>
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text)' }}>
        {title}
      </h3>
      <div style={{ fontSize: '0.9rem', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {children}
      </div>
    </section>
  )
}
