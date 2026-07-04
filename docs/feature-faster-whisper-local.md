# feature/faster-whisper-local

Faster-Whisper をローカル STT エンジンとして追加するためのブランチ作業メモ。

## 目的

Groq Whisper API / Gemini API に加えて、ユーザー自身の PC 上で動く Faster-Whisper をローカル HTTP サーバー方式で選べるようにする。API キー不要・無料枠の制限なし・音声データを外部へ送信しない選択肢を用意する。

参考実装として `E:\MyScript\twitch-chat-translate-ext` の `feature/faster-whisper-local`（マージ済み、`tools/faster-whisper-server/`）を採用した。

## 方針

- 認識エンジン選択に `faster-whisper` を追加する（`none` / `groq` / `gemini` / `faster-whisper`）。
- サーバー本体は参考実装と同じ FastAPI + faster-whisper 構成にするが、配置先は `tools/` ではなく **プロジェクト直下の `uv/`** フォルダにする（ユーザー指示）。
- Stream Speech Layer の文字起こし処理は offscreen document 内で直接 `fetch` している（content script 経由ではない）ため、参考実装のような background 経由の chunk 中継は不要。`transcriber.js` に直接 `fetch` する関数を追加するだけで完結する。
- 送信先 URL は `localhost` / `127.0.0.1` のみ許可し、任意の外部ホストに送れないようにする（参考実装と同じ安全策）。
- 拡張本体（`extension/`）と Faster-Whisper サーバー（`uv/`）は別々の ZIP としてビルドする（ユーザー指示）。
- GPU（NVIDIA・CUDA）利用を前提としたドキュメントにする（ユーザー指示）。CPU 実行も可能だが `small` モデル推奨である旨は明記する。

## 変更内容

- `uv/server.py` / `uv/requirements.txt` / `uv/README.md`: Faster-Whisper ローカルサーバー本体。参考実装からロジックを移植（PEP 723 で `uv run server.py` 起動、起動時モデル事前ロード、GPU 初期化失敗時の CPU 自動フォールバック、pip 版 NVIDIA ライブラリの DLL 自動検出）。
- `.gitignore`: `uv/.venv/` と `uv/__pycache__/` を除外。
- `extension/manifest.json`: `host_permissions` に `http://127.0.0.1/*` / `http://localhost/*` を追加。バージョンを `0.2.7` へ更新。
- `extension/src/transcription/transcriber.js`: `transcribeWithFasterWhisper()` を追加。`localhost` / `127.0.0.1` 以外への送信を拒否。30秒タイムアウト（サーバー起動直後のモデル読み込み待ちを考慮）。
- `extension/src/background.js`: `fasterWhisperUrl`（既定 `http://127.0.0.1:8765/transcribe`）/ `fasterWhisperModel`（既定 `large-v3-turbo`）を設定項目に追加（`onInstalled` の初期値・`startCapture` の設定収集・`getState`・`saveSettings`）。
- `extension/src/offscreen/offscreen.js`: `captureSettings` から `fasterWhisperUrl` / `fasterWhisperModel` を `transcribeAudioChunk()` へ渡す。
- `extension/src/ui/options.html` / `options.js`: 認識エンジンの選択肢に「Faster-Whisper（ローカルサーバー）」を追加。サーバー URL 入力・モデル選択（`small` / `medium` / `large-v3` / `large-v3-turbo`）・uv 導入手順への案内を追加。
- `scripts/build-release.ps1`: 拡張本体（`extension/` フォルダ一式）を `dist/stream-speech-layer-v<version>.zip` として ZIP 化する。
- `scripts/build-uv-release.ps1`: Faster-Whisper サーバー（`uv/server.py` / `requirements.txt` / `README.md`）を `dist/stream-speech-layer-uv-faster-whisper-v<version>.zip` として ZIP 化する。
- `README.md` / `README.en.md`: Faster-Whisper の説明、`uv/README.md` への案内、外部送信されない旨を追記。
- `docs/architecture.md` / `docs/privacy-notes.md` / `docs/local-whisper-notes.md`: 新エンジンの位置づけを追記。

## 検証結果

- `node --check` を対象の JS 全ファイル（`background.js` / `offscreen.js` / `transcriber.js` / `options.js` / `content.js` / `capture.js` / `popup.js`）に実行し通過。
- `extension/manifest.json` を `ConvertFrom-Json` で妥当性確認し通過。
- `python -m py_compile uv/server.py` で構文確認し通過。
- `scripts/build-release.ps1` / `scripts/build-uv-release.ps1` を実行し、それぞれのZIPが正しい内容（`extension/` 一式、`uv/` 一式）で生成されることを確認。

## 未確認事項

- 実ブラウザでの動作確認（拡張読み込み→設定保存→Faster-Whisperサーバー起動→実際の配信タブでの認識）は未実施（要ユーザーの手動テスト）。
- 実際に `uv run --with nvidia-cublas-cu12 --with "nvidia-cudnn-cu12>=9,<10" server.py` でサーバーを起動しての疎通確認は未実施。
