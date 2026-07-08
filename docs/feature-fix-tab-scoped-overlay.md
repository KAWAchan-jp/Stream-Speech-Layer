# fix/tab-scoped-overlay 作業記録

## 目的
翻訳を開始したタブ以外（新規タブ・無関係なページ）にも翻訳ウィンドウ（オーバーレイ）が表示されてしまう不具合を修正する。
あわせて、翻訳実行中に別タブのポップアップから「開始する」を押した際に、既存セッションを黙って切り替えてしまう挙動（多重起動的な体感バグ）を防ぐ。

## 原因
- `content.js` は `manifest.json` の `content_scripts.matches`（全URL）により全タブへ自動注入されるが、
  オーバーレイの表示可否をタブ非依存のグローバルフラグ `isEnabled`（`chrome.storage.local`）だけで判定していた。
- `chrome.storage.onChanged` は全タブの content script に届くため、開始/停止のたびに無関係なタブでもオーバーレイが出入りしていた。
- `background.js` の `startCapture()` は、実行中に別タブから開始要求が来ると既存セッションを黙って停止し、
  新しいタブへ切り替える実装だった。

## 実装方針・変更内容
1. `extension/src/background.js`
   - `startCapture()`: 別タブで実行中の場合は自動切替せず、エラーを投げて拒否するように変更。
   - `get-own-tab-id` メッセージハンドラを追加。content script が `sender.tab.id` を問い合わせられるようにした。
   - `getState` のレスポンスに `activeTabId` を追加。popup が実行中タブを判定できるようにした。
2. `extension/src/content.js`
   - `resolveOwnTabId()` を追加し、background に自タブIDを問い合わせてキャッシュする。
   - `syncState()` を、`isEnabled` に加えて `activeTabId === ownTabId` の場合のみオーバーレイを表示するように変更。
   - `chrome.storage.onChanged` で `isEnabled` / `activeTabId` の変化時は `syncState()` を再実行して自タブ判定をやり直す。
3. `extension/src/ui/popup.js`
   - `refreshState()` で現在タブを取得し、`activeTabId` と比較。別タブで実行中の場合は
     「他のタブで実行中: {タイトル}」を表示し、開始ボタンを無効化する。
   - クリックハンドラで `blockedByOtherTab` 状態を見て誤操作を防止。
4. `extension/manifest.json` の `version` を `0.3.2` → `0.3.3` に更新。

## 検証結果
- `node --check`（background.js / content.js / popup.js）: 通過。
- `manifest.json` のJSON妥当性（PowerShell `ConvertFrom-Json`）: 通過。
- 実ブラウザでの動作確認: **未実施**。次の作業者・ユーザーは以下を確認すること。
  1. タブAで開始 → オーバーレイがタブAにのみ表示される。
  2. 新規タブB（無関係なページ）を開く → オーバーレイが表示されない。
  3. タブBでポップアップを開く → 「他のタブで実行中: …」表示、開始ボタンが無効化されている。
  4. タブAで停止 → オーバーレイが消える。
  5. 停止後にタブBで開始 → 正常に開始できる。

## 未確認事項
- 実ブラウザでの動作確認（上記5点）。
