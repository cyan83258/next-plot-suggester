/**
 * 다음 전개 추천 확장 프로그램 - 서사 분석
 * (prompt.js에서 분리)
 *
 * 서사 페이싱/톤 분석, 미해결 스레드 감지, Web Worker 분석
 * - Worker 조건부 실행 (메시지 ≥30일 때만)
 * - Blob URL 해제로 메모리 누수 방지
 * - Worker 코드 생성 중앙화 (createWorkerCode)
 */
import { log } from "./utils.js";

// ═══════════════════════════════════════════
// 서사 분석 유틸리티
// ═══════════════════════════════════════════

const ACTION_RE = /fight|attack|run|chase|escape|battle|swing|dodge|jump|explode|crash|rush|strike|scream|shout|싸우|공격|도망|전투|뛰|폭발|충돌|소리/g;
const EMOTION_RE = /love|cry|tear|sob|heart|miss|hug|kiss|feel|emotion|sad|happy|joy|pain|anger|사랑|울|눈물|가슴|그리|안|입맞|느끼|감정|슬프|행복|기쁨|고통|분노/g;
const DIALOGUE_RE = /said|asked|replied|answered|told|spoke|말했|물었|대답|말|얘기|대화/g;
const CALM_RE = /quiet|peace|calm|gentle|soft|slow|rest|sleep|smile|laugh|walk|sit|조용|평화|차분|부드|천천|쉬|잠|미소|웃|걷|앉/g;

const TONE_HINTS = {
    action: "The recent narrative has been ACTION-HEAVY. Consider including at least one suggestion that provides a breathing moment, emotional reflection, or quiet aftermath. Contrast heightens impact.",
    calm: "The recent narrative has been CALM/PEACEFUL. Consider including at least one suggestion that introduces tension, a new challenge, or disrupts the status quo to prevent stagnation.",
    emotion: "The recent narrative has been EMOTIONALLY INTENSE. Consider including a suggestion that channels this emotion into action or decision, and another that introduces an external event to shift focus.",
    dialogue: "The recent narrative has been DIALOGUE-HEAVY. Consider including suggestions with more physical action, environmental description, or internal monologue to vary the narrative texture."
};

/**
 * 최근 채팅의 톤/페이싱을 분석하여 프롬프트 힌트를 생성
 */
export function analyzeNarrativePacing(chatHistory) {
    if (!chatHistory) return { hint: "", dominantTone: "neutral", messageCount: 0 };

    const lines = chatHistory.split("\n").filter(l => l.trim().length > 0);
    const msgCount = lines.length;
    if (msgCount === 0) return { hint: "", dominantTone: "neutral", messageCount: 0 };

    const text = chatHistory.toLowerCase();

    const actionCount = (text.match(ACTION_RE) || []).length;
    const emotionCount = (text.match(EMOTION_RE) || []).length;
    const dialogueCount = (text.match(DIALOGUE_RE) || []).length;
    const calmCount = (text.match(CALM_RE) || []).length;

    const total = actionCount + emotionCount + dialogueCount + calmCount;
    if (total === 0) return { hint: "", dominantTone: "neutral", messageCount: msgCount };

    let dominantTone = "neutral";
    let maxScore = 0;
    const scores = { action: actionCount, emotion: emotionCount, dialogue: dialogueCount, calm: calmCount };
    for (const key in scores) {
        if (scores[key] > maxScore) { maxScore = scores[key]; dominantTone = key; }
    }

    const hints = [];
    if (TONE_HINTS[dominantTone]) hints.push(TONE_HINTS[dominantTone]);

    if (msgCount > 15) {
        hints.push("The conversation has been going on for a while (" + msgCount + " messages). At least one suggestion should introduce a meaningful shift, new element, or escalation to maintain narrative momentum.");
    }

    return { hint: hints.join("\n"), dominantTone, messageCount: msgCount };
}

/**
 * 미해결 서사 스레드 감지 (간단한 휴리스틱)
 */
export function detectUnresolvedThreads(chatHistory) {
    if (!chatHistory) return "";

    const lines = chatHistory.split("\n").filter(l => l.trim().length > 0);
    const threads = [];
    const recentLines = lines.slice(-20);

    for (const line of recentLines) {
        if (/\?["\s]*$/.test(line) || /질문|물어|뭐|어떻|왜|언제/.test(line)) {
            const snippet = line.substring(0, 80).trim();
            if (snippet.length > 10) threads.push(snippet);
        }
        if (/\bwill\b|\bshould\b|\btomorrow\b|\blater\b|\bpromise\b|내일|나중에|약속|할 것|하겠/.test(line)) {
            const snippet = line.substring(0, 80).trim();
            if (snippet.length > 10 && threads.indexOf(snippet) < 0) threads.push(snippet);
        }
    }

    if (threads.length === 0) return "";

    let threadText = "DETECTED UNRESOLVED NARRATIVE THREADS (consider weaving these into suggestions where appropriate):\n";
    const limit = Math.min(threads.length, 5);
    for (let j = 0; j < limit; j++) {
        threadText += "- " + threads[j] + "\n";
    }
    return threadText;
}

// ═══════════════════════════════════════════
// Web Worker 분석 (조건부 실행 + 메모리 누수 수정)
// ═══════════════════════════════════════════

let analysisWorker = null;
let workerBlobUrl = null;
let workerSupported = typeof Worker !== "undefined";

/** Worker는 이 메시지 수 이상일 때만 사용 — 그 이하는 메인 스레드가 더 빠름 */
const WORKER_MESSAGE_THRESHOLD = 30;

/**
 * Web Worker로 서사 분석을 오프로드
 * - 메시지 수가 적으면 메인 스레드에서 직접 실행 (Worker 오버헤드 회피)
 * - Worker 생성 불가 시 메인 스레드 동기 실행 (폴백)
 * - Blob URL 정리로 메모리 누수 방지
 */
export function runAnalysisInWorker(chatHistory) {
    return new Promise(resolve => {
        const lineCount = chatHistory ? chatHistory.split("\n").filter(l => l.trim()).length : 0;

        // 메시지가 적으면 Worker 오버헤드가 분석보다 큼 → 메인 스레드 직접 실행
        if (!workerSupported || !chatHistory || lineCount < WORKER_MESSAGE_THRESHOLD) {
            resolve({
                pacing: analyzeNarrativePacing(chatHistory),
                threads: detectUnresolvedThreads(chatHistory)
            });
            return;
        }

        try {
            if (!analysisWorker) {
                const workerCode = createWorkerCode();
                const blob = new Blob([workerCode], { type: "application/javascript" });
                workerBlobUrl = URL.createObjectURL(blob);
                analysisWorker = new Worker(workerBlobUrl);
                // Blob URL은 Worker 생성 후 즉시 해제 가능
                URL.revokeObjectURL(workerBlobUrl);
                workerBlobUrl = null;
            }

            const timeout = setTimeout(() => {
                resolve({
                    pacing: analyzeNarrativePacing(chatHistory),
                    threads: detectUnresolvedThreads(chatHistory)
                });
            }, 3000);

            analysisWorker.onmessage = e => {
                clearTimeout(timeout);
                resolve(e.data);
            };

            analysisWorker.onerror = () => {
                clearTimeout(timeout);
                cleanupWorker();
                workerSupported = false;
                resolve({
                    pacing: analyzeNarrativePacing(chatHistory),
                    threads: detectUnresolvedThreads(chatHistory)
                });
            };

            analysisWorker.postMessage(chatHistory);
        } catch (e) {
            cleanupWorker();
            workerSupported = false;
            resolve({
                pacing: analyzeNarrativePacing(chatHistory),
                threads: detectUnresolvedThreads(chatHistory)
            });
        }
    });
}

/** Worker 리소스 정리 */
function cleanupWorker() {
    if (analysisWorker) {
        analysisWorker.terminate();
        analysisWorker = null;
    }
    if (workerBlobUrl) {
        URL.revokeObjectURL(workerBlobUrl);
        workerBlobUrl = null;
    }
}

/**
 * Worker 인라인 코드 생성 (중앙화)
 * 분석 로직은 메인 스레드의 analyzeNarrativePacing/detectUnresolvedThreads와
 * 동일한 결과를 반환하도록 작성되어 있음
 */
function createWorkerCode() {
    return `self.onmessage = function(e) {
    const text = e.data;
    const lines = text.split("\\n").filter(function(l) { return l.trim().length > 0; });
    const msgCount = lines.length;
    const lower = text.toLowerCase();

    const actionRe = /fight|attack|run|chase|escape|battle|swing|dodge|jump|explode|crash|rush|strike|scream|shout|싸우|공격|도망|전투|뛰|폭발|충돌|소리/g;
    const emotionRe = /love|cry|tear|sob|heart|miss|hug|kiss|feel|emotion|sad|happy|joy|pain|anger|사랑|울|눈물|가슴|그리|안|입맞|느끼|감정|슬프|행복|기쁨|고통|분노/g;
    const dialogRe = /said|asked|replied|answered|told|spoke|말했|물었|대답|말|얘기|대화/g;
    const calmRe = /quiet|peace|calm|gentle|soft|slow|rest|sleep|smile|laugh|walk|sit|조용|평화|차분|부드|천천|쉬|잠|미소|웃|걷|앉/g;

    const ac = (lower.match(actionRe) || []).length;
    const ec = (lower.match(emotionRe) || []).length;
    const dc = (lower.match(dialogRe) || []).length;
    const cc = (lower.match(calmRe) || []).length;

    const total = ac + ec + dc + cc;
    let dom = "neutral";
    let maxS = 0;
    const sc = { action: ac, emotion: ec, dialogue: dc, calm: cc };
    for (const k in sc) { if (sc[k] > maxS) { maxS = sc[k]; dom = k; } }

    const toneMap = {
        action: "The recent narrative has been ACTION-HEAVY. Consider including at least one suggestion that provides a breathing moment, emotional reflection, or quiet aftermath. Contrast heightens impact.",
        calm: "The recent narrative has been CALM/PEACEFUL. Consider including at least one suggestion that introduces tension, a new challenge, or disrupts the status quo to prevent stagnation.",
        emotion: "The recent narrative has been EMOTIONALLY INTENSE. Consider including a suggestion that channels this emotion into action or decision, and another that introduces an external event to shift focus.",
        dialogue: "The recent narrative has been DIALOGUE-HEAVY. Consider including suggestions with more physical action, environmental description, or internal monologue to vary the narrative texture."
    };
    const hints = [];
    if (total > 0 && toneMap[dom]) hints.push(toneMap[dom]);
    if (msgCount > 15) hints.push("The conversation has been going on for a while (" + msgCount + " messages). At least one suggestion should introduce a meaningful shift, new element, or escalation to maintain narrative momentum.");

    const threads = [];
    const recent = lines.slice(-20);
    for (let i = 0; i < recent.length; i++) {
        const line = recent[i];
        if (/\\?["\\s]*$/.test(line) || /질문|물어|뭐|어떻|왜|언제/.test(line)) {
            const s1 = line.substring(0, 80).trim();
            if (s1.length > 10) threads.push(s1);
        }
        if (/\\bwill\\b|\\bshould\\b|\\btomorrow\\b|\\blater\\b|\\bpromise\\b|내일|나중에|약속|할 것|하겠/.test(line)) {
            const s2 = line.substring(0, 80).trim();
            if (s2.length > 10 && threads.indexOf(s2) < 0) threads.push(s2);
        }
    }
    let threadText = "";
    if (threads.length > 0) {
        threadText = "DETECTED UNRESOLVED NARRATIVE THREADS (consider weaving these into suggestions where appropriate):\\n";
        for (let j = 0; j < Math.min(threads.length, 5); j++) threadText += "- " + threads[j] + "\\n";
    }

    self.postMessage({
        pacing: { hint: hints.join("\\n"), dominantTone: dom, messageCount: msgCount },
        threads: threadText
    });
};`;
}

// ═══════════════════════════════════════════
// 서사 단계 감지
// ═══════════════════════════════════════════

/**
 * 최근 채팅에서 현재 서사 단계를 감지
 * @returns {"intro"|"rising"|"crisis"|"climax"|"falling"}
 */
export function detectNarrativeStage(chatHistory) {
    if (!chatHistory) return "rising";

    const lines = chatHistory.split("\n").filter(l => l.trim().length > 0);
    const msgCount = lines.length;
    const text = chatHistory.toLowerCase();

    const conflictSignals = (text.match(/fight|conflict|danger|threat|problem|crisis|but|however|despite|against|싸움|갈등|위험|위기|문제|하지만|그러나/g) || []).length;
    const resolutionSignals = (text.match(/resolve|peace|agreement|understand|forgive|together|finally|해결|평화|합의|이해|용서|함께|마침내/g) || []).length;
    const introSignals = (text.match(/first time|meeting|hello|introduce|name is|처음|만나|안녕|소개|이름/g) || []).length;

    const intensity = conflictSignals / Math.max(msgCount, 1);

    if (msgCount <= 5 || introSignals > conflictSignals) return "intro";
    if (intensity > 0.5) return "climax";
    if (intensity > 0.3 && resolutionSignals < conflictSignals * 0.5) return "crisis";
    if (resolutionSignals > conflictSignals) return "falling";
    return "rising";
}
