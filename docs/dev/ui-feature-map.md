# UI Feature Map — Solid UI L2 契約

> **SSOT 資料：** [`ui-feature-map.json`](./ui-feature-map.json)  
> **對齊：** [`system-feature-registry.md`](./system-feature-registry.md) 全 **67** 項 F-*  
> **驗證：** `bun run test:ui:check-map` · **L2 掃頁：** `e2e/partner/system/p-ui-routes.spec.ts`

---

## 目標

| 層 | 驗咩 | 命令 |
|----|------|------|
| **L2 Surface** | 每 F-* 有 route 或 `headless`；靜態 route 存在於 `app/**/page.tsx` | `test:ui:check-map` |
| **L2 Scan** | 登入角色開頁 → heading／text／locator 可見 | `test:e2e:ui-l2`（`p-ui-routes.spec.ts`） |
| **L3 Semantics** | 文案／欄位／狀態對齊業務 | Partner P-A/B/C + nightly |
| **L4 Polish** | 好睇、通順、RWD | Partner M0 + 探索性 QA |

**Solid UI（工程簽收）= L2 map 全填 + check-map 綠 + L2 scan 綠。**

---

## JSON 欄位

| 欄 | 說明 |
|----|------|
| `kind` | `page` · `embedded` · `headless` |
| `surfaces[]` | `path` · `role` · `assertions` · `requiredElements` · `l2`（預設 true） |
| `component` / `action` | 主 UI／server action（文件用） |
| `partnerSpecs` | 已有 L3 Partner spec 路徑 |
| `requiredElements[]` | L2+ 必須出現嘅 interactive／anchor（`role` + `name`/`pattern` 或 `locator`） |
| `stateVariants[]` | `setup`（click tab）→ 額外 `requiredElements`（conditional UI） |
| `note` | headless 原因或 L3 歸屬 |

動態 path：`{sellerId}` · `{productId}` · `{listingId}` 由 E2E env 解析。

---

## 匯總

| ID | 條件 | 進度 |
|----|------|------|
| **SC-UI-MAP** | 67/67 F-* 在 JSON · `test:ui:check-map` 綠 | ☑ |
| **SC-UI-L2** | `p-ui-routes` 全綠（guest + buyer + seller） | ☑ |
| **SC-UI-L2+** | 54/54 L2 surfaces 有 `requiredElements` | ☑ |

---

## Changelog

| 日期 | 變更 |
|------|------|
| 2026-08-20 | v1.7：L2+ `requiredElements` 全 54 L2 surfaces 覆蓋（member / merchant / auth / legal） |
| 2026-08-20 | v1.6：home · member-dashboard · admin workbenches L2+ `requiredElements` |
| 2026-08-20 | v1.5：L2 env bootstrap (`seed:e2e-marketplace-listing` + nightly) · marketplace/product-detail/admin grading L2+ |
| 2026-08-20 | v1.4：CI `test:ui:check-map` · nightly `test:e2e:ui-l2` · F-M-18/F-A-06/checkout L2+ |
| 2026-08-20 | v1.3：`requiredElements` F-M-18/F-C-03/F-A-05 · merchant `stateVariants` pending 子篩選 |
| 2026-08-20 | v1.2：guest project L2 scan · storefront assertion fix · admin login idempotent |
| 2026-08-20 | v1.1：`requiredElements` pilot（F-C-02 merchant trading） |
| 2026-08-20 | v1：`ui-feature-map.json` + validate + Partner L2 route scan |
