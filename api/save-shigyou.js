import { google } from 'googleapis';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { lp, score, office, name, email, tel, date, time, answers } = req.body;

  // 1. バリデーション
  if (!office || !name || !email || !tel || !date || !time) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    // 2. Googleスプレッドシートへのデータ格納処理
    const authJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!authJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env variable is missing.');
    }
    const credentials = JSON.parse(authJson);

    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHIGYOU_SPREADSHEET_ID;
    const sheetName = 'AI診断結果'; // 指定のシート名

    const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    // スプレッドシート行データアペンド
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A:J`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          timestamp,
          lp || 'shigyo-v1',
          score,
          office,
          name,
          email,
          tel,
          date, // ハイフン形式 (YYYY-MM-DD)
          time,
          answers // 文字列型回答データ
        ]]
      }
    });

    // 3. Nodemailer + Gmail App Password によるオーナー通知メール送信
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    const notifyEmail = 'info.nexccess@gmail.com'; // 固定オーナー通知先

    if (gmailUser && gmailAppPassword) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailAppPassword
        }
      });

      const mailOptions = {
        from: `"Path-Flow System" <${gmailUser}>`,
        to: notifyEmail,
        subject: `【Path-Flow通知】AI診断＆カレンダー連携予約（${office}様）`,
        text: `
合同会社Nexccess 管理者様

Path-Flow（LP: shigyo-v1）より、新規のAI事前診断およびカレンダー連携相談予約が確定しました。

■ 診断・予約データ
・日時: ${timestamp}
・事務所/会社名: ${office}
・お名前（代表者様）: ${name}
・メールアドレス: ${email}
・電話番号: ${tel}
・ご希望相談日: ${date}
・時間帯スロット: ${time}
・アセスメント総合スコア: ${score} / 20

■ 診断回答テキスト明細:
${answers}

スプレッドシート（シート名: ${sheetName}）およびGoogleカレンダー（ID: ${process.env.CALENDAR_ID}）を確認のうえ、Zoomリンクの送付手配を行ってください。
`
      };

      await transporter.sendMail(mailOptions);
    }

    return res.status(200).json({ status: 'success', message: 'Spreadsheet updated and notification email sent successfully.' });

  } catch (error) {
    console.error('Error in save-shigyou backend logic:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
