/**
 * 다음 전개 추천 확장 프로그램 - 유틸리티 함수
 */
import { extension_settings, getContext } from "../../../extensions.js";
import { extensionName, defaultGenres } from "./constants.js";

/** 로그 출력 */
export function log(...args) {
    console.log("[" + extensionName + "]", ...args);
}

/** HTML 이스케이프 */
export function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/** 속성용 이스케이프 */
export function escapeAttr(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** 클립보드에 복사 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
    }
}

/** 채팅 하단으로 스크롤 */
export function scrollToBottom() {
    const chatElement = document.getElementById("chat");
    if (chatElement) {
        chatElement.scrollTop = chatElement.scrollHeight;
    }
}

/** 입력창에 텍스트 붙여넣기 */
export function pasteToInputField(text) {
    try {
        const textarea = document.getElementById("send_textarea");
        if (textarea) {
            const currentValue = textarea.value;
            textarea.value = currentValue ? currentValue + "\n" + text : text;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            textarea.focus();
        }
    } catch (e) {
        log("Failed to paste to input field:", e);
    }
}

/** 입력창에 텍스트를 넣고 즉시 전송 (Feature 2) */
export function sendMessageToChat(text) {
    try {
        const textarea = document.getElementById("send_textarea");
        if (!textarea) return false;
        textarea.value = text;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        const sendBtn = document.getElementById("send_but");
        if (sendBtn) {
            sendBtn.click();
            return true;
        }
    } catch (e) {
        log("Failed to send message:", e);
    }
    return false;
}

/**
 * 토큰 수 추정 (Feature 5 / Perf 4)
 * 한국어/일본어/중국어: ~2자 = 1토큰
 * 영어/라틴: ~4자 = 1토큰
 */
export function estimateTokens(text) {
    if (!text) return 0;
    const cjkRegex = /[\u3131-\uD79D\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;
    const cjkMatches = text.match(cjkRegex);
    const cjkChars = cjkMatches ? cjkMatches.length : 0;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars / 2 + otherChars / 4);
}

/** 간단한 문자열 해시 (캐시 키 생성용) */
export function simpleHash(str) {
    if (!str) return "0";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

/** 장르 목록 가져오기 (기본 + 사용자 정의) */
export function getAllGenres() {
    const settings = extension_settings[extensionName];
    const customGenres = settings.customGenres || [];
    return [...defaultGenres, ...customGenres];
}

// ═══════════════════════════════════════════
// v1.7.0: 코사인 유사도 필터
// ═══════════════════════════════════════════

/** 텍스트를 단어 빈도 벡터로 변환 (간단한 bag-of-words) */
function textToVector(text) {
    if (!text) return {};
    const words = text.toLowerCase().replace(/[^\w\uAC00-\uD7A3\u3040-\u30FF\u4E00-\u9FFF]/g, " ").split(/\s+/).filter(function (w) { return w.length > 1; });
    const vec = {};
    words.forEach(function (w) { vec[w] = (vec[w] || 0) + 1; });
    return vec;
}

/** 두 벡터의 코사인 유사도 계산 (0~1) */
function cosineSimilarity(vecA, vecB) {
    const allKeys = new Set(Object.keys(vecA).concat(Object.keys(vecB)));
    let dot = 0, magA = 0, magB = 0;
    allKeys.forEach(function (k) {
        const a = vecA[k] || 0;
        const b = vecB[k] || 0;
        dot += a * b;
        magA += a * a;
        magB += b * b;
    });
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * 유사도가 높은 중복 추천을 필터링
 * @param {string[]} suggestions - 추천 목록
 * @param {number} threshold - 유사도 임계값 (0~1, 이 값 이상이면 중복 제거)
 * @returns {string[]}
 */
export function filterSimilarSuggestions(suggestions, threshold) {
    if (!suggestions || suggestions.length <= 1) return suggestions;
    if (!threshold || threshold <= 0) return suggestions;

    const vectors = suggestions.map(textToVector);
    const filtered = [suggestions[0]];

    for (let i = 1; i < suggestions.length; i++) {
        let isDuplicate = false;
        for (let j = 0; j < filtered.length; j++) {
            const filteredVec = textToVector(filtered[j]);
            const sim = cosineSimilarity(vectors[i], filteredVec);
            if (sim >= threshold) {
                isDuplicate = true;
                log("Filtered similar suggestion (sim=" + sim.toFixed(3) + "): " + suggestions[i].substring(0, 40) + "...");
                break;
            }
        }
        if (!isDuplicate) filtered.push(suggestions[i]);
    }

    return filtered;
}

// ═══════════════════════════════════════════
// v1.7.0: 대화 리듬 분석
// ═══════════════════════════════════════════

/**
 * 대화 리듬을 분석하여 통계 반환
 * - 유저 vs AI 메시지 비율
 * - 평균 메시지 길이
 * - 응답 간 간격 패턴
 * @returns {{userRatio:number, aiRatio:number, avgUserLen:number, avgAiLen:number, dominantPattern:string, hint:string}}
 */
export function analyzeConversationRhythm() {
    try {
        const context = getContext();
        const chat = context.chat || [];
        const visible = chat.filter(function (m) { return !m.is_system; });
        if (visible.length < 4) return null;

        const recent = visible.slice(-30);
        const userMsgs = recent.filter(function (m) { return m.is_user; });
        const aiMsgs = recent.filter(function (m) { return !m.is_user; });

        const userCount = userMsgs.length;
        const aiCount = aiMsgs.length;
        const total = userCount + aiCount;
        if (total === 0) return null;

        const avgUserLen = userMsgs.reduce(function (sum, m) { return sum + (m.mes || "").length; }, 0) / Math.max(userCount, 1);
        const avgAiLen = aiMsgs.reduce(function (sum, m) { return sum + (m.mes || "").length; }, 0) / Math.max(aiCount, 1);

        // 패턴 감지
        let pattern = "balanced";
        let hint = "";
        const ratio = userCount / Math.max(aiCount, 1);

        if (avgUserLen < 50 && avgAiLen > 300) {
            pattern = "short-input-long-output";
            hint = "User sends short messages while AI writes long responses. Consider suggesting more interactive exchanges.";
        } else if (avgUserLen > 200 && avgAiLen < 100) {
            pattern = "long-input-short-output";
            hint = "User writes detailed messages. Suggestions should match this depth.";
        } else if (ratio > 2) {
            pattern = "user-dominant";
            hint = "User is driving the conversation. Allow more space for character reactions.";
        } else if (ratio < 0.5) {
            pattern = "ai-dominant";
            hint = "AI has been leading. Suggest openings for user engagement.";
        } else {
            hint = "Conversation rhythm is balanced.";
        }

        return {
            userRatio: Math.round((userCount / total) * 100),
            aiRatio: Math.round((aiCount / total) * 100),
            avgUserLen: Math.round(avgUserLen),
            avgAiLen: Math.round(avgAiLen),
            dominantPattern: pattern,
            hint: hint
        };
    } catch (e) {
        return null;
    }
}

/** v1.7.0: 대화 리듬을 프롬프트에 주입할 텍스트로 변환 */
export function buildRhythmPromptHint() {
    const rhythm = analyzeConversationRhythm();
    if (!rhythm || rhythm.dominantPattern === "balanced") return "";
    return "=== CONVERSATION RHYTHM ===\n" + rhythm.hint + "\n\n";
}
