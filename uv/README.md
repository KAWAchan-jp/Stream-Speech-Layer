# Faster-Whisper ローカルサーバー

Stream Speech Layer の Faster-Whisper 認識エンジン用ローカルサーバーです。
拡張機能本体とは別に、このフォルダをローカル PC 上で起動して使います。

**GPU（NVIDIA）搭載 PC での利用を前提にしています。** CPU でも動作しますが、
`large` 系モデルは実用速度が出ません（詳細は後述の性能目安を参照）。

## セットアップと起動（uv 推奨・GPU 搭載前提）

[uv](https://docs.astral.sh/uv/) がインストール済みなら、これだけで起動できます
（初回は依存パッケージ・CUDA ライブラリ・モデルが自動でダウンロードされます）:

```powershell
cd uv
uv run --with nvidia-cublas-cu12 --with "nvidia-cudnn-cu12>=9,<10" server.py
```

GPU を使わない場合（CPU のみ・small モデル推奨）:

```powershell
cd uv
uv run server.py
```

### uv のダウンロード・インストール方法

Windows の場合（PowerShell）:

```powershell
irm https://astral.sh/uv/install.ps1 | iex
```

winget でも導入できます:

```powershell
winget install astral-sh.uv
```

macOS / Linux:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

インストール後、ターミナルを開き直してから `uv --version` で確認してください。

> 詳細・最新のインストール方法は [uv 公式ドキュメント](https://docs.astral.sh/uv/getting-started/installation/) を参照してください。

起動後、拡張機能の設定ページで Faster-Whisper の URL を
`http://127.0.0.1:8765/transcribe` にします（デフォルト値のままで OK）。

コンソールに `Model '...' ready` と表示されてから、拡張側で認識を開始してください
（起動直後はモデル読み込み中のため、送信してもタイムアウトします）。

## 代替: venv + pip で起動する場合

uv を使わない場合は、通常の Python 仮想環境でも起動できます。

```powershell
cd uv
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py
```

## 環境変数

| 変数 | 説明 | デフォルト |
|---|---|---|
| `FASTER_WHISPER_MODEL` | デフォルトモデル（拡張側のモデル設定と合わせる） | `large-v3-turbo` |
| `FASTER_WHISPER_DEVICE` | `auto` / `cpu` / `cuda` など | `auto` |
| `FASTER_WHISPER_COMPUTE_TYPE` | `auto` / `int8` / `float16` など | `auto` |
| `FASTER_WHISPER_HOST` | バインドするホスト | `127.0.0.1` |
| `FASTER_WHISPER_PORT` | ポート番号 | `8765` |
| `FASTER_WHISPER_PRELOAD` | `0` で起動時のモデル事前ロードを無効化 | `1`（有効） |

モデル本体は Hugging Face から自動ダウンロードされ、`~/.cache/huggingface` に
キャッシュされます（`large-v3-turbo` は約1.6GB）。

拡張側は30秒でタイムアウトするため、リクエスト中にモデルダウンロードが走ると
必ず失敗します。これを避けるため、サーバー起動時にデフォルトモデルを事前ロード
します。

## GPU（CUDA）で動かす

NVIDIA GPU がある場合、**CUDA Toolkit をシステムにインストールする必要はありません**。
pip の NVIDIA ライブラリを uv に追加するだけで GPU が使えます:

```powershell
uv run --with nvidia-cublas-cu12 --with "nvidia-cudnn-cu12>=9,<10" server.py
```

- 初回は cuBLAS + cuDNN（合計約1.2GB）がダウンロードされます（uv がキャッシュ）。
- ドライバーは CUDA 12 対応版（バージョン 525 以上）が必要です。
- `server.py` が pip 版 NVIDIA ライブラリの DLL を自動検出して読み込みます。
- ライブラリ無しで起動した場合（`cublas64_12.dll is not found`）は
  自動で CPU にフォールバックします（起動ログに `[warn] GPU init failed` と出ます）。

## 性能の目安（実測: 7.5秒の英語音声）

| モデル | CPU (int8) | GPU (RTX 3070) | 備考 |
|---|---|---|---|
| `small` | 約6秒 | — | CPU のみの環境向け。リアルタイムぎりぎり |
| `large-v3-turbo` | 約30秒 | **約0.5〜1秒** | CPU では拡張のタイムアウト（30秒）に接触。**GPU 推奨** |

CPU のみの環境では拡張側のモデル設定を `small` にすることを推奨します。

## API

- `GET /health` — 稼働確認。デフォルトモデル・デバイス設定を返す
- `POST /transcribe` — multipart form で音声を受け取り認識結果を返す
  - `file`: 音声ファイル（webm/opus など。PyAV が内蔵 FFmpeg でデコードするため別途 ffmpeg 不要）
  - `model`: モデル名（`small` / `medium` / `large-v3` / `large-v3-turbo`）
  - `language`: ISO 639-1 言語コード（省略時は自動判定）
  - `initial_prompt`: 認識ヒント（省略可）

## デプロイ用 ZIP

拡張本体とは別に、このフォルダだけを含む ZIP をユーザー配布用に作成します。
`scripts/build-uv-release.ps1` を実行すると `uv/` フォルダ一式（`server.py` /
`requirements.txt` / `README.md`）を含む ZIP が生成されます。
