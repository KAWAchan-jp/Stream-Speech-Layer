# 作業ステータス（共有ボード）

複数のセッション・複数の AI（Claude Code / Codex など）や、時間を空けて再開する作業を
つなぐための進捗共有ファイル。**作業を始める前に必ず読み、作業が一区切りついたら必ず更新する。**

- 更新ルール: 着手・進捗・完了・中断のたびに、該当ブランチの欄と「申し送り」を書き換える
- 新しいブランチで作業を始めたら、このファイルに欄を追加する
- ブランチ作業の詳細（目的・実装方針・変更内容・検証結果・未確認事項）は
  `docs/feature-<ブランチ名>.md` に残す運用（`CLAUDE.md` 参照）。ここには要点とリンクだけを書く
- 最終更新: 2026-07-09 / by Claude Code（v0.3.2 リリース完了）

---

## ブランチ別ステータス

### feature/all-sites-support — 担当: Claude Code（完了・developへマージ済み）
- 役割: タブ音声取得の対象サイト制限（YouTube/Twitch限定）を撤廃し、全サイトで使えるようにする。
- 進捗: 実装完了・`develop` へマージ済み（v0.3.2）。`manifest.json` の `content_scripts.matches` / `host_permissions`、
  `background.js` の `SUPPORTED_URL_PATTERN`、popup・README の文言を修正。
  詳細: `docs/feature-all-sites-support.md`
- 検証: `node --check`（background.js / popup.js）、PowerShellでの `manifest.json` JSON妥当性は通過。
  実ブラウザでの動作確認（YouTube/Twitch以外のサイト・chrome://ページでのエラー表示・既存サイトの回帰）は**未実施**。
- 次の予定: マージ後にブランチは削除済み。実機での動作確認は次の作業者・ユーザーが行うこと。

### feature/faster-whisper-local — 担当: Claude Code（完了・developへマージ済み）
- 役割: 認識エンジンにローカル Faster-Whisper（HTTPサーバー方式・GPU前提）を追加する。
- 進捗: 実装完了・`develop` へマージ済み（v0.2.8）。`uv/` に Faster-Whisper サーバー（FastAPI + uv、GPU前提・CPUフォールバック対応）を追加し、
  拡張側に `faster-whisper` プロバイダを追加（`transcriber.js` / `background.js` / `offscreen.js` / `options.html,js`）。
  送信先は `localhost` / `127.0.0.1` のみ許可。拡張本体と `uv/` を別ZIPにするビルドスクリプトも追加。
  詳細: `docs/feature-faster-whisper-local.md`
- 検証: `node --check` 全対象・`manifest.json` 妥当性・`python -m py_compile server.py`・ビルドスクリプト実行は通過。
  ユーザーによる実機テストで、popupの認識エンジン表示が「未設定」のままになるバグを発見・修正済み（v0.2.8）。
- 次の予定: 追加作業なし。マージ後にブランチは削除。

### develop — 統合用（共有）
- バージョンは `extension/manifest.json` の `version` で管理。現在 **0.3.2**
  （`feature/faster-whisper-local`、`feature/all-sites-support` マージ済み）。
- 直近: 全サイト対応を含む開発版 `v0.3.2` を GitHub Release として公開済み（Latest指定）。
  `stream-speech-layer-v0.3.2.zip` / `stream-speech-layer-uv-faster-whisper-v0.3.2.zip` を添付。
  実ブラウザでの全サイト動作確認はまだのため、継続して要確認。

### master — 本番。直接作業しない。

---

## 申し送り（時系列・新しい順）

- **2026-07-09 Claude Code**: 開発版 `v0.3.2` をGitHub Releaseとして公開（Latest指定、prerelease解除）。
  タグ `v0.3.2` を push し、`build-release.ps1` / `build-uv-release.ps1` でZIPを作成、
  GitHub API（PowerShell `Invoke-RestMethod` + `$env:GITHUB_TOKEN`）でリリース作成とZIP添付を実施。
  <https://github.com/KAWAchan-jp/Stream-Speech-Layer/releases/tag/v0.3.2>
  実ブラウザでの全サイト動作確認は未実施のまま。次の作業者・ユーザーは実機確認をお願いします。
- **2026-07-09 Claude Code**: `feature/all-sites-support` を作成。ユーザーから「タブ音声を拾う仕組みなら
  YouTube/Twitch以外でも使えるのでは」と指摘を受け、対象サイト制限を撤廃する実装を実施。
  `manifest.json`（content_scripts/host_permissions）、`background.js`（URL判定）、popup・READMEの文言を修正。
  実機での動作確認はまだのため、次の作業者（またはユーザー）は実ブラウザでYouTube/Twitch以外のサイトでの
  動作、`chrome://`ページでのエラー表示、既存サイトでの回帰がないことを確認してください。
- **2026-07-05 Codex**: ハルシネーション判定が多いというフィードバックを受け、
  `isLikelyHallucination()` を緩和。1文字などの短文全般と「ありがとうございました」単体は破棄対象から外し、
  無音時に出やすい既知の定型文中心に絞った。`node --check extension/src/transcription/transcriber.js` 通過。
- **2026-07-05 Codex**: `develop` とタグ `v0.3.0` を GitHub `origin` へ push 済み。
  GitHub CLI を再認証し、GitHub Release `v0.3.0` を作成完了。prerelease は解除し、Latest として明示指定済み。
  `stream-speech-layer-v0.3.0.zip` / `stream-speech-layer-uv-faster-whisper-v0.3.0.zip` を添付済み。
- **2026-07-05 Codex**: 開発版 `v0.3.0` の静的検証と配布ZIP作成を完了。
  `node --check`、`manifest.json` JSON妥当性、`uv/server.py` py_compile を通過。
  `dist/stream-speech-layer-v0.3.0.zip` と `dist/stream-speech-layer-uv-faster-whisper-v0.3.0.zip` を作成済み。
- **2026-07-05 Codex**: 開発版リリース準備としてバージョンを `0.3.0` に更新。
  README バッジ、作業記録、DeepL Free API キー末尾 `:fx` の送信前除去も修正対象に含める。
- **2026-07-05 Codex**: `extension/src/ui/options.html` の上部説明カードに
  Faster-Whisper（ローカル認識）の案内を追加。API キー不要・外部送信なし・ローカルサーバー起動必須・GPU推奨/CPUはsmall推奨を明記。
- **2026-07-05 Codex**: develop の現状確認を実施。`node --check`（background/content/offscreen/transcriber/options/popup）、
  `python3 -m json.tool extension/manifest.json`、`python3 -m py_compile uv/server.py` は通過。
  Windows PowerShell 経由で `scripts/build-release.ps1` / `scripts/build-uv-release.ps1` を実行し、
  `stream-speech-layer-v0.2.8.zip` と `stream-speech-layer-uv-faster-whisper-v0.2.8.zip` の作成も確認。
  ただし DeepL Free 用の `:fx` が Authorization ヘッダーにも付いたまま送信される可能性、
  README / README.en の version badge が `0.2.7` のまま、`docs/feature-faster-whisper-local.md` に v0.2.7 の古い記述が残る点を検出。
- **2026-07-05 Claude Code**: `feature/faster-whisper-local` を `develop` へマージ（v0.2.8）。
  ユーザーの実機テストで、popup の `RECOGNITION_ENGINE_LABELS` に `faster-whisper` が未登録のため
  認識エンジンが「未設定」と表示されるバグが発覚し、修正した。マージ後にブランチは削除済み。
- **2026-07-05 Claude Code**: `feature/faster-whisper-local` を作成し、ローカル Faster-Whisper 対応を実装（v0.2.7）。
  参考実装 `E:\MyScript\twitch-chat-translate-ext` の `tools/faster-whisper-server/` を移植しつつ、
  配置先はユーザー指示により `uv/` フォルダに変更。拡張本体と `uv/` は別ZIPでビルドする
  （`scripts/build-release.ps1` / `scripts/build-uv-release.ps1`）。静的検証（`node --check` 等）は通過したが、
  実ブラウザでの疎通確認は未実施。**次の作業者へ**: マージ前に実機テスト結果を確認すること。
- **2026-07-05 Claude Code**: この共有ボード（`docs/WORK-STATUS.md`）を新設。
  `E:\MyScript\Minecraft\docs\WORK-STATUS.md` を参考に、作業開始前に読む・完了後に更新するルールを
  `CLAUDE.md` / `AGENTS.md` に明記した。
