// ログインが要る画面：合言葉のクッキーがなければログイン画面へ（中身の確かめは各 API で行う）
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (!request.cookies.has("yaobiz_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/hearing/:path*", "/statement", "/admin", "/everyone", "/voices", "/checkin", "/me"],
};
