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

export default nextConfig

