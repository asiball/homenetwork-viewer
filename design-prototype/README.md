# homenetwork-architecter

家庭内LAN配下の機器を一覧・調査するための単体Webアプリ「**homenet**」の設計プロジェクト。
このリポジトリには **仕様書** と **デザイン検討用キャンバス（React/JSX プロトタイプ）** が含まれます。

---

## 🤖 実装エージェント・開発者はここから

正本の仕様書は **[`spec/homenet-spec.md`](spec/homenet-spec.md)** です。まずこれを読んでください。

実装時に参照すべき採用済みビュー（参考実装）:

- `src/variant-noc.jsx` — ホーム画面（radial / spine の2レイアウト）
- `src/view-detail.jsx` — 機器の詳細ビュー
- `src/data.jsx` — サンプルデータ（22機器分のスキーマ実例）

`src/reference/` 配下は **不採用の比較案** なので実装には不要です。

---

## 📁 ファイル構成

```
/
├── README.md                          # このファイル
├── Home Network Explorer.html         # デザイン検討キャンバス（ブラウザで開くエントリ）
├── .design-canvas.state.json          # キャンバスの配置状態（entryと同階層に置くこと）
│
├── spec/
│   ├── homenet-spec.md                # ★ 仕様書（エージェント向け・正本）
│   └── Specification.html             # 同内容の人間向けレンダリング版
│
└── src/                               # デザイン検討用 React/JSX コンポーネント
    ├── design-canvas.jsx              # 検討用キャンバスの骨組
    ├── tweaks-panel.jsx               # Tweaksパネル
    ├── data.jsx                       # サンプルデータ（22機器）
    ├── variant-noc.jsx                # ★ ホーム画面（採用）
    ├── view-detail.jsx                # ★ 詳細ビュー（採用）
    ├── view-cables.jsx                # ケーブル/スイッチ・インベントリ（拡張候補）
    └── reference/                     # 不採用の参考案
        ├── variant-atelier.jsx
        └── variant-card.jsx
```

---

## 👀 デザインを見る

`Home Network Explorer.html` をブラウザで開くと、検討用キャンバス上に各画面が並びます。
右下の **Tweaks** でレイアウト・ポーリング間隔・密度・オフライン表示を切り替えられます。

> 注: `Home Network Explorer.html` と `.design-canvas.state.json`、`src/` の相対関係に依存しているため、この3つは一緒に移動してください。

---

## 仕様メモ（要点）

- **対象**: 個人利用 / 1ユーザー / ~25機器 / LAN内配信（インターネット非公開）
- **v1.0 の画面**: ホーム（トポロジーマップ）と詳細ビューの2画面のみ
- **データ**: `devices.json` で管理（手動編集 or 編集フォーム）
- **取得方針**: 通常は5分間隔のバッチ（ARP + ping）。詳細表示中のみライブ更新
- **推奨スタック**: Vite + React + TypeScript（フロント）／ Go or FastAPI（バックエンド v1.1〜）

詳細はすべて [`spec/homenet-spec.md`](spec/homenet-spec.md) に記載。
