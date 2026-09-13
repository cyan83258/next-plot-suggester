/** Budgeted, inspectable context. All non-verbatim messages enter the excerpt pool. */
import { getContext } from "../../../extensions.js";
import { selected_world_info, loadWorldInfo } from "../../../world-info.js";
import { state } from "./state.js";
import { estimateTokens } from "./utils.js";
import { messages, storyId, sceneId, validMemory, digest } from "./story.js";

const sourceCache = new Map();
export function clearContextCache() { sourceCache.clear(); }
export async function loadContextSource(name, loader, revision = state.contextRevision || 0) {
    const key = `${storyId()}:${name}`; // Explicit lore/settings events clear this cache; new messages reuse loaded books.
    if (sourceCache.has(key) && Date.now() - sourceCache.get(key).at > 60000) sourceCache.delete(key);
    if (!sourceCache.has(key)) {
        if (sourceCache.size > 30) sourceCache.clear();
        const promise = Promise.resolve().then(loader).catch(error => { sourceCache.delete(key); throw error; });
        sourceCache.set(key, { promise, at: Date.now() });
    }
    return sourceCache.get(key).promise;
}
export async function tokenCount(text) {
    try {
        const counter = getContext().getTokenCountAsync;
        if (counter) {
            const count = await counter(text, 0);
            if (Number.isFinite(count) && count >= 0) return { count, method: "SillyTavern tokenizer" };
        }
    } catch { /* offline tokenizer fallback */ }
    return { count: estimateTokens(text), method: "문자 수 기반 추정" };
}
export function trimBudget(text, budget, tail = false) {
    if (budget <= 0) return "";
    if (estimateTokens(text) <= budget) return text;
    let low = 0, high = text.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const part = tail ? text.slice(-mid) : text.slice(0, mid);
        if (estimateTokens(part + " …[일부 생략]") <= budget) low = mid;
        else high = mid - 1;
    }
    return low ? (tail ? "[앞부분 생략]… " + text.slice(-low) : text.slice(0, low) + " …[일부 생략]") : "";
}
export function relevantScore(text, query) {
    const terms = new Set((query.slice(-12000).toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || []).slice(-80));
    const lower = text.toLowerCase();
    let score = 0;
    for (const term of terms) if (lower.includes(term)) score++;
    return score;
}
export function packChat(sourceMessages, budget, compression = true, threshold = 20) {
    if (!sourceMessages.length || budget <= 0) return { text: "", recent: [], excerpts: [], omitted: sourceMessages.map(m => m.id), partial: [] };
    const useCompression = compression && sourceMessages.length > threshold;
    const recentBudget = useCompression ? Math.floor(budget * 0.65) : budget;
    const recent = [], partial = [];
    let used = 0;
    for (let i = sourceMessages.length - 1; i >= 0; i--) {
        const m = sourceMessages[i], full = `[M${m.id}] ${m.role}: ${m.text}`;
        if (used + estimateTokens(full) > recentBudget) {
            if (!recent.length) {
                const clipped = trimBudget(m.text, Math.max(0, recentBudget - estimateTokens(`[M${m.id}] ${m.role}: `) - 20), true);
                if (clipped) { recent.unshift({ ...m, rendered: `[M${m.id}] ${m.role}: ${clipped}` }); partial.push(m.id); used += estimateTokens(recent[0].rendered); }
            }
            break;
        }
        recent.unshift({ ...m, rendered: full }); used += estimateTokens(full);
    }
    const recentIds = new Set(recent.map(m => m.id));
    const older = sourceMessages.filter(m => !recentIds.has(m.id) || partial.includes(m.id));
    const query = sourceMessages.slice(-3).map(m => m.text).join(" ");
    const pool = older.flatMap(m => m.text.split(/(?<=[.!?。！？])\s+|\n+/).filter(s => s.trim().length >= 5).map((text, order) => ({ id: m.id, role: m.role, text: text.trim(), order, score: relevantScore(text, query) + m.id / (sourceMessages.at(-1).id + 1) })));
    const terms = [...new Set((query.slice(-12000).toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || []).slice(-80))];
    const frequency = new Map(terms.map(term => [term, pool.filter(p => p.text.toLowerCase().includes(term)).length]));
    for (const p of pool) p.score = terms.reduce((score, term) => score + (p.text.toLowerCase().includes(term) ? Math.log(1 + pool.length / (1 + frequency.get(term))) : 0), 0) + p.id / (sourceMessages.at(-1).id + 1);
    pool.sort((a, b) => b.score - a.score);
    const excerpts = [];
    const selectedText = new Set(), perMessage = new Map();
    let remaining = Math.max(0, budget - used - 65);
    if (useCompression) for (const p of pool) {
        if (remaining < 35) break;
        if (selectedText.has(p.text) || (perMessage.get(p.id) || 0) >= 2) continue;
        const full = `[M${p.id}] ${p.role}: ${p.text}`;
        const rendered = trimBudget(full, Math.min(remaining, 180));
        if (!rendered) continue;
        excerpts.push({ ...p, rendered }); remaining -= estimateTokens(rendered) + 2;
        selectedText.add(p.text); perMessage.set(p.id, (perMessage.get(p.id) || 0) + 1);
    }
    excerpts.sort((a, b) => a.id - b.id || a.order - b.order);
    const represented = new Set([...recent.map(m => m.id), ...excerpts.map(m => m.id)]);
    return {
        text: (excerpts.length ? "Earlier source excerpts (incomplete, NOT a full summary):\n" + excerpts.map(m => m.rendered).join("\n") + "\n\n" : "") + "Recent story (chronological):\n" + recent.map(m => m.rendered).join("\n\n"),
        recent: recent.map(m => m.id), excerpts: [...new Set(excerpts.map(m => m.id))], partial,
        omitted: sourceMessages.filter(m => !represented.has(m.id)).map(m => m.id),
    };
}
export function getChatHistory(budget = 2400) { return packChat(messages(), budget).text; }
export function getCharacterDescription(ctx = getContext()) {
    const indices = ctx.groupId ? (ctx.groups?.find(g => g.id === ctx.groupId)?.members || []).map(avatar => ctx.characters.findIndex(c => c.avatar === avatar)) : [ctx.characterId];
    return indices.map(id => ctx.characters?.[id]).filter(Boolean).map(c => [c.name, c.description || c.data?.description, c.personality || c.data?.personality, c.scenario || c.data?.scenario].filter(Boolean).join("\n")).join("\n\n");
}
export function getPersonaDescription(ctx = getContext()) { return ctx.persona_description || ctx.powerUserSettings?.persona_description || ""; }
export function getScenarioSummary(ctx = getContext()) {
    const data = ctx.chatMetadata?.scenarioSummary || ctx.chatMetadata?.["Scenario-Summarizer"];
    if (data?.summaries) return Object.values(data.summaries).map(s => s?.content).filter(Boolean).join("\n\n");
    const external = globalThis.SummarizerDebug?.getSummaryData?.();
    return external?.chatId === ctx.chatId && external?.summaries ? Object.values(external.summaries).map(s => s?.content).filter(Boolean).join("\n\n") : "";
}
export function getAUWorldBuilderSettings(snap) {
    const data = snap.auData;
    return data ? [data.worldSetting, data.characterSettings?.char, data.characterSettings?.user, data.auConcept, data.genrePrompt].filter(Boolean).join("\n\n") : "";
}
export function captureActivatedLore(args) {
    const entries = Array.from(args?.activated?.entries || []);
    state.activeLore = { scene: sceneId(), story: storyId(), messages: messages(), entries: entries.filter(e => e.content).map(e => ({ content: e.content, comment: e.comment || "", uid: e.uid })) };
}
export async function getWorldInfoBefore(snap) {
    const ctx = snap.context;
    const active = state.activeLore, currentMessages = messages(ctx);
    const scanMatches = active?.story === snap.story && currentMessages.length >= active.messages.length && currentMessages.length <= active.messages.length + 1 && active.messages.every((m, i) => currentMessages[i]?.text === m.text && currentMessages[i]?.swipe === m.swipe);
    if (scanMatches) return { entries: active.entries, mode: "SillyTavern 직전 생성의 활성 항목" };
    const books = new Set(selected_world_info || []);
    if (ctx.chatMetadata?.world_info) books.add(ctx.chatMetadata.world_info);
    const chars = ctx.groupId ? (ctx.groups?.find(g => g.id === ctx.groupId)?.members || []).map(a => ctx.characters.find(c => c.avatar === a)).filter(Boolean) : [ctx.characters?.[ctx.characterId]].filter(Boolean);
    let entries = [];
    for (const char of chars) {
        entries.push(...(char.data?.character_book?.entries || []));
        if (char.data?.extensions?.world) books.add(char.data.extensions.world);
    }
    const loaded = await Promise.allSettled([...books].map(name => loadContextSource(`book:${name}`, () => loadWorldInfo(name), snap.revision)));
    for (const result of loaded) if (result.status === "fulfilled") entries.push(...Object.values(result.value?.entries || {}));
    const query = messages(ctx).slice(-6).map(m => m.text).join("\n").toLowerCase();
    const seen = new Set();
    entries = entries.filter(e => {
        if (!e?.content || e.disable || e.enabled === false || seen.has(e.content)) return false;
        const keys = e.key || e.keys || [];
        const primary = keys.some(k => k && query.includes(String(k).toLowerCase()));
        const secondary = e.keysecondary || e.secondary_keys || [];
        const matches = secondary.map(k => query.includes(String(k).toLowerCase()));
        const logic = e.selectiveLogic ?? e.selective_logic ?? 0;
        const secondaryOK = !e.selective || !matches.length || (logic === 1 ? !matches.every(Boolean) : logic === 2 ? !matches.some(Boolean) : logic === 3 ? matches.every(Boolean) : matches.some(Boolean));
        if (!e.constant && !(primary && secondaryOK)) return false;
        seen.add(e.content); return true;
    });
    entries.sort((a, b) => relevantScore(b.content, query) - relevantScore(a.content, query));
    return { entries, mode: "현재 키워드 기반 대체 검색 (재귀·확률 등 ST 전체 활성 규칙과 다름)", failures: loaded.filter(r => r.status === "rejected").length };
}
export async function collectSources(snap) {
    const sources = snap.settings.inputSources;
    const list = [], warnings = [];
    const tasks = [
        ["캐릭터", sources.charDescription, () => getCharacterDescription(snap.context)],
        ["페르소나", sources.personaDescription, () => getPersonaDescription(snap.context)],
        ["시나리오 요약", sources.scenarioSummary, () => getScenarioSummary(snap.context)],
        ["AU 설정", sources.auWorldBuilder, () => getAUWorldBuilderSettings(snap)],
    ];
    const results = await Promise.allSettled(tasks.map(async ([name, enabled, loader]) => ({ name, text: enabled ? await loader() : "", enabled })));
    results.forEach((r, i) => { if (r.status === "fulfilled") { if (r.value.text) list.push(r.value); else if (r.value.enabled) warnings.push(`${tasks[i][0]}: 자료 없음`); } else warnings.push(`${tasks[i][0]}: 로딩 실패`); });
    if (sources.worldInfo) {
        try {
            const lore = await getWorldInfoBefore(snap);
            warnings.push("로어북: " + lore.mode);
            if (lore.failures) warnings.push(`로어북 ${lore.failures}개 로딩 실패`);
            lore.entries.forEach(e => list.push({ name: "로어북 " + (e.comment || e.uid || "항목"), text: e.content }));
        } catch { warnings.push("로어북 로딩 실패"); }
    }
    const memory = validMemory(snap.context);
    if (snap.settings.useStoryMemory) memory.items.forEach(item => list.push({ name: `기억:${item.category}`, text: `${item.text}\n${item.evidence.map(e => `[M${e.id}] ${e.quote}`).join("\n")}` }));
    return { list, warnings, memoryCovered: memory.covered };
}
export async function fitContext(instructions, snap, collected) {
    const outputReserve = snap.settings.maxTokens;
    const budget = snap.settings.maxContextTokens - outputReserve - 128;
    const base = await tokenCount(instructions);
    if (budget - base.count < 200) throw new Error("지시문과 출력 예약량이 맥락 예산을 채웠습니다. 최대 컨텍스트를 늘리거나 지시문/출력 길이를 줄여주세요.");
    const sourceMessages = snap.settings.inputSources.chatHistory !== false ? messages(snap.context) : [];
    let allowance = budget - base.count;
    let prompt, report;
    for (let attempt = 0; attempt < 9; attempt++) {
        const chatBudget = Math.floor(allowance * (collected.list.length ? 0.62 : 0.96));
        const packed = packChat(sourceMessages, chatBudget, snap.settings.enableCompression !== false, snap.settings.compressionThreshold);
        const sections = [], included = [], excluded = [];
        let left = allowance - estimateTokens(packed.text) - 35;
        const perSource = Math.max(50, Math.floor(left / Math.max(1, Math.min(collected.list.length, 5))));
        for (const source of collected.list) {
            const text = trimBudget(source.text, Math.min(perSource, left - 15));
            if (text) { const block = `[${source.name}]\n${text}`; sections.push(block); included.push({ name: source.name, tokens: estimateTokens(block), truncated: text !== source.text }); left -= estimateTokens(block) + 5; }
            else excluded.push(source.name);
        }
        prompt = instructions + "\n<story_material>\n" + sections.join("\n\n") + "\n" + packed.text + "\n</story_material>";
        const measured = await tokenCount(prompt);
        report = { ...packed, text: undefined, sources: included, excluded, warnings: collected.warnings, memoryCovered: collected.memoryCovered, total: measured.count, budget: snap.settings.maxContextTokens, outputReserve, method: measured.method, reserved: base.count, prompt, at: Date.now() };
        if (measured.count <= budget) {
            report.key = await digest({ v: 2, story: snap.story, scene: snap.scene, settings: snap.settings, connection: snap.connection, prompt });
            return { prompt, report };
        }
        allowance = Math.floor(allowance * Math.min(0.85, (budget - base.count) / Math.max(1, measured.count - base.count) * 0.93));
    }
    throw new Error("최종 프롬프트가 토큰 예산을 초과했습니다. 컨텍스트 예산을 늘려주세요.");
}
