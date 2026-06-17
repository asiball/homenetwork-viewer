# homenet — 家庭ネットワーク機器カタログ

[![CI](https://github.com/asiball/homenetwork-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/asiball/homenetwork-viewer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **A local-first catalog & topology map for your home LAN** — track every device's IP, MAC,
> hostname, specs and ownership, and know "what's that IP?" in 10 seconds. Single-user, self-hosted,
> never exposed to the internet. (日本語の説明が以下に続きます。)

自宅LAN配下の機器（ルーター・NAS・PC・IoT 等）の **IP / MAC / ホスト名 / スペック / 接続・所有情報** を、
ブラウザから一覧・参照・編集できるローカルホスト用 Web アプリです。「これ何のIP?」「あのMacのRAMは?」を
**10秒以内**に解消することを目的にしています（個人利用・1ユーザー・〜25機器・インターネット非公開）。

設計の正本は [`spec/homenet-spec.md`](spec/homenet-spec.md)。本リポジトリはその仕様を実装したものです。

> 🔰 **はじめての方へ** — ウェブ技術の基礎から、導入・使い方・運用・カスタマイズまでをやさしく解説した入門ドキュメントを [`docs/`](docs/README.md) に用意しました。Web に不慣れな場合はまずそちらをどうぞ。

```
┌──────────── HOME · TOPOLOGY MAP ────────────┐        ┌─── DETAIL · 1 DEVICE ───┐
│ ● HOMENET/NOC   ◎radial ─spine  up 15/22  ⟳ │        │ identity / 4 stats /     │
│ DEVICE │      ◉ gateway        │  SUMMARY    │  ───►  │ network / hardware /     │
│ LIST   │     /│\  · · ·        │  identity   │        │ services / storage /     │
│        │    radial / spine     │  網羅情報   │  ◄───  │ connection / ownership / │
└────────┴──────────────────────┴─────────────┘  edit  └──────────── notes ───────┘
```

---

## 構成

| サービス | 技術 | 役割 |
|---|---|---|
| **frontend** | Vite + React + TypeScript（nginx配信） | ホーム（トポロジーマップ）・詳細・編集の SPA。`/api` を backend へリバースプロキシ |
| **backend** | FastAPI（Python 3.11 / uv 管理） | devices / switches / cables の取得 + 機器の追加・編集・削除。`devices.json` に永続化 |

データは単一の JSON ファイル（`data/devices.json`）が正。UI から編集でき、手で直接編集することもできます
（バインドマウント）。書き込みはアトミック（temp + `os.replace`）です。

```
homenetwork-viewer/
├── docker-compose.yml          # frontend + backend の2サービス
├── data/                       # 実行時データ（devices.json を bind-mount・gitignore）
├── backend/
│   ├── pyproject.toml          # 依存管理（uv / PEP 621）
│   ├── uv.lock                 # 依存バージョンロックファイル
│   ├── app/
│   │   ├── main.py             # FastAPI ルート（/api/...）
│   │   ├── models.py           # Pydantic モデル（spec §3 準拠・IP/MAC/id 検証）
│   │   ├── storage.py          # JSON 永続化（アトミック書き込み + ロック + シード）
│   │   └── seed/devices.json   # 初期データ（22機器 + 4スイッチ + 9ケーブル）
│   ├── tests/                  # pytest（API/バリデーション/永続化）
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── views/              # HomeView / DetailView / EditView
│   │   ├── components/         # Shell / DeviceList / TopologyMap / SummaryPanel / ...
│   │   ├── lib/                # topology.ts（radial/spine）, helpers.ts
│   │   ├── api.ts  types.ts  theme.css
│   └── Dockerfile  nginx.conf
├── spec/                       # 正本仕様書（homenet-spec.md / Specification.html）
└── design-prototype/           # 採用前の React/JSX デザイン検討（参考・実装対象外）
```

---

## クイックスタート（docker compose）

```bash
docker compose up -d --build
# ブラウザで http://localhost:8080 を開く
```

- 公開ポートは **frontend の 8080 のみ**。nginx が `/api` を内部ネットワーク経由で backend に中継します。
- 初回起動時、`data/devices.json` が無ければ同梱シード（22機器）で自動初期化されます。
- LAN内の他端末からは `http://<ホストのIP>:8080` でアクセスできます。

停止 / ログ:

```bash
docker compose down          # 停止（data/ は残る）
docker compose logs -f       # ログ追跡
```

---

## ローカル開発（Docker なし）

**backend**

```bash
cd backend
uv sync                                         # 仮想環境作成 + 依存インストール（dev含む）
uv run uvicorn app.main:app --reload --port 8000 # http://localhost:8000/api/health
uv run pytest -q                                 # テスト
```

**frontend**

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173（/api は :8000 へプロキシ）
npm run build      # 本番ビルド（dist/）/ typecheck も実行
```

backend が 8000 以外の場合は `VITE_API_TARGET=http://host:port npm run dev`。

---

## 使い方

- **ホーム** `/` — トポロジーマップ。ヘッダーの **◎ radial / ─ spine / ⑂ tree** で配置を切替
  （URL `?layout=...` と同期）。**tree** は switches / cables 台帳の portMap から実配線の階層を
  表示します（固定スケール・ホイールスクロール / 背景ドラッグでパン、スイッチ行をクリックすると
  右パネルにポートマップ）。左リスト上部のフィルタで名前 / IP / type を部分一致で絞り込み。
  左リストやノードをクリックで選択 → 右に概要。`↑ ↓` で選択移動、`Enter` で詳細へ。`+ add` で機器登録。
  フッターの **show offline** でオフライン機器の表示/非表示。
  閲覧中の端末の IP がカタログの機器と一致すると **YOU** バッジ・破線リングが付きます（`/api/whoami`）。
- **詳細** `/d/:id` — identity / CPU・メモリ・帯域・稼働 / network / hardware / services / storage /
  接続履歴 / ownership / notes の構成。データが無い項目は推測せず `—` や `no agent` と表示します（spec §6.4）。
  host / IP / MAC はクリックでコピー。`url` を設定した機器は **↗ open** から管理画面を別タブで開け、
  ポートスキャン結果（services）の HTTP 系ポートも自動でリンクになります。
- **編集 / 追加** `/d/:id/edit`, `/add` — 識別情報・配置（web ui の `url` 含む）・スペック概要・所有情報・メモを編集。
  保存すると `devices.json` に書き戻されます。`id` は不変（追加時のみ設定、名前から kebab-case を自動提案）。
  自動収集系の詳細（メトリクス/ポート等）は編集対象外で、編集時もそのまま保持されます。

### ヘッダーの「poll / refresh」について

`refresh` と自動更新（off / 30s / 5m）は **API からカタログを再取得**します。`devices.json` を手で書き換えた場合も
これで反映されます。到達性（`online` / `last`）は backend のコレクタが **TCP プローブ + ICMP ping**（120秒間隔）で
実測して自動更新しており、`refresh` はその結果を取り直すものです。ルーター ARP 取得・SNMP メトリクス・ポートスキャンは
将来拡張で、`detail.metrics` / `services` は現時点では手動入力です（メトリクスを捏造しない方針）。

---

## API（backend）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/meta` | 件数サマリー（total / online / offline / updated_at） |
| GET | `/api/whoami` | クライアントIP（X-Real-IP / X-Forwarded-For 優先・自端末ハイライト用） |
| GET | `/api/devices` | 機器一覧 |
| GET | `/api/devices/{id}` | 機器1件 |
| POST | `/api/devices` | 追加（`id` 重複は 409、検証エラーは 422） |
| PUT | `/api/devices/{id}` | 更新（`id` は不変） |
| DELETE | `/api/devices/{id}` | 削除 |
| GET | `/api/switches` / `/api/cables` | スイッチ / ケーブル台帳（参照） |

対話的ドキュメント: backend 起動中に `http://localhost:8000/docs`（Swagger UI）。

---

## データモデル（要点・spec §3）

機器（Device）の必須フィールド: `id, name, host, ip, mac, group, type, online`。
任意: `cpu, mem, storage, conn, ring, last, uptime, notes, url`（管理画面URL・http/https のみ）と、
詳細ビュー専用の `detail`
（`net / hw / metrics / services / storage / hist7 / own`）。`group` は
`Infra | IoT | Media | Mobile | Computer | Misc`。`ip` は IPv4、`mac` は `XX:XX:XX:XX:XX:XX`、
`id` は kebab-case を検証します。

---

## ロードマップ

- **v1.0（実装済み）** ホーム（radial / spine / tree）+ 詳細の2画面、`devices.json` 読み込み、オフライン表示。
- **v1.1 編集（前倒し実装済み）** ブラウザからの追加 / 編集 / 削除と `devices.json` 書き戻し（本リポジトリ）。
- **到達性コレクタ（実装済み）** バックグラウンドで全機器を **TCP プローブ + ICMP ping フォールバック**（120秒間隔）で実測し、
  `online` / `last` を自動更新します。`detail.metrics` / `hist7` / `services`（ポートスキャン）は手動入力のままです。
- **その他 実装済み** ケーブル/スイッチ・インベントリ画面、Wake-on-LAN、カタログの import / export（バックアップ付き）。
- **将来（未実装）** ルーター ARP / DHCP リース / mDNS による自動デバイス発見、SNMP / node_exporter メトリクス、
  到達性の履歴・稼働率 SLO・ダウン通知、サブネット / VLAN（IPAM）ビュー。詳細は GitHub Issues（`[Feature/Epic]`）参照。

## 認証 / 公開について

LAN内・個人利用前提のため認証は付けていません。外部に出す場合は前段の nginx 等で Basic 認証や
内部CA（mkcert）による HTTPS を付与してください（spec §8.3）。

## ライセンス

[MIT License](LICENSE) © 2026 asiball
