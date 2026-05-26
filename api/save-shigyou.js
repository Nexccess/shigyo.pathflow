const { google } = require('googleapis');
const nodemailer = require('nodemailer');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const data = req.body;
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar'
    ],
  });

  try {
    const authClient = await auth.getClient();

    // 1. スプレッドシート記録 (手順書§3-2)
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHIGYOU_SPREADSHEET_ID,
      range: 'AI診断結果!A:K',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
          data.lp, data.name, data.phone, data.email, 
          data.date, data.date2 || "", data.recommended_menu, 
          data.score, data.level, data.answersStr
        ]]
      },
    });

    // 2. Googleカレンダー登録 (手順書§6-1)
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID,
      requestBody: {
        summary: `【仮予約】${data.name} 様`,
        description: `メニュー: ${data.recommended_menu}\nメール: ${data.email}`,
        start: { dateTime: `${data.date}T${data.time}:00`, timeZone: 'Asia/Tokyo' },
        end: { dateTime: `${data.date}T${parseInt(data.time)+1}:00`, timeZone: 'Asia/Tokyo' },
      },
    });

    // 3. Gmail通知 (Nodemailer: 手順書§4-3)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER, // オーナー通知
      subject: `【新規予約】${data.name} 様より`,
      text: `新規予約がありました。\n氏名: ${data.name}\n希望日: ${data.date} ${data.time}\n診断結果: ${data.level}`
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
