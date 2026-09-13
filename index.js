import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";
import { extensionName, defaultSettings } from "./constants.js";
import { state, recordAnalytics } from "./state.js";
import { snapshot, clone, assertCurrent, sceneId } from "./story.js";
import { generate, updateMemory } from "./engine.js";
import { requestQueue } from "./queue.js";
import { clearContextCache, captureActivatedLore } from "./context.js";
import { setupUICallbacks, createSettingsPopupHtml, bindPopupEvents, addExtensionMenuButton, addChatButton, openDirectionPopup, closeDirectionPopup, showLoadingMessage, removeLoadingMessage, displaySuggestionMessage, displayPreviewMessage, removeSuggestionMessage } from "./ui.js";
import { installStudio, refreshStudio, decorateCandidates } from "./studio.js";

export function migrateSettings(saved = {}) {
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
    return settings;
}
let sequence = 0;
async function run(options = {}) {
    if (state.isGenerating) { if (!options.silent) toastr.info("진행 중인 요청이 끝난 뒤 실행해 주세요."); return; }
    if (!extension_settings[extensionName].enabled) return;
    state.isGenerating = true;
    const id = ++sequence;
    const snap = snapshot(options.direction || "");
    state.activeRequest = { id, scene: snap.scene };
    showLoadingMessage();
    try {
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
                const c = results[0];
                old.dataset.suggestion = c.text;
                old.querySelector(".nps-suggestion-text").textContent = c.text;
                const textarea = old.querySelector(".nps-edit-textarea");
                if (textarea) textarea.value = c.text;
                old.querySelectorAll(".nps-candidate-tools").forEach(el => el.remove());
                decorateCandidates(old.parentElement, [c], old);
            }
        } else {
            removeSuggestionMessage();
            state.candidates = results;
            state.resultScene = snap.scene;
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
    removeSuggestionMessage(); state.candidates = []; state.lastContextReport = null;
}
let initialized = false;
async function init() {
    if (initialized) return;
    initialized = true;
    extension_settings[extensionName] = migrateSettings(extension_settings[extensionName]);
    saveSettingsDebounced();
    setupUICallbacks({ showSuggestions, cancelGeneration,
        showPreview: () => run({ mode: "preview", skipCache: true }),
        generateFromPreview: text => run({ count: 1, single: true, mode: "prose", direction: text, skipCache: true, task: "Expand this selected direction into prose. Preserve its causal mechanism; do not offer alternative plots." }),
        generateWithDirection: () => {
            const direction = document.getElementById("nps-direction-input")?.value.trim();
            if (!direction) { toastr.info("전개 방향을 입력해 주세요."); return; }
            closeDirectionPopup(); return run({ direction, skipCache: true });
        },
        mergeSuggestions: selected => run({ count: 1, single: true, skipCache: true, task: "Merge compatible elements into one plot. Scene locks and established facts override proposals. Discard incompatible details. Proposals:\n" + JSON.stringify(selected) }),
    });
    document.body.insertAdjacentHTML("beforeend", createSettingsPopupHtml());
    bindPopupEvents(); addExtensionMenuButton(); addChatButton();
    installStudio({ updateMemory: () => run({ memory: true }), cancelGeneration,
        revise: (item, instruction, expand) => run({ count: 1, single: true, skipCache: true, replaceItem: item, mode: expand ? "prose" : "outline", task: "Revise only this candidate; preserve its core idea except requested changes. This is a proposal, not canon:\n" + item.dataset.suggestion + "\nRequested change: " + instruction }),
    });
    // Settings edits invalidate source caches and in-flight snapshots too.
    document.getElementById("nps-settings-popup").addEventListener("change", () => { changed({ clearSources: true }); });
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
