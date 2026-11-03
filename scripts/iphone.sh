#!/bin/bash
# iPhone 実機テスト・デモ撮影用。本番と同じ形でビルドして、同じ Wi-Fi 内だけの https で動かす。
# （開発用の next dev は自動更新が仮の証明書と相性が悪く、iPhone で読み込みが繰り返されるため）
cd "$(dirname "$0")/.."
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
if [ -z "$IP" ]; then echo "ネットワークのアドレスが取れませんでした"; exit 1; fi
mkdir -p certificates
openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout certificates/lan-key.pem -out certificates/lan.pem \
  -subj "/CN=yaobiz" \
  -addext "subjectAltName=IP:${IP},DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
npx next build || exit 1
echo ""
echo "iPhone の Safari で開くアドレス:  https://${IP}:3100/"
exec node scripts/https-server.mjs
