# homenetwork-architecter（🧊 ARCHIVED / 凍結）

> **⚠️ このディレクトリは凍結されたデザイン履歴です（#105）。**
> ここにある `.jsx` は採用前のデザイン検討用キャンバスで、**正本ではありません**。
> 本番実装は **[`frontend/src/`](../frontend/src/)** が唯一の真実（source of truth）で、
> 実装はプロトタイプを追い越して乖離しています。デザイントークン（色・余白など）も
> **[`frontend/src/theme.css`](../frontend/src/theme.css)** に一本化されています。
> 新しく実装・レビューする人は、この `.jsx` を正と誤読しないでください。
>
> | 知りたいこと | 見る場所 |
> | --- | --- |
> | 仕様（正本） | [`spec/homenet-spec.md`](../spec/homenet-spec.md) |
> | 実装（正本） | [`frontend/src/`](../frontend/src/)（views / components / lib） |
> | デザイントークン | [`frontend/src/theme.css`](../frontend/src/theme.css) |
> | デザイン履歴（このフォルダ） | 当時の検討キャンバス。参考のみ・実装対象外 |

家庭内LAN配下の機器を一覧・調査するための単体Webアプリ「**homenet**」の**初期デザイン検討**プロジェクト。
このディレクトリには当時の **デザイン検討用キャンバス（React/JSX プロトタイプ）** が、履歴として残されています。

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
