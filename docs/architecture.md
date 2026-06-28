# アーキテクチャ設計メモ

## 目的
Stream Speech Layer は、配信音声を取得して文字起こしし、結果を UI で表示・保存する Chrome / Brave 両対応の Chromium 拡張 MVP を目指す。

## ブラウザ方針
- Chrome と Brave の両方で動作することを前提にする
- Chromium 116 以降の Manifest V3 と `chrome.*` API を基準にする
- Firefox 固有設定は基本的に入れない
- `tabCapture` と `offscreen` は Chrome / Brave の両方で確認対象にする

## 参考実装
参考にする構成として、Twitch Chat Translator の音声字幕実装を採用する。特に、以下のパターンをそのまま活かす。

- content script で音声取得と UI 制御を分担する
- tabCapture と Web Audio API でタブ音声を取り込む
- MediaRecorder で音声チャンクを作る
- 文字起こし処理は Web Worker / offscreen で分離する
- 文字起こし結果は popup や side panel に表示し、ログ保存へ繋ぐ

今回のプロジェクトでは、チャット翻訳のような複雑な機能は持たず、「音声取得 → 分割 → 認識 → 表示 → 保存」の最小フローに絞る。

## スコープ
- まずは YouTube Live の音声取得から始める
- 文字起こしは外部 API またはローカルエンジンのどちらかを選ぶ
- UI は popup または side panel で最小構成とする
- ログ保存はローカルストレージまたはファイル出力に限定する

## 主要コンポーネント

### 1. Capture Layer
- background service worker が `tabCapture.getMediaStreamId()` で現在タブの音声取得権を作る
- offscreen document が stream ID からタブ音声 MediaStream を取得する
- AudioContext で再生を維持する
- MediaRecorder で音声チャンクを作る

### 2. Transcription Layer
- 音声チャンクを認識エンジンへ送信する
- 文字起こしは Web Worker または offscreen page で実行し、UI スレッドをブロックしない
- 結果をテキストとして返す
- 失敗時は再試行やエラー表示を行う
- MVP ではローカル Whisper を優先し、必要なら将来的に API 連携へ拡張する
- 現在の実装は認識エンジン差し替え口を先に用意し、Groq Whisper API を任意設定で使えるようにする

### 3. UI Layer
- popup か side panel で開始/停止/状態表示を行う
- 文字起こし結果を一覧表示する
- 設定項目として認識エンジン種別や保存先を持つ

### 4. Storage Layer
- 文字起こしログをローカルに保存する
- 将来的に JSON / TXT / SRT などへエクスポートできるようにする

## データフロー
1. ユーザーが拡張機能を起動する
2. タブ音声を取得する
3. 音声を短いチャンクに分割する
4. 認識エンジンに送る
5. 結果を UI に表示する
6. ログとして保存する

## MVP 実装順
1. manifest.json と基本 UI を追加する
2. tabCapture と offscreen document で音声取得できるようにする
3. 音声チャンク化を実装する
4. 文字起こし API 連携を追加する
5. 結果表示とログ保存を実装する

## プライバシーと権限
- 取得開始はユーザー操作に限定する
- 音声送信先は明示する
- API キーは拡張内に埋め込まない
- 保存範囲と削除方法を UI で明示する
