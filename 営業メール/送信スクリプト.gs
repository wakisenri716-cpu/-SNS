/**
 * ジャジバ 自治体観光課への案内メール（Googleスプレッドシート用）
 *
 * 使い方
 *  1. 送信リスト_北海道.csv をGoogleスプレッドシートに読み込む（ファイル → インポート）
 *  2. 拡張機能 → Apps Script を開き、このファイルの中身を貼り付けて保存
 *  3. 下の SENDER_ADDRESS に住所を入れる（入れないと動きません）
 *  4. まず「下書きを作る」を実行 → Gmailの下書きで中身を確認
 *  5. 問題なければ「送信する」を実行。1回で BATCH_SIZE 通まで送り、
 *     送った行の「送信状態」に日時が入ります。次の回は続きから送ります。
 */

const SENDER_NAME = '脇泉里';
const SENDER_EMAIL = 'wakisenri716@gmail.com';
const SENDER_ADDRESS = '【住所をここに入れてください】';

const BATCH_SIZE = 20;            // 1回に送る数（Gmailの上限と迷惑メール判定を避けるため少なめに）
const INCLUDE_UNVERIFIED = false; // true にすると「要確認」の宛先にも送る

const SUBJECT = '【ご案内】観光情報発信プラットフォーム「Jaziba」デモ版ご試用のお願い';

function buildBody(row) {
  return `${row.municipality} ${row.department}
ご担当者様

突然のご連絡失礼いたします。
観光プラットフォーム「Jaziba（ジャジバ）」を開発しております、${SENDER_NAME}と申します。

Jazibaは、写真や映像で観光地の魅力を発信できる、旅行に特化したSNS型の観光プラットフォームです。
情報があふれる中で、地方の魅力ある観光地が埋もれてしまう状況を変えたいという思いから開発を進めております。

主な特徴は以下のとおりです。
・投稿できるのは自治体・観光事業者のみのため、公式で信頼できる情報として発信できる
・写真や映像を中心にすることで、言葉の壁を越えて海外の旅行者にも魅力が伝わる
・アクセス方法や予約サイトへのリンクを掲載し、「行ってみたい」から予約までをつなげられる

このたびデモ版が完成いたしましたので、ぜひ貴${suffix(row.municipality)}の観光情報を実際に投稿・閲覧していただき、ご意見をお聞かせいただけないでしょうか。
ご利用は無料で、現場でお使いになる方の声をもとに改善を進めたいと考えております。

▼デモ版はこちら
https://tabitube-him8.onrender.com/
※初回アクセス時は表示まで1分ほどかかる場合がございます。

もしよろしければ、30分ほどオンラインで画面をお見せしながらご説明する機会をいただけますと幸いです。
ご都合のよい日時を2〜3候補お知らせいただければ、こちらで調整いたします。

お忙しいところ恐れ入りますが、ご検討のほどよろしくお願いいたします。

──────────
Jaziba（ジャジバ）
${SENDER_NAME}
メール：${SENDER_EMAIL}
住所：${SENDER_ADDRESS}

今後このようなご案内が不要な場合は、お手数ですが本メールに「配信不要」とご返信ください。
──────────
`;
}

// 「貴市」「貴町」「貴村」「貴区」
function suffix(name) {
  const last = name.slice(-1);
  return ['市', '町', '村', '区'].includes(last) ? last : '自治体';
}

function 下書きを作る() { run_(false); }
function 送信する() { run_(true); }

function run_(send) {
  if (SENDER_ADDRESS.includes('【')) {
    throw new Error('SENDER_ADDRESS に住所を入れてから実行してください（営業メールには送信者の住所が必要です）。');
  }
  const sheet = SpreadsheetApp.getActiveSheet();
  const values = sheet.getDataRange().getValues();
  const header = values[0];
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`列「${name}」が見つかりません`);
    return i;
  };
  const cMuni = col('自治体'), cDept = col('担当課'), cMail = col('メールアドレス'),
        cConf = col('確度'), cState = col('送信状態');

  let done = 0;
  for (let r = 1; r < values.length && done < BATCH_SIZE; r++) {
    const v = values[r];
    const email = String(v[cMail]).trim();
    const state = String(v[cState]).trim();
    if (!email || state.startsWith('送信済') || state.startsWith('配信不要')) continue;
    if (!send && state.startsWith('下書き')) continue;
    if (!INCLUDE_UNVERIFIED && v[cConf] !== '公式確認') continue;

    const row = { municipality: String(v[cMuni]).trim(), department: String(v[cDept]).trim() };
    const body = buildBody(row);
    const stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    if (send) {
      GmailApp.sendEmail(email, SUBJECT, body, { name: SENDER_NAME });
      sheet.getRange(r + 1, cState + 1).setValue(`送信済 ${stamp}`);
    } else {
      GmailApp.createDraft(email, SUBJECT, body, { name: SENDER_NAME });
      sheet.getRange(r + 1, cState + 1).setValue(`下書き ${stamp}`);
    }
    done++;
    Utilities.sleep(1500);
  }
  SpreadsheetApp.getUi().alert(`${send ? '送信' : '下書き作成'}：${done}件` +
    `（今日のGmail残り送信数：${MailApp.getRemainingDailyQuota()}）`);
}
