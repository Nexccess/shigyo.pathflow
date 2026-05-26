import { GoogleGenAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { score, answers, lp } = req.body;
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not defined in environment variables.' });
  }

  // クライアント向け「士業コンサルティング・料金案内」の体系定義
  const shigyoMenuAndPricing = `
■ 合同会社Nexccess（3030_shigyo）提供：士業総合コンサルティング＆DXメニュー一覧・料金表
1. クラウド会計導入＆財務DXコンサルティングプラン
   - 初期設計・導入支援：250,000円（一括）
   - 月額顧問報酬：45,000円〜（仕訳規模による）
   - 概要：通帳・領収書の自動読込連携、コア業務への集中環境構築。
2. 労務コンプライアンス＆就業規則AI最適化パッケージ
   - 就業規則全面改定：300,000円
   - 月額労務顧問：35,000円〜
   - 概要：働き方改革関連法に完全準拠したリスクアラートモニタリングの構築。
3. 行政手続き・許認可申請自動化スクリーニング
   - スポット申請代行：150,000円〜（案件の難易度による）
   - 概要：事前の要件定義をデジタル化し、書類不備による手戻り工数をゼロ化。
4. Path-Flow型 AI診断・集客予約最適化システム（本システム）
   - 提供価格：4,500,000円（税別・一括）※IT導入補助金（最大3/4補助）適合。
`;

  const systemInstruction = `
あなたは合同会社Nexccessが開発した次世代AI診断ハブ「Path-Flow」のバックエンドに組み込まれた、世界最高峰の士業DX経営コンサルタントです。
ユーザーから送信された「診断スコア（20点満点）」および「5つの設問の回答履歴」に基づき、客観的ファクトのみを用いたプロフェッショナルな経営分析レポートを日本語で生成してください。

以下の士業メニュー・料金表のコンテキストを理解し、現在のユーザーのボトルネック（低単価スポットへの依存、無料相談の工数肥大、Webの看板化など）を鋭く指摘した上で、どのメニューを導入すべきかの接続理由を論理的に提示してください。

【メニュー料金表】
${shigyoMenuAndPricing}

【出力ルール】
- 結論から述べ、理由は箇条書きで簡潔に提示すること。
- 憶測や「〜と思われます」といった曖昧な表現を完全に排除し、業務文書レベルの簡潔かつ厳格な表現を使用すること。
- ユーザーに過度な忖度をせず、データに基づいたファクトのみを出力すること。
`;

  const userPrompt = `
【診断データ】
- 対象LP識別ID: ${lp || 'shigyo-v1'}
- 総合診断スコア: ${score} / 20
- 回答テキスト: 
${answers}

上記データに基づき、このクライアントが導入を最優先すべきメニューとその理由を含めた、実践的なアセスメントサマリーを生成してください。
`;

  // モデルフォールバック配列（優先順）
  const models = ['gemini-2.5-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
  let lastError = null;
  let analysisText = "";

  const ai = new GoogleGenAI({ apiKey: apiKey });

  for (const modelName of models) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          { role: 'user', parts: [{ text: systemInstruction + "\n\n" + userPrompt }] }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200
        }
      });

      if (response && response.text) {
        analysisText = response.text;
        break; // 生成成功
      }
    } catch (err) {
      console.warn(`Model ${modelName} failed. Trying next fallback... Error:`, err.message);
      lastError = err;
    }
  }

  if (!analysisText) {
    return res.status(500).json({ 
      error: 'All Gemini models in fallback chain failed.', 
      details: lastError ? lastError.message : 'Unknown error' 
    });
  }

  return res.status(200).json({ analysis: analysisText });
}
