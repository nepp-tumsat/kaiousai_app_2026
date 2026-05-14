import withPWA from '@ducanh2912/next-pwa'

/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

const nextConfig = {
  reactStrictMode: false,
  output: 'export',
  // スマホ実機テスト時のクロスオリジン警告抑制（同一LAN内のみ）
  allowedDevOrigins: ['192.168.0.*', '192.168.1.*', '10.0.0.*'],
  trailingSlash: true,
  /** API の pin-adjustments で XLSX を Node の fs 付きで読み込む（バンドルすると writeFile が壊れる） */
  serverExternalPackages: ['xlsx'],
  images: {
    unoptimized: true,
  },
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath,
      }
    : {}),
}

export default withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /\/images\/(shops-thumb|events-thumb|icons)\/.+\.webp$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'thumbs',
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        urlPattern: /\/images\/(shops|events)\/.+/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images',
          expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
      },
    ],
  },
})(nextConfig)
