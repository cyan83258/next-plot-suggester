/**
 * 다음 전개 추천 확장 프로그램 - API 통신
 * Perf 3: AbortController 지원
 * Perf 8: 에러 리트라이 (exponential backoff)
 */
import { extension_settings } from "../../../extensions.js";
import { SECRET_KEYS, secret_state } from "../../../secrets.js";
import { getRequestHeaders } from "../../../../script.js";
import { extensionName } from "./constants.js";
import { log } from "./utils.js";

/**
 * 에러 리트라이 래퍼
 * - 인증 오류(401/403)는 즉시 실패
 * - AbortError는 재시도하지 않음
 * - 그 외에는 최대 2회 exponential backoff 재시도
 */
async function withRetry(fn, maxRetries = 2, signal = null) {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
        // 취소 확인
        if (signal && signal.aborted) {
            throw new DOMException(signal.reason || "요청이 취소되었습니다.", "AbortError");
        }
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            // AbortError는 재시도 안 함
            if (error.name === "AbortError") throw error;
            const msg = error.message || "";
            if (msg.includes("401") || msg.includes("403") || msg.includes("API 키")) {
                throw error;
            }
            if (i < maxRetries) {
                const delay = Math.pow(2, i) * 1000;
                log("API retry " + (i + 1) + "/" + maxRetries + " in " + delay + "ms:", msg);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

/** API 요청 보내기 (리트라이 + AbortController 포함) */
export async function sendApiRequest(prompt, signal) {
    const settings = extension_settings[extensionName];
    return withRetry(async function () {
        if (settings.apiType === "current") {
            return await generateWithCurrentApi(prompt, signal);
        } else if (settings.apiType === "profile") {
            return await generateWithProfileApi(prompt, signal);
        } else {
            return await generateWithCustomApi(prompt, signal);
        }
    }, 2, signal);
}

/** 현재 연결된 API로 생성 */
async function generateWithCurrentApi(prompt, signal) {
    const settings = extension_settings[extensionName];
    let result = "";

    if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
        const ctx = SillyTavern.getContext();
        if (ctx.generateRaw) {
            // AbortController 취소 확인
            if (signal && signal.aborted) throw new DOMException("취소됨", "AbortError");
            result = await ctx.generateRaw({
                prompt: prompt,
                maxContext: null,
                quietToLoud: false,
                skipWIAN: true,
                skipAN: true,
                signal: signal
            });
        } else if (ctx.generateQuietPrompt) {
            if (signal && signal.aborted) throw new DOMException("취소됨", "AbortError");
            result = await ctx.generateQuietPrompt(prompt, false, false);
        }
    }

    if (!result && typeof generateQuietPrompt === "function") {
        if (signal && signal.aborted) throw new DOMException("취소됨", "AbortError");
        result = await generateQuietPrompt(prompt, false, false);
    }

    if (!result) {
        const fetchOptions = {
            method: "POST",
            headers: getRequestHeaders(),
            body: JSON.stringify({
                prompt: prompt,
                max_tokens: settings.maxTokens || 1000,
                temperature: settings.temperature || 0.8
            })
        };
        if (signal) fetchOptions.signal = signal;

        const response = await fetch("/api/backends/chat-completions/generate", fetchOptions);
        if (!response.ok) {
            throw new Error("API request failed: " + response.status);
        }
        const data = await response.json();
        result = data.response || data.text || data.content || "";
    }

    return result;
}

/** 선택한 LLM Provider로 직접 API 호출 */
async function generateWithProfileApi(prompt, signal) {
    const settings = extension_settings[extensionName];
    const provider = settings.llmProvider || "openai";
    const model = settings.llmModel || "";
    const temperature = settings.temperature || 0.8;

    const messages = [{ role: "user", content: prompt }];
    const parameters = {
        model: model,
        messages: messages,
        temperature: temperature,
        stream: false,
        chat_completion_source: provider
    };

    let apiKey;
    switch (provider) {
        case "openai":
            apiKey = secret_state[SECRET_KEYS.OPENAI];
            parameters.chat_completion_source = "openai";
            break;
        case "claude":
            apiKey = secret_state[SECRET_KEYS.CLAUDE];
            parameters.chat_completion_source = "claude";
            break;
        case "google":
            apiKey = secret_state[SECRET_KEYS.MAKERSUITE];
            parameters.chat_completion_source = "makersuite";
            break;
        case "cohere":
            apiKey = secret_state[SECRET_KEYS.COHERE];
            parameters.chat_completion_source = "cohere";
            break;
        default:
            throw new Error("지원하지 않는 프로바이더: " + provider);
    }

    if (!apiKey) {
        throw new Error(provider.toUpperCase() + " API 키가 설정되어 있지 않습니다.");
    }

    log("Provider: " + provider + ", model: " + model + ", temp: " + temperature);

    const fetchOptions = {
        method: "POST",
        headers: Object.assign({}, getRequestHeaders(), { "Content-Type": "application/json" }),
        body: JSON.stringify(parameters)
    };
    if (signal) fetchOptions.signal = signal;

    const response = await fetch("/api/backends/chat-completions/generate", fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error("API 요청 실패: " + response.status + " - " + errorText);
    }

    const data = await response.json();
    let result = "";

    switch (provider) {
        case "openai":
            result = data.choices?.[0]?.message?.content?.trim() || "";
            break;
        case "claude":
            result = data.content?.[0]?.text?.trim() || "";
            break;
        case "google":
            result = data.candidates?.[0]?.content?.trim() ||
                     data.choices?.[0]?.message?.content?.trim() ||
                     data.text?.trim() || "";
            break;
        case "cohere":
            result = data.message?.content?.[0]?.text?.trim() ||
                     data.generations?.[0]?.text?.trim() ||
                     data.text?.trim() || "";
            break;
        default:
            result = data.response || data.text || data.content || "";
    }

    if (!result) throw new Error("API 응답이 비어있습니다.");
    return result;
}

/** 커스텀 API로 생성 */
async function generateWithCustomApi(prompt, signal) {
    const settings = extension_settings[extensionName];
    if (!settings.apiEndpoint) throw new Error("API endpoint not configured");

    const headers = { "Content-Type": "application/json" };
    if (settings.apiKey) {
        headers["Authorization"] = "Bearer " + settings.apiKey;
    }

    const body = {
        model: settings.apiModel || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: settings.maxTokens || 1000,
        temperature: settings.temperature || 0.8
    };

    const fetchOptions = {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body)
    };
    if (signal) fetchOptions.signal = signal;

    const response = await fetch(settings.apiEndpoint, fetchOptions);

    if (!response.ok) throw new Error("Custom API request failed: " + response.status);

    const data = await response.json();
    if (data.choices && data.choices[0]) {
        return data.choices[0].message?.content || data.choices[0].text || "";
    }
    return data.response || data.text || data.content || "";
}

/** API 연결 테스트 */
export async function testApiConnection() {
    try {
        const testPrompt = "Say 'API connection successful!' in exactly those words.";
        const response = await sendApiRequest(testPrompt);
        if (response && response.length > 0) {
            toastr.success("API 연결 테스트 성공!");
            updateApiStatus(true);
            return true;
        } else {
            toastr.error("API 응답이 비어있습니다.");
            updateApiStatus(false);
            return false;
        }
    } catch (error) {
        toastr.error("API 연결 테스트 실패: " + error.message);
        updateApiStatus(false);
        return false;
    }
}

/** API 상태 표시 업데이트 */
export function updateApiStatus(connected) {
    const statusDiv = document.getElementById("nps-api-status");
    const indicator = document.getElementById("nps-api-status-indicator");
    const text = document.getElementById("nps-api-status-text");
    if (statusDiv) statusDiv.style.display = "flex";
    if (indicator) {
        indicator.className = "nps-api-status-indicator " + (connected ? "connected" : "disconnected");
    }
    if (text) {
        text.textContent = connected ? "연결됨" : "연결 실패";
    }
}
