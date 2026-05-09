/**
 * 画像ディレクトリの WebP 変換 / サムネ生成。
 *
 * - `maxEdge` を指定すると最大辺をそれにフィットさせる（Events 一覧用サムネ等）。
 *   未指定なら原寸のまま WebP に変換（マップ画像の軽量化等）。
 * - `sourceDir === outDir` のとき: 元 `.png` 等の隣に `.webp` を作る。
 *   元画像の削除や、出力 dir のオーファン除去（`pruneOrphans`）は行わない。
 * - 元画像の mtime が出力より新しいものだけ再生成する。
 *
 * 出力は同名ベース＋ `.webp`。例: `shops/29-海洋会.png` → `shops-thumb/29-海洋会.webp`。
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { extname, join, parse } from 'node:path'
import sharp from 'sharp'

const SOURCE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export type ThumbnailGenOptions = {
  /** 入力ディレクトリ（絶対パス） */
  sourceDir: string
  /** 出力ディレクトリ（絶対パス）。`sourceDir` と同じでも良い（同じ dir に `.webp` を作る運用） */
  outDir: string
  /** 長辺の最大ピクセル。未指定ならリサイズせず WebP 変換のみ。 */
  maxEdge?: number
  /** WebP quality（既定 80） */
  quality?: number
  /**
   * 出力 dir 内の WebP のうち、対応する元画像が無いものを削除するか（既定 true）。
   * `sourceDir === outDir` のときは無視（誤って元画像系列を消さないため）。
   */
  pruneOrphans?: boolean
  /** 詳細ログを出すか */
  verbose?: boolean
}

/** 1 ディレクトリ分のサムネイル / WebP 生成 */
export async function generateThumbnails(opts: ThumbnailGenOptions): Promise<{
  generated: number
  skipped: number
  removed: number
}> {
  const {
    sourceDir,
    outDir,
    maxEdge,
    quality = 80,
    pruneOrphans = true,
    verbose = false,
  } = opts

  if (!existsSync(sourceDir)) {
    return { generated: 0, skipped: 0, removed: 0 }
  }
  mkdirSync(outDir, { recursive: true })

  const isInPlace = sourceDir === outDir
  const sourceFiles = readdirSync(sourceDir).filter((f) =>
    SOURCE_EXT.has(extname(f).toLowerCase()),
  )
  const expectedThumbs = new Set(sourceFiles.map((f) => `${parse(f).name}.webp`))

  let generated = 0
  let skipped = 0

  for (const filename of sourceFiles) {
    const ext = extname(filename).toLowerCase()
    /** 同じ dir で元が既に .webp の場合は処理対象外（自分を上書きしない） */
    if (isInPlace && ext === '.webp') {
      skipped++
      continue
    }

    const srcPath = join(sourceDir, filename)
    const outPath = join(outDir, `${parse(filename).name}.webp`)

    if (existsSync(outPath) && srcPath !== outPath) {
      const srcStat = statSync(srcPath)
      const outStat = statSync(outPath)
      if (outStat.mtimeMs >= srcStat.mtimeMs) {
        skipped++
        continue
      }
    }

    let pipeline = sharp(srcPath).rotate()
    if (maxEdge !== undefined) {
      pipeline = pipeline.resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
    }
    await pipeline.webp({ quality }).toFile(outPath)
    generated++
    if (verbose) console.log(`webp: ${filename} → ${parse(outPath).base}`)
  }

  let removed = 0
  if (pruneOrphans && !isInPlace) {
    for (const f of readdirSync(outDir)) {
      if (!f.toLowerCase().endsWith('.webp')) continue
      if (!expectedThumbs.has(f)) {
        unlinkSync(join(outDir, f))
        removed++
      }
    }
  }

  return { generated, skipped, removed }
}
