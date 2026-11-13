# MyRoom 3D

집 내부 영상을 올리면 3D 공간으로 변환해 모바일/노트북 브라우저에서 보고, 매물끼리 비교하는 웹앱.

- `web/` — Next.js 프론트 (모바일 촬영/업로드 + 3D 뷰어 + 매물 비교). Vercel 배포 가능.
- `server/` — FastAPI 백엔드 (영상 → 키프레임 추출 → 3D 변환, 매물 저장). 본인 서버/맥북에서 실행.

## 실행

```bash
# 백엔드
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000

# 프론트
cd web
npm install
npm run dev -- -H 0.0.0.0
```

같은 Wi-Fi의 폰에서 `http://<맥 IP>:3000` 접속. (폰 카메라 직접 녹화는 HTTPS가 필요하므로 ‘폰 카메라 바로 켜기’ 버튼(파일 입력)을 쓰세요.)

## Vercel + 내 서버

1. 서버를 Docker로 실행: `docker compose up -d --build`
2. 서버를 HTTPS로 노출 (Cloudflare Tunnel, Tailscale Funnel 등)
3. Vercel 환경변수 `NEXT_PUBLIC_API_URL=https://<서버 주소>` 설정 후 `web/`을 배포
   (서버 CORS는 현재 `*` — 공개 배포 시 도메인으로 제한하세요)

## 정밀 3D (COLMAP + OpenSplat)

`server/scripts/install_engine.sh` 참고. COLMAP/OpenSplat 바이너리가 있어야 실제 3D 복원이 됩니다.
없으면 **간이 근사 모드**로 동작합니다(아래 한계 참고).

## 한계

- COLMAP/OpenSplat 미설치 시 변환은 영상 색을 방 모양 상자에 투영한 **근사**이며 실제 집 구조를 복원하지 않습니다.
- 샘플 매물 2개는 코드로 만든 데모 방입니다.
- 치수 측정은 스케일이 임의라서 실제 cm와 다릅니다. 실측용은 LiDAR 앱(Polycam 등)이 정확합니다.

