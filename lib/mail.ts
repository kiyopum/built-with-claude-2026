// メールを送る部品。設定は .env の SMTP_URL（例 smtps://ユーザー:パスワード@ホスト:465）と MAIL_FROM（差出人）。
// どちらかが無ければ送らない（注文の記録は止めない）。試すときは MAIL_TRANSPORT=json で、送らずに中身をログに出す。
import nodemailer from "nodemailer";
import { appendFileSync } from "node:fs";

export type MailResult = { ok: boolean; skipped?: boolean; error?: string };

export function mailReady(): boolean {
  return process.env.MAIL_TRANSPORT === "json" || !!(process.env.SMTP_URL && process.env.MAIL_FROM);
}

export async function sendMail(to: string, subject: string, text: string): Promise<MailResult> {
  if (!mailReady()) return { ok: false, skipped: true, error: "メールの設定（SMTP_URL・MAIL_FROM）がありません" };
  try {
    if (process.env.MAIL_TRANSPORT === "json") {
      const t = nodemailer.createTransport({ jsonTransport: true });
      const info = await t.sendMail({ from: process.env.MAIL_FROM || "test@example.invalid", to, subject, text });
      if (process.env.YAOBIZ_MAIL_LOG) appendFileSync(process.env.YAOBIZ_MAIL_LOG, info.message + "\n");
      return { ok: true };
    }
    const t = nodemailer.createTransport(process.env.SMTP_URL!);
    await t.sendMail({ from: process.env.MAIL_FROM!, to, subject, text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
