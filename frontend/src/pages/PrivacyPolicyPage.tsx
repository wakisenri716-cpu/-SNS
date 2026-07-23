export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto my-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:max-w-3xl lg:p-8">
      <h1 className="text-xl font-bold text-gray-900">プライバシーポリシー</h1>
      <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        これは開発用のドラフトです。実際のサービス公開前に、内容を法務担当者・専門家に確認してもらってください。
      </p>

      <div className="mt-6 flex flex-col gap-5 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">1. 取得する情報</h2>
          <p>本サービス（TabiTube）は、以下の情報を取得します。</p>
          <ul className="mt-1 list-disc pl-5">
            <li>アカウント情報（メールアドレス、お名前、パスワードのハッシュ値）</li>
            <li>投稿コンテンツ（自治体・企業アカウントがアップロードする動画・キャプション・位置情報）</li>
            <li>利用履歴（いいね・コメント・閲覧数など）</li>
            <li>ブラウザのローカルストレージに保存するログイン状態・一部の表示設定</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">2. 利用目的</h2>
          <p>取得した情報は、本サービスの提供・維持、機能改善、不正利用の防止のために利用します。</p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">3. 第三者への提供</h2>
          <p>
            投稿に位置情報が含まれる場合、経路検索のためにGoogle Maps
            Platform（Geocoding／Directions API）へ位置情報を送信することがあります。法令に基づく場合を除き、取得した個人情報を本人の同意なく第三者に提供しません。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">4. アカウントの削除</h2>
          <p>
            設定画面からいつでも自分のアカウントを削除できます。削除すると、投稿・いいね・コメントを含む関連データも削除され、復元できません。
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">5. お問い合わせ</h2>
          <p>本ポリシーに関するお問い合わせは、サービス運営者までご連絡ください。</p>
        </section>
      </div>
    </div>
  );
}
