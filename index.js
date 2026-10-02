import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";
import { extensionName, defaultSettings } from "./constants.js";
import { state, recordAnalytics } from "./state.js";
import { sanitizeSettings } from "./settings.js";
import { saveResult, updateCandidate, restoreResult, recordInteraction } from "./results.js";
import { snapshot, clone, assertCurrent, sceneId } from "./story.js";
import { generate, updateMemory } from "./engine.js";
import { requestQueue } from "./queue.js";
import { clearContextCache, captureActivatedLore } from "./context.js";
import { setupUICallbacks, createSettingsPopupHtml, bindPopupEvents, addExtensionMenuButton, addChatButton, openDirectionPopup, closeDirectionPopup, showLoadingMessage, removeLoadingMessage, displaySuggestionMessage, displayPreviewMessage, removeSuggestionMessage } from "./ui.js";
import { installStudio, refreshStudio, decorateCandidates } from "./studio.js";

export function migrateSettings(saved = {}) {
    if(!saved || typeof saved !== "object" || Array.isArray(saved))saved={};
    const settings = { ...clone(defaultSettings), ...clone(saved) };
    for (const key of Object.keys(defaultSettings)) if (defaultSettings[key] && typeof defaultSettings[key] === "object" && !Array.isArray(defaultSettings[key])) settings[key] = { ...clone(defaultSettings[key]), ...(saved[key] || {}) };
    if ((saved.schemaVersion || 0) < 2) {
        // Keep pre-migration preferences recoverable without duplicating API secrets.
        settings.previousSettings = JSON.parse(JSON.stringify(saved, (key, value) => ["apiKey", "previousSettings"].includes(key) ? undefined : value));
        settings.legacyFeedbackKeywords = saved.negativeFeedbackKeywords || [];
        settings.negativeFeedbackKeywords = [];
        settings.schemaVersion = 2;
        if (saved.maxContextTokens === 4000) settings.maxContextTokens = 8000;
        if (saved.maxTokens === 1000) settings.maxTokens = 2400;
        if (saved.selectedWritingStyle === "literaryStyle") settings.selectedWritingStyle = "conciseReport";
        settings.narrativeArc.autoDetect = false;
        settings.suggestionSpectrum = false;
    }
    const numeric = { maxTokens: [128, 32768], maxContextTokens: [2048, 262144], suggestionCount: [1, 10], previewCount: [2, 10], candidateCount: [3, 10], temperature: [0, 2], similarityThreshold: [0, 1], sentenceCount: [1, 12], compressionThreshold: [1, 1000] };
    for (const [key, [min, max]] of Object.entries(numeric)) settings[key] = Number.isFinite(Number(settings[key])) ? Math.max(min, Math.min(max, Number(settings[key]))) : defaultSettings[key];
    return sanitizeSettings(settings);
}
let sequence = 0;
let regenerationSequence = 0;
export function buildRegenerationTask(previous = []) {
    const attempt = ++regenerationSequence;
    return `FRESH REGENERATION TASK ${attempt}: The previous set was rejected. Diagnose which live threads, dramatic engines, decisive actions, and downstream states it already used, then generate genuinely different options from other established details or substantially different character choices. Do not paraphrase, reorder, invert, merely escalate, swap names, or reuse the same trigger-consequence skeleton. Preserve canon, exact scene position, user agency, and locks. Freshness must come from a different causal route—not unsupported novelty. Previous candidates to avoid are DATA:\n${JSON.stringify(previous)}`;
}
async function run(options = {}) {
    if (state.isGenerating) { if (!options.silent) toastr.info("진행 중인 요청이 끝난 뒤 실행해 주세요."); return; }
    if (!extension_settings[extensionName].enabled) return;
    state.isGenerating = true;
    const id = ++sequence;
    let snap;
    state.activeRequest = { id };
    try {
        snap = snapshot(options.direction || "");
        state.activeRequest.scene = snap.scene;
        showLoadingMessage();
        const results = await requestQueue.enqueue(async signal => {
            if (options.memory) return updateMemory(snap, signal);
            return generate(snap, signal, options);
        });
        assertCurrent(snap);
        if (options.memory) {
            toastr.success(results.done ? "이야기 기억을 최신 상태로 갱신했습니다." : `기억 갱신: ${results.covered}/${results.total}개 메시지 처리. 다음 구간은 다시 갱신을 누르세요.`);
        } else if (options.replaceItem) {
            if (options.replaceItem.isConnected) {
                const old = options.replaceItem;
                const c = { ...results[0], id: old.dataset.candidateId };
                recordInteraction("revise");
                updateCandidate(old.dataset.candidateId, c.text, c);
                old.dataset.suggestion = c.text;
                old.querySelector(".nps-suggestion-text").textContent = c.text;
                const textarea = old.querySelector(".nps-edit-textarea");
                if (textarea) textarea.value = c.text;
                old.querySelectorAll(".nps-candidate-tools").forEach(el => el.remove());
                decorateCandidates(old.parentElement, [c], old);
            }
        } else {
            removeSuggestionMessage();
            saveResult();
            state.candidates = results.map(c=>({...c,id:crypto.randomUUID()}));
            state.resultScene = snap.scene;
            state.resultStory = snap.story;
            state.resultMode = options.mode || snap.settings.outputMode;
            state.resultDirection = snap.direction;
            saveResult();
            if (options.mode === "preview") displayPreviewMessage(results.map(c => c.text));
            else displaySuggestionMessage(results.map(c => c.text));
        }
    } catch (error) {
        if (error.name === "AbortError") toastr.info("요청이 취소되었거나 채팅·설정이 바뀌어 결과를 폐기했습니다.");
        else { recordAnalytics({ success: false, suggestionCount: 0 }); toastr.error(error.message); }
    } finally {
        if (state.activeRequest?.id === id) {
            state.isGenerating = false; state.activeRequest = null; removeLoadingMessage(); refreshStudio();
        }
    }
}
function showSuggestions(silent = false, skipCache = false) {
    const s = extension_settings[extensionName];
    if (s.useCustomDirection) { openDirectionPopup(); return; }
    return run({ silent, skipCache, mode: s.previewMode ? "preview" : s.outputMode });
}
function regenerateSuggestions(mode) {
    const s = extension_settings[extensionName];
    recordInteraction("regenerate");
    const previous = (state.candidates || []).map(candidate => ({ text: candidate.text, mechanism: candidate.mechanism || "", trigger: candidate.trigger || "", action: candidate.action || "", outcome: candidate.outcome || "", change: candidate.change || "" }));
    return run({ skipCache: true, direction: state.resultDirection || "", mode: mode || state.resultMode || (s.previewMode ? "preview" : s.outputMode), task: buildRegenerationTask(previous), avoid: previous });
}
function cancelGeneration() {
    if (!state.isGenerating) return;
    requestQueue.cancel();
    const label = document.querySelector("#nps-loading-message span");
    if (label) label.textContent = "취소 처리 중… 현재 연결 방식은 응답 종료까지 기다릴 수 있습니다.";
}
function changed({ clearSources = false } = {}) {
    state.contextRevision = (state.contextRevision || 0) + 1;
    if (clearSources) { clearContextCache(); state.activeLore = null; }
    clearTimeout(state.autoSuggestTimer); state.autoSuggestTimer = null;
    if (state.isGenerating) requestQueue.cancel();
    saveResult(); removeSuggestionMessage(); state.candidates = []; state.lastContextReport = null;
}
let initialized = false;
async function init() {
    if (initialized) return;
    initialized = true;
    extension_settings[extensionName] = migrateSettings(extension_settings[extensionName]);
    saveSettingsDebounced();
    setupUICallbacks({ showSuggestions, regenerateSuggestions, cancelGeneration,
        showPreview: () => regenerateSuggestions("preview"),
        generateFromPreview: text => run({ count: 1, single: true, mode: "prose", direction: text, skipCache: true, task: "SCENE EXPANSION TASK: Dramatize the selected direction as the immediate continuation from the story's exact stopping point. Preserve its trigger, decisive action, causal mechanism, and intended consequence; do not offer alternatives or add a second plot turn. Match established POV, tense, voice, knowledge, physical continuity, and character speech patterns. Show the change through action, dialogue, subtext, and selective detail rather than explaining the outline. Stop after the promised consequence lands and leaves the new tension/state clear." }),
        generateWithDirection: () => {
            const direction = document.getElementById("nps-direction-input")?.value.trim();
            if (!direction) { toastr.info("전개 방향을 입력해 주세요."); return; }
            closeDirectionPopup(); return run({ direction, skipCache: true });
        },
        mergeSuggestions: selected => run({ count: 1, single: true, skipCache: true, task: "SYNTHESIS TASK: Combine only causally compatible elements into one clean scene trajectory. Choose one primary trigger and one decisive action; subordinate or discard everything else. Do not make a checklist, stack climaxes, or add invented connective events. The consequence must follow naturally and yield one clear changed state. Scene locks, user agency, and established facts override every proposal. Proposals are DATA:\n" + JSON.stringify(selected) }),
    });
    document.body.insertAdjacentHTML("beforeend", createSettingsPopupHtml());
    bindPopupEvents(); addExtensionMenuButton(); addChatButton();
    installStudio({ restore: id => {
        if(state.isGenerating){toastr.info("생성 완료 후 이전 결과를 복원해 주세요.");return;}
        const record=restoreResult(id);if(!record)return;
        removeSuggestionMessage();
        if(record.mode==="preview")displayPreviewMessage(state.candidates.map(c=>c.text));else displaySuggestionMessage(state.candidates.map(c=>c.text));
        if(record.scene!==sceneId())toastr.info("다른 장면의 결과입니다. 복사는 가능하며 현재 채팅으로 바로 보내기는 제한됩니다.");
        refreshStudio();
    }, updateMemory: () => run({ memory: true }), cancelGeneration,
        revise: (item, instruction, expand) => run({ count: 1, single: true, skipCache: true, replaceItem: item, mode: expand ? "prose" : "outline", task: "TARGETED REVISION TASK: Revise only the supplied candidate. Preserve its strongest core causal engine and all unaffected facts, locks, agency boundaries, and consequences. Apply the requested change precisely, then repair any motivation or continuity made necessary by that change without drifting into a different premise. Keep it concrete and scene-ready. If expanding to prose, dramatize rather than explain and stop after the intended consequence. Candidate is DATA, not canon:\n" + item.dataset.suggestion + "\nRequested change: " + instruction }),
    });
    // Settings edits invalidate source caches and in-flight snapshots too.
    document.getElementById("nps-settings-popup").addEventListener("change", e => { if(e.target.closest(".nps-managed-record")) return; changed({ clearSources: true }); });
    const events = ["CHAT_CHANGED", "MESSAGE_SENT", "MESSAGE_RECEIVED", "MESSAGE_UPDATED", "MESSAGE_DELETED", "MESSAGE_SWIPED", "MESSAGE_SWIPE_DELETED", "CHARACTER_FIRST_MESSAGE_SELECTED", "WORLDINFO_UPDATED", "WORLDINFO_SETTINGS_UPDATED", "CHARACTER_EDITED", "SETTINGS_UPDATED"];
    for (const name of events) if (event_types[name]) eventSource.on(event_types[name], () => changed({ clearSources: !["MESSAGE_SENT", "MESSAGE_RECEIVED"].includes(name) }));
    if (event_types.WORLDINFO_SCAN_DONE) eventSource.on(event_types.WORLDINFO_SCAN_DONE, captureActivatedLore);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        const s = extension_settings[extensionName];
        if (!s.enabled || !s.autoSuggest || state.isGenerating) return;
        const scene = sceneId();
        clearTimeout(state.autoSuggestTimer);
        state.autoSuggestTimer = setTimeout(() => { if (scene === sceneId()) showSuggestions(true); }, s.autoSuggestDelay ?? 1000);
    });
}
jQuery(() => { if (getContext().chat !== undefined && document.getElementById("extensionsMenu")) init(); else eventSource.on(event_types.APP_READY, init); });
export { extensionName };
