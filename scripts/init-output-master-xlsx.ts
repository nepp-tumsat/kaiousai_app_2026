/**
 * ピン調整の書き出し先 `scripts/sources/output_海王祭アプリ2026マスターデータ.xlsx` が無いとき用。
 * マスターをコピーして作る（gitignore のため clone 直後は存在しない）。
 *
 *   npm run init-output-xlsx
 *   npm run init-output-xlsx -- --force   # 既存 output をマスターで上書き
 */
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MASTER_XLSX_FILENAME,
  OUTPUT_MASTER_XLSX_FILENAME,
} from '../src/lib/devMasterXlsxPatch'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const sourcesDir = join(root, 'scripts', 'sources')
const masterPath = join(sourcesDir, MASTER_XLSX_FILENAME)
const outputPath = join(sourcesDir, OUTPUT_MASTER_XLSX_FILENAME)

const force = process.argv.includes('--force')

if (!existsSync(masterPath)) {
  console.error(`マスター Excel がありません: ${masterPath}`)
  process.exit(1)
}

if (existsSync(outputPath) && !force) {
  console.log(`既に存在するためスキップしました: ${outputPath}`)
  console.log('マスターから作り直す場合は: npm run init-output-xlsx -- --force')
  process.exit(0)
}

copyFileSync(masterPath, outputPath)
console.log(`書き出しました: ${outputPath}`)
