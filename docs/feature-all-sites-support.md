# feature/all-sites-support 作業記録

## 目的
タブ音声取得の仕組み（`chrome.tabCapture`）自体は YouTube / Twitch 固有の API に依存していないため、
対象サイトの制限を撤廃し、音声が再生されるタブであればどのサイトでも使えるようにする。

## 実装方針
- `chrome.tabCapture` はサイトを問わず動作するため、コード側で明示的にホワイトリスト化していた
  YouTube / Twitch 限定のチェックと content script のmatchesを全サイト対応に広げる。
- tabCaptureが機能しない/許可されないページ（`chrome://` や拡張機能ストア等）は
  引き続き弾き、分かりやすいエラーメッセージを出す。
- ユーザー向け文言（popup・README）もYouTube/Twitch限定の表現を修正する。

## 変更内容
- `extension/manifest.json`: `content_scripts.matches` を `http://*/*` `https://*/*` に変更し、
  不要になった YouTube/Twitch の `host_permissions` エントリを削除
- `extension/src/background.js`: `SUPPORTED_URL_PATTERN` を `https?://` 全般に変更し、
  `RESTRICTED_URL_PATTERN`（拡張機能ストア等）を新設して除外。エラーメッセージも汎用化
- `extension/src/ui/popup.html` / `popup.js`: YouTube/Twitch限定の文言を汎用表現に修正
- `README.md` / `README.en.md`: 対象サイト・使い方・実装済み機能の記述を更新し、
  全サイトへのcontent script注入に伴う権限警告についての注記を追加

## 検証結果
- `node --check extension/src/background.js` / `extension/src/ui/popup.js`: 通過
- `Get-Content extension/manifest.json | ConvertFrom-Json`（PowerShell）でJSON妥当性: 通過

## 未確認事項
- 実ブラウザでの動作確認は未実施（拡張の再読み込み、YouTube/Twitch以外のサイトでの
  開始・字幕表示、`chrome://` ページでのエラーメッセージ表示、既存YouTube/Twitchでの回帰なし）
- 強いCSPやDOM構造の特殊なサイトでオーバーレイ表示に問題が出ないかは個別確認していない
- `extension/src/content.js` はサイト名を参照しておらず変更不要と判断（未変更）
