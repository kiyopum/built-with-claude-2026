// 画面からサーバーを呼ぶときは必ずこれを使う。
// iPhone では通信が途中で切れると、ボタンが「作業中」のまま止まって見えることがあった（2026-11-03、582秒回り続けた）。
//   ・時間の上限をつける（Claude の作業は長くて2分ほど。余裕を見て4分）
//   ・切れたら例外を投げずに { error } を返す（画面側の「エラーを出して作業中を解く」処理にそのまま乗る）
export const NETWORK_ERROR =
  "通信が途中で切れたか、時間がかかりすぎました。保存できているかもしれないので、画面を開き直して確かめてから、もう一度押してください。";

export async function apiFetch(url: string, init?: RequestInit, timeoutMs = 240_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return Response.json({ error: NETWORK_ERROR }, { status: 599 });
  } finally {
    clearTimeout(timer);
  }
}
