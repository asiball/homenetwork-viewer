# homenet — 家庭ネットワーク機器カタログ 仕様書

| | |
|---|---|
| **document** | 仕様書 (engineering brief) |
| **version** | 1.0 |
| **date** | 2026-05-19 |
| **status** | design complete / ready to implement |
| **scope** | 1 dev · 1 user · ~25 devices |
| **related** | `Home Network Explorer.html`（デザイン検討用キャンバス） |

> **このファイルについて** — これは実装エージェント／開発者向けの正本仕様書です。
> 人間がレンダリングして眺めるための同内容ファイルが `spec/Specification.html` にあります。
> 図版（SVG）は本MDではテキスト記述に置き換えています。意味が変わらない限りMDを正とします。

自宅LAN配下の機器を一覧・調査するための単体Webアプリケーション。個人利用、ブラウザ表示、ローカルホスト or 家庭内サーバー配信を想定。

---

## 目次

1. [概要 — objective & scope](#1-概要)
2. [画面構成 — screen map](#2-画面構成)
3. [データモデル — data model](#3-データモデル)
4. [データ取得方針 — polling strategy](#4-データ取得方針)
5. [ホーム画面 — home screen](#5-ホーム画面)
6. [詳細ビュー — detail screen](#6-詳細ビュー)
7. [デザインシステム — design tokens](#7-デザインシステム)
8. [技術構成 — recommended stack](#8-技術構成-推奨)
9. [ファイル構成 — file layout](#9-ファイル構成)
10. [受け入れ条件 — definition of done](#10-受け入れ条件-dod)
11. [拡張余地 — future work](#11-拡張余地)

---

## 1. 概要

### 1.1 目的

自宅のローカルネットワーク（`192.168.1.0/24` を想定）に接続している機器のIPアドレス・MACアドレス・ホスト名・ハードウェアスペック・所有情報をブラウザから一覧・参照できるリファレンスサイト。

日常的に発生する「これって何のIP?」「あのMacのRAMいくつだっけ?」を **10秒以内** に解消することを目的とする。

### 1.2 利用者と利用環境

- 利用者: 自分 1名 (admin)。マルチユーザーは考慮しない。
- 主環境: デスクトップブラウザ (1280×800以上)。サブ環境: iPad / iPhone。
- 配信: 家庭内サーバー (Raspberry Pi or NAS) からLAN内へ。インターネット公開しない。
- 認証: ローカル前提のため当面不要。Basic認証を簡易にかけるのは可。

### 1.3 主要シナリオ

1. 帰宅後ふと機器を見て「これ何だっけ」 → ホーム画面でノードクリック → 右パネルで即把握。
2. 新しいIoT機器を購入 → 編集フォーム (v1.1スコープ) で登録。
3. トラブル時、特定機器の履歴・開放ポート・メモを確認 → 詳細ビューへ遷移。

### 1.4 非ゴール

- マルチユーザー、ロール、共有リンク。
- 毎秒更新のリアルタイム監視ダッシュボード。
- パケット解析・侵入検知・脆弱性スキャン。
- クラウド連携（Home Assistant等との連携は v3 以降スコープ）。

---

## 2. 画面構成

v1.0 では以下の **2画面のみ**。編集機能は v1.1 でフォームを追加する。

```
[ HOME · TOPOLOGY MAP ]  --click node-->  [ DETAIL · 1 DEVICE ]
        ^                                          |
        +---------------- back to map -------------+
```

| id | 画面 | 用途 | バージョン |
|---|---|---|---|
| `/home` | トポロジーマップ + サマリー | 全体把握。日常使い。 | **必須 (v1.0)** |
| `/d/:id` | 詳細ビュー | 1台を深掘り。ポート・履歴・所有情報。 | **必須 (v1.0)** |
| `/d/:id/edit` | 編集フォーム | 機器情報を手動で書き換え。 | v1.1 |
| `/add` | 機器追加 | 新規機器の登録。 | v1.1 |

> 補足: デザイン検討段階で「ケーブル & スイッチ・インベントリ」ビュー（ポート単位の可視化＋ケーブル台帳）も試作済み（`src/view-cables.jsx`）。v1.0 のコア要件ではないが拡張候補として残す。

---

## 3. データモデル

データはJSONファイル `devices.json` で管理する (v1.0)。ファイルは手動編集 or 編集フォーム経由で書き換える。

> 📌 実装メモ（v1.1+）: 永続化は **SQLite（`homenet.db`）** に移行済み。人が書く静的カタログ（devices/switches/cables）と機械が書く到達性状態（online/last）をテーブル分離し、スキーマは `PRAGMA user_version` のマイグレーションで進化する。**JSON は import/export の交換形式として継続**し、本章のデータ構造はそのまま export/import 形式となる。一括編集は「export → JSON 編集 → import」で行う。

自動取得した値とユーザー編集した値を区別するため、各値は `{ value, source, updated_at }` の形で保持する方針（v1.1で導入）。**v1.0はフラットな値で良い。**

### 3.1 Device — 必須フィールド

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ● | 不変識別子。kebab-case。例 `nas` |
| `name` | string | ● | 表示名 (短く)。例 `NAS` |
| `host` | string | ● | FQDN。例 `nas.home.arpa` |
| `ip` | string | ● | IPv4。`x.x.x.x` 形式。 |
| `mac` | string | ● | MACアドレス。`XX:XX:XX:XX:XX:XX` |
| `group` | enum | ● | `Infra \| IoT \| Media \| Mobile \| Computer \| Misc` |
| `type` | string | ● | 機器種別。`router \| ap \| nas \| phone \| laptop \| desktop \| tv \| console \| speaker \| camera \| hub \| printer \| reader \| wearable` 等。アイコン選択に使用。 |
| `online` | boolean | ● | 最新スキャン時のオンライン状態。 |

### 3.2 Device — 任意フィールド（スペック・ネットワーク）

| キー | 型 | 説明 |
|---|---|---|
| `cpu` | string | 例 `Apple M3 Pro 11C` |
| `mem` | string | 例 `16 GB DDR4-3200` |
| `storage` | string | 例 `4 × 8 TB HDD · RAID5` |
| `conn` | enum | `Wired 1G \| Wired 2.5G \| Wired 100M \| Wi-Fi 2.4 GHz \| Wi-Fi 5 GHz \| Wi-Fi 6 GHz \| —` |
| `ring` | `0 \| 1 \| 2` | radialレイアウト用。0=Gateway, 1=Infra, 2=末端。 |
| `last` | string | 最終オンライン時刻。`now` or 相対時刻。 |
| `uptime` | string | 起動からの経過。`47d 12h` 等。 |
| `notes` | string | 自由記述。Markdown非対応 (v1.0)。 |

### 3.3 DetailData — 詳細ビュー専用（任意）

各機器の詳細ビューでのみ参照する追加情報。サブオブジェクトとして格納する。

```jsonc
{
  "net":  { "ipv4": "", "ipv6": "", "gateway": "", "dns": "", "dhcp": "", "vlan": "", "rssi": "" },
  "hw":   { "cpu_full": "", "arch": "", "mem_full": "", "chassis": "", "bios": "" },
  "metrics": {
    "cpu_pct": 18, "cpu_series": [],
    "mem_pct": 62, "mem_series": [],
    "net_in": 3.2, "net_out": 0.4, "temp": 48
  },
  "services": [
    { "port": 22, "proto": "tcp", "svc": "SSH", "banner": "OpenSSH 9.0" }
  ],
  "storage": { "drives": [], "pool": "", "health": "" },
  "hist7": [ 1.0, 1.0, 0.99, 1.0, 0.92, 1.0, 1.0 ],
  "own": { "manufacturer": "", "model": "", "purchased": "", "price": "", "warranty": "", "location": "", "tags": [] }
}
```

> **取り扱いの原則:** 詳細データは「無いのが普通」。すべてのフィールドは optional とし、**欠損時のレンダリングを必ず定義する**（§6.4）。

---

## 4. データ取得方針

家庭内LANで「実機・サーバー側どちらも軽い」ことを優先する。リアルタイム描画は **個別機器の詳細を開いている間のみ** 許可し、それ以外は5分間隔のバッチ収集に留める。

### 4.1 階層化されたポーリング

| tier | 取得元 | 間隔 | 取得項目 | 負荷 |
|---|---|---|---|---|
| `T1` | ルーター ARP テーブル | 5 min | IP / MAC / オンライン | ほぼ 0（API 1呼び出し） |
| `T2` | 各機器へ ICMP ping | 5 min | 到達性確認 | 1機器あたり1pkt / 5min |
| `T3` | SNMP / node_exporter | 5 min | CPU・メモリ・帯域 | agent設置機器のみ |
| `T4` | 同上（詳細表示中のみ） | 2 s | CPU/メモリ/帯域 (live) | 1機器のみ・閲覧中のみ |
| `T5` | nmap（手動実行のみ） | on demand | 開放ポート | 明示的に「scan」を押した時のみ |

> **判断:** 通常表示は T1 + T2 で十分。T3 はラックのNAS・mini PC等「自分が管理する」機器に限定。IoT機器に対するメトリクス取得は **しない**（機器側に負荷をかけない & そもそも取れない）。

### 4.2 ユーザー編集との競合

ユーザーがUI上で書き換えたフィールドは `source: 'user'` としてマーク。バックグラウンドの自動取得は `source: 'auto'` の値しか上書きしない。`name`, `notes`, `own.*`, `tags` は基本的に **user-only**。

### 4.3 UI上の表現

- ヘッダー右に現在のポーリング間隔と「次回スキャンまで」を表示。
- `manual` モード時はメーターを止め「last scan 11:42 JST」のみ。
- `live` モード時のみスパークラインがティック更新。**デフォルトは 5min**。

---

## 5. ホーム画面

### 5.1 レイアウト構造

5領域構成: **header / list (left) / map (center) / detail summary (right) / footer**。

```
┌──────────────────────────────────────────────────────────────┐
│ ● HOMENET / NOC        ⊙radial ─spine  poll·5min  up 21/24  ⟳ │  header ~44px
├────────────┬───────────────────────────┬─────────────────────┤
│ DEVICE     │      TOPOLOGY MAP         │   DETAIL SUMMARY     │
│ LIST       │   (radial or spine)       │  - identity         │
│ (220px)    │                           │  - network/hardware │
│  group別   │        ◉ gateway          │  - notes preview    │
│            │       /│\                  │   [ 詳細を見る → ]   │
│ (320px相当)                            │   (320px)            │
└────────────┴───────────────────────────┴─────────────────────┘
```

### 5.2 マップ: 2つのレイアウト

v1.0 は **radial** と **spine** の2種類のみを実装する（検討時の tree / grid はボツ）。ヘッダー内のトグルボタンで瞬時に切り替えできること。

- **① radial / 放射** — gateway を中心に同心円リング状にノードを配置。`ring` (0/1/2) で半径を決める。全体把握と雰囲気重視。個人用ダッシュボード向き。
- **② spine / 水平バス** — 中央に水平のバス線 (`br-lan`) を引き、gateway を左端に、AP/NAS等のインフラを縦に分岐、カテゴリ機器をバスの上下に配置。ネットワーク図らしさがあり、人に説明・ケーブル点検する用途向き。

### 5.3 ヘッダー

- 左: `● HOMENET / NOC` ブランドラベル + パンくず（`net 192.168.1.0/24 · iface br-lan · layout {…}`）。
- 右: **レイアウト切替トグル**（radial / spine）、ポーリング状態、オンライン台数（`up 21/24`）、手動スキャンボタン（`⟳ scan`）。
- 高さ: 約 44px。背景は `--bg-2`、下線 `--rule`。

### 5.4 左サイドバー — 機器リスト

- 幅 220px。カテゴリ (group) ごとにグループ化、見出しは小さなキャプション。
- 各行: **ステータスドット (7px)** · 機器名 · IP末尾オクテット (`.10`)。
- 選択中: 背景濃く + 左端に2pxのアンバーアクセント、機器名はアンバー色。
- クリックでマップ・右パネル両方を同期更新。

### 5.5 右パネル — サマリー

- 幅 320px。マップを残したまま選択機器の概要を表示する。
- 4ブロック: **identity / network / hardware / notes**。各ブロックはラベル付きの枠 (1px dashed)。
- 下部に **「詳細を見る →」** ボタンを置き、詳細ビューへ遷移。

### 5.6 インタラクション

| 操作 | 対象 | 結果 |
|---|---|---|
| click | ノード or リスト行 | 選択を更新。マップにパルス。右パネル差し替え。 |
| click | レイアウトトグル | マップを radial ⇄ spine でクロスフェード遷移 (200ms)。 |
| click | ⟳ scan ボタン | 即時スキャンを発火。ボタンに進行スピナー。 |
| click | 「詳細を見る」 | `/d/:id` へ遷移。 |
| hover | ノード | 軽くハイライト。ツールチップで `name + ip`。 |
| keydown | `↑↓` | リスト内の選択移動。 |
| keydown | `Enter` | 選択中の機器の詳細ビューへ遷移。 |

---

## 6. 詳細ビュー

### 6.1 構成

NOCシェル（ヘッダー・左リスト・フッター）を保持しつつ、中央エリアをマップから「機器ドシエ」に置換する。

### 6.2 セクション

| セクション | 内容 |
|---|---|
| identity row | カテゴリ (eyebrow) / 機器名 (28px monospace) / ホスト名 · IP · MAC を `·` 区切りで一行。右端にステータスバッジ列（`ONLINE / OFFLINE`、リンク種別、`live agent`）。 |
| stat row × 4 | CPU負荷 · メモリ · 帯域 · 稼働時間。各カードに数値・単位・スパークライン (12点)・補足キャプション。データなし時は `—`。 |
| network | ipv4 / ipv6 / mac / link / gateway / dns / dhcp / vlan / rssi（該当時のみ）。`dl` 2カラム。 |
| hardware | cpu (詳細) / arch / memory / chassis / firmware。 |
| services | テーブル: port / proto / service / banner。下部に `last scan` 時刻と件数。 |
| storage | 各ドライブ行: name · size / model / 使用率メーター / %。下部に pool 構成・health。 |
| connection | 過去7日間の縦棒ヒストグラム。95%超え=ok / 70%超え=warn / それ未満=err。 |
| ownership | maker / model / location / purchased / price / warranty。下部に編集可能なタグ列。 |
| notes | 2カラム幅 (full)。`white-space: pre-wrap` で長文表示。最終編集日表示。 |

### 6.3 サイズ規定

- キャンバス: 1280×900 を基準とする（スクロール許容）。
- identity row 高 ≈ 90px、stat row 高 ≈ 110px、グリッドカード最低高 ≈ 130px。
- カードの内側余白は 14–16px。グリッドのギャップは 12px。

### 6.4 欠損時の表示ルール

> **原則:** 取得できない値は **無理に推測しない**。`—` または `no agent / offline` と書く。**空欄禁止。**

| シナリオ | 表示 |
|---|---|
| 機器がオフライン | stat row全て `—` + `last online {…}` サブテキスト |
| SNMP / agent未設置 | CPU/メモリスパークラインを `no agent` に置換 |
| ポートスキャン未実施 | `no scan data · run port scan to populate` |
| 所有情報未登録 | 各フィールドに `—`、タグ行に `+ add` プレースホルダー |

---

## 7. デザインシステム

### 7.1 カラー (NOC theme)

| token | value | 用途 |
|---|---|---|
| `--bg` | `#0b0d10` | ベース背景 |
| `--bg-2` | `#11141a` | ヘッダー・パネル背景 |
| `--bg-3` | `#161a22` | 選択行・メーター背景 |
| `--fg` | `#d9e0e8` | 本文 |
| `--fg-soft` | `#8a93a0` | サブ情報 |
| `--fg-faint` | `#525a66` | ラベル・キャプション |
| `--rule` | `#1d222b` | 境界線 |
| `--rule-2` | `#2a313d` | カード境界 |
| `--amber` | `#f0b657` | アクセント（選択・強調） |
| `--ok` | `#79ddb0` | オンライン・正常 |
| `--warn` | `#f0b657` | 警告（= amber と同色） |
| `--err` | `#e87a6a` | オフライン・エラー |

### 7.2 タイポグラフィ

- UI: `JetBrains Mono` 400/500/600。全UIラベル・本文ともmonospaceで統一。
- 本文サイズ: 10.5–11px。データ表示: 11–14px（機器名は 15–24px）。
- letter-spacing: ラベルは 0.06–0.14em で広く取る。本文は 0.02–0.04em。
- uppercaseはラベル類のみ。本文はそのまま。

### 7.3 スペーシング / ボーダー

- 4px grid。`4 / 8 / 12 / 14 / 18 / 22 / 28` をよく使う。
- border-radius: 基本 `2px`（角を立てる）。ピル類のみ `0`。
- border: 全て `0.75–1px`。点線は `2 3` または `2 4`。

### 7.4 構成要素

| 要素 | 仕様 |
|---|---|
| panel | 1px solid `--rule-2`。`data-title` 属性をラベルとしてカード上端に描画。 |
| pill | 9px monospace · 2px 6px padding · 1px border · uppercase。状態色は `.on / .off`。 |
| meter bar | 高さ 4–6px。fill 色は `--amber` (cpu)、`--ok` (mem)、85%超は `--err` に変色。 |
| sparkline | 88×24px。stroke 1px + area opacity 0.08。stroke色はメトリクス種で切替。 |
| dl | 2カラムグリッド。`dt` uppercase ラベル、`dd` monospace 値。 |

---

## 8. 技術構成 (推奨)

### 8.1 フロントエンド

- 静的サイト。**Vite + React + TypeScript** を推奨。
- SVGはすべてインライン（アイコンライブラリ不使用）。
- 状態管理は React state + URL（`/d/:id?layout=spine`）のみで十分。
- データソース: `public/devices.json` を fetch。

### 8.2 バックエンド (v1.1 以降)

- 軽量サーバー: **Go (Echo / Chi)** または **Python (FastAPI)**。
- ARP取得: SSHでルーターに入り `arp -a` をパース、もしくは OpenWrt の RPC API。
- ping: GoroutineまたはasyncIOで並列。タイムアウト 1秒。
- SNMPは `gosnmp` / `pysnmp`。
- データ永続化は SQLite で十分。`devices`, `history` の2テーブル。

### 8.3 配信 / 認証

- RPi or NAS 上に `nginx` でリバースプロキシ。
- HTTPはLAN内のみ。`auth_basic` を簡易にかける。
- HTTPSは内部CA (mkcert等) を使う or 不要（LAN内割り切り）。

---

## 9. ファイル構成

本仕様書と同梱されているデザインファイル一式は以下の通り。実装時はこれらを **参考実装** として読む。

```
/
├── README.md                          # プロジェクトの道標（人間＋エージェント向け）
├── Home Network Explorer.html         # デザイン検討用キャンバス (entry)
├── .design-canvas.state.json          # キャンバスの配置状態（entryと同階層必須）
│
├── spec/
│   ├── homenet-spec.md                # ★ この仕様書（エージェント向け・正本）
│   └── Specification.html             # 同内容の人間向けレンダリング版
│
└── src/                               # デザイン検討用 React/JSX コンポーネント
    ├── design-canvas.jsx              # 検討用キャンバスの骨組
    ├── tweaks-panel.jsx               # tweaksパネル（検討時のみ）
    ├── data.jsx                       # サンプルデータ（22機器）
    ├── variant-noc.jsx                # ★ ホーム画面 (radial + spine)・採用案
    ├── view-detail.jsx                # ★ 詳細ビュー・採用案
    ├── view-cables.jsx                # ケーブル/スイッチ・インベントリ（拡張候補）
    └── reference/                     # 不採用の参考案（実装しない）
        ├── variant-atelier.jsx        # 参考案 A
        └── variant-card.jsx           # 参考案 C
```

> ★ = 製品として採用する方向のビュー。実装時はまず `src/variant-noc.jsx`（ホーム）と `src/view-detail.jsx`（詳細）を読むこと。`src/reference/` は採用しない比較案なので参照不要。

---

## 10. 受け入れ条件 (DoD)

### v1.0 として最低限満たすべき条件

1. `devices.json` を読み込み、22件以上の機器を破綻なくマップに表示できる。
2. radial と spine の両方が実装され、ヘッダーから切り替えできる。
3. ノードをクリックすると右パネルが該当機器の情報に切り替わる。
4. 「詳細を見る」から詳細ビュー (`/d/:id`) に遷移できる。
5. 詳細ビューの8セクション（identity / 4stats / 6cards / notes）がデータの濃淡に対応して破綻なく描画される。
6. オフライン機器のスタイルが明確に区別される（枠色・パルスなし・stat `—`）。
7. 1280×800 以上のデスクトップブラウザで横スクロールが発生しない。
8. iPad縦 (820px幅) で「左リストを格納できる」状態で破綻しないこと（v1.0 は格納UIまで実装、サイドバー自体は閉じる動作）。

### v1.1 で追加

1. 機器の追加 / 編集 / 削除フォーム。
2. `devices.json` の自動書き戻し（バックエンド経由）。
3. ARP / ping によるT1+T2のバックグラウンド収集。

---

## 11. 拡張余地

- **サブネット / VLANビュー**: spine上に複数バスを縦に並べる派生レイアウト。
- **OUIによるメーカー自動判定**: MACの先頭24bitから機器メーカー名を引く。
- **履歴ページ**: 機器ごとに30日分のオンライン率・IP変動を表示。
- **通知**: 重要機器（タグ=critical）が N 分以上オフラインなら自分にpush。
- **Home Assistant連携**: 状態のクロスチェック・自動化トリガー。
- **パケット集計**: ルーターのNetFlowを活用したトラフィックグラフ（機器ごと）。
- **テーマ切替**: NOC dark 以外にライト (Atelier) を後付け可能（CSS変数で完結）。

---

*homenet · spec v1.0 · end of document · 2026-05-19*
