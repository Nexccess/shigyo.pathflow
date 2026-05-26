const { GoogleGenerativeAI } = require("@google/generative-ai");

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { answers, lp } = req.body;
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  // 手順書§5-2: 優先順位に基づいたモデル選択
  const models = ["gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-flash-8b"];
  
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const prompt = `あなたは専門家です。以下の診断回答に基づき、最適なメニュー、スコア(0-100)、レベル(A/B/C)、理由をJSON形式で出力してください。回答: ${answers}`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return res.status(200).json(JSON.parse(response.text()));
    } catch (e) {
      console.warn(`${modelName} failed, trying next...`);
      continue;
    }
  }
  // 全モデル失敗時のルールベース・フォールバック
  res.status(200).json({ menu: "標準プラン", score: 50, level: "B", reason: "AI一時負荷のため標準回答" });
}
