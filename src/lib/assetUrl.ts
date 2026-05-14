/**
 * GitHub Pages のサブパス配信時も public アセットを正しく参照する。
 * ローカルでは NEXT_PUBLIC_BASE_PATH 未設定のため先頭スラッシュのみ。
 */
export function assetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalized}`
}

/**
 * 模擬店サムネイル用 URL（`public/images/shops-thumb/` の WebP）。
 * `shop.image` が `shops/<basename>.<ext>` の前提。それ以外（外部 URL や `events/` 等）はそのまま `assetUrl` で返す。
 * `npm run ingest` が `scripts/lib/generateThumbnails.ts` 経由で生成する。
 */
export function shopThumbUrl(image: string): string {
  if (image.startsWith('shops/')) {
    const basename = image.slice('shops/'.length).replace(/\.(png|jpe?g|webp)$/i, '.webp')
    return assetUrl(`/images/shops-thumb/${basename}`)
  }
  return assetUrl(`/images/${image}`)
}

/**
 * イベントサムネイル用 URL（`public/images/events-thumb/` の WebP）。
 * `event.image` が `events/<basename>.<ext>` の前提。
 * `npm run ingest` が `scripts/lib/generateThumbnails.ts` 経由で生成する。
 */
export function eventThumbUrl(image: string): string {
  if (image.startsWith('events/')) {
    const basename = image.slice('events/'.length).replace(/\.(png|jpe?g|webp)$/i, '.webp')
    return assetUrl(`/images/events-thumb/${basename}`)
  }
  return assetUrl(`/images/${image}`)
}
