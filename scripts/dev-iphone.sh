#!/bin/bash
# iPhone 実機テスト用：同じ Wi-Fi の中だけで https の開発サーバーを立てる。
# Mac のアドレスが変わっても、起動のたびに今のアドレスで証明書を作り直す。
cd "$(dirname "$0")/.."
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
if [ -z "$IP" ]; then echo "ネットワークのアドレスが取れませんでした"; exit 1; fi
mkdir -p certificates
openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout certificates/lan-key.pem -out certificates/lan.pem \
  -subj "/CN=yaobiz-dev" \
  -addext "subjectAltName=IP:${IP},DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
echo "iPhone の Safari で開くアドレス:  https://${IP}:3100/"
exec npx next dev -p 3100 --experimental-https \
  --experimental-https-key certificates/lan-key.pem \
  --experimental-https-cert certificates/lan.pem
