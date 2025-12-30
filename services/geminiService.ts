import { GoogleGenAI } from "@google/genai";
import { Keyword, Campaign } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzePerformance = async (keywords: Keyword[], campaigns: Campaign[]) => {
  if (!keywords.length) return "데이터가 없어 분석할 수 없습니다.";

  const keywordSummary = keywords.slice(0, 10).map(k => 
    `- 키워드: "${k.keyword}" | 입찰가: ${k.bidAmt}원 | 비용: ${k.stats.cost}원 | 전환: ${k.stats.conversions}건 | CPA: ${k.stats.cpa}원 | 순위: ${k.currentRankEstimate}위`
  ).join('\n');

  const prompt = `
    당신은 네이버 검색광고(Naver Search Ads) 전문가입니다. 
    아래의 키워드 성과 데이터를 분석하고 전략적인 입찰 조정 제안을 해주세요.
    
    이 광고주는 DB수집/상담신청을 목표로 하며, ROAS보다는 '전환당 비용(CPA)' 최적화가 중요합니다.
    
    데이터:
    ${keywordSummary}

    다음 내용을 포함하여 한국어로 답변해주세요:
    1. CPA가 낮고 전환이 많은 효자 키워드 식별 (확장 제안)
    2. CPA가 지나치게 높은 비효율 키워드 식별 (감액 제안)
    3. 순위 대비 효율성 분석 (무리한 순위 경쟁 지양)
    4. 구체적인 입찰가 조정 제안 (상향/하향/유지 등)

    응답 형식은 Markdown을 사용하고 가독성 있게 작성해주세요.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.7,
      }
    });

    return response.text || "분석 결과를 생성할 수 없습니다.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "AI 서비스 연결 오류가 발생했습니다. API 키를 확인해주세요.";
  }
};