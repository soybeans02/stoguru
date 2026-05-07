# 懸念点まとめ + 寝てる間の作業ログ — 2026-05-07

寝てる間に i18n 整備 + 監査して、起きたら確認する用のメモ。

---

## ✅ 寝てる間にやったこと (push 待ち)

### A. 価格レンジの重大バグ修正 (push 済み: ad22490)
- `frontend/src/utils/price.ts` 新設
- 全角 `〜` 見落としで上限が下限と同値になるバグ修正
- フィルタが `¥1,000〜¥2,000` を 1,000 万円扱いするバグ修正
- 範囲オーバーラップ判定に変更

### B. 都道府県フィルタの正規化 (push 済み: 5c0d81e)
- `frontend/src/utils/prefecture.ts` 新設
- `address.startsWith()` から `extractPrefecture` (include ベース) に変更
- 「〒530-... 大阪府...」みたいな postal-code 始まりでもマッチするように

### C. 第 2 監査 CRITICAL/HIGH 修正 (push 済み: 29ddcb3)
- `DELETE /auth/account` に password 再認証必須化
- `/auth/{email,account,password}` に `sensitiveAuthLimit` (1h 5回)
- `SKIP_EMAIL_VERIFICATION` を明示オプトイン化
- フィードバック投稿 1h 5件レート制限
- フロント `uploadPhoto` に MIME WL + 8MB 上限ガード

### D. 距離フィルタ撤廃 (push 済み: 1d98d8e)
- マップの絞り込みシートから距離スライダー削除

### E. **i18n 大幅整備 (まだ push してない)**

#### 辞書 (ja.ts / en.ts)
- 新ネームスペース: `filter` / `search` / `upload` / `actions`
- 拡充: `map.*` (legend / list / nearby / mode picker etc.)
- 拡充: `account.*` (bio fallback / joinedSinceTemplate / currentPassword)
- 拡充: `influencer.*` (form 全項目)
- 拡充: `stock.*` (検索 placeholder / source template / 削除確認)
- 拡充: `home.*` (feed empty 系 / aria-label)
- 拡充: `auth.*` (mode label / placeholder / submit text)

#### 新ヘルパー
- `frontend/src/utils/labelI18n.ts` — `localizeGenre / localizeScene / localizePrefecture`
  ジャンル「ラーメン→Ramen」、シーン「デート→Date」、県名「東京都→Tokyo」など
  内部キーは JP のまま、表示時のみ言語切替

#### `t()` 化したコンポーネント (主要)
- `FilterOverlay.tsx` ✅ (絞り込みシート全項目)
- `SimpleMapViewMapbox.tsx` ✅ (top pill / 検索 / list / legend / 衛星 / nearby / picker / mode picker)
- `SimpleMapViewMapbox` の `buildPopupNode` ✅ (popup の動画 / 経路ラベルもlanguage 追従)
- `SocialScreen.tsx` ✅ (検索 / リクエスト / ランキング)
- `InfluencerRestaurantForm.tsx` ✅ (フォーム全部 + ジャンル名表示)
- `InfluencerDashboard.tsx` ✅ (タイトル + 公開ボタン + プレビュー + ジャンルチップ)
- `PhotoUpload.tsx` ✅
- `AccountScreen.tsx` ✅ (alert メッセージ / bio fallback / Following overlay / DeleteAccount step3 のパスワード入力)
- `StockScreen.tsx` ✅ (検索 placeholder / pill / 並び替え / stat / カードボタン / 削除確認 / アクティブフィルタ表示)
- `DiscoveryHome.tsx` ✅ (feed empty 系 / aria-label)
- `AuthScreen.tsx` ✅ (modeLabel / placeholder / submit / リンク文言)

#### まだ手付かず or 未調査 (要点検)
- ~~**EditProfilePanel** (AccountScreen 内、L1100+) — bio入力 / 好きなジャンル / 地域などのラベル~~ ✅ 対応済み
- **FeedbackSheet.tsx** — i18n 既存だが残漏れ無いか再確認推奨
- **OnboardingScreen.tsx** — 既存 i18n、再確認推奨
- **ThemeListScreen.tsx** — テーマカードの説明文、要確認
- **LegalDocs.tsx / FeatureArticleScreen.tsx** — 法務文書 / CMS 記事は **対象外** (英訳に法務確認が必要、CMS 側で言語フィールドが要る)
- **AdminPage.tsx** — 管理画面なので JP 固定でも良い (運営者専用)

---

## 🚨 起きたらまずやること

### 1. 必ず tsc -b で型チェック (Bash)

```bash
cd /Users/seongwhankim/vsc/ストレス/frontend && npx tsc -b
cd /Users/seongwhankim/vsc/ストレス/backend && npx tsc --noEmit
```

両方 EXIT=0 なら commit + push 可。

### 2. 落ちる可能性が高い箇所
- `SimpleMapViewMapbox.tsx` の `popupLabelsRef` 型 (functions を含む optional フィールド)
- `useTranslation()` の destructure に `language` を含めた箇所すべて (LanguageContext のシグネチャに `language` が露出してるか確認)
- `localizeGenre` import の重複/衝突

### 3. もし型エラー出たら
- `useTranslation` の戻り値: `LanguageContext.tsx` を見て `{ t, language, setLanguage }` が exposed されてるか確認
- もし `language` が露出してない場合: 別途 `useLanguage()` hook を追加するか、`useTranslation` の戻り値型に `language` を追加する必要あり

---

## 📋 推奨コミット分割

```
feat(i18n): localize JP data labels (genres / scenes / prefectures)
  - frontend/src/utils/labelI18n.ts (新規)

feat(i18n): expand dictionaries (filter / search / map / influencer / upload)
  - frontend/src/i18n/ja.ts
  - frontend/src/i18n/en.ts

feat(i18n): wire t() into FilterOverlay / map / social
  - FilterOverlay.tsx
  - SimpleMapViewMapbox.tsx (popup builder 含む)
  - SocialScreen.tsx

feat(i18n): wire t() into influencer forms / photo upload
  - InfluencerDashboard.tsx
  - InfluencerRestaurantForm.tsx
  - PhotoUpload.tsx

feat(i18n): wire t() into account / stock / home / auth
  - AccountScreen.tsx
  - StockScreen.tsx
  - DiscoveryHome.tsx (一部)
  - AuthScreen.tsx
```

---

## 🔴 まだ残ってる脆弱性 / バグ (前回監査で見送ったもの)

優先度順:

### HIGH
1. **`backend/routes/data.ts` `/restaurants/sync` の逐次実行**
   - 500 件 × ~200ms = 100 秒。Lambda タイムアウト超過
   - 修正: `Promise.all` で並列化 + chunk size 制御

2. **`backend/services/dynamo.ts:771,1199` `Math.random()` 衝突**
   - notification createdAt の tiebreak / feedback id 末尾。同 ms で SK 衝突可
   - 修正: `crypto.randomUUID()` か counter

### MEDIUM
3. **`AuthContext.tsx:223-225` useEffect deps 不正**
   - `setRefreshTokenFn(refreshTokenFn)` の effect が `[]` deps
   - 修正: `[refreshTokenFn]` に変更

4. **`AuthContext.tsx:43-111` 二重 `/me` fetch**
   - tryFetchMe effect dep が `[token]` で内部で setToken → 2 回走る
   - 修正: setToken 後に early return か別 effect に分離

5. **`utils/api.ts` fetchWithRetry の Headers 大文字小文字**
   - lowercase + Capital で二重 Authorization
   - 修正: `Headers` インスタンスを直接使う

6. **`backend/middleware/auth.ts:118-122` optionalAuth の 5xx 判別**
   - Cognito 一時障害が「未認証」扱いに沈黙落ち
   - 修正: 401 と 5xx を区別、5xx は 503 に

7. **`SwipeScreen.tsx:26-30` whoosh.mp3 が import 時 fetch**
   - iOS Safari でブロック
   - 修正: 最初の swipe 時に lazy fetch

8. **`hooks/useGPS.ts:138-142` cleanup race**
   - visibilitychange と unmount で重複 clear
   - 修正: visibilitychange は pause/resume

### LOW
9. **`backend/routes/auth.ts:36-45` signup 存在判定漏洩**
   - 409 vs 400 で email enumeration 可
   - 修正: 統一 400 + ジェネリックメッセージ

10. **`backend/routes/upload.ts` サイズ制限がフロント任せ**
    - 抜本: `createPresignedPost` + `Conditions: [['content-length-range', 0, MAX]]`

11. **migration scripts (`migrate-v2.ts` 他) が src/ → dist/ に出てる**
    - `scripts/` ディレクトリへ移動

12. **`backend/index.ts:35,156` `(req: any)` キャスト**
    - `AuthRequest` 型を使用

---

## 📝 補足

- **iOS アプリ側**: 今夜は web のみ。SwiftUI の i18n は別タスク。
- **CMS Feature 記事**: microCMS 側で言語フィールド追加が必要。今は JP 固定で OK。
- **PREFECTURES の英訳**: 「東京都」→「Tokyo」(都が落ちる)。表示用として割り切り。
- **GENRES の英訳**: 「居酒屋」→「Izakaya」/「丼もの」→「Donburi」など transliteration。違和感あれば調整可。
- **管理画面 (AdminPage)**: 運営者専用なので JP 固定で OK。

---

## 🧠 セッション全体での得たもの

ユーザーの感想 (笑) のとおり、**重大バグ 2 件** (price filter の 10,002,000円扱い、上限なし保存後の上限化け) は具体テストしないと見つからないクラシックなパターン。
今回の i18n 作業中も同じ。EN 切替 → 各画面巡回で「あ、ここまだ JP だ」というのが何度も出るので、起きてから言語切り替えてサーフィンしてもらうのが最も確実。
