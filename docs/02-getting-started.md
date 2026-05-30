# 02. セットアップと起動

このページの通りに進めれば、homenet をゼロから起動してブラウザで開けます。所要時間は **初回 10〜20 分**（ほとんどはダウンロード待ち）です。

## 全体の流れ

```
1) Docker を入れる  →  2) コードを手元に置く  →  3) 1コマンドで起動  →  4) ブラウザで開く
```

---

## ステップ1: Docker をインストールする

homenet を動かすには **Docker** が必要です（[01 概要](01-overview.md#どうやって動かすのdocker) の「冷凍弁当を温めるレンジ」です）。

### Windows / macOS の場合 — Docker Desktop

1. ブラウザで **「Docker Desktop ダウンロード」** を検索し、公式サイト（docker.com）から自分のOS用をダウンロード。
2. インストーラを実行し、画面の指示に従う（基本は「次へ」を押すだけ）。
3. インストール後、**Docker Desktop を起動**する。タスクバー/メニューバーのクジラのアイコン 🐳 が「Running（実行中）」になればOK。
   - Windows では初回に「WSL2 を有効化してください」と出ることがあります。表示される案内に従ってください（Windows の Linux 実行機能で、Docker が使います）。

### Linux の場合 — Docker Engine

ディストリビューションの公式手順で `docker` と `docker compose` プラグインを入れます（例: Ubuntu なら docker.com の「Install Docker Engine on Ubuntu」）。

### 入ったか確認する

ターミナル（Windows は PowerShell、Mac は「ターミナル」アプリ）を開いて、次を打ちます。

```bash
docker --version
docker compose version
```

それぞれバージョン番号が表示されれば成功です。エラーが出る場合は Docker Desktop が起動しているか確認してください。

> 🔰 **ターミナルとは？** 文字でコマンドを打ってパソコンに指示する黒い画面のことです。Windows は「PowerShell」または「ターミナル」、Mac は「ターミナル」、Linux は「端末」。

---

## ステップ2: コードを手元に置く

homenet 一式（このリポジトリ）を自分のパソコンに置きます。方法は2つ。

### 方法A: git で取得（おすすめ）

`git` が入っているなら、ターミナルで:

```bash
git clone <このリポジトリのURL> homenetwork-viewer
cd homenetwork-viewer
```

`<このリポジトリのURL>` は GitHub のページにある緑の「Code」ボタンから取得できます。

### 方法B: ZIP でダウンロード

GitHub のページの「Code」→「Download ZIP」で zip を落とし、好きな場所に展開し、ターミナルでそのフォルダに移動します（`cd 展開したフォルダ`）。

> 🔰 `cd` は「change directory（フォルダを移動）」の意味。`cd homenetwork-viewer` で、そのフォルダの中に入ります。以降のコマンドは**このフォルダの中**で打ちます。

---

## ステップ3: 起動する

フォルダの中（`docker-compose.yml` がある場所）で、次の **1コマンド**を打ちます。

```bash
docker compose up -d --build
```

初回は部品のダウンロードと組み立て（ビルド）で数分かかります。`✔ Container homenet-backend Healthy` のような表示が出て、プロンプトが戻ってくれば起動完了です。

- `up` … サービスを起動する
- `-d` … バックグラウンドで動かす（ターミナルを閉じても動き続ける）
- `--build` … 最初に箱（イメージ）を組み立てる

うまくいったか確認:

```bash
docker compose ps
```

`backend` と `frontend` の2つが表示され、`frontend` が `running`、`backend` が `healthy` ならOKです。

---

## ステップ4: ブラウザで開く

ブラウザのアドレス欄に次を入力して開きます。

```
http://localhost:8080
```

homenet のホーム画面（ネットワークの地図）が表示されれば成功です！🎉

最初は**サンプルの22機器**が入っています。これは自由に編集・削除して、自分の機器に置き換えられます（→ [05 データとカスタマイズ](05-data-and-customize.md)）。

> 🔰 **`localhost` とは？** 「このパソコン自身」を指す住所です。`:8080` は「8080番の窓口」という意味（→ [用語集: ポート](07-glossary.md)）。つまり「自分のPCの8080番窓口を開く」という指示です。

### 同じ家の別の端末（スマホ・別PC）から開く

homenet を動かしているPCの **IP アドレス**が分かれば、同じ Wi‑Fi/LAN の別端末からも開けます。

```
http://<homenetを動かしているPCのIP>:8080      例) http://192.168.1.22:8080
```

PC の IP は、Windows は `ipconfig`、Mac/Linux は `ifconfig` または `ip addr` で確認できます（`192.168.x.x` のような値）。

---

## 止める・また始める

```bash
docker compose stop     # 一時停止（データはそのまま）
docker compose start    # 再開
docker compose down     # 停止して片付け（データ data/ は残る）
```

> 運用（自動起動・更新・バックアップなど）の詳しい話は [06 運用とトラブルシューティング](06-operations.md) にあります。

---

## うまくいかないとき（最初のチェック）

| 症状 | まず確認すること |
|---|---|
| `docker: command not found` | Docker が未インストール、または Docker Desktop が未起動。ステップ1へ。 |
| 画面が出ない / つながらない | `docker compose ps` で2つとも動いているか。`http://localhost:8080`（`https` ではない）か。 |
| `port is already allocated` | 8080番を他のアプリが使用中。[05](05-data-and-customize.md#ポート番号を変える) でポート変更。 |
| 一瞬エラー→更新で直る | backend 起動直後の一時的なもの。数秒待ってブラウザを再読み込み。 |

詳しくは [06 運用とトラブルシューティング](06-operations.md#トラブルシューティング) を参照してください。

---

← [01. 概要](01-overview.md) ／ 次へ → [03. アーキテクチャ](03-architecture.md)
