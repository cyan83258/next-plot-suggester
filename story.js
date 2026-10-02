/** Story snapshots and evidence. Proposed plots are never stored as canon. */
import { extension_settings, getContext } from "../../../extensions.js";
import { extensionName, defaultSettings } from "./constants.js";
import { state } from "./state.js";
import { sanitizeSettings } from "./settings.js";

export const MEMORY_KEY = "npsStoryMemoryV2";
export const categories = ["fact", "goal", "relationship", "open", "resolved", "hypothesis"];
export const clone = value => JSON.parse(JSON.stringify(value));
export function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
    return JSON.stringify(value);
}
export async function digest(value) {
    const bytes = new TextEncoder().encode(typeof value === "string" ? value : stable(value));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export function storyId(ctx = getContext()) {
    return stable([ctx.groupId ?? null, ctx.characterId ?? null, ctx.chatId ?? "", ctx.characters?.[ctx.characterId]?.avatar ?? ""]);
}
export function messages(ctx = getContext()) {
    return (ctx.chat || []).map((m, i) => ({ id: i + 1, role: m.is_user ? (ctx.name1 || "User") : (m.name || ctx.name2 || "Character"), text: String(m.mes || ""), swipe: m.swipe_id ?? 0, system: !!m.is_system })).filter(m => !m.system);
}
// Compact full-content change detector for synchronous UI guards. Cache keys use SHA-256.
export function fingerprint(text) {
    let a = 2166136261, b = 2246822519;
    for (let i = 0; i < text.length; i++) { const n = text.charCodeAt(i); a = Math.imul(a ^ n, 16777619); b = Math.imul(b ^ n, 3266489917); }
    return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
export function messageStamp(m) { return { id: m.id, role: m.role, swipe: m.swipe, hash: fingerprint(m.text) }; }
export function sceneId(ctx = getContext()) {
    return stable([storyId(ctx), fingerprint(stable(messages(ctx).map(messageStamp)))]);
}
export function activeFeedback(settings, ctx) {
    const story = storyId(ctx), scene = sceneId(ctx);
    return (settings.feedbackRecords || []).filter(f => f.scope === "global" || (f.story === story && (f.scope === "story" || f.scene === scene))).slice(-30);
}
export function settingsSnapshot() {
    const saved = extension_settings[extensionName] || {};
    const settings = clone({ ...defaultSettings, ...saved });
    for (const key of ["inputSources", "sceneLocks", "qualityEnhancements", "moodSettings", "focusTarget", "pacing", "narrativeArc"]) settings[key] = { ...defaultSettings[key], ...saved[key] };
    return sanitizeSettings(settings);
}
export function snapshot(direction = state.currentCustomDirection || "") {
    const ctx = getContext();
    const context = clone({ chat: ctx.chat || [], chatId: ctx.chatId, characterId: ctx.characterId, groupId: ctx.groupId, name1: ctx.name1, name2: ctx.name2, characters: ctx.characters || [], groups: ctx.groups || [], chatMetadata: Object.fromEntries(Object.entries(ctx.chatMetadata || {}).filter(([k])=>k!=="npsResultHistoryV1")), persona_description: ctx.powerUserSettings?.persona_description || "" });
    const settings = settingsSnapshot();
    const connection = clone({ mainApi: ctx.mainApi, chat: ctx.chatCompletionSettings || {}, text: ctx.textCompletionSettings || {} });
    return { settings, context, connection, auData: clone(extension_settings["AU-World-Builder"]?.chatData?.[ctx.chatId] || null), direction, revision: state.contextRevision || 0, scene: sceneId(ctx), story: storyId(ctx), feedback: activeFeedback(settings, context) };
}
export function isCurrent(snap) {
    return snap.revision === (state.contextRevision || 0) && snap.scene === sceneId() && stable(snap.settings) === stable(settingsSnapshot()) && stable(snap.connection) === stable({ mainApi: getContext().mainApi, chat: getContext().chatCompletionSettings || {}, text: getContext().textCompletionSettings || {} });
}
export function assertCurrent(snap, signal) {
    if (signal?.aborted || !isCurrent(snap)) throw new DOMException("채팅 또는 설정이 바뀌어 이전 요청을 중단했습니다.", "AbortError");
}
export function validMemory(ctx) {
    const stored = ctx.chatMetadata?.[MEMORY_KEY];
    const current = messages(ctx);
    if (!stored || stored.story !== storyId(ctx)) return { items: [], covered: 0 };
    let covered = 0;
    for (let i = 0; i < Math.min(current.length, stored.sourceMessages?.length || 0); i++) {
        const saved = stored.sourceMessages[i];
        if (stable(saved.text === undefined ? messageStamp(current[i]) : current[i]) !== stable(saved)) break;
        covered++;
    }
    // Any edit/swipe invalidates later deductions, even if their quoted line is unchanged.
    const validIds = new Set(current.slice(0, covered).map(m => m.id));
    return { items: (stored.items || []).filter(item => item.through <= covered && item.evidence?.every(e => validIds.has(e.id) && current.find(m => m.id === e.id)?.text.includes(e.quote))), covered };
}
export function validateEvidence(evidence, sourceMessages) {
    return (Array.isArray(evidence) ? evidence : []).filter(e => Number.isInteger(e?.id) && typeof e.quote === "string" && e.quote.trim().length >= 4 && sourceMessages.some(m => m.id === e.id && m.text.includes(e.quote))).map(e => ({ id: e.id, quote: e.quote.slice(0, 500) })).slice(0, 4);
}
export function validateMemory(items, sourceMessages, through) {
    return (Array.isArray(items) ? items : []).flatMap(item => {
        const evidence = validateEvidence(item?.evidence, sourceMessages);
        return evidence.length && typeof item.text === "string" && categories.includes(item.category)
            ? [{ category: item.category, text: item.text.slice(0, 800), evidence, through }] : [];
    }).slice(0, 60);
}
export function recordFeedback({ polarity, reason, note = "", scope = "scene", suggestion = "" }) {
    if (!["scene", "story", "global"].includes(scope)) scope = "scene";
    const settings = extension_settings[extensionName];
    const records = settings.feedbackRecords ||= [];
    records.push({ id: crypto.randomUUID(), polarity, reason, note: note.slice(0, 1000), scope, suggestion: suggestion.slice(0, 1500), story: storyId(), scene: sceneId(), at: Date.now() });
    settings.feedbackRecords = records.slice(-150);
    getContext().saveSettingsDebounced();
}
