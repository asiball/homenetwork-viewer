# 05. データとカスタマイズ

サンプルを自分の環境に置き換えたり、見た目やポートを変えたりする方法です。

## データはどこにある？

機器データは **1つのファイル** に入っています。

```
homenetwork-viewer/data/devices.json
```

- これが**唯一の正データ**です。バックアップを取るならこのファイル（と `data/` フォルダ）。
- 画面（UI）からの追加・編集・削除も、ここに書き込まれます。
- 初回起動時、空なら `backend/app/seed/devices.json`（サンプル22機器）が自動コピーされます。

### 2通りの編集方法

1. **画面から**（おすすめ・安全）: ブラウザの追加/編集フォーム（[04 使い方](04-usage.md#追加編集フォーム-adddidedit)）。形式チェック付き。
2. **ファイルを直接**（一括編集向き）: `data/devices.json` をテキストエディタで開いて書き換え、保存。ブラウザで **⟳ refresh**（または再読み込み）すれば反映されます（**再ビルド不要**）。

> ⚠️ 直接編集するときは **JSON の文法**（カンマ・引用符・括弧）を崩さないよう注意。保存後に画面が真っ白なら文法ミスの可能性大。エディタの JSON チェック機能や、`python3 -m json.tool data/devices.json` で検証できます。

> 🔰 **Docker で動かしていると `data/devices.json` の持ち主が `root` になり、手編集時に管理者権限を求められる**ことがあります。対処は [06 運用](06-operations.md#dataの所有者がrootで編集できない) を参照。画面からの編集だけなら気にする必要はありません。

---

## devices.json の構造

ファイルは大きく3つの配列を持ちます。

```json
{
  "devices":  [ ... 機器 ... ],
  "switches": [ ... スイッチ/ハブ（任意・参照用） ... ],
  "cables":   [ ... ケーブル台帳（任意・参照用） ... ]
}
```

### 機器（devices の1要素）

**必須**の項目と、**任意**の項目があります。

```json
{
  "id": "mbp",                         // 必須・不変。英小文字/数字/ハイフン（kebab-case）
  "name": "MacBook Pro",               // 必須・表示名
  "host": "mbp.home.arpa",             // 必須・ホスト名(FQDN)
  "ip": "192.168.1.21",                // 必須・IPv4
  "mac": "AA:BB:CC:00:15:00",          // 必須・MAC（XX:XX:XX:XX:XX:XX）
  "group": "Computer",                 // 必須・Infra|IoT|Media|Mobile|Computer|Misc
  "type": "laptop",                    // 必須・種別（router/nas/phone/laptop…自由）
  "online": true,                      // 必須・true/false

  "conn": "Wi-Fi 6 GHz",               // 任意・接続種別
  "ring": 2,                           // 任意・地図の層 0=GW /1=インフラ /2=末端
  "cpu": "Apple M3 Pro 11C",           // 任意
  "mem": "18 GB unified",              // 任意
  "storage": "512 GB SSD",             // 任意
  "last": "now",                       // 任意・最終オンライン
  "uptime": "08h 22m",                 // 任意・連続稼働
  "notes": "Work laptop. macOS 15.",   // 任意・自由メモ（改行可）

  "detail": { ... 詳細画面だけで使う追加情報（任意・後述）... }
}
```

最低限、**必須7項目 + online** さえあれば登録できます。残りは分かる範囲で。

#### `group`（カテゴリ）に使える値

`Infra` / `IoT` / `Media` / `Mobile` / `Computer` / `Misc` のいずれか。これ以外を書くと弾かれます（422 エラー）。

#### `conn`（接続種別）に使える値

`Wired 1G` / `Wired 2.5G` / `Wired 100M` / `Wi-Fi 2.4 GHz` / `Wi-Fi 5 GHz` / `Wi-Fi 6 GHz` / `—`。

#### `detail`（詳細画面用・全部任意）

詳細画面の network/hardware/ports/storage/履歴/所有情報を充実させたいときに付けます。**無くても問題ありません**（その場合は `—` 表示）。

```json
"detail": {
  "net":  { "ipv4": "192.168.1.21/24", "ipv6": "—", "gateway": "192.168.1.1", "dns": "1.1.1.1", "dhcp": "reserved", "vlan": "default", "rssi": "-52 dBm" },
  "hw":   { "cpu_full": "Apple M3 Pro 11C", "arch": "arm64", "mem_full": "18 GB unified", "chassis": "14-inch", "bios": "—" },
  "metrics": { "cpu_pct": 18, "cpu_series": [12,16,14,18], "mem_pct": 62, "mem_series": [60,61,62], "net_in": 3.2, "net_out": 0.4, "net_in_series": [1,2,3], "temp": 48 },
  "services": [ { "port": 22, "proto": "tcp", "svc": "SSH", "banner": "OpenSSH 9.0" } ],
  "storage":  { "drives": [ { "nm": "disk0", "md": "APPLE SSD", "size": "512 GB", "pct": 41 } ], "pool": "—", "health": "ok" },
  "hist7": [1.0, 1.0, 0.99, 1.0, 0.92, 1.0, 1.0],
  "own": { "manufacturer": "Apple", "model": "MacBookPro18,3", "location": "Desk", "purchased": "2024-01", "price": "¥...", "warranty": "AppleCare", "tags": ["work","critical"] }
}
```

> `metrics` や `services` は本来「自動収集」される類の値です。手で入れても表示はされますが、実測ではない点に注意。実測の自動収集は将来の拡張です。

### switches / cables（任意・参照用）

スイッチの各ポートに何がつながっているか、ケーブルの種類・長さ・色などの台帳です。詳細画面の network カードに「patch（どのスイッチの何番）」「cable」として表示されます。無くても本体は動きます。形式は `backend/app/seed/devices.json` の実例を真似るのが早いです。

---

## まるごと自分のデータに入れ替える手順

1. （保険）今の `data/devices.json` をコピーしてバックアップ。
2. `data/devices.json` を開く。
3. `"devices": [ ... ]` の中身を、自分の機器に書き換える（不要なサンプルは削除、必要な台数を追加）。
4. `switches` / `cables` は使わないなら `[]`（空）にしてOK。
5. 保存 → ブラウザを再読み込み（または **⟳ refresh**）。

迷ったら **空に近い状態から1台ずつ画面のフォームで追加**していくのが、文法ミスもなく確実です。

---

## よくあるカスタマイズ

### ポート番号を変える

`http://localhost:8080` の **8080** を変えたい、または 8080 が他で使われている場合。`docker-compose.yml` の `frontend` の `ports` を編集します。

```yaml
  frontend:
    ports:
      - "9000:80"     # ← 左を好きな番号に（例 9000）。右の 80 は触らない
```

変更後、`docker compose up -d`（再ビルド不要）。以後 `http://localhost:9000` でアクセス。

> 「左:右」は「PC側の窓口番号 : 箱の中の番号」。変えるのは**左だけ**です。

### 配色（テーマ色）を変える

見た目の色は `frontend/src/theme.css` の冒頭 `:root { ... }` にまとまっています。

```css
:root {
  --bg:    #0b0d10;   /* 背景 */
  --fg:    #d9e0e8;   /* 文字 */
  --amber: #f0b657;   /* アクセント（選択・強調） */
  --ok:    #79ddb0;   /* オンライン・正常 */
  --err:   #e87a6a;   /* オフライン・エラー */
  /* ... */
}
```

色コード（`#rrggbb`）を書き換え、**フロントは再ビルドが必要**です。

```bash
docker compose up -d --build
```

### 機器を増やす / 減らす

画面のフォーム（[04](04-usage.md)）が一番安全。一括なら `data/devices.json` を直接編集（上記）。

### サブネットやブランド名などの文言

地図の「192.168.1.0/24」「br-lan」やブランド表記は、いまは表示用に固定された文字列です。変えたい場合は該当の表示箇所（`frontend/src/components/TopologyMap.tsx`、`frontend/src/views/HomeView.tsx` など）を編集 → 再ビルド。コードを触る変更なので [06 運用](06-operations.md) の「更新の流れ」を参照してください。

---

← [04. 使い方](04-usage.md) ／ 次へ → [06. 運用とトラブルシューティング](06-operations.md)
