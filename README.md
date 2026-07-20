# TabiTube（観光専用SNS）

観光の情報格差解消と自治体プロモーション支援を目的とした、観光特化型SNSのMVP実装です。企画書の内容に基づき、以下をコア機能として実装しています。

- Instagram/TikTokのリールのような縦スクロール動画フィード（「おすすめ」）
- **リール動画を投稿できるのは自治体アカウント、および自治体に紐づいた企業アカウントのみ**（一般ユーザーは閲覧・いいね・コメントのみ）
- 自治体プロフィール（アクセス方法・宿情報・飲食店・観光情報・OTA外部リンク・投稿一覧）
- 自治体管理ダッシュボード（リール投稿・削除、紐づく企業一覧の確認、プロフィール編集）
- 企業管理ダッシュボード（自社が投稿したリールの投稿・削除のみ。自治体プロフィールの編集は不可）
- キーワード検索、ルールベースの「AIレコメンド」
- MaaS/OTA連携の土台（下記「外部連携について」参照）

## 構成

```
backend/   Express + TypeScript + Prisma(SQLite) API サーバー
frontend/  React(Vite) + TypeScript + Tailwind CSS の SPA
```

フロントエンドとバックエンドは別プロジェクト・別プロセスで、フロントは `/api` 宛のリクエストを Vite の dev proxy でバックエンドに転送します。

## セットアップ

### backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev   # http://localhost:4000
```

### frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

ブラウザで `http://localhost:5173` を開きます。自治体としてリールを投稿するには「自治体の方へ」から自治体アカウントを新規登録してください。

## 公開デプロイ（Render.com）

このリポジトリには [Render](https://render.com) 用の `render.yaml`（Blueprint）を用意しており、フロントエンドのビルド結果をバックエンドの Express プロセスから配信することで、1つのWebサービスとして公開できます。

1. [Render](https://render.com) に無料アカウントを作成し、GitHubアカウントを連携する
2. Renderダッシュボードで **New + → Blueprint** を選択し、このリポジトリ（`claude/tourism-sns-planning-643nty` ブランチ）を指定する
3. `render.yaml` が自動検出されるので、そのまま **Apply** してデプロイを実行する（ビルドには数分かかります）
4. デプロイ完了後に発行されるURL（`https://<サービス名>.onrender.com`）でブラウザからアクセスできます

Blueprintが使えない場合は、**New + → Web Service** で同じリポジトリを選び、以下を手動設定しても同じ内容になります。

- Build Command: `bash render-build.sh`
- Start Command: `node backend/dist/index.js`
- 環境変数：`NODE_ENV=production`, `DATABASE_URL=file:./dev.db`, `UPLOAD_DIR=./uploads`, `JWT_SECRET=<ランダムな文字列>`

**注意（無料プランの制約）**：Renderの無料プランはディスクが永続化されないため、再デプロイやスリープ復帰のたびにSQLiteのデータ（登録した自治体・投稿したリール動画ファイル）はリセットされます。デモ・検証用途として利用し、本番運用する場合はPostgreSQL（データ）＋S3等（動画ファイル）への切り替えを推奨します。

## データモデル（Prisma / backend/prisma/schema.prisma）

- `User`：一般ユーザー / 自治体担当者 / 企業担当者共通のアカウント（`role` で区別：`USER` | `MUNICIPALITY` | `COMPANY`）
- `Municipality`：自治体プロフィール（`User` と1:1）。アクセス方法・宿・飲食店・観光情報・OTAリンクを保持
- `Company`：自治体に紐づく企業アカウント（`User` と1:1、`Municipality` に多対1）。企業は自己登録時に既存の自治体を選んで紐づける
- `Reel`：自治体名義で表示されるリール動画。`companyId` が設定されていれば、その自治体に紐づく企業が投稿したもの
- `Like` / `Comment`：一般ユーザーによるリールへのいいね・コメント

## 権限モデル

- リール投稿は `role: MUNICIPALITY` と `role: COMPANY` のアカウントのみ許可（`backend/src/middleware/auth.ts` の `requireRole`）
- **自治体アカウント**：自分の自治体名義の投稿を全て（紐づく企業が投稿したものも含む）編集・削除でき、自治体プロフィール（アクセス・宿・飲食店・観光情報・OTAリンク）も編集できる
- **企業アカウント**：自社が投稿したリールのみ編集・削除できる。自治体プロフィールの編集は不可
- 一般ユーザーはリール閲覧・いいね・コメントのみ可能
- 企業アカウントは自己登録時に既存の自治体をプルダウンから選んで紐づけます。**自治体側の承認ステップはないため、既存の自治体名を選べば誰でもその自治体名義の投稿権限を持つ企業アカウントを作成できます**。実運用では自治体による承認フローや招待制への変更を推奨します。

## 外部連携について（重要）

企画書ではMaaS（交通情報連携）とOTA（宿・航空券予約）連携が構想されていますが、実際の外部API契約・APIキーがない状態のため、本実装では以下の方針で「差し替え可能な形」にしています。

- **OTA連携**（`backend/src/services/otaProvider.ts`）：じゃらん/楽天トラベル/Booking.com等への外部検索リンクを自動生成して自治体プロフィールに表示します。自治体側で実際の提携リンクに上書きすることも可能です（プロフィール編集画面）。実際のOTA APIと契約できた場合は、この関数を実APIコールに差し替えるだけで組み込めます。
- **MaaS連携**（`backend/src/services/maasProvider.ts`）：リールに紐づく場所情報から、徒歩＋電車の想定所要時間を返す「モックデータ」を生成しています。画面上には常に「交通情報は仮データ」と明示しています。実際のMaaS/ルート検索APIと契約できた場合は、この関数の中身を実APIコールに差し替えるだけで済むように設計しています。
- 決済機能（宿泊予約や広告出稿の決済）は未実装です。実装には決済代行事業者との契約が必要なため、現段階ではスコープ外としています。

## 今後の拡張候補

- 動画アップロード先をローカルディスクからS3等のオブジェクトストレージに切り替え（`backend/src/middleware/upload.ts` のstorage設定を変更）
- AIレコメンド（現状はルールベースのスコアリング。`backend/src/routes/search.ts` の `/recommend`）をLLMベースの推薦に置き換え
- 自治体向け掲載課金・広告主向け課金機能
- 多言語対応（インバウンド旅行者向け）
