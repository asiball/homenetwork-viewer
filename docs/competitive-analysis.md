# 競合分析と差別化 (Competitive Analysis)

> 調査時点: 2026-06（Web調査ベース。各ツールの細部は変化しうる）。
> 目的: homenet の立ち位置を、死活監視に限らず**機器台帳・IPAM・発見・トポロジ・資産管理**の全領域で正直に評価し、
> 「続ける価値のあるニッチがあるか／アーカイブすべきか」の判断材料にする。

## 0. 結論（先に要約）

- **homenet は単機能では competitor に勝てない。** 発見・死活・トポロジ・IPAM・資産管理の**各軸には、それぞれ成熟した専用ツールが存在**する。
- **homenet の独自性は「5軸の組み合わせ ＋ 手編集できる Git-native な JSON 正本」にある。** この5つを1つで satisfy するツールは（調査範囲では）存在しない。最接近は **Homelable**。
- ただし**差別化は狭く、実行（Git-native 正本 ＋ 資産/所有の深掘り）に依存**する。トポロジ・発見・死活で competitor と正面から競うと、自動化された専用ツールの劣化版になる。
- **単一ユーザーの個人ツールとしては、市場差別化が無くても「自分の頭のモデルに完全一致し、手で編集でき、見て楽しい」ことが存続理由になりうる。** 「他人に配るプロダクト」を目指すなら差別化は弱く、アーカイブも合理的選択。

---

## 1. homenet の機能を5軸で分解

| 軸 | homenet の実装 |
|---|---|
| **A. 機器台帳（identity）** | id/name/host/**IP/MAC**/group/type を手入力。kebab-id・IPv4・MAC を検証 |
| **B. 資産/所有（ownership）** | manufacturer/model/**purchased/price/warranty**/location/tags、自作PCの cpu/gpu/storage |
| **C. 死活監視（liveness）** | collector が TCP+ICMP を120秒間隔で実測し online/last を自動更新（履歴は未保持） |
| **D. トポロジ可視化** | radial/spine/tree の3レイアウトを**手入力の ring/配線**から SVG 描画 |
| **E. データ形式** | **単一 JSON ファイルが正**。UI 編集と手編集が等価・bind-mount・アトミック書き込み |

この **A〜E を1つにまとめている**点が homenet の形。各軸を個別に見ると以下の competitor がいる。

---

## 2. 競合マッピング（カテゴリ別）

### カテゴリ① IPAM / DCIM（台帳の正本管理）
| ツール | コア価値 | homenet との差 |
|---|---|---|
| **NetBox** | IPAM＋DCIM の決定版。ラック/ケーブル/IP/VLAN を厳密モデル化、API・プラグイン豊富 | homenet が**圧倒的に軽量**。NetBox は25機器には過剰・UIが硬い・所有情報や"見て楽しい"面は弱い |
| **Nautobot** | NetBox フォーク。自動化寄り | 同上 |
| **phpIPAM** | 軽量 IPAM。サブネット使用率・IP割当 | homenet は**サブネット/空きIPの俯瞰（IPAM中核）を持たない**（→ Issue #95）。逆にトポロジ/所有/UXは homenet が上 |

→ **示唆**: 本格 IPAM は competitor の領域。homenet が IPAM を自作すると劣化クローン化。サブネット俯瞰は"軽量ビュー"に留めるべき（#95 のコメント参照）。

### カテゴリ② ネットワーク発見 / 新規デバイス検知（presence）
| ツール | コア価値 | homenet との差 |
|---|---|---|
| **NetAlertX** (旧 Pi.Alert) | **継続スキャンで自動デバイス発見**、新規/離脱の**通知**、presence 履歴、Apprise/HA連携、VLAN対応 | homenet は**自動発見が無い**（手入力が唯一の入口、→ #92）。逆に NetAlertX は所有情報/配線トポロジ/スペック台帳が弱い |
| **Fing** | スマホから即スキャン→OUI 素性判定 | homenet は永続台帳・所有情報を持つが即時スキャンの手軽さは無い |
| **nmap / arp-scan** | 生スキャン（プリミティブ） | homenet の"データソース"になりうる（自作せず取り込む対象） |

→ **示唆**: 発見は NetAlertX/nmap が成熟。homenet は**発見を再発明せず「発見結果を承認して台帳化するキュレーション層」**に徹するのが現実的（#92 の解き方）。

### カテゴリ③ トポロジ / ネットワーク図（自動生成）
| ツール | コア価値 | homenet との差 |
|---|---|---|
| **Scanopy** | **SNMP/LLDP/ARP から多VLAN・多サイトのトポロジを自動生成**（手描き不要）、自己ホスト | homenet の tree/spine は**手入力の配線/ring 依存**。自動生成に対し手間で劣る。逆に homenet は所有/スペックを併せ持つ |
| **LibreNMS** | SNMP 監視＋weathermap でトポロジ | エージェントレス自動。homenet は手動だが軽量 |
| **Homelable** ⭐ | **最接近**。nmap 発見→承認キュー→**インタラクティブ図＋ライブ死活**（ping/TCP/HTTP/SSH/Prometheus）、PNG出力、**MCPでAI連携**、公開Live View | 発見＋承認＋トポロジ＋死活＋AI を既に統合。ただし**資産/所有（保証/価格）・手編集設定ファイルは非対応**（=homenet の差別化が残る点） |

→ **示唆**: トポロジ自動生成は Scanopy/Homelable/LibreNMS が先行。homenet の手描きトポロジ（特に radial の"雰囲気"）は**プロダクト価値としては弱い**（自動化に勝てない）。Homelable は homenet の構想に酷似しており、**最も正面から競合**する。

### カテゴリ④ 死活 / アップタイム監視
| ツール | コア価値 | homenet との差 |
|---|---|---|
| **Uptime Kuma** | 定番。HTTP/TCP/DNS/ping、**履歴・SLO・90+通知（ntfy/Slack…）**、美しいUI | homenet の死活は online/last のみで**履歴/通知/SLO 無し**（→ #93/#94）。Kuma は機器台帳/スペック/トポロジは持たない |
| **Gatus** | **宣言的 YAML を Git管理**→ステータスページ生成。HTTP/TCP/ICMP/DNS/SSH/TLS | **「Git-native な設定」という homenet の差別化を、監視領域で既に実現**。ただし Gatus は監視専用で台帳/資産/IP管理は無い |
| **Beszel** | 軽量エージェントで CPU/RAM/disk/net メトリクス | homenet 非ゴール（メトリクス捏造しない方針）。直交 |

→ **示唆**: 死活/通知は Kuma が圧倒的成熟。homenet は**薄く実装し ntfy/Webhook に委譲**すべき（#94 コメント）。「Git-native」は Gatus が監視で先行している点に注意 — homenet の Git-native は**"監視設定"でなく"機器台帳"** である点が差。

### カテゴリ⑤ 家庭の資産/在庫管理（ownership）
| ツール | コア価値 | homenet との差 |
|---|---|---|
| **HomeBox** ⭐ | **家庭の物品在庫**。場所階層・**購入日/価格/保証**・シリアル・写真/領収書添付・**QR ラベル**・全文検索・**モバイルアプリ** | homenet の所有情報(B軸)を**より深く**実装。ただし HomeBox は**汎用物品**で、**IP/MAC/ネットワーク識別・死活・トポロジは対象外** |

→ **示唆**: 「資産/所有」も HomeBox という強力な専用ツールがある。homenet の優位は**"ネットワーク機器に特化した"資産台帳**（IP/MAC/死活/配線と所有が一体）である点のみ。HomeBox は物理在庫、homenet はネットワーク資産、と棲み分く。

### カテゴリ⑥ ホームラボ・ダッシュボード（参考・直交）
- **Homepage / Homer / Dashy**: サービスへのリンク集ダッシュボード。機器台帳ではない。homenet とはレイヤが違う（連携先になりうる: Homelable は Homepage に stats を出す）。

---

## 3. 「死活監視だけの競合か？」への回答

**いいえ。** 競合は死活監視に限らず、以下の**5領域すべてに存在**する:
1. IPAM/DCIM → NetBox, phpIPAM
2. 発見/presence → NetAlertX, Fing
3. トポロジ自動生成 → Scanopy, LibreNMS, **Homelable**
4. 死活/通知 → Uptime Kuma, Gatus
5. 資産/所有 → **HomeBox**

そして **Homelable** は「発見＋承認＋トポロジ＋ライブ死活＋AI(MCP)」を1つに統合しており、homenet の将来構想（#92/#93/#107 等）と**最も正面から競合**する。

---

## 4. homenet が唯一持つ組み合わせ（差別化の核）

単機能では負けるが、**次の交差点を1つで満たすツールは存在しない**:

> **「ネットワーク機器に特化した、手編集できる Git-native な JSON 正本」**
> ＝ IP/MAC 識別(A) ＋ 資産/所有(B) ＋ 軽量な実測死活(C) ＋ 台帳の可視化(D) を、
>   **DB ではなく人間が読める1枚の JSON** で持つ。

- competitor は**ほぼ全て DB（不透明）**。homenet の「git diff できる・PR でレビューできる・手で直せる正本」は IaC/homelab 文化に刺さる**唯一の強み**（Gatus が監視領域で近いが、台帳ではない）。
- **HomeBox は物品**、**NetBox は重い**、**NetAlertX/Homelable は発見・トポロジ特化で所有が薄い**。この三角形の中央（軽量・ネットワーク特化・資産も持つ・テキスト正本）が空白。

---

## 4.5. 最接近の競合 Homelable との精密比較（追記）

> 追加調査（2026-06、Homelable v2.5.0 / 2.1k★ / MIT / 単一メンテナだが活発）で判明した正確な事実に基づく。
> 当初の「Homelable は所有/スペックが薄い」という見立ては**一部誤り**だったため補正する。

### Homelable は当初の見立てより近い（正確な事実）
- ノードスキーマに **`mac` / `services` / `cpu_count` / `cpu_model` / `ram_gb` / `disk_gb` / `os` / `notes` / `properties`** を持ち、**MCP の `create_node`/`update_node` で AI から編集可能**。つまり「スペックを持たない単なる図」ではなく、CPU/RAM/Disk/MAC を記録する。
- **自動発見（nmap -sV）→ 承認キュー**、**多彩な死活**（ping/TCP/HTTP/SSH/Prometheus/health、ノード毎に方式選択）、**Zigbee2MQTT 取込**、**Home Assistant 連携（HACS）**、**MCP/AI**、**公開 Live View**、**PNG 出力**。homenet が「将来」として Issue 化した機能（#92/#93/#94/#100 等）の多くを**既に実装済み**。

### それでも Homelable に「無い」＝ homenet だけができること（確度順）
1. **手編集できるテキスト正本 ＋ Git 運用** — Homelable はバックエンドDB（手編集可否の明記なし）で、**構造化エクスポートは PNG（図）のみ**が言及。homenet の `devices.json` は **人が直接編集でき・`git diff`/PR でレビューでき・テキストでバックアップできる**。これが最も堅い差。
2. **所有/資産/財務の管理** — Homelable のスキーマに **manufacturer / model / purchased / price / warranty / location** は**無い**（cpu/ram/disk の"性能"はあるが"所有"は無い）。homenet は「いつ買った・いくら・保証はいつ切れる・どこにある」を答えられる。**Homelable は資産管理ツールではない**。
3. **自作PCのパーツ詳細と構成履歴** — homenet は GPU/マザボ/ドライブ単位（＋ #97 の Part/構成変更履歴・保証切れアラート）。Homelable は `cpu_model/ram_gb/disk_gb` 止まりで PC ビルド志向ではない。
4. **「人が意図を書く台帳/ドシエ」＋ 引き継ぎ用テキスト出力** — Homelable は canvas（図）中心・自動発見中心。homenet は per-device のスペック/所有/サービス/ストレージの**仕様書**で、#113 の Markdown/HTML 引き継ぎ資料に発展できる。
5. （非市場的だが実在）**自分のコードで完全に手の内** — 学習・改造・所有の楽しさ。

### 逆に Homelable が明確に上回る点
自動発見・自動トポロジ・死活の多様さ・Zigbee・MCP/AI・HA 連携・成熟度（2.1k★・活発）。**「発見して・自動で図にして・監視する」が主目的なら Homelable が決定的に優位**。

### 結論（homenet vs Homelable）
- **発見・可視化・監視が主目的** → Homelable を採用し homenet をアーカイブするのが合理的。homenet が追いつくには #92/#93/#94/#100 等の重い実装が必要で、しかも追いついても"後発の同等品"にしかならない。
- **「手編集できる Git 正本」＋「所有/保証/自作PC資産の台帳」に価値を感じる** → そこは Homelable が踏んでいない空白で、homenet を **(1)テキスト正本 (2)資産/所有 (3)自作PCパーツ** に一点集中させれば存在意義がある。
- **折衷（補完運用）** → 発見・監視・トポロジは Homelable に任せ、homenet を**「資産/所有レジスタ＋Git正本」**として併用（将来 Homelable の MCP/API から機器を取り込み、homenet 側で所有情報を付与する形もありうる）。

---

## 5. 正直な評価とアーケイブ判断

### 差別化は「ある。ただし狭く、執行依存」
- **勝てる土俵**: (a) Git-native な手編集 JSON 正本、(b) ネットワーク機器の所有/自作PC資産の深掘り、(c) 発見結果を"承認して意味づけ"するキュレーション体験。
- **勝てない土俵**: トポロジ自動生成（Scanopy/Homelable）、死活監視の成熟度（Uptime Kuma）、本格 IPAM（NetBox）、汎用資産（HomeBox）。ここで競うと再発明・劣化版になる。

### 判断の分岐
- **「他人に配るプロダクト」を目指すなら**: 差別化は弱い。特に Homelable が近い。明確な勝ち筋（上記 a/b/c に全振り）が描けないなら、**アーカイブは合理的**。少なくとも「トポロジ自動生成や本格監視で勝とう」とするのは非推奨。
- **「自分用の個人ツール」として続けるなら**: 市場差別化は**そもそも不要**。「自分の頭の中のネットワーク像に完全一致」「手で JSON を直せる」「見て楽しい NOC UI」「作る/育てる楽しさ」自体が十分な存続理由。この場合は competitor を気にせず、コア体験（10秒で引ける・手編集・所有管理）だけ磨けばよい。

### 推奨スタンス
1. **当面は「自分用ツール」として割り切る** — competitor 追従（発見/監視/トポロジ自動化）に資源を割かない。
2. もし公開・配布に踏み出すなら、ポジショニングを **「Git で管理できる、ネットワーク機器に特化した軽量資産台帳」** に**一点集中**（差別化 a/b/c）。発見・死活・トポロジは「薄く・委譲・取り込み」に徹し、専用ツールと棲み分ける。
3. **アーカイブ判断の基準**: 上記 a/b/c に魅力を感じない／自分でも使っていない、なら畳む。逆に「手編集 JSON の台帳が自分に刺さる」なら、competitor の有無に関わらず続ける価値がある。

---

## 付録: 参照した主な competitor

| ツール | 種別 | URL |
|---|---|---|
| NetBox | IPAM/DCIM | https://github.com/netbox-community/netbox |
| phpIPAM | IPAM | https://phpipam.net/ |
| NetAlertX (Pi.Alert) | 発見/presence | https://github.com/jokob-sk/NetAlertX |
| Fing | 発見(モバイル) | https://www.fing.com/ |
| Scanopy | トポロジ自動生成 | https://github.com/scanopy/scanopy |
| LibreNMS | 監視+トポロジ | https://www.librenms.org/ |
| Homelable | 発見+トポロジ+死活+MCP（最接近） | https://github.com/Pouzor/homelable |
| Uptime Kuma | 死活/通知 | https://github.com/louislam/uptime-kuma |
| Gatus | Git管理の死活 | https://github.com/TwiN/gatus |
| Beszel | メトリクス | https://github.com/henrygd/beszel |
| HomeBox | 家庭資産/在庫（最接近） | https://github.com/sysadminsmedia/homebox |
