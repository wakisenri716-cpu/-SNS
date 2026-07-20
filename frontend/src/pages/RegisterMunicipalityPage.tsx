import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

export default function RegisterMunicipalityPage() {
  const { registerMunicipality } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    municipalityName: "",
    prefecture: PREFECTURES[0],
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerMunicipality(form);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-2 text-xl font-bold">自治体アカウント登録</h1>
      <p className="mb-6 text-sm text-white/60">
        リール動画を投稿できるのは自治体アカウントのみです。観光PR担当の自治体職員の方はこちらから登録してください。
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          required
          placeholder="自治体名（例：○○市）"
          value={form.municipalityName}
          onChange={(e) => setForm({ ...form, municipalityName: e.target.value })}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <select
          value={form.prefecture}
          onChange={(e) => setForm({ ...form, prefecture: e.target.value })}
          className="rounded border border-white/20 bg-black px-3 py-2"
        >
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          required
          placeholder="担当者名"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <input
          type="email"
          required
          placeholder="担当者メールアドレス"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="パスワード（8文字以上）"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
        {error && <p className="text-sm text-red-400">登録に失敗しました。入力内容をご確認ください。</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-purple-600 py-2 font-medium disabled:opacity-50"
        >
          自治体として登録する
        </button>
      </form>
    </div>
  );
}
