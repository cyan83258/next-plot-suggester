/**
 * 다음 전개 추천 확장 프로그램 - 공유 상태
 * v1.4.0: 분석 데이터, 취소 상태 추가
 */
export const state = {
    currentSuggestionMessageId: null,
    isGenerating: false,
    currentCustomDirection: "",
    autoSuggestTimer: null,

    // Perf 7: 프롬프트 결과 분석 데이터
    analytics: {
        /** @type {Array<{timestamp:number, durationMs:number, promptTokens:number, success:boolean, suggestionCount:number}>} */
        history: [],
        maxHistory: 50
    },

    // Perf 2: 프로그레시브 컨텍스트 로딩 캐시
    contextCache: {
        worldInfo: { data: null, hash: null },
        charDesc: { data: null, hash: null },
        personaDesc: { data: null, hash: null },
        scenarioSummary: { data: null, hash: null },
        auWorldBuilder: { data: null, hash: null }
    }
};

/**
 * 분석 데이터 기록 (Perf 7)
 * @param {{durationMs:number, promptTokens:number, success:boolean, suggestionCount:number}} entry
 */
export function recordAnalytics(entry) {
    entry.timestamp = Date.now();
    state.analytics.history.push(entry);
    if (state.analytics.history.length > state.analytics.maxHistory) {
        state.analytics.history.shift();
    }
}

/**
 * 분석 요약 반환 (Perf 7)
 */
export function getAnalyticsSummary() {
    const h = state.analytics.history;
    if (h.length === 0) return null;

    let totalDuration = 0;
    let totalTokens = 0;
    let successCount = 0;
    for (let i = 0; i < h.length; i++) {
        totalDuration += h[i].durationMs || 0;
        totalTokens += h[i].promptTokens || 0;
        if (h[i].success) successCount++;
    }

    return {
        totalRequests: h.length,
        successRate: Math.round((successCount / h.length) * 100),
        avgDurationMs: Math.round(totalDuration / h.length),
        avgPromptTokens: Math.round(totalTokens / h.length),
        lastRequest: h[h.length - 1]
    };
}
