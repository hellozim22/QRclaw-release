# Visual audit (Vercel vs design PNG)

Captures full-viewport screenshots on **https://qrclaw-test.vercel.app** (override with `VISUAL_AUDIT_BASE_URL`) and writes pixel diffs vs `design/design-png-dashboard` and `design/design-png-phone`.

## Prerequisites

- Node 18+
- From `tests/`: `npm install`
- Playwright browsers: `npx playwright install chromium`

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `TEST_USER_EMAIL` | Yes (dashboard + most mobile auth shots) | Login |
| `TEST_USER_PASSWORD` | Yes | Login |
| `VISUAL_AUDIT_AGENT_ID` | Optional | Default `a26c6cf5-4eff-4d9f-aae7-45cf9a061712` |
| `VISUAL_AUDIT_SUPPORT_AGENT_ID` | Optional | Agent id for **Mobile!ScanQR-AgentGuide** (`/m/chat/:id?guide=1&audit=1` fixed Support thread); defaults to `VISUAL_AUDIT_AGENT_ID` |
| `VISUAL_AUDIT_PAUSED_AGENT_ID` | Optional | Mobile paused profile |
| `VISUAL_AUDIT_BASE_URL` | Optional | Default `https://qrclaw-test.vercel.app` |

## Commands

```bash
cd tests

# 1) Capture (all projects)
TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
  npx playwright test --config=e2e/visual-audit/playwright.config.ts

# Public mobile pages only (no login)
npx playwright test --config=e2e/visual-audit/playwright.config.ts --project=mobile-public

# 2) Compare (after capture; use same base URL as capture so report.md matches)
VISUAL_AUDIT_BASE_URL=http://127.0.0.1:3000 node e2e/visual-audit/compare-visual-audit.mjs
```

Outputs（默认写入 `tests/test-results/visual-audit-YYYYMMDD/`，**视觉审计目录已跟踪进仓库**，便于协作者与 Agent 直接打开 PNG / `report.md`）：

- **Create QR 向导**（`Web!CreateQR-*` / `Web!AddQRModal`）：实现为 **Step0 选 Agent → Step1 选模板 → Step2 配置+右侧预览 → 成功页**（对应设计 `Web-CreateQR-Step0/1/2` + Success）。Playwright 会 **mock** Supabase `GET /rest/v1/agents`，固定返回「Visual Audit Agent」。
- **`Web!CreateQR-Success`**：额外 **mock** Gateway `POST .../api/create-qrcode`，返回含 `profile_url` / `qr_image_url` 的 JSON（线上 Gateway 若缺字段，前端会回退 URL / 占位图，但审计截图需稳定成功态）。
- `implementation/*.png` — 线上截图
- `reference-resized/*.png` — 设计稿缩放到视口
- `diff/*.png` — 差异高亮
- `report.md` — 总表 + **给其他 Agent 怎么改** + **逐屏说明**

更新审计后请 `git add tests/test-results/visual-audit-20260327`（或当前日期目录）下的 `implementation/`、`diff/`、`reference-resized/`、`report.md` 并提交。**像素对比依赖** 仓库内 `design/design-png-dashboard` 与 `design/design-png-phone`（文件名与实现截图一致，均为 `Web!*.png` / `Mobile!*.png`）；若缺失则 `compare` 会在 `report.md` 中标记 `missing design`。

## Notes

- Design PNGs are much larger than 1440×900 / 390×844; the script resizes with **cover + top** before `pixelmatch`. This is an automated proxy for “frame-level” review, not a substitute for art-directed crop.
- Run order: `mobile-empty-qr` (empty `/m/qrcodes`) → `dashboard` → `mobile-auth`. Same Supabase user.
- **Web `/qrcodes` empty vs list**: `Web!Dashboard-QRcode-Empty` and `Web!Dashboard-QRcode` / `Web!EditQR` intercept Supabase `GET .../rest/v1/qrcodes` (see `mock-qrcodes-api.ts`) so shots stay stable when Gateway create fails or DB rows differ.
- Skipped tests mean optional env or data was missing.
