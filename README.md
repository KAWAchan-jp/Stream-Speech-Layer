# Stream Speech Layer

YouTube / Twitch 両対応の音声認識レイヤー企画メモ。

## コンセプト

YouTube Live / Twitch の配信タブ音声を取得し、音声認識・翻訳・字幕表示・ログ保存へつなぐ Chrome / Brave 両対応の Chromium 拡張機能。

既存の Twitch チャット翻訳拡張とは別プロジェクトとして、チャットではなく「配信音声」を主対象にする。将来的には録音・録画も扱える共通レイヤーに育てる。

## 想定プロジェクト名

- 表示名: Stream Speech Layer
- リポジトリ名: stream-speech-layer
- ディレクトリ: E:\MyScript\Stream-Speech-Layer

## 対象サイト

- YouTube / YouTube Live
- Twitch

## 対応ブラウザ

- Chrome
- Brave

Chromium 116 以降を前提にする。開発中は Chrome の `chrome://extensions/` または Brave の `brave://extensions/` でデベロッパーモードを有効にし、`extension/` ディレクトリを「パッケージ化されていない拡張機能」として読み込む。

実装・検証では Chrome と Brave の両方で動作することを前提にする。Firefox 固有設定は基本的に入れず、`chrome.*` API と Chromium の Manifest V3 を基準にする。

## MVP

1. Chrome / Brave 拡張として起動する
2. 現在の YouTube / Twitch タブ音声を取得する
3. 音声を短いチャンクに分割する
4. 音声認識 API またはローカル認識エンジンに送る
5. 認識結果を拡張 UI またはページ上オーバーレイに表示する
6. 認識ログを保存できる

## 将来的な拡張

- 翻訳表示
- 字幕オーバーレイ
- SRT / VTT / TXT / JSON エクスポート
- 録音保存
- 録画保存
- 話者分離
- 用語辞書
- 配信タイトル・チャンネル名・URLとのログ紐づけ
- Twitch / YouTube 共通 UI

## 技術方針

### 音声取得

Chromium 拡張の tabCapture API を使い、現在タブの音声 MediaStream を取得する。

注意点として、tabCapture 中はタブ音声がユーザーに聞こえなくなる場合があるため、AudioContext 経由で再出力する処理を入れる。

現在の実装では `extension/` を Chromium 拡張ルートとして読み込む。background service worker が `tabCapture.getMediaStreamId()` を取得して offscreen document へ渡す。offscreen document 側で `MediaRecorder` によるチャンク化と、AudioContext による再出力を担当する。

### 録音・分割

MediaRecorder を使って音声チャンクを生成する。

録画を後から入れる場合は、video track も含めて MediaRecorder で保存する設計に拡張できる。

### 音声認識

候補:

- OpenAI Whisper / Transcription API
- Google Cloud Speech-to-Text
- ローカル Whisper 系
- Web Speech API

安定性重視なら Web Speech API だけに依存せず、音声チャンクを外部またはローカル認識エンジンへ送る構成がよい。

現時点では認識エンジンを差し替え可能な形にし、popup で Groq Whisper API を選んだ場合だけ音声チャンクを外部送信する。未設定時は外部送信せず、音声チャンク取得までを行う。

### 翻訳

既存の Twitch Chat Translator の翻訳処理を軽量移植し、まずは Google Translate 経由で音声認識後のテキストを翻訳する。popup で翻訳の有効/無効、翻訳先言語、翻訳エンジンを設定できる。

### 表示

候補:

- 拡張 popup
- Chrome side panel
- ページ上オーバーレイ
- 独立ログビュー

MVPでは popup か side panel が安全。字幕用途が強くなったらページ上オーバーレイを追加する。

## 権限・審査上の注意

- 録音・録画を扱うため、ユーザー操作による開始が必須
- Chrome Web Store 申請時に、音声取得・録画・外部API送信の説明が必要
- APIキーを拡張内に直書きしない
- 音声データの保存・送信範囲を UI 上で明確にする
- YouTube / Twitch の DOM 依存は最小限にする

## 設計メモ

共通パイプライン:

capture -> chunk -> transcribe -> translate(optional) -> display -> export

サイト固有処理:

- 対象URL判定
- 配信タイトル取得
- チャンネル名取得
- オーバーレイ挿入位置

共通処理:

- タブ音声取得
- 音声チャンク化
- 認識エンジン連携
- 表示UI
- ログ保存
- 設定管理

## 初期ファイル構成案

```text
Stream-Speech-Layer/
  README.md
  docs/
    project-plan.md
    architecture.md
    privacy-notes.md
  extension/
    manifest.json
    src/
      background/
      content/
      offscreen/
      capture/
      transcription/
      ui/
      storage/
```

## 次に決めること

- 最初は YouTube のみで試すか、YouTube / Twitch 同時対応で始めるか
- 認識エンジンを何にするか
- UI を popup / side panel / overlay のどれから始めるか
- 録画を MVP に含めるか、後回しにするか
