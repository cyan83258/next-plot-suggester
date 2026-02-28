/**
 * 다음 전개 추천 확장 프로그램 - UI 관리
 *
 * Feature 2: 바로 보내기
 * Feature 3: 편집 모드
 * Feature 4: 네거티브 프롬프트 UI
 * Feature 6: Temperature / Max Tokens UI
 * Perf 1: 설정 값 디바운싱
 * Perf 3: 취소 버튼
 * Perf 6: 이벤트 위임 + DOM 최적화
 * Perf 7: 분석 패널
 */
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import {
    extensionName, defaultSettings, defaultQualityPrompts,
    defaultMoods, defaultGenres, plotBeats, plotBeatPresets, narrativeStages, emotions,
    conditionalRulePresets, sceneAtmospheres, sensoryOptions, qualityEnhancements
} from "./constants.js";
import { state, getAnalyticsSummary } from "./state.js";
import {
    log, escapeHtml, escapeAttr, copyToClipboard,
    scrollToBottom, pasteToInputField, sendMessageToChat, getAllGenres
} from "./utils.js";
import { testApiConnection } from "./api.js";
import { detectNarrativeStage, getTokenBreakdown } from "./prompt.js";
import { analyzeConversationRhythm } from "./utils.js";
import { createSettingsPopupHtml, createSuggestionMessageHtml, createPreviewMessageHtml } from "./ui-html.js";

// UI 콜백 (index.js에서 설정)
const _callbacks = {
    showSuggestions: null,
    generateWithDirection: null,
    cancelGeneration: null,
    generateFromPreview: null,
    showPreview: null,
    mergeSuggestions: null
};

export function setupUICallbacks(callbacks) {
    if (callbacks.showSuggestions) _callbacks.showSuggestions = callbacks.showSuggestions;
    if (callbacks.generateWithDirection) _callbacks.generateWithDirection = callbacks.generateWithDirection;
    if (callbacks.cancelGeneration) _callbacks.cancelGeneration = callbacks.cancelGeneration;
    if (callbacks.generateFromPreview) _callbacks.generateFromPreview = callbacks.generateFromPreview;
    if (callbacks.showPreview) _callbacks.showPreview = callbacks.showPreview;
    if (callbacks.mergeSuggestions) _callbacks.mergeSuggestions = callbacks.mergeSuggestions;
}

// ═══════════════════════════════════════════
// 설정 저장 (Perf 1: 디바운싱)
// ═══════════════════════════════════════════
function saveSettings() {
    saveSettingsDebounced();
}

// ═══════════════════════════════════════════
// 설정 팝업
// ═══════════════════════════════════════════
export function openSettingsPopup() {
    const popup = document.getElementById("nps-settings-popup");
    if (popup) {
        $(popup).addClass("open");
        updatePopupUIFromSettings();
        refreshAnalyticsPanel();
    }
}

export function closeSettingsPopup() {
    const popup = document.getElementById("nps-settings-popup");
    if (popup) $(popup).removeClass("open");
}

// 헬퍼
function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
}
function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

export function updatePopupUIFromSettings() {
    const settings = extension_settings[extensionName];

    // 기본 설정
    setChecked("nps-popup-enabled", settings.enabled);
    setChecked("nps-popup-auto-suggest", settings.autoSuggest);
    setValue("nps-popup-auto-suggest-delay", settings.autoSuggestDelay || 1000);
    setChecked("nps-popup-auto-paste", settings.autoPasteToInput);
    setChecked("nps-popup-show-input-btn", settings.showInputButton !== false);
    setChecked("nps-popup-use-custom-direction", settings.useCustomDirection === true);
    setValue("nps-popup-sentence-count", settings.sentenceCount);
    setValue("nps-popup-suggestion-count", settings.suggestionCount);
    setValue("nps-popup-output-language", settings.outputLanguage || "ko");
    setValue("nps-popup-custom-prompt", settings.customPrompt || "");
    setValue("nps-popup-negative-prompt", settings.negativePrompt || "");

    // v1.5.1: 프리뷰 모드
    setChecked("nps-popup-preview-mode", settings.previewMode === true);
    setValue("nps-popup-preview-count", settings.previewCount || 5);

    // v1.3.0: 생성 파라미터
    const tempEl = document.getElementById("nps-popup-temperature");
    if (tempEl) tempEl.value = settings.temperature || 0.8;
    const tempDisplay = document.getElementById("nps-popup-temp-value");
    if (tempDisplay) tempDisplay.textContent = (settings.temperature || 0.8).toFixed(1);
    setValue("nps-popup-max-tokens", settings.maxTokens || 1000);
    setValue("nps-popup-max-context", settings.maxContextTokens || 4000);
    setChecked("nps-popup-json-mode", settings.useJsonMode !== false);
    setChecked("nps-popup-enable-cache", settings.enableCache !== false);
    setChecked("nps-popup-enable-compression", settings.enableCompression !== false);
    setValue("nps-popup-compression-threshold", settings.compressionThreshold || 20);

    // API 설정
    setValue("nps-popup-api-type", settings.apiType);
    setValue("nps-popup-api-endpoint", settings.apiEndpoint || "");
    setValue("nps-popup-api-key", settings.apiKey || "");
    setValue("nps-popup-api-model", settings.apiModel || "");

    // Input 소스
    const sources = settings.inputSources || defaultSettings.inputSources;
    setChecked("nps-popup-input-char", sources.charDescription);
    setChecked("nps-popup-input-persona", sources.personaDescription);
    setChecked("nps-popup-input-world", sources.worldInfo);
    setChecked("nps-popup-input-summary", sources.scenarioSummary);
    setChecked("nps-popup-input-au", sources.auWorldBuilder);
    setChecked("nps-popup-input-chat", true);

    // 퀄리티 프롬프트 (v1.8.0: 개별 스타일 선택)
    const selectedStyle = settings.selectedWritingStyle || "literaryStyle";
    const styleRadio = document.querySelector('input[name="nps-writing-style"][value="' + selectedStyle + '"]');
    if (styleRadio) styleRadio.checked = true;

    // v1.8.0: 퀄리티 강화 옵션
    const qeSettings = settings.qualityEnhancements || defaultSettings.qualityEnhancements;
    qualityEnhancements.forEach(function (qe) {
        setChecked("nps-qe-" + qe.id, qeSettings[qe.id] === true);
    });

    // 분위기
    const moodInit = settings.moodSettings || defaultSettings.moodSettings;
    setChecked("nps-mood-enabled", moodInit.enabled === true);
    const moodOptions = document.querySelector(".nps-mood-options");
    if (moodOptions) {
        moodOptions.style.opacity = moodInit.enabled ? "1" : "0.5";
        moodOptions.style.pointerEvents = moodInit.enabled ? "auto" : "none";
    }
    if (moodInit.selectedMood) {
        const radio = document.querySelector('input[name="nps-mood-select"][value="' + moodInit.selectedMood + '"]');
        if (radio) radio.checked = true;
    }
    // v1.8.0: 장면 분위기
    const sceneAtm = moodInit.sceneAtmosphere || "none";
    const sceneRadio = document.querySelector('input[name="nps-scene-atmosphere"][value="' + sceneAtm + '"]');
    if (sceneRadio) sceneRadio.checked = true;
    // v1.8.0: 감각 포커스
    const sensoryFocuses = moodInit.sensoryFocus || [];
    sensoryOptions.forEach(function (s) {
        const cb = document.getElementById("nps-sensory-" + s.id);
        if (cb) cb.checked = sensoryFocuses.indexOf(s.id) >= 0;
    });
    // v1.8.0: 감정 강도
    const intensityEl = document.getElementById("nps-emotional-intensity");
    if (intensityEl) intensityEl.value = moodInit.emotionalIntensity !== undefined ? moodInit.emotionalIntensity : 5;
    const intensityValEl = document.getElementById("nps-emotional-intensity-val");
    if (intensityValEl) intensityValEl.textContent = moodInit.emotionalIntensity !== undefined ? moodInit.emotionalIntensity : 5;

    // LLM Provider/Model
    const provider = settings.llmProvider || "openai";
    setValue("nps-popup-llm-provider", provider);
    updateLlmModelList(provider, false);
    if (settings.llmModel) setValue("nps-popup-llm-model", settings.llmModel);

    updatePopupApiSettingsVisibility();
    renderPopupGenreSelection();
    renderPopupCustomGenres();

    // v1.7.0: 추천 길이 슬라이더
    const lengthEl = document.getElementById("nps-popup-suggestion-length");
    if (lengthEl) lengthEl.value = settings.suggestionLength !== undefined ? settings.suggestionLength : 5;
    const lengthValEl = document.getElementById("nps-suggestion-length-val");
    if (lengthValEl) lengthValEl.textContent = settings.suggestionLength !== undefined ? settings.suggestionLength : 5;

    // v1.7.0: 유사도 임계값
    const simEl = document.getElementById("nps-popup-similarity-threshold");
    if (simEl) simEl.value = settings.similarityThreshold !== undefined ? settings.similarityThreshold : 0.6;
    const simValEl = document.getElementById("nps-similarity-threshold-val");
    if (simValEl) simValEl.textContent = (settings.similarityThreshold !== undefined ? settings.similarityThreshold : 0.6).toFixed(1);

    // v1.7.0: 프로필 렌더
    renderProfilesList();

    renderCustomQualityPrompts();

    // v1.5.0: 플롯 탭 설정
    updatePlotTabUI(settings);
}

// ═══════════════════════════════════════════
// LLM 모델
// ═══════════════════════════════════════════
function updateLlmModelList(provider, setDefault) {
    if (setDefault === undefined) setDefault = true;
    const modelLists = {
        "openai": ["gpt-5.2", "gpt-5.1", "gpt-5"],
        "claude": ["claude-opus-4-5", "claude-sonnet-4-5"],
        "google": ["gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-2.5-pro"],
        "cohere": ["command-r-plus", "command-r", "command"]
    };
    const defaultModels = {
        "openai": "gpt-5.2",
        "claude": "claude-sonnet-4-5",
        "google": "gemini-3-flash-preview",
        "cohere": "command-r-plus"
    };

    const modelSelect = document.getElementById("nps-popup-llm-model");
    if (!modelSelect) return;

    modelSelect.innerHTML = "";
    const models = modelLists[provider] || [];
    models.forEach(function (model) {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
    });

    if (setDefault) {
        modelSelect.value = defaultModels[provider] || "";
        extension_settings[extensionName].llmModel = modelSelect.value;
    } else {
        const saved = extension_settings[extensionName].llmModel;
        if (saved && models.indexOf(saved) >= 0) {
            modelSelect.value = saved;
        } else if (models.length > 0) {
            modelSelect.value = models[0];
            extension_settings[extensionName].llmModel = models[0];
        }
    }
}

function updatePopupApiSettingsVisibility() {
    const apiType = extension_settings[extensionName].apiType;
    const custom = document.querySelector("#nps-settings-popup .nps-custom-api-settings");
    const profile = document.querySelector("#nps-settings-popup .nps-profile-settings");
    if (custom) custom.style.display = apiType === "custom" ? "block" : "none";
    if (profile) profile.style.display = apiType === "profile" ? "block" : "none";
}

// ═══════════════════════════════════════════
// 생성 통계 (Perf 7)
// ═══════════════════════════════════════════
function refreshAnalyticsPanel() {
    const summary = getAnalyticsSummary();
    const setVal = function (id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    if (!summary) {
        setVal("nps-stat-total", "0");
        setVal("nps-stat-success-rate", "-");
        setVal("nps-stat-avg-duration", "-");
        setVal("nps-stat-avg-tokens", "-");
        setVal("nps-stat-last-request", "-");
        return;
    }
    setVal("nps-stat-total", summary.totalRequests);
    setVal("nps-stat-success-rate", summary.successRate.toFixed(1) + "%");
    setVal("nps-stat-avg-duration", (summary.avgDurationMs / 1000).toFixed(1) + "s");
    setVal("nps-stat-avg-tokens", Math.round(summary.avgPromptTokens).toLocaleString());
    if (summary.lastRequest && summary.lastRequest.timestamp) {
        const ago = Math.round((Date.now() - summary.lastRequest.timestamp) / 1000);
        setVal("nps-stat-last-request", ago < 60 ? ago + "초 전" : Math.round(ago / 60) + "분 전");
    } else {
        setVal("nps-stat-last-request", "-");
    }
}

// ═══════════════════════════════════════════
// v1.6.0: 컨텍스트 토큰 시각화
// ═══════════════════════════════════════════

async function refreshTokenVisualization() {
    const barEl = document.getElementById("nps-token-bar");
    const legendEl = document.getElementById("nps-token-legend");
    const summaryEl = document.getElementById("nps-token-summary");
    if (!barEl || !legendEl || !summaryEl) return;

    barEl.innerHTML = '<div class="nps-token-bar-loading">분석 중...</div>';
    legendEl.innerHTML = "";
    summaryEl.innerHTML = "";

    try {
        const data = await getTokenBreakdown();
        const budget = data.budget;
        const total = data.total;
        const pct = Math.min(100, Math.round((total / budget) * 100));

        // 막대그래프
        let barHtml = '<div class="nps-token-bar">';
        data.sources.forEach(function (src) {
            const w = Math.max(1, (src.tokens / budget) * 100);
            barHtml += '<div class="nps-token-bar-segment" style="width:' + w.toFixed(1) + '%;background:' + src.color + ';" title="' + src.name + ': ' + src.tokens.toLocaleString() + ' tokens"></div>';
        });
        barHtml += '</div>';
        barEl.innerHTML = barHtml;

        // 범례
        let legHtml = "";
        data.sources.forEach(function (src) {
            legHtml += '<span class="nps-token-legend-item"><span class="nps-token-legend-dot" style="background:' + src.color + ';"></span>' + src.name + ' <b>' + src.tokens.toLocaleString() + '</b></span>';
        });
        legendEl.innerHTML = legHtml;

        // 요약
        const remaining = Math.max(0, budget - total);
        const statusClass = pct > 90 ? "nps-token-warn" : pct > 70 ? "nps-token-caution" : "nps-token-ok";
        summaryEl.innerHTML = '<span class="' + statusClass + '">' + total.toLocaleString() + ' / ' + budget.toLocaleString() + ' tokens (' + pct + '%)</span> · 여유: ' + remaining.toLocaleString() + ' tokens';

    } catch (e) {
        barEl.innerHTML = '<div class="nps-token-bar-loading">분석 실패</div>';
        log("Token viz error:", e);
    }
}

// ═══════════════════════════════════════════
// v1.5.0: 플롯 탭 UI 헬퍼
// ═══════════════════════════════════════════

function updatePlotTabUI(settings) {
    // Feature 1: 전개 유형
    const selectedBeats = settings.plotBeats || [];
    plotBeats.forEach(function (beat) {
        const cb = document.getElementById("nps-beat-" + beat.id);
        if (cb) cb.checked = selectedBeats.indexOf(beat.id) >= 0;
    });

    // Feature 2: 서사 단계
    const arcSettings = settings.narrativeArc || {};
    setChecked("nps-arc-auto-detect", arcSettings.autoDetect !== false);
    setValue("nps-arc-manual-stage", arcSettings.manualStage || "");
    refreshNarrativeArcDisplay();

    // Feature 3: 포커스 대상
    const focus = settings.focusTarget || {};
    setValue("nps-focus-type", focus.type || "auto");
    setValue("nps-focus-character", focus.characterName || "");
    setValue("nps-focus-custom", focus.customFocus || "");
    updateFocusVisibility(focus.type || "auto");

    // Feature 4: 스펙트럼
    setChecked("nps-spectrum-enabled", settings.suggestionSpectrum !== false);

    // Feature 7: 감정 곡선
    const ec = settings.emotionCurve || {};
    setChecked("nps-emotion-enabled", ec.enabled === true);
    setValue("nps-emotion-current", ec.currentEmotion || "");
    setValue("nps-emotion-target", ec.targetEmotion || "");
    const speedRadio = document.querySelector('input[name="nps-emotion-speed"][value="' + (ec.transitionSpeed || "gradual") + '"]');
    if (speedRadio) speedRadio.checked = true;
    const emotionOpts = document.getElementById("nps-emotion-options");
    if (emotionOpts) {
        emotionOpts.style.opacity = ec.enabled ? "1" : "0.5";
        emotionOpts.style.pointerEvents = ec.enabled ? "auto" : "none";
    }

    // v1.7.0: 창의성 레벨
    const creativityEl = document.getElementById("nps-creativity-level");
    if (creativityEl) creativityEl.value = settings.creativityLevel !== undefined ? settings.creativityLevel : 5;
    const creativityValEl = document.getElementById("nps-creativity-level-val");
    if (creativityValEl) creativityValEl.textContent = settings.creativityLevel !== undefined ? settings.creativityLevel : 5;

    // v1.7.0: 조건부 규칙
    renderConditionalRules();

    // Feature 8: 페이싱
    setChecked("nps-pacing-enabled", settings.pacingEnabled === true);
    const pacingOpts = document.getElementById("nps-pacing-options");
    if (pacingOpts) {
        pacingOpts.style.opacity = settings.pacingEnabled ? "1" : "0.5";
        pacingOpts.style.pointerEvents = settings.pacingEnabled ? "auto" : "none";
    }
    const pacing = settings.pacing || {};
    setValue("nps-pacing-timeframe", pacing.timeframe || "immediate");
    const speedEl = document.getElementById("nps-pacing-speed");
    if (speedEl) speedEl.value = pacing.speed !== undefined ? pacing.speed : 5;
    const speedValEl = document.getElementById("nps-pacing-speed-val");
    if (speedValEl) speedValEl.textContent = pacing.speed !== undefined ? pacing.speed : 5;

    // Feature 9: 구성 비율
    const ratioEl = document.getElementById("nps-dialogue-ratio");
    if (ratioEl) ratioEl.value = settings.dialogueRatio !== undefined ? settings.dialogueRatio : 5;
    const ratioValEl = document.getElementById("nps-dialogue-ratio-val");
    if (ratioValEl) ratioValEl.textContent = settings.dialogueRatio !== undefined ? settings.dialogueRatio : 5;
    setChecked("nps-include-inner", settings.includeInnerThought === true);
    setChecked("nps-include-env", settings.includeEnvironment === true);
}

function updateFocusVisibility(type) {
    const charRow = document.querySelector(".nps-focus-char-row");
    const customRow = document.querySelector(".nps-focus-custom-row");
    if (charRow) charRow.style.display = (type === "character" || type === "relationship") ? "flex" : "none";
    if (customRow) customRow.style.display = type === "custom" ? "flex" : "none";
}

function refreshNarrativeArcDisplay() {
    const stageEl = document.getElementById("nps-arc-detected-stage");
    if (!stageEl) return;
    try {
        const context = getContext();
        const chat = context.chat || [];
        const visible = chat.filter(function (m) { return !m.is_system; });
        const text = visible.slice(-30).map(function (m) { return (m.is_user ? "User" : "Character") + ": " + m.mes; }).join("\n");
        const stage = detectNarrativeStage(text);
        const stageInfo = narrativeStages.find(function (s) { return s.id === stage; });
        stageEl.textContent = stageInfo ? stageInfo.name + " (" + stageInfo.nameEn + ")" : "-";
        stageEl.className = "nps-arc-stage nps-arc-" + stage;
    } catch (e) {
        stageEl.textContent = "-";
    }
}

/** v1.5.0: 플롯 탭 이벤트 바인딩 */
function bindPlotTabEvents() {
    const settings = extension_settings[extensionName];

    // v1.6.0: 프리셋 버튼
    document.querySelectorAll(".nps-preset-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const presetId = this.dataset.preset;
            if (presetId === "clear") {
                settings.plotBeats = [];
            } else {
                const preset = plotBeatPresets.find(function (p) { return p.id === presetId; });
                if (preset) settings.plotBeats = preset.beats.slice();
            }
            // 체크박스 UI 동기화
            plotBeats.forEach(function (beat) {
                const cb = document.getElementById("nps-beat-" + beat.id);
                if (cb) cb.checked = settings.plotBeats.indexOf(beat.id) >= 0;
            });
            // 활성 프리셋 표시
            document.querySelectorAll(".nps-preset-btn").forEach(function (b) { b.classList.remove("active"); });
            if (presetId !== "clear") this.classList.add("active");
            saveSettings();
        });
    });

    // Feature 1: 전개 유형 체크박스들
    plotBeats.forEach(function (beat) {
        const cb = document.getElementById("nps-beat-" + beat.id);
        if (cb) {
            cb.addEventListener("change", function () {
                if (!settings.plotBeats) settings.plotBeats = [];
                if (this.checked) {
                    if (settings.plotBeats.indexOf(beat.id) < 0) settings.plotBeats.push(beat.id);
                } else {
                    settings.plotBeats = settings.plotBeats.filter(function (b) { return b !== beat.id; });
                }
                saveSettings();
            });
        }
    });

    // Feature 2: 서사 단계
    const arcAutoEl = document.getElementById("nps-arc-auto-detect");
    if (arcAutoEl) {
        arcAutoEl.addEventListener("change", function () {
            if (!settings.narrativeArc) settings.narrativeArc = {};
            settings.narrativeArc.autoDetect = this.checked;
            saveSettings();
            refreshNarrativeArcDisplay();
        });
    }
    const arcManualEl = document.getElementById("nps-arc-manual-stage");
    if (arcManualEl) {
        arcManualEl.addEventListener("change", function () {
            if (!settings.narrativeArc) settings.narrativeArc = {};
            settings.narrativeArc.manualStage = this.value;
            saveSettings();
        });
    }

    // Feature 3: 포커스 대상
    const focusTypeEl = document.getElementById("nps-focus-type");
    if (focusTypeEl) {
        focusTypeEl.addEventListener("change", function () {
            if (!settings.focusTarget) settings.focusTarget = {};
            settings.focusTarget.type = this.value;
            updateFocusVisibility(this.value);
            saveSettings();
        });
    }
    const focusCharEl = document.getElementById("nps-focus-character");
    if (focusCharEl) {
        focusCharEl.addEventListener("change", function () {
            if (!settings.focusTarget) settings.focusTarget = {};
            settings.focusTarget.characterName = this.value;
            saveSettings();
        });
    }
    const focusCustomEl = document.getElementById("nps-focus-custom");
    if (focusCustomEl) {
        focusCustomEl.addEventListener("change", function () {
            if (!settings.focusTarget) settings.focusTarget = {};
            settings.focusTarget.customFocus = this.value;
            saveSettings();
        });
    }

    // Feature 4: 스펙트럼
    const spectrumEl = document.getElementById("nps-spectrum-enabled");
    if (spectrumEl) {
        spectrumEl.addEventListener("change", function () {
            settings.suggestionSpectrum = this.checked;
            saveSettings();
        });
    }

    // Feature 7: 감정 곡선
    const emotionEnabledEl = document.getElementById("nps-emotion-enabled");
    if (emotionEnabledEl) {
        emotionEnabledEl.addEventListener("change", function () {
            if (!settings.emotionCurve) settings.emotionCurve = {};
            settings.emotionCurve.enabled = this.checked;
            const opts = document.getElementById("nps-emotion-options");
            if (opts) {
                opts.style.opacity = this.checked ? "1" : "0.5";
                opts.style.pointerEvents = this.checked ? "auto" : "none";
            }
            saveSettings();
        });
    }
    const emCurrentEl = document.getElementById("nps-emotion-current");
    if (emCurrentEl) {
        emCurrentEl.addEventListener("change", function () {
            if (!settings.emotionCurve) settings.emotionCurve = {};
            settings.emotionCurve.currentEmotion = this.value;
            saveSettings();
        });
    }
    const emTargetEl = document.getElementById("nps-emotion-target");
    if (emTargetEl) {
        emTargetEl.addEventListener("change", function () {
            if (!settings.emotionCurve) settings.emotionCurve = {};
            settings.emotionCurve.targetEmotion = this.value;
            saveSettings();
        });
    }
    document.querySelectorAll('input[name="nps-emotion-speed"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
            if (!settings.emotionCurve) settings.emotionCurve = {};
            settings.emotionCurve.transitionSpeed = this.value;
            saveSettings();
        });
    });

    // Feature 8: 페이싱
    const pacingTimeEl = document.getElementById("nps-pacing-timeframe");
    if (pacingTimeEl) {
        pacingTimeEl.addEventListener("change", function () {
            if (!settings.pacing) settings.pacing = {};
            settings.pacing.timeframe = this.value;
            saveSettings();
        });
    }
    const pacingSpeedEl = document.getElementById("nps-pacing-speed");
    if (pacingSpeedEl) {
        pacingSpeedEl.addEventListener("input", function () {
            if (!settings.pacing) settings.pacing = {};
            settings.pacing.speed = parseInt(this.value);
            const valEl = document.getElementById("nps-pacing-speed-val");
            if (valEl) valEl.textContent = this.value;
            saveSettings();
        });
    }

    // Feature 9: 구성 비율
    const dialogueRatioEl = document.getElementById("nps-dialogue-ratio");
    if (dialogueRatioEl) {
        dialogueRatioEl.addEventListener("input", function () {
            settings.dialogueRatio = parseInt(this.value);
            const valEl = document.getElementById("nps-dialogue-ratio-val");
            if (valEl) valEl.textContent = this.value;
            saveSettings();
        });
    }
    const innerEl = document.getElementById("nps-include-inner");
    if (innerEl) {
        innerEl.addEventListener("change", function () {
            settings.includeInnerThought = this.checked;
            saveSettings();
        });
    }
    const envEl = document.getElementById("nps-include-env");
    if (envEl) {
        envEl.addEventListener("change", function () {
            settings.includeEnvironment = this.checked;
            saveSettings();
        });
    }
}

// ═══════════════════════════════════════════
// 장르 렌더링
// ═══════════════════════════════════════════
function renderPopupGenreSelection() {
    const container = document.getElementById("nps-popup-default-genres");
    if (!container) return;

    const settings = extension_settings[extensionName];
    container.innerHTML = "";

    defaultGenres.forEach(function (genre) {
        const div = document.createElement("div");
        div.className = "nps-genre-item";
        const checked = settings.selectedGenres.indexOf(genre.id) >= 0;
        div.innerHTML = '<label><input type="checkbox" class="nps-popup-genre-checkbox" data-genre-id="' + genre.id + '"' + (checked ? ' checked' : '') + '><span>' + escapeHtml(genre.nameKo) + '</span></label>';
        container.appendChild(div);
    });

    container.querySelectorAll(".nps-popup-genre-checkbox").forEach(function (cb) {
        cb.addEventListener("change", onPopupGenreChange);
    });
}

function renderPopupCustomGenres() {
    const container = document.getElementById("nps-popup-custom-genres-list");
    if (!container) return;

    const settings = extension_settings[extensionName];
    container.innerHTML = "";

    if (!settings.customGenres || settings.customGenres.length === 0) {
        container.innerHTML = '<p class="nps-no-custom-genres">사용자 정의 장르가 없습니다.</p>';
        return;
    }

    settings.customGenres.forEach(function (genre) {
        const div = document.createElement("div");
        div.className = "nps-custom-genre-item";
        const checked = settings.selectedGenres.indexOf(genre.id) >= 0;
        div.innerHTML = '<label><input type="checkbox" class="nps-popup-genre-checkbox" data-genre-id="' + genre.id + '"' + (checked ? ' checked' : '') + '><span>' + escapeHtml(genre.nameKo) + ' (' + escapeHtml(genre.name) + ')</span></label><button class="nps-delete-genre-btn" data-genre-id="' + genre.id + '" title="삭제">&times;</button>';
        container.appendChild(div);
    });

    container.querySelectorAll(".nps-delete-genre-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            deleteCustomGenre(btn.dataset.genreId);
            renderPopupCustomGenres();
        });
    });

    container.querySelectorAll(".nps-popup-genre-checkbox").forEach(function (cb) {
        cb.addEventListener("change", onPopupGenreChange);
    });
}

function onPopupGenreChange(e) {
    const settings = extension_settings[extensionName];
    const genreId = e.target.dataset.genreId;
    if (e.target.checked) {
        if (settings.selectedGenres.indexOf(genreId) < 0) settings.selectedGenres.push(genreId);
    } else {
        settings.selectedGenres = settings.selectedGenres.filter(function (id) { return id !== genreId; });
    }
    saveSettings();
}

function addCustomGenre(name, nameKo) {
    const settings = extension_settings[extensionName];
    if (!settings.customGenres) settings.customGenres = [];
    settings.customGenres.push({ id: "custom_" + Date.now(), name: name, nameKo: nameKo });
    saveSettings();
    toastr.success("장르가 추가되었습니다.");
}

function deleteCustomGenre(genreId) {
    const settings = extension_settings[extensionName];
    settings.customGenres = settings.customGenres.filter(function (g) { return g.id !== genreId; });
    settings.selectedGenres = settings.selectedGenres.filter(function (id) { return id !== genreId; });
    saveSettings();
    toastr.info("장르가 삭제되었습니다.");
}

// ═══════════════════════════════════════════
// 커스텀 퀄리티 프롬프트
// ═══════════════════════════════════════════
export function renderCustomQualityPrompts() {
    const container = document.getElementById("nps-custom-quality-list");
    if (!container) return;

    const customPrompts = extension_settings[extensionName].customQualityPrompts || [];
    container.innerHTML = "";

    if (customPrompts.length === 0) {
        container.innerHTML = '<p style="color: #888; font-size: 12px;">아직 추가된 커스텀 프롬프트가 없습니다.</p>';
        return;
    }

    customPrompts.forEach(function (qp, index) {
        const item = document.createElement("div");
        item.className = "nps-custom-quality-item";
        item.innerHTML = '<input type="checkbox" class="nps-custom-qp-checkbox" data-qp-id="' + qp.id + '"' + (qp.enabled ? ' checked' : '') + '>' +
            '<label><strong>' + escapeHtml(qp.name) + '</strong><small>' + escapeHtml(qp.prompt.substring(0, 50)) + '...</small></label>' +
            '<button class="nps-delete-btn" data-qp-index="' + index + '" title="삭제"><i class="fa-solid fa-trash"></i></button>';
        container.appendChild(item);
    });

    // 체크박스 이벤트
    container.querySelectorAll(".nps-custom-qp-checkbox").forEach(function (cb) {
        cb.addEventListener("change", function () {
            const qpId = this.dataset.qpId;
            const prompts = extension_settings[extensionName].customQualityPrompts || [];
            prompts.forEach(function (p) {
                if (p.id === qpId) p.enabled = cb.checked;
            });
            saveSettings();
        });
    });

    // 삭제 이벤트
    container.querySelectorAll(".nps-delete-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const qpIndex = parseInt(this.dataset.qpIndex);
            const prompts = extension_settings[extensionName].customQualityPrompts || [];
            prompts.splice(qpIndex, 1);
            extension_settings[extensionName].customQualityPrompts = prompts;
            saveSettings();
            renderCustomQualityPrompts();
        });
    });
}

// ═══════════════════════════════════════════
// v1.7.0: 설정 프로필
// ═══════════════════════════════════════════

function renderProfilesList() {
    const container = document.getElementById("nps-profiles-list");
    if (!container) return;
    const settings = extension_settings[extensionName];
    const profiles = settings.settingsProfiles || [];
    container.innerHTML = "";

    if (profiles.length === 0) {
        container.innerHTML = '<p class="nps-no-profiles">저장된 프로필이 없습니다.</p>';
        return;
    }

    profiles.forEach(function (profile, index) {
        const div = document.createElement("div");
        div.className = "nps-profile-item";
        div.innerHTML = '<span class="nps-profile-name">' + escapeHtml(profile.name) + '</span>' +
            '<button class="nps-btn nps-btn-small nps-profile-load-btn" data-profile-index="' + index + '"><i class="fa-solid fa-download"></i> 불러오기</button>' +
            '<button class="nps-btn nps-btn-small nps-profile-delete-btn" data-profile-index="' + index + '"><i class="fa-solid fa-trash"></i></button>';
        container.appendChild(div);
    });

    container.querySelectorAll(".nps-profile-load-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const idx = parseInt(this.dataset.profileIndex);
            loadProfile(idx);
        });
    });

    container.querySelectorAll(".nps-profile-delete-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const idx = parseInt(this.dataset.profileIndex);
            deleteProfile(idx);
        });
    });
}

function saveProfile(name) {
    if (!name) return;
    const settings = extension_settings[extensionName];
    if (!settings.settingsProfiles) settings.settingsProfiles = [];

    // 프로필 불러올 때 제외하고 복사
    const snapshot = {};
    const excludeKeys = ["settingsProfiles", "negativeFeedbackKeywords"];
    for (let key in settings) {
        if (Object.prototype.hasOwnProperty.call(settings, key) && excludeKeys.indexOf(key) < 0) {
            const val = settings[key];
            snapshot[key] = typeof val === "object" && val !== null ? JSON.parse(JSON.stringify(val)) : val;
        }
    }

    settings.settingsProfiles.push({ name: name, data: snapshot, createdAt: Date.now() });
    saveSettings();
    renderProfilesList();
    toastr.success("프로필 '" + name + "' 저장됨");
}

function loadProfile(index) {
    const settings = extension_settings[extensionName];
    const profiles = settings.settingsProfiles || [];
    if (index < 0 || index >= profiles.length) return;

    const profile = profiles[index];
    const preserved = {
        settingsProfiles: settings.settingsProfiles,
        negativeFeedbackKeywords: settings.negativeFeedbackKeywords || []
    };

    for (let key in profile.data) {
        if (Object.prototype.hasOwnProperty.call(profile.data, key)) {
            settings[key] = typeof profile.data[key] === "object" && profile.data[key] !== null
                ? JSON.parse(JSON.stringify(profile.data[key])) : profile.data[key];
        }
    }

    // 보존값 복원
    settings.settingsProfiles = preserved.settingsProfiles;
    settings.negativeFeedbackKeywords = preserved.negativeFeedbackKeywords;

    saveSettings();
    updatePopupUIFromSettings();
    toastr.success("프로필 '" + profile.name + "' 불러옴");
}

function deleteProfile(index) {
    const settings = extension_settings[extensionName];
    const profiles = settings.settingsProfiles || [];
    if (index < 0 || index >= profiles.length) return;
    const name = profiles[index].name;
    profiles.splice(index, 1);
    saveSettings();
    renderProfilesList();
    toastr.info("프로필 '" + name + "' 삭제됨");
}

// ═══════════════════════════════════════════
// v1.7.0: 조건부 규칙 렌더링
// ═══════════════════════════════════════════

function renderConditionalRules() {
    const container = document.getElementById("nps-conditional-rules-list");
    if (!container) return;
    const settings = extension_settings[extensionName];
    const rules = settings.conditionalRules || [];
    container.innerHTML = "";

    if (rules.length === 0) {
        container.innerHTML = '<p class="nps-no-rules">등록된 규칙이 없습니다.</p>';
        return;
    }

    rules.forEach(function (rule, index) {
        const div = document.createElement("div");
        div.className = "nps-rule-item";
        div.innerHTML = '<input type="checkbox" class="nps-rule-toggle" data-rule-index="' + index + '"' + (rule.enabled ? ' checked' : '') + '>' +
            '<span class="nps-rule-text"><strong>IF</strong> ' + escapeHtml(rule.condition) + ' <strong>THEN</strong> ' + escapeHtml(rule.action) + '</span>' +
            '<button class="nps-rule-delete-btn" data-rule-index="' + index + '" title="삭제"><i class="fa-solid fa-trash"></i></button>';
        container.appendChild(div);
    });

    container.querySelectorAll(".nps-rule-toggle").forEach(function (cb) {
        cb.addEventListener("change", function () {
            const idx = parseInt(this.dataset.ruleIndex);
            if (settings.conditionalRules[idx]) {
                settings.conditionalRules[idx].enabled = this.checked;
                saveSettings();
            }
        });
    });

    container.querySelectorAll(".nps-rule-delete-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const idx = parseInt(this.dataset.ruleIndex);
            settings.conditionalRules.splice(idx, 1);
            saveSettings();
            renderConditionalRules();
        });
    });
}

// ═══════════════════════════════════════════
// v1.7.0: 퀵 템플릿 렌더링
// ═══════════════════════════════════════════

function renderQuickTemplates() {
    const container = document.getElementById("nps-quick-templates-chips");
    if (!container) return;
    const settings = extension_settings[extensionName];
    const templates = settings.quickTemplates || [];
    container.innerHTML = "";

    // 기본 템플릿
    const defaults = [
        { text: "갑작스러운 사건 발생", icon: "fa-bolt" },
        { text: "감정적 대화", icon: "fa-heart" },
        { text: "새로운 인물 등장", icon: "fa-user-plus" },
        { text: "장면 전환", icon: "fa-right-left" },
        { text: "비밀이 밝혀짐", icon: "fa-eye" }
    ];

    defaults.forEach(function (tmpl) {
        const chip = document.createElement("span");
        chip.className = "nps-quick-chip";
        chip.innerHTML = '<i class="fa-solid ' + tmpl.icon + '"></i> ' + escapeHtml(tmpl.text);
        chip.addEventListener("click", function () {
            const input = document.getElementById("nps-direction-input");
            if (input) { input.value = tmpl.text; input.focus(); }
        });
        container.appendChild(chip);
    });

    // 사용자 정의 템플릿
    templates.forEach(function (tmpl, index) {
        const chip = document.createElement("span");
        chip.className = "nps-quick-chip nps-quick-chip-custom";
        chip.innerHTML = escapeHtml(tmpl.text) + ' <i class="fa-solid fa-xmark nps-template-delete" data-template-index="' + index + '"></i>';
        chip.addEventListener("click", function (e) {
            if (e.target.classList.contains("nps-template-delete")) return;
            const input = document.getElementById("nps-direction-input");
            if (input) { input.value = tmpl.text; input.focus(); }
        });
        container.appendChild(chip);
    });

    // 삭제 이벤트
    container.querySelectorAll(".nps-template-delete").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            const idx = parseInt(this.dataset.templateIndex);
            settings.quickTemplates.splice(idx, 1);
            saveSettings();
            renderQuickTemplates();
        });
    });
}

// ═══════════════════════════════════════════
// 추천 결과 UI (Feature 2, 3 / Perf 6)
// ═══════════════════════════════════════════

// createSuggestionMessageHtml → ui-html.js로 분리됨

/** 로딩 메시지 (Perf 3: 취소 버튼 포함) */
export function showLoadingMessage() {
    const chatElement = document.getElementById("chat");
    if (!chatElement) return;
    const div = document.createElement("div");
    div.id = "nps-loading-message";
    div.className = "mes nps-loading-mes";
    div.innerHTML = '<div class="nps-loading-container"><div class="nps-loading-spinner"></div><span>다음 전개 추천 생성 중...</span><button class="nps-cancel-btn" id="nps-cancel-generation-btn" title="취소"><i class="fa-solid fa-times"></i> 취소</button></div>';
    chatElement.appendChild(div);

    // 취소 버튼 이벤트
    const cancelBtn = div.querySelector("#nps-cancel-generation-btn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", function () {
            if (_callbacks.cancelGeneration) _callbacks.cancelGeneration();
        });
    }

    scrollToBottom();
}

export function removeLoadingMessage() {
    const el = document.getElementById("nps-loading-message");
    if (el) el.remove();
}

/** 추천 메시지 표시 (Perf 6: DocumentFragment + requestAnimationFrame) */
export function displaySuggestionMessage(suggestions) {
    const chatElement = document.getElementById("chat");
    if (!chatElement) return;

    state.currentSuggestionMessageId = "nps-suggestion-" + Date.now();

    // Perf 6: DocumentFragment로 오프스크린에서 DOM 조립
    const fragment = document.createDocumentFragment();
    const messageDiv = document.createElement("div");
    messageDiv.id = state.currentSuggestionMessageId;
    messageDiv.className = "mes nps-suggestion-mes";
    messageDiv.innerHTML = createSuggestionMessageHtml(suggestions);
    fragment.appendChild(messageDiv);

    // 이벤트 위임 - 단일 리스너로 모든 액션 처리
    messageDiv.addEventListener("click", handleSuggestionAction);

    // v1.5.2: 드래그 앤 드롭 순서 변경
    initDragAndDrop(messageDiv);

    // Perf 6: requestAnimationFrame으로 다음 페인트에 DOM 삽입
    requestAnimationFrame(function () {
        chatElement.appendChild(fragment);
        scrollToBottom();
    });
}

// ═══════════════════════════════════════════
// v1.5.1: 프리뷰 모드 UI
// ═══════════════════════════════════════════

// createPreviewMessageHtml → ui-html.js로 분리됨

/** 프리뷰 메시지 표시 */
export function displayPreviewMessage(previews) {
    const chatElement = document.getElementById("chat");
    if (!chatElement) return;

    removeSuggestionMessage();

    state.currentSuggestionMessageId = "nps-preview-" + Date.now();

    const fragment = document.createDocumentFragment();
    const messageDiv = document.createElement("div");
    messageDiv.id = state.currentSuggestionMessageId;
    messageDiv.className = "mes nps-suggestion-mes nps-preview-mes";
    messageDiv.innerHTML = createPreviewMessageHtml(previews);
    fragment.appendChild(messageDiv);

    // 이벤트 위임
    messageDiv.addEventListener("click", handlePreviewAction);

    requestAnimationFrame(function () {
        chatElement.appendChild(fragment);
        scrollToBottom();
    });
}

/** 프리뷰 이벤트 핸들러 */
function handlePreviewAction(e) {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;

    switch (action) {
        case "select-preview": {
            const item = actionEl.closest(".nps-preview-item");
            const preview = item ? item.dataset.preview : "";
            if (preview && _callbacks.generateFromPreview) {
                _callbacks.generateFromPreview(preview);
            }
            break;
        }
        case "close": {
            removeSuggestionMessage();
            break;
        }
        case "regenerate-preview": {
            if (_callbacks.showPreview) _callbacks.showPreview();
            break;
        }
    }
}

// ═══════════════════════════════════════════
// v1.5.2: 드래그 앤 드롭 순서 변경
// ═══════════════════════════════════════════

/** 추천 아이템에 드래그 앤 드롭 이벤트를 바인딩 */
function initDragAndDrop(container) {
    const dragState = { draggedItem: null };

    container.addEventListener("dragstart", function (e) {
        const item = e.target.closest(".nps-suggestion-item");
        if (!item) return;
        // 드래그 핸들에서만 드래그 시작 허용
        if (!e.target.closest(".nps-drag-handle")) {
            e.preventDefault();
            return;
        }
        dragState.draggedItem = item;
        item.classList.add("nps-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.dataset.index);
    });

    container.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!dragState.draggedItem) return;

        const target = e.target.closest(".nps-suggestion-item");
        if (!target || target === dragState.draggedItem) return;

        // 기존 표시 제거
        container.querySelectorAll(".nps-drag-over, .nps-drag-over-below").forEach(function (el) {
            el.classList.remove("nps-drag-over", "nps-drag-over-below");
        });

        // 마우스 y 위치로 위/아래 판단
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            target.classList.add("nps-drag-over");
        } else {
            target.classList.add("nps-drag-over-below");
        }
    });

    container.addEventListener("dragleave", function (e) {
        const target = e.target.closest(".nps-suggestion-item");
        if (target) {
            target.classList.remove("nps-drag-over", "nps-drag-over-below");
        }
    });

    container.addEventListener("drop", function (e) {
        e.preventDefault();
        if (!dragState.draggedItem) return;

        const target = e.target.closest(".nps-suggestion-item");
        if (!target || target === dragState.draggedItem) return;

        const buttonsList = target.closest(".nps-suggestion-buttons");
        if (!buttonsList) return;

        // 위/아래 판단
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            buttonsList.insertBefore(dragState.draggedItem, target);
        } else {
            buttonsList.insertBefore(dragState.draggedItem, target.nextSibling);
        }

        // 번호 다시 매기기
        renumberSuggestionItems(buttonsList);

        // 표시 정리
        container.querySelectorAll(".nps-drag-over, .nps-drag-over-below").forEach(function (el) {
            el.classList.remove("nps-drag-over", "nps-drag-over-below");
        });
    });

    container.addEventListener("dragend", function () {
        if (dragState.draggedItem) {
            dragState.draggedItem.classList.remove("nps-dragging");
            dragState.draggedItem = null;
        }
        // 남아있는 표시 정리
        container.querySelectorAll(".nps-drag-over, .nps-drag-over-below").forEach(function (el) {
            el.classList.remove("nps-drag-over", "nps-drag-over-below");
        });
    });
}

/** 드롭 후 번호·인덱스 재갱신 */
function renumberSuggestionItems(buttonsList) {
    const items = buttonsList.querySelectorAll(".nps-suggestion-item");
    items.forEach(function (item, idx) {
        item.dataset.index = idx;
        const numberEl = item.querySelector(".nps-suggestion-number");
        if (numberEl) numberEl.textContent = idx + 1;
        // data-index 속성을 하위 요소에도 동기화
        item.querySelectorAll("[data-index]").forEach(function (child) {
            child.dataset.index = idx;
        });
    });
}

/** 이벤트 위임 핸들러 (Perf 6 / Feature 2, 3) */
async function handleSuggestionAction(e) {
    // 드래그 핸들 클릭시 무시
    if (e.target.closest(".nps-drag-handle")) return;
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const item = actionEl.closest(".nps-suggestion-item");
    const suggestion = item ? item.dataset.suggestion : "";
    const settings = extension_settings[extensionName];

    switch (action) {
        case "copy": {
            await copyToClipboard(suggestion);
            if (settings.autoPasteToInput) {
                pasteToInputField("<ooc: " + suggestion + ">");
                toastr.success("입력창에 붙여넣기 되었습니다.");
            } else {
                toastr.success("클립보드에 복사되었습니다.");
            }
            removeSuggestionMessage();
            break;
        }
        case "send": {
            // Feature 2: 바로 보내기
            const oocText = "<ooc: " + suggestion + ">";
            sendMessageToChat(oocText);
            toastr.success("메시지를 전송했습니다!");
            removeSuggestionMessage();
            break;
        }
        case "edit": {
            // Feature 3: 편집 모드 진입
            if (item) {
                item.classList.add("editing");
                const textarea = item.querySelector(".nps-edit-textarea");
                if (textarea) {
                    textarea.value = suggestion;
                    textarea.focus();
                }
            }
            break;
        }
        case "edit-copy": {
            const editTextarea = item ? item.querySelector(".nps-edit-textarea") : null;
            const editText = editTextarea ? editTextarea.value.trim() : suggestion;
            await copyToClipboard(editText);
            toastr.success("편집된 내용이 복사되었습니다.");
            removeSuggestionMessage();
            break;
        }
        case "edit-send": {
            const sendTextarea = item ? item.querySelector(".nps-edit-textarea") : null;
            const sendText = sendTextarea ? sendTextarea.value.trim() : suggestion;
            sendMessageToChat("<ooc: " + sendText + ">");
            toastr.success("편집된 내용을 전송했습니다!");
            removeSuggestionMessage();
            break;
        }
        case "edit-cancel": {
            if (item) item.classList.remove("editing");
            break;
        }
        case "close": {
            removeSuggestionMessage();
            break;
        }
        case "regenerate": {
            if (_callbacks.showSuggestions) _callbacks.showSuggestions();
            break;
        }
        case "feedback-negative": {
            // v1.7.0: "이건 아니야" 키워드를 추출 후 저장함
            if (suggestion) {
                const keywords = suggestion.replace(/[^\w\uAC00-\uD7A3\u3040-\u30FF\u4E00-\u9FFF]/g, " ")
                    .split(/\s+/).filter(function (w) { return w.length > 2; }).slice(0, 5);
                if (!settings.negativeFeedbackKeywords) settings.negativeFeedbackKeywords = [];
                keywords.forEach(function (kw) {
                    if (settings.negativeFeedbackKeywords.indexOf(kw) < 0) {
                        settings.negativeFeedbackKeywords.push(kw);
                    }
                });
                // 최대 30개만 유지
                if (settings.negativeFeedbackKeywords.length > 30) {
                    settings.negativeFeedbackKeywords = settings.negativeFeedbackKeywords.slice(-30);
                }
                saveSettings();
                if (item) {
                    item.classList.add("nps-feedback-rejected");
                    item.style.opacity = "0.4";
                }
                toastr.info("키워드 반영됨. 유사한 전개가 이후 제외됩니다.");
            }
            break;
        }
        case "merge": {
            // v1.7.0: 선택한 추천 합치기
            const msgContainer = e.currentTarget;
            const checkboxes = msgContainer.querySelectorAll(".nps-merge-checkbox:checked");
            const selected = [];
            checkboxes.forEach(function (cb) {
                const parentItem = cb.closest(".nps-suggestion-item");
                if (parentItem && parentItem.dataset.suggestion) {
                    selected.push(parentItem.dataset.suggestion);
                }
            });
            if (selected.length < 2) {
                toastr.warning("합칠 추천을 2개 이상 체크해주세요.");
                break;
            }
            if (_callbacks.mergeSuggestions) _callbacks.mergeSuggestions(selected);
            break;
        }
    }
}

/** 추천 메시지 제거 */
export function removeSuggestionMessage() {
    if (state.currentSuggestionMessageId) {
        const el = document.getElementById(state.currentSuggestionMessageId);
        if (el) el.remove();
        state.currentSuggestionMessageId = null;
    }
    document.querySelectorAll(".nps-suggestion-mes").forEach(function (el) { el.remove(); });
}

// ═══════════════════════════════════════════
// 전개 방향 팝업
// ═══════════════════════════════════════════
export function openDirectionPopup() {
    const popup = document.getElementById("nps-direction-popup");
    if (popup) {
        popup.classList.add("active");
        const input = document.getElementById("nps-direction-input");
        if (input) { input.value = ""; input.focus(); }
        // v1.7.0: 퀵 템플릿 렌더
        renderQuickTemplates();
    }
}

export function closeDirectionPopup() {
    const popup = document.getElementById("nps-direction-popup");
    if (popup) popup.classList.remove("active");
}

// ═══════════════════════════════════════════
// 확장 메뉴 / 채팅 버튼
// ═══════════════════════════════════════════
export function addExtensionMenuButton(retryCount) {
    if (retryCount === undefined) retryCount = 0;
    const MAX_RETRIES = 10;
    if (document.getElementById("nps-menu-item") && document.getElementById("nps-settings-menu-item")) return;

    const menu = document.getElementById("extensionsMenu");
    if (!menu) {
        if (retryCount < MAX_RETRIES) {
            setTimeout(function () { addExtensionMenuButton(retryCount + 1); }, 1000);
        }
        return;
    }

    if (!document.getElementById("nps-menu-item")) {
        const item = document.createElement("div");
        item.id = "nps-menu-item";
        item.className = "list-group-item flex-container flexGap5 interactable";
        item.tabIndex = 0;
        item.role = "listitem";
        item.innerHTML = '<div class="fa-solid fa-lightbulb extensionsMenuExtensionButton"></div>다음 전개 추천';
        item.addEventListener("click", function () {
            if (_callbacks.showSuggestions) _callbacks.showSuggestions();
            menu.style.display = "none";
        });
        menu.appendChild(item);
    }

    if (!document.getElementById("nps-settings-menu-item")) {
        const settingsItem = document.createElement("div");
        settingsItem.id = "nps-settings-menu-item";
        settingsItem.className = "list-group-item flex-container flexGap5 interactable";
        settingsItem.tabIndex = 0;
        settingsItem.role = "listitem";
        settingsItem.innerHTML = '<div class="fa-solid fa-gear extensionsMenuExtensionButton"></div>다음 전개 추천 설정';
        settingsItem.addEventListener("click", function () {
            openSettingsPopup();
            menu.style.display = "none";
        });
        menu.appendChild(settingsItem);
    }

    log("Menu buttons added");
}

export function addChatButton() {
    const existing = document.getElementById("nps-generate-btn");
    if (existing) existing.remove();

    const settings = extension_settings[extensionName];
    if (settings && settings.showInputButton === false) return;

    const rightSendForm = document.getElementById("rightSendForm");
    if (!rightSendForm) return;

    const button = document.createElement("div");
    button.id = "nps-generate-btn";
    button.className = "interactable" + (settings.autoSuggest ? " nps-auto-active" : "");
    button.title = "다음 전개 추천" + (settings.autoSuggest ? " (자동 모드 ON)" : "");
    button.innerHTML = '<span class="fa-solid fa-lightbulb"></span>' + (settings.autoSuggest ? '<span class="nps-auto-badge">A</span>' : '');
    button.addEventListener("click", function () {
        if (_callbacks.showSuggestions) _callbacks.showSuggestions();
    });
    rightSendForm.insertBefore(button, rightSendForm.firstChild);
}

/** v1.6.0: 자동 추천 상태에 따라 채팅 버튼 뱃지 갱신 */
function updateChatButtonAutoState() {
    const btn = document.getElementById("nps-generate-btn");
    if (!btn) return;
    const settings = extension_settings[extensionName];
    const isAuto = settings.autoSuggest;
    btn.classList.toggle("nps-auto-active", isAuto);
    btn.title = "다음 전개 추천" + (isAuto ? " (자동 모드 ON)" : "");
    const badge = btn.querySelector(".nps-auto-badge");
    if (isAuto && !badge) {
        const b = document.createElement("span");
        b.className = "nps-auto-badge";
        b.textContent = "A";
        btn.appendChild(b);
    } else if (!isAuto && badge) {
        badge.remove();
    }
}

// ═══════════════════════════════════════════
// 팝업 이벤트 바인딩
// ═══════════════════════════════════════════
export function bindPopupEvents() {
    // 닫기
    const closeBtn = document.getElementById("nps-popup-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeSettingsPopup);

    const popup = document.getElementById("nps-settings-popup");
    if (popup) {
        popup.addEventListener("click", function (e) {
            if (e.target === popup) closeSettingsPopup();
        });
    }

    // 오버레이 클릭
    const overlayBg = document.getElementById("nps-popup-overlay-bg");
    if (overlayBg) overlayBg.addEventListener("click", closeSettingsPopup);

    // ─── 토글 설정 (일괄 바인딩) ───
    const toggleSettings = [
        { id: "nps-popup-enabled", key: "enabled" },
        { id: "nps-popup-auto-paste", key: "autoPasteToInput" },
        { id: "nps-popup-use-custom-direction", key: "useCustomDirection" },
        { id: "nps-popup-json-mode", key: "useJsonMode" },
        { id: "nps-popup-enable-cache", key: "enableCache" },
        { id: "nps-popup-enable-compression", key: "enableCompression" }
    ];

    toggleSettings.forEach(function (cfg) {
        const el = document.getElementById(cfg.id);
        if (el) {
            el.addEventListener("change", function () {
                extension_settings[extensionName][cfg.key] = this.checked;
                saveSettings();
            });
        }
    });

    // v1.6.0: 자동 추천 토글 (뱃지 갱신 사이드이펙트)
    const autoSuggestEl = document.getElementById("nps-popup-auto-suggest");
    if (autoSuggestEl) {
        autoSuggestEl.addEventListener("change", function () {
            extension_settings[extensionName].autoSuggest = this.checked;
            saveSettings();
            updateChatButtonAutoState();
        });
    }

    // 입력란 버튼 표시 (사이드 이펙트 포함)
    const showInputBtnEl = document.getElementById("nps-popup-show-input-btn");
    if (showInputBtnEl) {
        showInputBtnEl.addEventListener("change", function () {
            extension_settings[extensionName].showInputButton = this.checked;
            if (this.checked) {
                addChatButton();
            } else {
                const btn = document.getElementById("nps-generate-btn");
                if (btn) btn.remove();
            }
            saveSettings();
        });
    }

    // ─── Input 소스 (일괄 바인딩) ───
    const inputSourceSettings = [
        { id: "nps-popup-input-char", key: "charDescription" },
        { id: "nps-popup-input-persona", key: "personaDescription" },
        { id: "nps-popup-input-world", key: "worldInfo" },
        { id: "nps-popup-input-summary", key: "scenarioSummary" },
        { id: "nps-popup-input-au", key: "auWorldBuilder" }
    ];

    inputSourceSettings.forEach(function (cfg) {
        const el = document.getElementById(cfg.id);
        if (el) {
            el.addEventListener("change", function () {
                if (!extension_settings[extensionName].inputSources) {
                    extension_settings[extensionName].inputSources = Object.assign({}, defaultSettings.inputSources);
                }
                extension_settings[extensionName].inputSources[cfg.key] = this.checked;
                saveSettings();
            });
        }
    });

    // ─── 숫자 설정 (일괄 바인딩) ───
    const numberSettings = [
        { id: "nps-popup-sentence-count", key: "sentenceCount", min: 1, max: 10 },
        { id: "nps-popup-suggestion-count", key: "suggestionCount", min: 1, max: 10 },
        { id: "nps-popup-max-tokens", key: "maxTokens", min: 100, max: 4000 },
        { id: "nps-popup-max-context", key: "maxContextTokens", min: 1000, max: 128000 },
        { id: "nps-popup-compression-threshold", key: "compressionThreshold", min: 10, max: 100 },
        { id: "nps-popup-auto-suggest-delay", key: "autoSuggestDelay", min: 500, max: 10000 }
    ];

    numberSettings.forEach(function (cfg) {
        const el = document.getElementById(cfg.id);
        if (el) {
            const handler = function () {
                let value = parseInt(this.value);
                if (isNaN(value) || value < cfg.min) value = cfg.min;
                if (value > cfg.max) value = cfg.max;
                this.value = value;
                extension_settings[extensionName][cfg.key] = value;
                saveSettings();
            };
            el.addEventListener("input", handler);
            el.addEventListener("change", handler);
        }
    });

    // ─── 온도 슬라이더 (Feature 6) ───
    const tempEl = document.getElementById("nps-popup-temperature");
    if (tempEl) {
        tempEl.addEventListener("input", function () {
            const value = parseFloat(this.value);
            extension_settings[extensionName].temperature = value;
            const display = document.getElementById("nps-popup-temp-value");
            if (display) display.textContent = value.toFixed(1);
            saveSettings();
        });
    }

    // ─── 추천 언어 ───
    const outputLanguageEl = document.getElementById("nps-popup-output-language");
    if (outputLanguageEl) {
        outputLanguageEl.addEventListener("change", function () {
            extension_settings[extensionName].outputLanguage = this.value;
            saveSettings();
        });
    }

    // ─── 커스텀 프롬프트 ───
    const customPromptEl = document.getElementById("nps-popup-custom-prompt");
    if (customPromptEl) {
        customPromptEl.addEventListener("change", function () {
            extension_settings[extensionName].customPrompt = this.value;
            saveSettings();
        });
    }

    // ─── 네거티브 프롬프트 (Feature 4) ───
    const negativePromptEl = document.getElementById("nps-popup-negative-prompt");
    if (negativePromptEl) {
        negativePromptEl.addEventListener("change", function () {
            extension_settings[extensionName].negativePrompt = this.value;
            saveSettings();
        });
    }

    // ─── v1.5.1: 프리뷰 모드 ───
    const previewModeEl = document.getElementById("nps-popup-preview-mode");
    if (previewModeEl) {
        previewModeEl.addEventListener("change", function () {
            extension_settings[extensionName].previewMode = this.checked;
            saveSettings();
        });
    }
    const previewCountEl = document.getElementById("nps-popup-preview-count");
    if (previewCountEl) {
        const previewCountHandler = function () {
            let value = parseInt(this.value);
            if (isNaN(value) || value < 3) value = 3;
            if (value > 10) value = 10;
            this.value = value;
            extension_settings[extensionName].previewCount = value;
            saveSettings();
        };
        previewCountEl.addEventListener("input", previewCountHandler);
        previewCountEl.addEventListener("change", previewCountHandler);
    }

    // ─── API 설정 ───
    const apiTypeEl = document.getElementById("nps-popup-api-type");
    if (apiTypeEl) {
        apiTypeEl.addEventListener("change", function () {
            extension_settings[extensionName].apiType = this.value;
            updatePopupApiSettingsVisibility();
            saveSettings();
        });
    }

    const llmProviderEl = document.getElementById("nps-popup-llm-provider");
    if (llmProviderEl) {
        llmProviderEl.addEventListener("change", function () {
            extension_settings[extensionName].llmProvider = this.value;
            updateLlmModelList(this.value, true);
            saveSettings();
        });
    }

    const llmModelEl = document.getElementById("nps-popup-llm-model");
    if (llmModelEl) {
        llmModelEl.addEventListener("change", function () {
            extension_settings[extensionName].llmModel = this.value;
            saveSettings();
        });
    }

    const textSettings = [
        { id: "nps-popup-api-endpoint", key: "apiEndpoint" },
        { id: "nps-popup-api-key", key: "apiKey" },
        { id: "nps-popup-api-model", key: "apiModel" }
    ];

    textSettings.forEach(function (cfg) {
        const el = document.getElementById(cfg.id);
        if (el) {
            el.addEventListener("change", function () {
                extension_settings[extensionName][cfg.key] = this.value;
                saveSettings();
            });
        }
    });

    // API 테스트
    const testApiBtn = document.getElementById("nps-popup-test-api");
    if (testApiBtn) testApiBtn.addEventListener("click", testApiConnection);

    // ─── 생성 통계 새로고침 (Perf 7) ───
    const refreshAnalyticsBtn = document.getElementById("nps-refresh-analytics");
    if (refreshAnalyticsBtn) {
        refreshAnalyticsBtn.addEventListener("click", refreshAnalyticsPanel);
    }

    // ─── v1.6.0: 토큰 시각화 새로고침 ───
    const refreshTokenVizBtn = document.getElementById("nps-refresh-token-viz");
    if (refreshTokenVizBtn) {
        refreshTokenVizBtn.addEventListener("click", refreshTokenVisualization);
    }

    // ─── v1.5.0: 플롯 세분화 바인딩 ───
    bindPlotTabEvents();

    // ─── 커스텀 장르 추가 ───
    const addGenreBtn = document.getElementById("nps-popup-add-genre-btn");
    if (addGenreBtn) {
        addGenreBtn.addEventListener("click", function () {
            const nameEl = document.getElementById("nps-popup-new-genre-name");
            const nameKoEl = document.getElementById("nps-popup-new-genre-name-ko");
            const name = nameEl ? nameEl.value.trim() : "";
            const nameKo = nameKoEl ? nameKoEl.value.trim() : "";
            if (!name || !nameKo) {
                toastr.warning("장르 이름(영문/한글)을 모두 입력해주세요.");
                return;
            }
            addCustomGenre(name, nameKo);
            if (nameEl) nameEl.value = "";
            if (nameKoEl) nameKoEl.value = "";
            renderPopupCustomGenres();
        });
    }

    // ─── 퀄리티 프롬프트: 문체 스타일 라디오 ───
    document.querySelectorAll('input[name="nps-writing-style"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
            extension_settings[extensionName].selectedWritingStyle = this.value;
            // qualityPrompts 객체에 동기화
            const qp = extension_settings[extensionName].qualityPrompts || {};
            Object.keys(qp).forEach(function (k) { qp[k] = false; });
            qp[this.value] = true;
            extension_settings[extensionName].qualityPrompts = qp;
            saveSettings();
        });
    });

    // ─── v1.8.0: 퀄리티 강화 토글 ───
    document.querySelectorAll(".nps-qe-toggle").forEach(function (cb) {
        cb.addEventListener("change", function () {
            if (!extension_settings[extensionName].qualityEnhancements) {
                extension_settings[extensionName].qualityEnhancements = Object.assign({}, defaultSettings.qualityEnhancements);
            }
            const key = this.id.replace("nps-qe-", "");
            extension_settings[extensionName].qualityEnhancements[key] = this.checked;
            saveSettings();
        });
    });

    // 커스텀 퀄리티 프롬프트 추가
    const addQualityBtn = document.getElementById("nps-add-quality-btn");
    const newQPContainer = document.getElementById("nps-new-quality-prompt-container");
    const newQPNameInput = document.getElementById("nps-new-quality-name");
    const newQPPromptInput = document.getElementById("nps-new-quality-prompt");
    const saveQPBtn = document.getElementById("nps-save-quality-btn");
    const cancelQPBtn = document.getElementById("nps-cancel-quality-btn");

    if (addQualityBtn && newQPContainer) {
        addQualityBtn.addEventListener("click", function () {
            const name = newQPNameInput ? newQPNameInput.value.trim() : "";
            if (!name) {
                toastr.warning("프롬프트 이름을 입력해주세요.");
                return;
            }
            newQPContainer.style.display = "block";
        });
    }

    if (saveQPBtn) {
        saveQPBtn.addEventListener("click", function () {
            const name = newQPNameInput ? newQPNameInput.value.trim() : "";
            const prompt = newQPPromptInput ? newQPPromptInput.value.trim() : "";
            if (!name || !prompt) {
                toastr.warning("이름과 프롬프트 내용을 모두 입력해주세요.");
                return;
            }
            if (!extension_settings[extensionName].customQualityPrompts) {
                extension_settings[extensionName].customQualityPrompts = [];
            }
            extension_settings[extensionName].customQualityPrompts.push({
                id: "custom_" + Date.now(), name: name, prompt: prompt, enabled: true
            });
            saveSettings();
            if (newQPNameInput) newQPNameInput.value = "";
            if (newQPPromptInput) newQPPromptInput.value = "";
            if (newQPContainer) newQPContainer.style.display = "none";
            renderCustomQualityPrompts();
            toastr.success("커스텀 퀄리티 프롬프트가 추가되었습니다.");
        });
    }

    if (cancelQPBtn) {
        cancelQPBtn.addEventListener("click", function () {
            if (newQPPromptInput) newQPPromptInput.value = "";
            if (newQPContainer) newQPContainer.style.display = "none";
        });
    }

    // ─── 분위기 설정 ───
    const moodEnabledEl = document.getElementById("nps-mood-enabled");
    if (moodEnabledEl) {
        moodEnabledEl.addEventListener("change", function () {
            if (!extension_settings[extensionName].moodSettings) {
                extension_settings[extensionName].moodSettings = Object.assign({}, defaultSettings.moodSettings);
            }
            extension_settings[extensionName].moodSettings.enabled = this.checked;
            const moodOptions = document.querySelector(".nps-mood-options");
            if (moodOptions) {
                moodOptions.style.opacity = this.checked ? "1" : "0.5";
                moodOptions.style.pointerEvents = this.checked ? "auto" : "none";
            }
            saveSettings();
        });
    }

    document.querySelectorAll('input[name="nps-mood-select"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
            if (!extension_settings[extensionName].moodSettings) {
                extension_settings[extensionName].moodSettings = Object.assign({}, defaultSettings.moodSettings);
            }
            extension_settings[extensionName].moodSettings.selectedMood = this.value;
            saveSettings();
        });
    });

    // ─── 탭 전환 (C.5: 핸들러 분리 수정 후 v1.8.0 핸들러들은 탭 클릭 밖으로 이동) ───
    document.querySelectorAll(".nps-tab-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const targetTab = this.dataset.tab;
            document.querySelectorAll(".nps-tab-btn").forEach(function (b) { b.classList.remove("active"); });
            document.querySelectorAll(".nps-tab-content").forEach(function (c) { c.classList.remove("active"); });
            this.classList.add("active");
            const tabContent = document.getElementById("nps-tab-" + targetTab);
            if (tabContent) tabContent.classList.add("active");
        });
    });

    // ─── v1.8.0: 장면 분위기 라디오 ───
    document.querySelectorAll('input[name="nps-scene-atmosphere"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
            if (!extension_settings[extensionName].moodSettings) {
                extension_settings[extensionName].moodSettings = Object.assign({}, defaultSettings.moodSettings);
            }
            extension_settings[extensionName].moodSettings.sceneAtmosphere = this.value;
            saveSettings();
        });
    });

    // ─── v1.8.0: 감각 포커스 체크박스 ───
    document.querySelectorAll('.nps-sensory-chip input[type="checkbox"]').forEach(function (cb) {
        cb.addEventListener("change", function () {
            if (!extension_settings[extensionName].moodSettings) {
                extension_settings[extensionName].moodSettings = Object.assign({}, defaultSettings.moodSettings);
            }
            const checked = [];
            document.querySelectorAll('.nps-sensory-chip input[type="checkbox"]:checked').forEach(function (c) { checked.push(c.value); });
            extension_settings[extensionName].moodSettings.sensoryFocus = checked;
            saveSettings();
        });
    });

    // ─── v1.8.0: 감정 강도 슬라이더 ───
    const emotionalIntensityEl = document.getElementById("nps-emotional-intensity");
    if (emotionalIntensityEl) {
        emotionalIntensityEl.addEventListener("input", function () {
            if (!extension_settings[extensionName].moodSettings) {
                extension_settings[extensionName].moodSettings = Object.assign({}, defaultSettings.moodSettings);
            }
            extension_settings[extensionName].moodSettings.emotionalIntensity = parseInt(this.value);
            const valEl = document.getElementById("nps-emotional-intensity-val");
            if (valEl) valEl.textContent = this.value;
            saveSettings();
        });
    }

    // ─── v1.8.0: 페이싱 이어 토글 ───
    const pacingEnabledEl = document.getElementById("nps-pacing-enabled");
    if (pacingEnabledEl) {
        pacingEnabledEl.addEventListener("change", function () {
            extension_settings[extensionName].pacingEnabled = this.checked;
            const pacingOpts = document.getElementById("nps-pacing-options");
            if (pacingOpts) {
                pacingOpts.style.opacity = this.checked ? "1" : "0.5";
                pacingOpts.style.pointerEvents = this.checked ? "auto" : "none";
            }
            saveSettings();
        });
    }

    // ─── v1.8.0: 조건부 규칙 프리셋 ───
    document.querySelectorAll(".nps-rule-preset-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
            const idx = parseInt(this.dataset.presetIdx);
            const preset = conditionalRulePresets[idx];
            if (!preset) return;
            const condEl = document.getElementById("nps-rule-condition");
            const actEl = document.getElementById("nps-rule-action");
            if (condEl) condEl.value = preset.condition;
            if (actEl) actEl.value = preset.action;
        });
    });

    // ─── 전개 방향 입력 팝업 ───
    const directionCloseBtn = document.getElementById("nps-direction-close-btn");
    if (directionCloseBtn) directionCloseBtn.addEventListener("click", closeDirectionPopup);

    const directionOverlay = document.getElementById("nps-direction-overlay-bg");
    if (directionOverlay) directionOverlay.addEventListener("click", closeDirectionPopup);

    const directionGenerateBtn = document.getElementById("nps-direction-generate-btn");
    if (directionGenerateBtn) {
        directionGenerateBtn.addEventListener("click", function () {
            if (_callbacks.generateWithDirection) _callbacks.generateWithDirection();
        });
    }

    const directionCancelBtn = document.getElementById("nps-direction-cancel-btn");
    if (directionCancelBtn) {
        directionCancelBtn.addEventListener("click", function () {
            state.currentCustomDirection = "";
            closeDirectionPopup();
        });
    }

    const directionInput = document.getElementById("nps-direction-input");
    if (directionInput) {
        directionInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (_callbacks.generateWithDirection) _callbacks.generateWithDirection();
            }
        });
    }

    // ─── v1.6.0: 설정 내보내기/불러오기 ───
    const exportBtn = document.getElementById("nps-export-settings-btn");
    if (exportBtn) {
        exportBtn.addEventListener("click", function () {
            const settings = extension_settings[extensionName];
            const json = JSON.stringify(settings, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "nps-settings-" + new Date().toISOString().slice(0, 10) + ".json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toastr.success("설정이 내보내졌습니다.");
        });
    }

    const importBtn = document.getElementById("nps-import-settings-btn");
    const importInput = document.getElementById("nps-import-file-input");
    if (importBtn && importInput) {
        importBtn.addEventListener("click", function () { importInput.click(); });
        importInput.addEventListener("change", function (e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    const imported = JSON.parse(ev.target.result);
                    if (typeof imported !== "object" || imported === null) throw new Error("Invalid format");
                    // 안전하게 병합: 기존 설정 기반으로 가져온 값 덮어쓰기
                    const current = extension_settings[extensionName];
                    for (let key in imported) {
                        if (Object.prototype.hasOwnProperty.call(imported, key) &&
                            Object.prototype.hasOwnProperty.call(defaultSettings, key)) {
                            current[key] = imported[key];
                        }
                    }
                    saveSettings();
                    updatePopupUIFromSettings();
                    toastr.success("설정을 불러왔습니다.");
                } catch (err) {
                    toastr.error("설정 파일을 읽는 데 오류가 발생했습니다: " + err.message);
                }
            };
            reader.readAsText(file);
            importInput.value = ""; // 같은 파일 재선택 허용
        });
    }

    // ─── v1.7.0: 추천 길이 슬라이더 ───
    const lengthEl = document.getElementById("nps-popup-suggestion-length");
    if (lengthEl) {
        lengthEl.addEventListener("input", function () {
            extension_settings[extensionName].suggestionLength = parseInt(this.value);
            const valEl = document.getElementById("nps-suggestion-length-val");
            if (valEl) valEl.textContent = this.value;
            saveSettings();
        });
    }

    // ─── v1.7.0: 유사도 임계값 슬라이더 ───
    const simThreshEl = document.getElementById("nps-popup-similarity-threshold");
    if (simThreshEl) {
        simThreshEl.addEventListener("input", function () {
            extension_settings[extensionName].similarityThreshold = parseFloat(this.value);
            const valEl = document.getElementById("nps-similarity-threshold-val");
            if (valEl) valEl.textContent = parseFloat(this.value).toFixed(1);
            saveSettings();
        });
    }

    // ─── v1.7.0: 프로필 저장 ───
    const saveProfileBtn = document.getElementById("nps-save-profile-btn");
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener("click", function () {
            const nameInput = document.getElementById("nps-profile-name-input");
            const name = nameInput ? nameInput.value.trim() : "";
            if (!name) { toastr.warning("프로필 이름을 입력해주세요."); return; }
            saveProfile(name);
            if (nameInput) nameInput.value = "";
        });
    }

    // ─── v1.7.0: 창의성 레벨 슬라이더 ───
    const creativityEl = document.getElementById("nps-creativity-level");
    if (creativityEl) {
        creativityEl.addEventListener("input", function () {
            extension_settings[extensionName].creativityLevel = parseInt(this.value);
            const valEl = document.getElementById("nps-creativity-level-val");
            if (valEl) valEl.textContent = this.value;
            saveSettings();
        });
    }

    // ─── v1.7.0: 조건부 규칙 추가 ───
    const addRuleBtn = document.getElementById("nps-add-rule-btn");
    if (addRuleBtn) {
        addRuleBtn.addEventListener("click", function () {
            const condEl = document.getElementById("nps-rule-condition");
            const actEl = document.getElementById("nps-rule-action");
            const condition = condEl ? condEl.value.trim() : "";
            const action = actEl ? actEl.value.trim() : "";
            if (!condition || !action) { toastr.warning("조건과 결과를 모두 입력해주세요."); return; }
            if (!extension_settings[extensionName].conditionalRules) extension_settings[extensionName].conditionalRules = [];
            extension_settings[extensionName].conditionalRules.push({ condition: condition, action: action, enabled: true });
            saveSettings();
            if (condEl) condEl.value = "";
            if (actEl) actEl.value = "";
            renderConditionalRules();
            toastr.success("규칙이 추가되었습니다.");
        });
    }

    // ─── v1.7.0: 리듬 분석 새로고침 ───
    const refreshRhythmBtn = document.getElementById("nps-refresh-rhythm");
    if (refreshRhythmBtn) {
        refreshRhythmBtn.addEventListener("click", function () {
            const rhythm = analyzeConversationRhythm();
            const setRhythmVal = function (id, val) { const el = document.getElementById(id); if (el) el.textContent = val; };
            if (!rhythm) {
                setRhythmVal("nps-rhythm-user", "-");
                setRhythmVal("nps-rhythm-ai", "-");
                setRhythmVal("nps-rhythm-user-len", "-");
                setRhythmVal("nps-rhythm-ai-len", "-");
                setRhythmVal("nps-rhythm-pattern", "데이터 부족");
                return;
            }
            setRhythmVal("nps-rhythm-user", rhythm.userRatio + "%");
            setRhythmVal("nps-rhythm-ai", rhythm.aiRatio + "%");
            setRhythmVal("nps-rhythm-user-len", rhythm.avgUserLen + "자");
            setRhythmVal("nps-rhythm-ai-len", rhythm.avgAiLen + "자");
            const patternNames = {
                "balanced": "균형적",
                "short-input-long-output": "짧은 입력 / 긴 응답",
                "long-input-short-output": "긴 입력 / 짧은 응답",
                "user-dominant": "유저 주도",
                "ai-dominant": "AI 주도"
            };
            setRhythmVal("nps-rhythm-pattern", patternNames[rhythm.dominantPattern] || rhythm.dominantPattern);
        });
    }

    // ─── v1.7.0: 퀵 템플릿 저장 ───
    const saveTemplateBtn = document.getElementById("nps-save-template-btn");
    if (saveTemplateBtn) {
        saveTemplateBtn.addEventListener("click", function () {
            const input = document.getElementById("nps-direction-input");
            const text = input ? input.value.trim() : "";
            if (!text) { toastr.warning("먼저 텍스트를 입력해주세요."); return; }
            if (!extension_settings[extensionName].quickTemplates) extension_settings[extensionName].quickTemplates = [];
            extension_settings[extensionName].quickTemplates.push({ text: text });
            saveSettings();
            renderQuickTemplates();
            toastr.success("템플릿이 저장되었습니다.");
        });
    }
}

// createSettingsPopupHtml -> ui-html.js
export { createSettingsPopupHtml } from "./ui-html.js";
