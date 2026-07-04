# 作業記録: gemini-speech-translator

ブランチ `gemini-speech-translator` での作業内容の記録。

## 目的

翻訳エンジンに Google AI Studio (Gemini API) を追加する。特に、認識エンジンと翻訳エンジンの両方に Gemini を選んだ場合は、内部で音声認識と翻訳を1回の Gemini API 呼び出しにまとめる。

## 背景

Gemini API の利用上限は音声認識用と翻訳用で別枠ではなく、同じ Google AI Studio / Google Cloud プロジェクトの枠を使う。単純に「Gemini 音声認識 -> Gemini 翻訳」と2回呼び出すと、チャンクごとのリクエスト数とレイテンシが増える。

そのため、ユーザーには従来どおり「認識エンジン: Gemini」「翻訳エンジン: Gemini」と見せつつ、内部では一括処理する。

## 実装方針

- `translationProvider` に `gemini` を追加する。
- Gemini API キーは既存の `geminiApiKey` を共用し、翻訳専用キーは増やさない。
- `transcriptionProvider === 'gemini'` かつ `translationProvider === 'gemini'` かつ翻訳有効の場合、offscreen 側で Gemini に文字起こしと翻訳を同時に依頼する。
- Gemini 一括処理の応答は JSON として受け取り、`transcript` と `translation` に分ける。
- Gemini 一括処理済みの結果には `translationHandled` を付け、background 側で二重翻訳しない。
- Groq 認識 + Gemini 翻訳など、認識エンジンが Gemini ではない組み合わせでは、background 側で通常のテキスト翻訳として Gemini を呼び出す。
- Gemini の JSON 応答が崩れた場合は、文字起こし結果として扱い、後段翻訳にフォールバックできるようにする。

## 変更予定ファイル

| ファイル | 内容 |
|---|---|
| `extension/src/transcription/transcriber.js` | Gemini 一括プロンプト、JSON パース、`translationHandled` 返却 |
| `extension/src/offscreen/offscreen.js` | 翻訳設定を transcriber へ渡し、翻訳済み結果を background へ渡す |
| `extension/src/background.js` | Gemini テキスト翻訳、Gemini 一括済み結果の二重翻訳防止 |
| `extension/src/ui/options.html` | 翻訳エンジンに Gemini を追加し、上限共有と内部一括処理の説明を追加 |
| `extension/src/ui/popup.js` | popup の翻訳エンジン表示に Gemini を追加 |
| `README.md` / `README.en.md` | Gemini 翻訳対応、外部送信、上限説明を更新 |
| `docs/gemini-notes.md` | Gemini 翻訳の設計判断を追記 |
| `docs/privacy-notes.md` | Gemini 一括処理時の外部送信内容を追記 |

## 検証観点

- `node --check` で background / offscreen / transcriber / popup の構文チェックが通ること。
- `manifest.json` が JSON として妥当であること。
- options の翻訳エンジンに Gemini が表示されること。
- popup に翻訳エンジン Gemini が表示されること。
- Gemini 認識 + Gemini 翻訳で、チャンク1つにつき Gemini API 呼び出しが1回になること。
- Groq 認識 + Gemini 翻訳で、認識後に Gemini テキスト翻訳が行われること。
- Gemini 一括処理で `translatedText` がログと字幕オーバーレイに反映されること。
- Gemini 一括処理の JSON パースに失敗しても、文字起こし表示が壊れないこと。

## 検証結果

- `node --check extension/src/background.js`: 通過
- `node --check extension/src/offscreen/offscreen.js`: 通過
- `node --check extension/src/transcription/transcriber.js`: 通過
- `node --check extension/src/ui/popup.js`: 通過
- `extension/manifest.json` の JSON 妥当性確認: 通過
- 実機での拡張読み込み、Gemini API 実呼び出し、YouTube / Twitch 上での字幕表示確認: 未実施

## 注意点

- Gemini の利用上限は音声認識と翻訳で同じプロジェクト枠を使う。
- Gemini 翻訳の上限は「月何語」ではなく、RPM / TPM / RPD とトークン量で見る。音声認識で使った場合も翻訳で使った場合も同じ上限にカウントされる。
- 6秒チャンクの場合、最大で 10 req/min、600 req/hour、14,400 req/day 程度。Gemini 認識 + Gemini 翻訳の内部一括処理では1チャンク1リクエストのまま。
- 認識と翻訳を一括処理しても、音声チャンクは Gemini API へ送信される。
- 翻訳先言語を変えた場合、過去チャンクの Gemini 一括翻訳結果は自動再翻訳されない。
