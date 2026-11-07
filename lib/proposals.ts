// 次の商品の提案（Claude が出した案）を、事業者の記録から取り出す。
//   画面から来た文は信じない。サーバーに残してある案を、番号で引く。
import type { Proposal } from "@/lib/claude";

export function proposalsOf(shop: { proposals_json: string | null }): Proposal[] {
  if (!shop.proposals_json) return [];
  try {
    const a = JSON.parse(shop.proposals_json);
    return Array.isArray(a) ? (a as Proposal[]) : [];
  } catch {
    return [];
  }
}

// フォームの seed（案の番号）から、その案を返す。なければ null
export function proposalFromForm(shop: { proposals_json: string | null }, seed: FormDataEntryValue | null): Proposal | null {
  if (seed == null || seed === "") return null;
  const i = Number(seed);
  return Number.isInteger(i) ? (proposalsOf(shop)[i] ?? null) : null;
}

// Claude に渡す形（質問づくり・申し込みページの下書きの手がかり）
export function proposalText(p: Proposal): string {
  return `名前: ${p.name}\n届け方: ${p.form}\n何をするか: ${p.what}\nどんな人に: ${p.who}${p.unit ? `\n申し込みのまとまり: ${p.unit}` : ""}\n出す前に確かめること: ${p.check}`;
}
