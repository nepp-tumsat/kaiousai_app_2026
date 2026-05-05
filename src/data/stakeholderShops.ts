/**
 * 強調表示したい「ステークホルダー（協賛・関係企業 等）」の店舗 ID 一覧。
 *
 * - ID は `scripts/sources/海王祭アプリ2026マスターデータ.xlsx` の `shops` シート
 *   `id` 列の値をそのまま入れる（例: `mogi_01`）。
 * - 屋外マップで該当ピンの周囲が金色にやわらかくパルスする。
 * - 並び順は無関係（重複・空文字は自動で無視）。
 */
const STAKEHOLDER_SHOP_SOURCE_IDS_RAW: readonly string[] = [
  '00', // 本部（動作確認用）
]

export const STAKEHOLDER_SHOP_SOURCE_IDS: ReadonlySet<string> = new Set(
  STAKEHOLDER_SHOP_SOURCE_IDS_RAW.map((s) => s.trim()).filter((s) => s !== ''),
)

export function isStakeholderShopId(sourceLocationId: string | undefined): boolean {
  if (sourceLocationId === undefined) return false
  return STAKEHOLDER_SHOP_SOURCE_IDS.has(sourceLocationId)
}
