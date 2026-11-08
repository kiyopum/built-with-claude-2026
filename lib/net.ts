import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// サーバーに取りに行かせてよいホストか（外から見えるアドレスだけ）。
//   localhost・自分のネットワークの中（10.x／172.16〜31.x／192.168.x）・ループバック・リンクローカル（169.254.x＝クラウドのメタデータ）などは断る
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (low.startsWith("::ffff:")) return isPrivateIp(low.slice(7));
    return low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe80");
  }
  return false;
}

export async function isPublicHost(hostname: string): Promise<boolean> {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (isIP(h)) return !isPrivateIp(h);
  try {
    const addrs = await lookup(h, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}
