# Gemini API (Google AI Studio) 検討メモ

## 結論
音声認識エンジンの第3の選択肢として Gemini API を追加する。既存の Groq Whisper API 実装（`extension/src/transcription/transcriber.js`）と対称的な構造で実装し、実装差分を最小化する。

## 無料枠の概要（2026年7月時点）
- クレジットカード登録不要でそのまま利用可能。ただし API キー自体は必須（Google AI Studio https://aistudio.google.com/apikey で発行）
- 無料枠対象は Flash / Flash-Lite 系のみ（Pro は2026年4月に無料枠から除外済み）
- レート制限（目安、プロジェクト単位）
  - Gemini 2.5 Flash: 15 RPM / 100万 TPM / 1,500 RPD
  - Gemini 2.5 Flash-Lite: 30 RPM / 100万 TPM / 1,500 RPD
  - 正確な値は利用者ごとに [AI Studio のレート制限ページ](https://aistudio.google.com/rate-limit) で要確認
- 音声入力は 32 トークン/秒でトークン化される

## 実質的なボトルネック
RPM ではなく **RPD（1日1,500リクエスト）**。
- チャンク間隔6秒（= 10 req/分）で運用した場合: 1,500 ÷ 10 = 150分（約2時間30分）で1日分を使い切る
- RPM上限（Flash 15 / Flash-Lite 30）に対しては10 req/分で十分な余裕がある

## 採用する既定値
- モデル: `gemini-2.5-flash-lite`（RPM上限が緩く、料金面でも最安）
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
