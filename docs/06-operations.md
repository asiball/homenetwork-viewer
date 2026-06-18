# 06. 運用とトラブルシューティング

長く使うための操作と、困ったときの対処をまとめます。コマンドは**リポジトリのフォルダ内**（`docker-compose.yml` がある場所）で実行してください。

## 日常の操作

| やりたいこと | コマンド |
|---|---|
| 起動（初回・更新後） | `docker compose up -d --build` |
| 起動（変更なし） | `docker compose up -d` |
| 一時停止 | `docker compose stop` |
| 停止して片付け（データは残る） | `docker compose down` |
| 再開 | `docker compose start` |
| 状態を見る | `docker compose ps` |
| ログを見る（追跡） | `docker compose logs -f` |
| backend だけのログ | `docker compose logs -f backend` |

> `-d` は「バックグラウンドで動かす」。付けるとターミナルを閉じても動き続けます。`logs -f` は `Ctrl + C` で表示だけ終了（サービスは止まりません）。

## PC 起動時に自動で立ち上げる

`docker-compose.yml` の各サービスには `restart: unless-stopped` が付いているので、**Docker が起動していれば** homenet も自動復帰します。あとは Docker 自体を自動起動にすればOK:

- **Windows / macOS**: Docker Desktop の設定で「Start Docker Desktop when you sign in（サインイン時に起動）」を有効化。
- **Linux**: `sudo systemctl enable docker`。

## 更新の流れ（コードを直したとき）

`devices.json`（データ）を変えただけなら**再ビルド不要**（ブラウザ更新だけ）。一方、**コードや設定（theme.css・compose・Dockerfile など）を変えたとき**は箱を作り直します。

```bash
git pull               # 最新を取得（git 運用している場合）
docker compose up -d --build   # 作り直して再起動
```

不要になった古いイメージを掃除したいとき:

```bash
docker image prune -f
```

## バックアップと復元

守るべきは **`data/` フォルダ（中の `homenet.db`）** だけです。データは SQLite データベースに入っています。

おすすめは、画面右下の **⇩ export** で JSON を書き出しておく方法です（人が読める・他環境へ持ち運べる）。戻すときは **⇧ import**（全置換・取り込み前にサーバ側で自動バックアップ）。

ファイルを直接コピーしてバックアップすることもできます:

```bash
# バックアップ（DB ファイルを日付つきでコピー）。停止中に取るのが最も安全です。
docker compose stop backend
cp data/homenet.db data/homenet.backup-$(date +%Y%m%d).db
docker compose start backend

# 復元（停止 → 差し替え → 起動）
docker compose stop backend
cp data/homenet.backup-YYYYMMDD.db data/homenet.db
docker compose start backend
```

> 補足: import の度にサーバ側でも `homenet.db.bak-<時刻>` が `data/` に最大5世代まで自動保存されます。
> `data/` ごと別の保存先（クラウドストレージや外付け）にコピーしておけば万全です（IP/MAC など自宅情報が含まれる点に留意）。

## 同じ家の別端末（スマホ等）から使う

[02 セットアップ](02-getting-started.md#同じ家の別の端末スマホ別pcから開く) の通り、homenet を動かす PC の IP を使って `http://<PCのIP>:8080` で開けます。PC のファイアウォールが 8080 番を塞いでいる場合は、その PC で 8080 を許可してください。

## （任意）簡易パスワードをかける

homenet は LAN 内・個人利用前提のため認証はありません。家族と共用する等で軽くロックしたい場合は、**nginx に Basic 認証**を足すのが簡単です（`frontend/nginx.conf` の `location /` に `auth_basic` を追加し、パスワードファイルを用意）。手順は「nginx basic auth」で検索すると多数あります。本格的に公開する用途は想定していません。

---

## トラブルシューティング

### `docker: command not found` と出る

Docker が未インストール、または Docker Desktop が起動していません。→ [02 ステップ1](02-getting-started.md#ステップ1-docker-をインストールする)。

### ブラウザでつながらない・画面が出ない

1. `docker compose ps` で **frontend が running、backend が healthy** か確認。
2. 住所が `http://localhost:8080`（`https` ではない）か確認。
3. ポートを変えた場合は、その番号で開いているか確認（[05](05-data-and-customize.md#ポート番号を変える)）。
4. それでもなら `docker compose logs -f` でエラーを確認。

### 開いた直後だけエラー、更新すると直る（502 など）

backend の起動が間に合わず、最初の数秒だけデータ取得に失敗することがあります。**数秒待ってブラウザを再読み込み**してください（compose 側で backend の healthy を待つ設定にしてあるため、通常は起きにくいはずです）。

### `port is already allocated` / `address already in use`

8080 番を他のアプリが使用中です。homenet のポートを変える（[05](05-data-and-customize.md#ポート番号を変える)）か、その別アプリを止めてください。使用中のプロセスは Mac/Linux なら `lsof -i :8080`、Windows なら `netstat -ano | findstr :8080` で調べられます。

### 「couldn't load catalog」と出る／データが出ない

`data/homenet.db` が **壊れている / 読めない**場合に起きます。画面に
**`homenet.db is not a valid SQLite database: …`** のような**具体的なエラー**が表示されます
（バックエンドは 503 を返し、`/api/health` は稼働継続）。バックアップ（`homenet.db.bak-*` か自分で取った `.db`、または export した JSON の import）から戻すのが確実です。

直したらブラウザを再読み込み（**再起動不要で自動回復**）。

### `data/` の所有者が root で編集できない

Docker のバックエンドは（既定で）管理者ユーザーとして動くため、初回に作られる `data/homenet.db` が **root 所有**になり、PC からファイル操作しようとすると権限エラーになることがあります。対処は3つ:

1. **画面のフォームから編集する**（権限の問題なし。これが一番ラク）。
2. **所有者を自分に変える**（Mac/Linux）:
   ```bash
   sudo chown -R "$(id -u):$(id -g)" data
   ```
3. **そもそも自分の権限で動かす**: `docker-compose.yml` の `backend` に自分の UID/GID を指定する。
   ```yaml
   backend:
     user: "1000:1000"   # 自分の UID:GID（Mac/Linux で `id -u` / `id -g` で確認）
   ```
   設定後 `docker compose up -d`。`data/` の所有者を事前に自分にしておくと確実です。

### ビルドが途中で失敗する（ダウンロード系のエラー）

ネットワークやプロキシの影響で、部品取得に失敗することがあります。時間をおいて再実行（`docker compose build` → `docker compose up -d`）してください。社内プロキシ環境では Docker 側のプロキシ設定が必要な場合があります。

### 全部リセットしたい（サンプルに戻す）

データを初期サンプルに戻すには、`data/homenet.db` を削除してから再起動します（backend が seed から作り直します）。
旧版から移行した環境では、取り込み元の `data/devices.json` が残っていると再びそれを読み込むので、合わせて削除（または退避）してください。

```bash
docker compose down
rm data/homenet.db data/homenet.db-wal data/homenet.db-shm   # 権限エラーなら sudo を付ける
rm -f data/devices.json                                      # 旧 JSON が残っている場合のみ
docker compose up -d
```

> ⚠️ これは**今のデータを消す**操作です。必要ならバックアップを取ってから。

---

← [05. データとカスタマイズ](05-data-and-customize.md) ／ 次へ → [07. 用語集](07-glossary.md)
