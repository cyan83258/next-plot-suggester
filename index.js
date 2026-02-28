/**
 * 다음 전개 추천 확장 프로그램 v1.8.0
 * SillyTavern 확장 프로그램 - 엔트리 포인트
 *
 * 주요 기능:
 * - 채팅 내역을 바탕으로 다음 전개 추천
 * - 추천 내용을 버튼 형태로 표시 (복사 / 바로 보내기 / 편집)
 * - 장르, 분위기, 퀄리티 프롬프트 지정
 * - API 연결 프로필 개별 지정 (Connection Manager 연동)
 * - 새 메시지 수신 시 자동 추천 (on/off, 쓰로틀링)
 *
 * v1.8.0 변경사항:
 * - [아키텍처] C.1 통합 생성 플로우: executeGeneration() 공통 함수
 * - [코드품질] var → let/const 전환
 * - [기능] 퀄리티 강화 옵션, 장면 분위기, 감각 포커스, 감정 강도
 */

import { extension_settings } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";

// 모듈 임포트
import { extensionName, defaultSettings } from "./constants.js";
import { state, recordAnalytics } from "./state.js";
import { log, estimateTokens, filterSimilarSuggestions } from "./utils.js";
import { sendApiRequest } from "./api.js";
import {
    buildPrompt, buildPreviewPrompt, buildMergePrompt,
    parseSuggestions, parsePreviewResponse, parseMergeResponse,
    getCachedSuggestions, setCachedSuggestions, invalidateCache
} from "./prompt.js";
import { requestQueue } from "./queue.js";
import {
    setupUICallbacks,
    createSettingsPopupHtml,
    bindPopupEvents,
    addExtensionMenuButton,
    addChatButton,
    openDirectionPopup,
    closeDirectionPopup,
    showLoadingMessage,
    removeLoadingMessage,
    displaySuggestionMessage,
    displayPreviewMessage,
    removeSuggestionMessage
} from "./ui.js";

// ═══════════════════════════════════════════
// 설정 로드
// ═══════════════════════════════════════════
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    const settings = extension_settings[extensionName];

    for (const key in defaultSettings) {
        if (Object.prototype.hasOwnProperty.call(defaultSettings, key)) {
            if (settings[key] === undefined) {
                const value = defaultSettings[key];
                if (typeof value === "object" && value !== null) {
                    settings[key] = Array.isArray(value) ? value.slice() : Object.assign({}, value);
                } else {
                    settings[key] = value;
                }
            }
        }
    }

    log("Settings loaded");
}

// ═══════════════════════════════════════════
// C.1: 통합 생성 플로우
// ═══════════════════════════════════════════
/**
 * 공통 생성 실행 함수.
 * 큐잉·로딩·분석·에러처리 보일러플레이트를 한곳에서 처리한다.
 *
 * @param {Object} opts
 * @param {() => Promise<string>} opts.promptBuilder  - 프롬프트를 반환하는 async 함수
 * @param {(response: string) => any} opts.responseParser - API 응답을 파싱하는 함수
 * @param {(parsed: any) => void} opts.resultHandler  - 파싱 결과를 UI에 표시하는 함수
 * @param {string} opts.errorPrefix  - 에러 토스트에 표시할 접두어
 * @param {boolean} [opts.cacheResult=false] - 결과를 IndexedDB 캐시에 저장할지 여부
 * @param {(parsed: any) => any} [opts.postProcess] - 파싱 후 후처리 (e.g. 유사도 필터)
 * @param {() => void} [opts.onComplete] - finally 구간에서 추가로 실행할 콜백
 * @param {boolean} [opts.silent=false] - true이면 isGenerating 경고 표시 안함
 */
async function executeGeneration(opts) {
    // 중복 생성 방지
    if (state.isGenerating) {
        if (!opts.silent) toastr.warning("이미 생성 중입니다. 잠시 기다려주세요.");
        return;
    }

    removeSuggestionMessage();
    state.isGenerating = true;

    try {
        showLoadingMessage();

        let result = await requestQueue.enqueue(async function (signal) {
            const startTime = Date.now();
            const prompt = await opts.promptBuilder();
            const promptTokens = estimateTokens(prompt);
            log("Sending prompt (~" + promptTokens + " tokens)");

            const response = await sendApiRequest(prompt, signal);
            log("Received response (length: " + response.length + ")");

            let parsed = opts.responseParser(response);
            const durationMs = Date.now() - startTime;

            recordAnalytics({
                durationMs,
                promptTokens,
                success: Array.isArray(parsed) ? parsed.length > 0 : !!parsed,
                suggestionCount: Array.isArray(parsed) ? parsed.length : (parsed ? 1 : 0)
            });

            if ((Array.isArray(parsed) && parsed.length === 0) || !parsed) {
                throw new Error("No results parsed from response");
            }

            if (opts.postProcess) {
                parsed = opts.postProcess(parsed);
            }

            return parsed;
        });

        if (opts.cacheResult) {
            await setCachedSuggestions(result);
        }

        removeLoadingMessage();
        opts.resultHandler(result);

    } catch (error) {
        removeLoadingMessage();
        if (error.name === "AbortError") {
            log("Generation cancelled by user");
            toastr.info("생성이 취소되었습니다.");
        } else {
            log("Error: " + opts.errorPrefix, error);
            toastr.error(opts.errorPrefix + ": " + error.message);
        }
    } finally {
        state.isGenerating = false;
        if (opts.onComplete) opts.onComplete();
    }
}

// ═══════════════════════════════════════════
// 추천 생성 (메인 플로우)
// ═══════════════════════════════════════════

/** 유사도 필터 후처리 */
function applySimilarityFilter(suggestions) {
    const threshold = extension_settings[extensionName].similarityThreshold || 0;
    if (threshold > 0 && suggestions.length > 1) {
        return filterSimilarSuggestions(suggestions, threshold);
    }
    return suggestions;
}

/**
 * 추천 표시
 * @param {boolean} [silent=false] - true이면 경고 메시지 표시 안함
 */
async function showSuggestions(silent) {
    if (silent === undefined) silent = false;

    const settings = extension_settings[extensionName];

    if (state.isGenerating) {
        if (!silent) toastr.warning("이미 생성 중입니다. 잠시 기다려주세요.");
        return;
    }

    if (!settings.enabled) {
        toastr.info("다음 전개 추천 기능이 비활성화되어 있습니다.");
        return;
    }

    // 전개 방향 입력 사용 시 팝업 먼저 표시
    if (settings.useCustomDirection) {
        openDirectionPopup();
        return;
    }

    // v1.5.1: 프리뷰 모드인 경우 프리뷰 생성
    if (settings.previewMode) {
        showPreview();
        return;
    }

    // 캐시 확인 (async — IndexedDB)
    const cached = await getCachedSuggestions();
    if (cached) {
        removeSuggestionMessage();
        displaySuggestionMessage(cached);
        return;
    }

    // showSuggestions에서 이미 isGenerating을 체크했으므로 silent=true로 전달
    await executeGeneration({
        promptBuilder: buildPrompt,
        responseParser: parseSuggestions,
        resultHandler: displaySuggestionMessage,
        errorPrefix: "추천 생성 중 오류가 발생했습니다",
        cacheResult: true,
        postProcess: applySimilarityFilter,
        silent: true
    });
}

// ═══════════════════════════════════════════
// v1.5.1: 프리뷰 모드
// ═══════════════════════════════════════════

/** 프리뷰 생성 — 1문장 요약 N개를 먼저 표시 */
async function showPreview() {
    await executeGeneration({
        promptBuilder: buildPreviewPrompt,
        responseParser: parsePreviewResponse,
        resultHandler: displayPreviewMessage,
        errorPrefix: "프리뷰 생성 중 오류가 발생했습니다"
    });
}

/**
 * 프리뷰에서 선택한 방향으로 전체 생성
 * @param {string} previewText - 선택된 프리뷰 텍스트
 */
async function generateFromPreview(previewText) {
    state.currentCustomDirection = previewText;
    log("Generating from preview:", previewText);
    await invalidateCache();

    await executeGeneration({
        promptBuilder: buildPrompt,
        responseParser: parseSuggestions,
        resultHandler: displaySuggestionMessage,
        errorPrefix: "추천 생성 중 오류가 발생했습니다",
        cacheResult: true,
        postProcess: applySimilarityFilter,
        onComplete() { state.currentCustomDirection = ""; }
    });
}

/** 전개 방향 입력 후 생성 실행 */
async function generateWithDirection() {
    const input = document.getElementById("nps-direction-input");
    const direction = input ? input.value.trim() : "";

    if (!direction) {
        toastr.warning("전개 방향을 입력해주세요.");
        return;
    }

    state.currentCustomDirection = direction;
    log("Custom direction:", direction);
    closeDirectionPopup();

    await invalidateCache();

    await executeGeneration({
        promptBuilder: buildPrompt,
        responseParser: parseSuggestions,
        resultHandler: displaySuggestionMessage,
        errorPrefix: "추천 생성 중 오류가 발생했습니다",
        cacheResult: true,
        postProcess: applySimilarityFilter,
        onComplete() { state.currentCustomDirection = ""; }
    });
}

// ═══════════════════════════════════════════
// v1.7.0: 추천 합치기(머지)
// ═══════════════════════════════════════════

/**
 * 선택된 추천들을 합쳐 하나의 새 추천 생성
 * @param {string[]} selectedSuggestions
 */
async function mergeSuggestions(selectedSuggestions) {
    if (!selectedSuggestions || selectedSuggestions.length < 2) {
        toastr.warning("합칠 추천을 2개 이상 선택해주세요.");
        return;
    }

    await executeGeneration({
        promptBuilder: () => buildMergePrompt(selectedSuggestions),
        responseParser(response) {
            const merged = parseMergeResponse(response);
            return merged ? [merged] : [];
        },
        resultHandler(result) {
            removeSuggestionMessage();
            displaySuggestionMessage(result);
            toastr.success("추천이 합쳐졌습니다!");
        },
        errorPrefix: "합치기 실패"
    });
}

/** 생성 취소 (Perf 3) */
function cancelGeneration() {
    if (state.isGenerating) {
        requestQueue.cancel("사용자가 생성을 취소했습니다.");
        state.isGenerating = false;
        removeLoadingMessage();
        log("Generation cancelled");
    }
}

// ═══════════════════════════════════════════
// 자동 추천 (쓰로틀링 — v1.6.0: 캐릭터 메시지만 트리거)
// ═══════════════════════════════════════════
function onNewMessage(messageId, isCharacterMessage) {
    const settings = extension_settings[extensionName];

    // 새 메시지 시 캐시 무효화
    invalidateCache();

    // v1.6.0: 캐릭터(AI) 메시지일 때만 자동 추천
    if (settings.enabled && settings.autoSuggest && isCharacterMessage) {
        if (state.isGenerating) {
            log("Auto-suggest skipped: already generating");
            return;
        }

        if (state.autoSuggestTimer) {
            clearTimeout(state.autoSuggestTimer);
            state.autoSuggestTimer = null;
        }

        const delay = settings.autoSuggestDelay || 1000;
        state.autoSuggestTimer = setTimeout(function () {
            state.autoSuggestTimer = null;
            showSuggestions(true);
        }, delay);
    }
}

// ═══════════════════════════════════════════
// 초기화
// ═══════════════════════════════════════════
async function init() {
    log("Extension loading v1.8.0...");

    loadSettings();

    // UI 콜백 설정 (순환 의존 방지)
    setupUICallbacks({
        showSuggestions,
        generateWithDirection,
        cancelGeneration,
        generateFromPreview,
        showPreview,
        mergeSuggestions
    });

    // 설정 팝업 HTML 추가
    const popupHtml = createSettingsPopupHtml();
    document.body.insertAdjacentHTML("beforeend", popupHtml);

    // 팝업 이벤트 바인딩
    bindPopupEvents();

    // 메뉴 및 채팅 버튼 추가
    addExtensionMenuButton();
    addChatButton();

    log("Extension loaded successfully!");
}

// ═══════════════════════════════════════════
// jQuery ready + 이벤트 등록
// ═══════════════════════════════════════════
jQuery(async function () {
    eventSource.on(event_types.APP_READY, async function () {
        await init();
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, function (messageId) {
        onNewMessage(messageId, false);
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, function (messageId) {
        onNewMessage(messageId, true);
    });
});

// Export
export { extensionName };
