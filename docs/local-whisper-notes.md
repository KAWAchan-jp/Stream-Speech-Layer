# ローカル Whisper 検討メモ

## 実装状況（2026-07-05 追記）
`feature/faster-whisper-local` ブランチで、下記「方針案」のうち **Faster-Whisper（ローカル HTTP サーバー方式）** を実装済み。
詳細は [feature-faster-whisper-local.md](./feature-faster-whisper-local.md) を参照。

- 認識エンジンに「Faster-Whisper（ローカルサーバー）」を追加（`extension/src/transcription/transcriber.js` ほか）
- サーバー本体は `uv/`（uv 対応・GPU 前提・`tools/` ではなくプロジェクト直下に配置）
- 拡張本体と uv サーバーを別々の ZIP にビルドするスクリプトを `scripts/` に追加

以下の「ブラウザ内 Transformers.js によるローカル Whisper（WebGPU/WASM）」は、Faster-Whisper とは別の選択肢として**未実装のまま**残す。

## 結論
ローカル Whisper は Stream Speech Layer の本命候補として有力。

MVP の動作確認は Groq Whisper API を使うと進めやすいが、長期運用・プライバシー・コスト面ではローカル Whisper を選べる構成が望ましい。

## 良い点
- 音声データを外部 API に送らなくて済む
- API キー不要
- 配信音声のプライバシー説明がしやすい
- 長時間配信でも従量課金を気にしなくてよい
- 外部 API の障害や制限に左右されにくい

## 懸念点
- 初回モデル読み込みが重い
- CPU 実行だと遅くなる可能性がある
- WebGPU 対応状況で Chrome / Brave の差が出る
- Transformers.js / ONNX runtime / WASM / モデル取得まわりで拡張サイズや配布設計が重くなる
- Chrome Web Store 配布を考える場合、CDN 取得や外部モデル取得の扱いを慎重に決める必要がある

## 方針案
認識エンジンは切り替え式にする。

```text
未設定
Groq Whisper API
Google AI Studio (Gemini API)
ローカル Whisper
```

Gemini API は Groq と並ぶ選択肢として追加（詳細は [gemini-notes.md](./gemini-notes.md) を参照）。無料枠の上限はモデル・アカウントごとに大きく異なるため、必ず自分の [rate-limit ページ](https://aistudio.google.com/rate-limit) の実数値で確認する（旧世代モデルは極端に絞られている。現行世代の Flash Lite なら RPD に大きな余裕がある）。

実装順の候補:

1. Groq Whisper API でタブ音声取得から字幕表示までの流れを安定させる
2. 既存の twitch-chat-translate-ext のローカル Whisper 実装を軽量移植する
3. WebGPU が使える場合はローカル Whisper を優先できるようにする
4. WebGPU 非対応・重い環境では Groq Whisper API に切り替えられるようにする

## 参考にする既存実装
`E:\MyScript\twitch-chat-translate-ext` の音声字幕実装を参考にする。

特に見る箇所:

- `content-whisper.js`
- `whisper-worker.js`
- `offscreen-whisper.js`
- `background.js` の Groq / 翻訳まわり

参考になる要素:

- Whisper Worker
- モデル選択
- WebGPU / WASM 切り替え
- ハルシネーション除去
- Worker 再起動
- タイムアウト処理
- Groq へのフォールバック

## 現時点の判断
この拡張には Groq Whisper API とローカル Whisper の両方を持たせ、ユーザーが環境や用途に応じて切り替えられる形がよい。
