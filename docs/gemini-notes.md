# Gemini API (Google AI Studio) 検討メモ

## 結論
音声認識エンジンの第3の選択肢として Gemini API を追加する。既存の Groq Whisper API 実装（`extension/src/transcription/transcriber.js`）と対称的な構造で実装し、実装差分を最小化する。

## 無料枠の概要（2026年7月時点）
- クレジットカード登録不要でそのまま利用可能。ただし API キー自体は必須（Google AI Studio https://aistudio.google.com/apikey で発行）
- **上限はモデル・アカウントごとに大きく異なる**。必ず利用者ごとに [AI Studio のレート制限ページ](https://aistudio.google.com/rate-limit) で確認する
- 音声入力は 32 トークン/秒でトークン化される

## 実測値の教訓（2026-07-04）
当初、ブログ等の情報から「Flash-Lite は 1,500 RPD（約2時間30分/日）」と見積もっていたが、**実測では `gemini-2.5-flash-lite` の無料枠RPDはわずか20回/日**で、開始2分で枯渇した。旧世代（2.5系）は無料枠が極端に絞られている。

一方、同じアカウントのレート制限ページでは現行世代の **Gemini 3.1 Flash Lite が RPD 150K / RPM 4K** と桁違いに大きかったため、使用モデルをこちらに変更した。

**教訓: Gemini の無料枠はブログの二次情報ではなく、自分のアカウントの rate-limit ページの実数値で判断する。世代交代で旧モデルの無料枠は急激に削られる。**

## 採用する既定値
- モデル: `gemini-3.1-flash-lite`（現行世代のFlash-Lite。RPD 150K で実質上限なし、料金面でも最安クラス）
- チャンク間隔（`chunkMillis`）: 6000ms に統一（Groq/Gemini共通）

## レート制限(429)対策
`transcribeWithGemini` で 429 応答を受けた際、エラーボディの `error.status`（`RESOURCE_EXHAUSTED`）とクォータ情報から RPM由来かRPD由来かを判別する。
- RPM由来（一時的）: 当該チャンクのみスキップし、次のチャンクで通常どおり再試行
- RPD由来（日次上限）: フラグを立てて以降のリクエスト送信自体を停止し、「本日のGemini無料枠(RPD)の上限に達した可能性があります」と表示。無駄な失敗リクエストの連続送信を防ぐ。フラグはキャプチャ開始時にリセット

## Groqとの比較
- Groq Whisper API に比べて応答速度は遅め（options 画面の説明文にも明記する）
- 無料枠の連続利用時間はGroqよりGeminiの方が制約が強い（Groqは別途レート制限ありだが本メモの対象外）

## 除外・保留事項
- モデル選択UI（Flash / Flash-Lite の切替）は今回は行わない
- Gemini Live API（ストリーミング音声対話）は対象外。チャンクを都度送信する既存方式に統一する
- offscreen.js側での事前RPMスロットリングは実装しない（6秒間隔ならRPM上限に対して十分余裕があるため）
