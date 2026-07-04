# 作業記録: feature/gemini-speech-recognition

ブランチ `feature/gemini-speech-recognition` での作業内容の記録（v0.2.1）。

## 目的
音声認識エンジンの第3の選択肢として Google AI Studio (Gemini API) を追加する。Groq の無料枠を使い切った日の代替手段を確保するのが主な狙い。設計の背景・無料枠の調査結果は [gemini-notes.md](./gemini-notes.md) を参照。

## 変更内容

### 機能追加
- 認識エンジンに「Google AI Studio (Gemini API)」を追加（モデルは `gemini-2.5-flash-lite` 固定）
- 設定ページに Gemini API キーの保存・削除・状態表示を追加（Groq キーと同じUI構造）
- 429（レート制限）応答時の処理:
  - エラーボディに日次上限（PerDay）の記載があれば RPD 到達と判断し、以降のリクエスト送信を自動停止して字幕パネルに案内を表示（無駄打ち防止）。フラグはキャプチャ開始時にリセット
  - それ以外（RPM 等の一時的な制限）は当該チャンクのみスキップし、次のチャンクで自動再試行

### 既定値の変更
- `chunkMillis` の既定値を 5000ms → **6000ms** に変更（Groq/Gemini 共通）
  - 理由: Gemini 無料枠の実質的なボトルネックは RPD（1日1,500リクエスト）。6秒間隔＝10 req/分なら1日約2時間30分の連続認識が可能
  - 注意: `chrome.storage.local` に既に 5000 が保存されている既存環境では自動では変わらない（`onInstalled` は未設定キーのみ初期化するため）。既存環境で 6000 にしたい場合は拡張のストレージをリセットするか、コンソールで `chrome.storage.local.set({ chunkMillis: 6000 })` を実行する

### 変更ファイル
| ファイル | 変更内容 |
|---|---|
| `extension/manifest.json` | `host_permissions` に `generativelanguage.googleapis.com` 追加、バージョン 0.2.1 |
| `extension/src/transcription/transcriber.js` | `transcribeWithGemini` 実装（base64変換・プロンプト・429のRPM/RPD判別・ハルシネーション除去流用）、`resetGeminiDailyLimitFlag` エクスポート |
| `extension/src/ui/options.html` | プロバイダ選択肢・Gemini キー入力欄・説明文（取得先URL / 無料枠目安 / Groqより低速）追加 |
| `extension/src/ui/options.js` | Gemini キーの保存・削除・状態表示（Groq と対称実装） |
| `extension/src/background.js` | `chunkMillis` 既定値 6000、`geminiApiKey` の保存・取得・offscreen への受け渡し |
| `extension/src/offscreen/offscreen.js` | `geminiApiKey` を transcribe 呼び出しに追加、キャプチャ開始時に RPD フラグをリセット、フォールバック値 6000 |
| `README.md` / `README.en.md` | Gemini 対応・無料枠目安・上限時の対処を追記、バッジを 0.2.1 に更新 |
| `docs/gemini-notes.md` | 新規。無料枠調査と設計方針のメモ |
| `docs/local-whisper-notes.md` | 切替候補リストに Gemini を追記 |

## 実装しなかったこと（意図的な保留）
- モデル選択UI（Flash / Flash-Lite の切替）— 今回は Flash-Lite 固定
- Gemini Live API（ストリーミング）— チャンク都度送信方式に統一
- 送信前の事前RPMスロットリング — 6秒間隔なら RPM 上限（30）に対し余裕があるため不要と判断

## 検証状況
- `node --check` による全変更 JS の構文チェック: ✅ 通過
- `manifest.json` の JSON 妥当性: ✅ 通過
- options.js が参照する Gemini 関連の DOM ID が options.html に存在すること: ✅ 確認
- 実機での動作確認（拡張再読み込み → Gemini キー保存 → YouTube/Twitch で認識）: ✅ v0.2.5（`gemini-3.1-flash-lite`）で動作確認済み（2026-07-04）
- 429 の RPM/RPD 判別: ✅ 実機の429エラーボディ（RPD超過）で検知・自動停止が動作することを確認。模擬ボディでの誤検知回帰テストも実施（v0.2.3）

## 追記（v0.2.2〜v0.2.5）
- v0.2.2: popup に現在の認識・翻訳エンジンを表示
- v0.2.3: 429 の RPD 判定をボディ全体の文字列一致から `QuotaFailure.violations[].quotaId` の判別に修正（説明文中の "per day" への誤反応を解消）。429 の生ボディをコンソールへ記録
- v0.2.4: ステータスメッセージを重要度で色分け（error=赤 / warn=オレンジ / info=通常色）。level を transcriber → offscreen → background → content の全経路に追加
- v0.2.5: 実測で `gemini-2.5-flash-lite` の無料枠が **RPD 20回/日** しかないことが判明（当初見積の1,500は誤り）。使用モデルを現行世代の `gemini-3.1-flash-lite`（RPD 150K）に変更し、ドキュメントの無料枠記述を「rate-limit ページで要確認」に修正

## 使い方（動作確認手順）
1. `chrome://extensions/` で拡張を再読み込み
2. <https://aistudio.google.com/apikey> で無料の API キーを取得（クレジットカード不要）
3. 設定ページで「Gemini API キー」を保存し、認識エンジンを「Google AI Studio (Gemini API)」に変更
4. YouTube / Twitch の配信タブで開始 → 字幕が表示されることを確認
5. DevTools の Network で `generativelanguage.googleapis.com` へのリクエストが約6秒間隔で 200 になっていることを確認
