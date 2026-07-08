# 作業ステータス（共有ボード）

複数のセッション・複数の AI（Claude Code / Codex など）や、時間を空けて再開する作業を
つなぐための進捗共有ファイル。**作業を始める前に必ず読み、作業が一区切りついたら必ず更新する。**

- 更新ルール: 着手・進捗・完了・中断のたびに、該当ブランチの欄と「申し送り」を書き換える
- 新しいブランチで作業を始めたら、このファイルに欄を追加する
- ブランチ作業の詳細（目的・実装方針・変更内容・検証結果・未確認事項）は
  `docs/feature-<ブランチ名>.md` に残す運用（`CLAUDE.md` 参照）。ここには要点とリンクだけを書く
- リリースでZIPファイルを添付した場合は、ファイル名だけでなく各ZIPが何か（拡張機能本体／
  Faster-Whisperローカルサーバーなど任意コンポーネント）を一言添える
- 最終更新: 2026-07-09 / by Claude Code（v0.3.7 リリース完了）

---

## ブランチ別ステータス

### fix/clear-overlay-on-start — 担当: Claude Code（完了・developへマージ済み・GitHub Release公開済み）
- 役割: 開始ボタンを押したときに翻訳ウィンドウ（字幕オーバーレイ）へ前回セッションの内容が
  残ってしまう不具合を修正する。
- 進捗: 実装完了・`develop`へマージ済み（v0.3.7）。`background.js`の`startCapture()`内、既存の`storageSet()`
  呼び出しに`lastTranscript: ''`, `lastTranslation: ''` を追加し、開始時に前回内容をクリアするようにした。
  `content.js`は無改修（既存の空文字チェックで自然にクリア状態が表示される）。マージ後にブランチは削除済み。
  詳細: `docs/feature-fix-clear-overlay-on-start.md`
- 検証: `node --check background.js`、`manifest.json`のJSON妥当性は通過。実ブラウザでの動作確認は**未実施のまま公開**
  （ユーザー指示によりリリース優先）。<https://github.com/KAWAchan-jp/Stream-Speech-Layer/releases/tag/v0.3.7>
- 次の予定: ユーザーが実機で動作確認し、`docs/feature-fix-clear-overlay-on-start.md` の検証手順の結果を追記すること。

### feature/more-languages — 担当: Claude Code（完了・developへマージ済み・GitHub Release公開済み）
- 役割: 配信音声の言語・翻訳先言語の選択肢を増やす。ユーザーから「対応言語を増やしてほしい」との
  要望を受け、中国語・フランス語・ドイツ語・スペイン語・ポルトガル語・ロシア語・イタリア語の7言語を追加。
- 進捗: 実装完了・`develop`へマージ済み（元v0.3.6、最終的にv0.3.7としてまとめて公開）。`options.html`の
  2つのセレクトに7言語を追加。`background.js`の`normalizeDeepLSourceLanguage()`/`normalizeDeepLTargetLanguage()`
  （ポルトガル語はPT-BR地域指定）・`languageLabel()`、`transcriber.js`の`languageNames`（Gemini用）を更新。
  マージ後にブランチは削除済み。詳細: `docs/feature-more-languages.md`
- 検証: `node --check`（background.js/transcriber.js）、`manifest.json`のJSON妥当性は通過。
  実ブラウザでの動作確認は**未実施のまま公開**。<https://github.com/KAWAchan-jp/Stream-Speech-Layer/releases/tag/v0.3.7>
- 次の予定: 実ブラウザでの動作確認（特にDeepL×ポルトガル語）は次の作業者・ユーザーが行うこと。

### fix/hallucination-repeat-filter — 担当: Claude Code（完了・developへマージ済み・GitHub Release公開済み）
- 役割: 認識結果に「ほぼ同一文の反復」が出る場合（Whisperの典型的なハルシネーション）を検出して破棄する。
  ユーザーから、配信音声＝英語／翻訳言語＝日本語の設定で使用中、字幕に意味不明な日本語の反復文が
  表示されるとの報告を受けた。
- 進捗: 実装完了・`develop` へマージ済み（元v0.3.5、最終的にv0.3.7としてまとめて公開）。`transcriber.js` の
  `isLikelyHallucination()` に `hasRepeatedSentenceLoop()`（文単位の類似度判定による反復検出）を追加。
  既存の定型文完全一致チェックは維持。「カタカナの無意味な単語列」型のハルシネーションは誤検知リスクが
  高いため今回は対象外（ユーザーと確認済み・スコープ外）。マージ後にブランチは削除済み。
  詳細: `docs/feature-fix-hallucination-repeat-filter.md`
- 検証: `node --check transcriber.js`、`manifest.json`のJSON妥当性、Node.js上でのロジック手動検証
  （反復文=検出、通常会話文・短い相槌・実際にありうる感謝の反復=誤検知しない）は通過。
  実ブラウザでの動作確認は**未実施のまま公開**。<https://github.com/KAWAchan-jp/Stream-Speech-Layer/releases/tag/v0.3.7>
- 次の予定: 実ブラウザでの動作確認は次の作業者・ユーザーが行うこと。

### fix/stale-session-lockout — 担当: Claude Code（完了・developへマージ済み・GitHub Release公開済み）
- 役割: 「停止せずにタブ/ウィンドウを閉じたあとなど、開始ボタンが押せない時がある」不具合を修正する。
  v0.3.3で追加した「別タブで実行中なら開始ボタン無効化」ロジックが、MV3 Service Worker再起動により
  storageに残るstale状態（閉じたタブが実行中扱いのまま）と組み合わさり、開始ボタンが永久に無効化される
  回帰的症状だった。
- 進捗: 実装完了・`develop` へマージ済み（元v0.3.4、最終的にv0.3.7としてまとめて公開）。`background.js` に
  `isTabAlive()` / `reconcileStaleSession()` を追加し、`chrome.tabs.onRemoved`・`startCapture()`・
  `getState`ハンドラ・`chrome.runtime.onStartup` の4箇所でstale状態を自己修復するようにした。
  `chrome.storage.local` を状態の正本として扱う設計に変更。popup.js は無改修。
  詳細: `docs/feature-fix-stale-session-lockout.md`
- 経緯: 一度v0.3.4として単独リリースを作成したが、ユーザーから「他にも問題が見つかった」との指摘で
  リリース前に取り消し、他の修正（ハルシネーション反復検出・対応言語追加・オーバーレイクリア）と
  まとめてv0.3.7として公開した。
- 検証: `node --check background.js`、`manifest.json`のJSON妥当性は通過。実ブラウザでの動作確認は**未実施のまま公開**。
  <https://github.com/KAWAchan-jp/Stream-Speech-Layer/releases/tag/v0.3.7>
- 次の予定: ユーザーが実機で動作確認すること。

### fix/tab-scoped-overlay — 担当: Claude Code（完了・developへマージ済み・GitHub Release公開済み）
- 役割: 翻訳を開始したタブ以外にも翻訳ウィンドウが表示される不具合を修正し、
  別タブから開始した際に既存セッションを黙って切り替えてしまう挙動（多重起動的バグ）を防ぐ。
- 進捗: 実装完了・`develop` へマージ済み（v0.3.3）。`background.js`（`startCapture`の別タブ拒否・`get-own-tab-id`・
  `getState`への`activeTabId`追加）、`content.js`（自タブID判定によるオーバーレイ表示制御）、
  `popup.js`（他タブ実行中の警告表示・開始ボタン無効化）を修正。マージ後にブランチは削除済み。
  詳細: `docs/feature-fix-tab-scoped-overlay.md`
- 検証: `node --check`（background.js/content.js/popup.js）、`manifest.json`のJSON妥当性は通過。
  実ブラウザでの動作確認はユーザー側で**未実施のまま公開**（ユーザー指示によりリリース優先）。
  <https://github.com/KAWAchan-jp/Stream-Speech-Layer/releases/tag/v0.3.3>
- 次の予定: ユーザーが実機で動作確認し、`docs/feature-fix-tab-scoped-overlay.md` の検証手順の結果を追記すること。

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
- バージョンは `extension/manifest.json` の `version` で管理。現在 **0.3.7**。リモート・ローカルとも同期済み。
- 直近: 以下4件をまとめて `v0.3.7` として GitHub Release 公開済み（Latest指定）。
  - タブ終了後にstale状態が残り開始ボタンが押せなくなる問題の修正（`fix/stale-session-lockout`）
  - 認識結果の反復ハルシネーション検出（`fix/hallucination-repeat-filter`）
  - 配信音声・翻訳先の対応言語を7言語追加（`feature/more-languages`）
  - 開始時の翻訳ウィンドウ前回内容クリア（`fix/clear-overlay-on-start`）
  `stream-speech-layer-v0.3.7.zip`（拡張機能本体） / `stream-speech-layer-uv-faster-whisper-v0.3.7.zip`
  （Faster-Whisperローカルサーバー、任意コンポーネント）を添付。
  <https://github.com/KAWAchan-jp/Stream-Speech-Layer/releases/tag/v0.3.7>
  実ブラウザでの動作確認はまだのため、継続して要確認。

### master — 本番。直接作業しない。

---

## 申し送り（時系列・新しい順）

- **2026-07-09 Claude Code**: ユーザーの指示で `fix/clear-overlay-on-start` を含む4件（stale-session-lockout、
  hallucination-repeat-filter、対応言語追加、clear-overlay-on-start）をまとめて `v0.3.7` として
  GitHub Releaseに公開（Latest指定、prerelease解除）。`develop`をリモートへpush、タグ`v0.3.7`をpush、
  GitHub API（PowerShell `Invoke-RestMethod` + `$env:GITHUB_TOKEN`）でリリース作成とZIP添付を実施。
  <https://github.com/KAWAchan-jp/Stream-Speech-Layer/releases/tag/v0.3.7>
  実ブラウザでの動作確認はいずれも未実施のまま公開。次の作業者・ユーザーは各`docs/feature-*.md`の
  検証手順（特にstale-session-lockoutのService Worker再起動シナリオ、DeepL×ポルトガル語）を確認してください。
- **2026-07-09 Claude Code**: `feature/more-languages` を `develop` へマージ（v0.3.6、GitHub Release未公開、
  引き続きテスト中のため保留）。続けてユーザーから「開始ボタンを押したときに翻訳ウィンドウに前回の内容が
  残っている。クリアした状態から始めたい」との報告を受け`fix/clear-overlay-on-start`を作成。
  `background.js`の`startCapture()`で`isEnabled`等を書き込む既存の`storageSet()`呼び出しに
  `lastTranscript: ''`, `lastTranslation: ''` を追加し、開始時に前回セッションの表示内容をクリアするようにした
  （v0.3.7）。`content.js`は無改修。実ブラウザでの動作確認は未実施のため、次の作業者・ユーザーは
  `docs/feature-fix-clear-overlay-on-start.md`の検証手順を確認してください。
- **2026-07-09 Claude Code**: `fix/hallucination-repeat-filter` を `develop` へマージ（v0.3.5、GitHub Release未公開）。
  続けてユーザーから「配信言語、翻訳言語ともに対応言語を増やしてほしい」との要望を受け`feature/more-languages`
  を作成。中国語・フランス語・ドイツ語・スペイン語・ポルトガル語・ロシア語・イタリア語の7言語を
  `options.html`の配信音声言語・翻訳先言語の両セレクトに追加。バックエンド側（Groq/Faster-Whisper・
  Google Translate・Gemini）はほぼ任意のISO言語コードを素通しできる作りだったためコード変更は最小限。
  DeepLのみ`normalizeDeepLSourceLanguage()`にコードを明示追加し、ポルトガル語は翻訳先指定時に
  `PT-BR`の地域指定が必須なため`normalizeDeepLTargetLanguage()`に個別対応した（v0.3.6）。
  実ブラウザでの動作確認は未実施のため、次の作業者・ユーザーは`docs/feature-more-languages.md`の
  検証手順（特にDeepL×ポルトガル語）を確認してください。
- **2026-07-09 Claude Code**: v0.3.4のGitHub Release作成を開始したところ、ユーザーから「他にも問題が見つかった」
  とストップがかかり、リリース作成前だったため実害なし。ただし既にpush済みだった`develop`ブランチの更新と
  `v0.3.4`タグはユーザー指示で取り消した（リモート`develop`をpush前の`3854d7f`へforce-with-leaseで戻し、
  リモート・ローカル両方の`v0.3.4`タグを削除）。**ローカルの`develop`ブランチのコミット自体は削除していない**
  （stale-session-lockout修正のコードを残し、追加の問題を直してからまとめてリリースする方針）。
  続けてユーザーから、認識結果に反復するハルシネーションが出る不具合の報告を受け`fix/hallucination-repeat-filter`
  を作成。`transcriber.js`の`isLikelyHallucination()`に文単位の反復検出（`hasRepeatedSentenceLoop()`）を追加した
  （v0.3.5）。あわせて「配信音声・翻訳先の対応言語を増やしてほしい」との要望も受け、中国語・フランス語・
  ドイツ語・スペイン語・ポルトガル語・ロシア語・イタリア語の7言語を追加する`feature/more-languages`を
  別途着手する予定（本コミット時点では未着手）。実ブラウザでの動作確認はいずれも未実施のため、
  次の作業者・ユーザーは各`docs/feature-*.md`の検証手順を確認してください。
- **2026-07-09 Claude Code**: `fix/stale-session-lockout` を作成。ユーザーから「停止せずにウィンドウを終了した
  あとなど開始ボタンが押せない時がある」との報告を受け調査。v0.3.3で追加した「別タブで実行中なら開始ボタン
  無効化」ロジックが、MV3 Service Worker再起動でインメモリ`activeSession`が失われることと組み合わさり、
  storageに残るstale状態（閉じたタブが実行中扱いのまま）により開始ボタンが永久に無効化される回帰的症状と判明。
  `background.js`に`reconcileStaleSession()`を追加し、`chrome.storage.local`を状態の正本として扱い
  `tabs.onRemoved`・`startCapture()`・`getState`・`onStartup`の4箇所で自己修復するようにした（v0.3.4）。
  実機での動作確認はまだのため、次の作業者・ユーザーは`docs/feature-fix-stale-session-lockout.md`の
  検証手順（特にService Worker再起動後のタブクローズ）を実施してください。
- **2026-07-09 Claude Code**: `fix/tab-scoped-overlay` を `develop` へマージし、ユーザー指示により
  実機動作確認前に `v0.3.3` を GitHub Release として公開（Latest指定）。
  <https://github.com/KAWAchan-jp/Stream-Speech-Layer/releases/tag/v0.3.3>
  `stream-speech-layer-v0.3.3.zip`（拡張機能本体） /
  `stream-speech-layer-uv-faster-whisper-v0.3.3.zip`（Faster-Whisperローカルサーバー、任意コンポーネント。
  API キー不要・外部送信なしで文字起こしできる。拡張機能とは別にユーザーのPCで起動する）を添付済み。
  マージ後にブランチは削除済み。**次の作業者・ユーザーへ**: `docs/feature-fix-tab-scoped-overlay.md` の
  検証手順（複数タブでの表示範囲・別タブからの開始拒否・警告表示）を実機で確認し、結果を追記してください。
- **2026-07-09 Claude Code**: `fix/tab-scoped-overlay` を作成。ユーザーから「翻訳を開始したタブ以外にも
  翻訳ウィンドウが出てしまう」との指摘を受け、`content.js` にタブID判定を追加してオーバーレイの表示範囲を
  開始タブのみに限定。あわせて `background.js` の `startCapture()` が別タブから開始要求を受けると
  黙ってセッションを切り替えていた挙動をやめ、エラーで拒否するように変更。`popup.js` は他タブで実行中の場合に
  「他のタブで実行中」と表示し開始ボタンを無効化するようにした（v0.3.3）。実機での動作確認はまだのため、
  次の作業者・ユーザーは `docs/feature-fix-tab-scoped-overlay.md` の検証手順を実施してください。
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
