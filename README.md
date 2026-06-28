# Stream Speech Layer

YouTube / Twitch の配信タブ音声を取得し、音声認識・翻訳・字幕表示・ログ保存を行う Chrome / Brave 向け Chromium 拡張です。

## 対応環境

- Chrome
- Brave
- Chromium 116 以降

## 対象サイト

- YouTube / YouTube Live
- Twitch

## インストール

1. Chrome の `chrome://extensions/` または Brave の `brave://extensions/` を開く
2. デベロッパーモードを有効にする
3. 「パッケージ化されていない拡張機能を読み込む」を選ぶ
4. このリポジトリの `extension/` ディレクトリを選ぶ

## 使い方

1. YouTube または Twitch の配信ページを開く
2. 拡張 popup を開く
3. 認識エンジン、配信音声の言語、翻訳設定を選ぶ
4. 必要な API キーを保存する
5. 「開始する」を押す

拡張を更新した後は、拡張機能ページで再読み込みし、配信ページもリロードしてください。

## 実装済み機能

- 現在の YouTube / Twitch タブ音声の取得
- タブ音声の再出力
- MediaRecorder による音声チャンク化
- Groq Whisper API による音声認識
- Google Translate による翻訳
- DeepL API による翻訳
- ページ上字幕オーバーレイ
- 字幕オーバーレイのドラッグ移動と位置保存
- popup での最近の文字起こし表示
- Groq / DeepL API キーの保存状態表示
- Chrome / Brave 対応

## 設定

### 認識エンジン

- 未設定
- Groq Whisper API

未設定の場合、音声チャンクの取得まで行い、外部の音声認識 API には送信しません。

### 配信音声の言語

配信で話されている言語を指定します。

- 日本語
- 英語
- 自動

### 翻訳

音声認識後に翻訳する場合は、popup の「音声認識後に翻訳する」を有効にします。

翻訳先言語:

- 日本語
- 英語
- 韓国語

翻訳エンジン:

- Google Translate
- DeepL API

DeepL Free API キーを使う場合は、キーの末尾に `:fx` を付けて保存します。

```text
your-deepl-free-api-key:fx
```

DeepL Pro API キーの場合、`:fx` は不要です。

## 保存データ

文字起こしログは `chrome.storage.local` に保存します。

保存件数は直近 50 件までです。新しい認識結果が追加されるたびに、古いものから削除して最新 50 件だけを残します。

保存する主な内容:

- `text`: 音声認識結果
- `translatedText`: 翻訳結果
- `source`: 配信タイトルなど
- `url`: 配信 URL
- `timestamp`: 保存時刻

最新の認識結果と翻訳結果は、字幕オーバーレイ復元用に `lastTranscript` / `lastTranslation` として保存します。

## 外部送信

ユーザーが開始操作を行った後だけ、現在の配信タブ音声を取得します。

選択した設定に応じて、以下の外部サービスへデータを送信します。

- Groq Whisper API: 音声認識に使用
- Google Translate: 翻訳に使用
- DeepL API: 翻訳に使用

API キーは拡張内に直書きせず、ユーザーが popup から保存します。
