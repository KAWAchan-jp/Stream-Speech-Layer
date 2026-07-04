# 作業ステータス（共有ボード）

複数のセッション・複数の AI（Claude Code / Codex など）や、時間を空けて再開する作業を
つなぐための進捗共有ファイル。**作業を始める前に必ず読み、作業が一区切りついたら必ず更新する。**

- 更新ルール: 着手・進捗・完了・中断のたびに、該当ブランチの欄と「申し送り」を書き換える
- 新しいブランチで作業を始めたら、このファイルに欄を追加する
- ブランチ作業の詳細（目的・実装方針・変更内容・検証結果・未確認事項）は
  `docs/feature-<ブランチ名>.md` に残す運用（`CLAUDE.md` 参照）。ここには要点とリンクだけを書く
- 最終更新: 2026-07-05 / by Claude Code

---

## ブランチ別ステータス

### feature/faster-whisper-local — 担当: Claude Code
- 役割: 認識エンジンにローカル Faster-Whisper（HTTPサーバー方式・GPU前提）を追加する。
- 進捗: 実装完了（v0.2.7）。`uv/` に Faster-Whisper サーバー（FastAPI + uv、GPU前提・CPUフォールバック対応）を追加し、
  拡張側に `faster-whisper` プロバイダを追加（`transcriber.js` / `background.js` / `offscreen.js` / `options.html,js`）。
  送信先は `localhost` / `127.0.0.1` のみ許可。拡張本体と `uv/` を別ZIPにするビルドスクリプトも追加。
  詳細: `docs/feature-faster-whisper-local.md`
- 検証: `node --check` 全対象・`manifest.json` 妥当性・`python -m py_compile server.py`・ビルドスクリプト実行は通過。
  **実ブラウザでの動作確認（サーバー起動→拡張連携）は未実施**。
- 次の予定: ユーザーによる実機テスト（uvサーバー起動→拡張で認識確認）→ 問題なければ `develop` へマージ。

### develop — 統合用（共有）
- バージョンは `extension/manifest.json` の `version` で管理（3桁目インクリメント方式）。現在 **0.2.6**
  （`feature/faster-whisper-local` マージ後に 0.2.7 になる想定）。
- 直近: Gemini API による音声認識・翻訳の一括処理（v0.2.6）まで統合済み。

### master — 本番。直接作業しない。

---

## 申し送り（時系列・新しい順）

- **2026-07-05 Claude Code**: `feature/faster-whisper-local` を作成し、ローカル Faster-Whisper 対応を実装（v0.2.7）。
  参考実装 `E:\MyScript\twitch-chat-translate-ext` の `tools/faster-whisper-server/` を移植しつつ、
  配置先はユーザー指示により `uv/` フォルダに変更。拡張本体と `uv/` は別ZIPでビルドする
  （`scripts/build-release.ps1` / `scripts/build-uv-release.ps1`）。静的検証（`node --check` 等）は通過したが、
  実ブラウザでの疎通確認は未実施。**次の作業者へ**: マージ前に実機テスト結果を確認すること。
- **2026-07-05 Claude Code**: この共有ボード（`docs/WORK-STATUS.md`）を新設。
  `E:\MyScript\Minecraft\docs\WORK-STATUS.md` を参考に、作業開始前に読む・完了後に更新するルールを
  `CLAUDE.md` / `AGENTS.md` に明記した。
