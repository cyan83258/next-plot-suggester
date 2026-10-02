/** Strict structured outputs; malformed JSON is never displayed as prose. */
import { validateEvidence } from "./story.js";

export function parseJson(response) {
    if (typeof response !== "string") throw new Error("문자열 응답이 아닙니다.");
    const clean = response.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try { return JSON.parse(clean); } catch { const error = new Error("응답 JSON이 잘렸거나 형식이 잘못되었습니다. 형식 복구 또는 다시 생성을 시도해 주세요."); error.code="INVALID_JSON"; throw error; }
}
export function parseCandidates(response, sourceMessages = [], allowText = false) {
    let data;
    try { data = parseJson(response); }
    catch (error) {
        if (!allowText || /[\[{}\]]/.test(response)) throw error;
        const lines = response.split(/\n(?=\s*\d+[.)]\s)/).map(s => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
        if (lines.length < 2) throw error;
        data = { suggestions: lines };
    }
    if (!data || typeof data !== "object") throw new Error("추천 응답은 JSON 객체여야 합니다.");
    const raw = data.suggestions || data.previews || (data.merged ? [data.merged] : []);
    if (!Array.isArray(raw)) throw new Error("추천 목록이 없습니다.");
    const results = raw.flatMap(c => {
        if (typeof c === "string") c = { text: c };
        if (!c || typeof c.text !== "string" || !c.text.trim()) return [];
        return [{ trigger: typeof c.trigger === "string" ? c.trigger.slice(0,500) : "", action: typeof c.action === "string" ? c.action.slice(0,500) : "", outcome: typeof c.outcome === "string" ? c.outcome.slice(0,500) : "", text: c.text.trim(), mechanism: typeof c.mechanism === "string" ? c.mechanism.slice(0, 500) : "", change: typeof c.change === "string" ? c.change.slice(0, 500) : "", caveat: typeof c.caveat === "string" ? c.caveat.slice(0, 500) : "", evidence: validateEvidence(c.evidence, sourceMessages) }];
    }).slice(0, 12);
    if (!results.length) throw new Error("유효한 추천이 없습니다.");
    return results;
}
function grams(text) {
    const clean = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const set = new Set();
    for (let i = 0; i < clean.length - 2; i++) set.add(clean.slice(i, i + 3));
    return set;
}
function overlap(a, b) { const x = grams(a), y = grams(b); return !x.size || !y.size ? 0 : [...x].filter(g => y.has(g)).length / Math.sqrt(x.size * y.size); }
export function selectDiverse(candidates, count, threshold = 0.6) {
    const ranked = [...candidates]; // Quote availability is not an editorial quality score.
    const selected = [];
    for (const c of ranked) {
        const skeleton = x => [x.trigger, x.action, x.outcome].filter(Boolean).join(" ");
        if (selected.some(s => s.text === c.text || (threshold > 0 && skeleton(c) && skeleton(s) && overlap(skeleton(c), skeleton(s)) >= Math.max(0.8, threshold)) || (threshold > 0 && (overlap(c.text, s.text) >= threshold || (c.mechanism && s.mechanism && overlap(c.mechanism, s.mechanism) >= Math.max(0.8, threshold)))))) continue;
        selected.push(c);
        if (selected.length >= count) break;
    }
    return selected;
}
export function parseSuggestions(response) { return parseCandidates(response, [], true).map(c => c.text); }
export const parsePreviewResponse = parseSuggestions;
export function parseMergeResponse(response) { return parseSuggestions(response)[0] || ""; }
