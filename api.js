/** Request-local API parameters. Never changes the user's global generation preset. */
import { getContext } from "../../../extensions.js";
import { getRequestHeaders, eventSource, event_types } from "../../../../script.js";
import { SECRET_KEYS, secret_state } from "../../../secrets.js";
import { createGenerationParameters } from "../../../openai.js";
import { settingsSnapshot } from "./story.js";
import { state } from "./state.js";

export function abortError() { return new DOMException("생성이 취소되었습니다.", "AbortError"); }
function check(signal) { if (signal?.aborted) throw abortError(); }
export function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        check(signal);
        const cancel = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(abortError()); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, ms);
        signal?.addEventListener("abort", cancel, { once: true });
    });
}
export async function withRetry(fn, signal, maxRetries = 2) {
    for (let i = 0; ; i++) {
        check(signal);
        try { return await fn(); } catch (error) {
            check(signal);
            const retryable = error instanceof TypeError || [408, 429, 500, 502, 503, 504].includes(error.status);
            if (error.name === "AbortError" || !retryable || i >= maxRetries) throw error;
            await delay(Math.min(30000, error.retryAfter || 1000 * 2 ** i + Math.random() * 300), signal);
        }
    }
}
export function extractResponse(data) {
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map(p => p.text || "").join("");
    if (Array.isArray(data.content)) return data.content.filter(p => p.type === "text").map(p => p.text || "").join("");
    const google = data.candidates?.[0]?.content;
    if (google?.parts) return google.parts.map(p => p.thought ? "" : p.text || "").join("");
    if (typeof google === "string") return google;
    if (Array.isArray(data.message?.content)) return data.message.content.map(p => p.text || "").join("");
    for (const text of [data.response, data.text, data.content, data.generations?.[0]?.text, data.choices?.[0]?.text]) if (typeof text === "string") return text;
    return "";
}
async function request(url, body, headers, signal) {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
    if (!response.ok) {
        const error = new Error(`API 요청 실패 (${response.status})`);
        error.status = response.status;
        const retry = response.headers.get("Retry-After");
        error.retryAfter = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now())) : 0;
        throw error;
    }
    const data = await response.json();
    if (data.choices?.[0]?.finish_reason === "length" || data.stop_reason === "max_tokens" || data.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("출력이 토큰 한도에서 잘렸습니다. 출력 토큰을 늘려주세요.");
    const text = extractResponse(data).trim();
    if (!text) throw new Error("API 응답이 비어 있습니다.");
    return text;
}
export async function sendApiRequest(prompt, signal, settings = settingsSnapshot()) {
    check(signal);
    const start = performance.now();
    state.effectiveApi = { type: settings.apiType, model: "", temperature: settings.temperature, maxTokens: settings.maxTokens, cancel: "요청 중단 지원" };
    try {
        return await withRetry(async () => {
            if (settings.apiType === "current") return current(prompt, signal, settings);
            let body = { model: settings.apiType === "profile" ? settings.llmModel : settings.apiModel, messages: [{ role: "user", content: prompt }], temperature: settings.temperature, max_tokens: settings.maxTokens, stream: false };
            let url = settings.apiEndpoint;
            let headers = { "Content-Type": "application/json" };
            if (settings.apiType === "profile") {
                const provider = settings.llmProvider;
                const keys = { openai: SECRET_KEYS.OPENAI, claude: SECRET_KEYS.CLAUDE, google: SECRET_KEYS.MAKERSUITE, cohere: SECRET_KEYS.COHERE };
                if (!keys[provider] || !secret_state[keys[provider]]) throw new Error("선택한 프로바이더의 API 키가 설정되지 않았습니다.");
                body.chat_completion_source = provider === "google" ? "makersuite" : provider;
                const requestSettings = { ...getContext().chatCompletionSettings, chat_completion_source: body.chat_completion_source, temp_openai: settings.temperature, openai_max_tokens: settings.maxTokens, stream_openai: false };
                const prepared = await createGenerationParameters(requestSettings, body.model, "quiet", body.messages);
                body = { ...prepared.generate_data, stream: false };
                url = "/api/backends/chat-completions/generate";
                headers = getRequestHeaders();
            } else {
                if (!url || !body.model) throw new Error("커스텀 API 주소와 모델을 입력해 주세요.");
                if (settings.apiKey) headers.Authorization = "Bearer " + settings.apiKey;
            }
            state.effectiveApi.model = body.model;
            state.effectiveApi.temperature = body.temperature ?? "모델에서 온도 미지원";
            return request(url, body, headers, signal);
        }, signal);
    } finally { state.lastApiMs = performance.now() - start; }
}
async function current(prompt, signal, settings) {
    const ctx = getContext();
    if (!ctx.generateRaw) throw new Error("현재 SillyTavern에서 generateRaw를 찾을 수 없습니다.");
    // Installed generateRaw has no AbortSignal parameter. Keep queue ownership until it settles;
    // cancellation discards its result instead of broadcasting a global stop to other extensions.
    state.effectiveApi.cancel = "결과 폐기 (현재 연결의 서버 생성은 계속될 수 있음)";
    state.effectiveApi.model = ctx.chatCompletionSettings?.model || ctx.chatCompletionSettings?.openai_model || ctx.mainApi;
    state.effectiveApi.temperature = "현재 연결 프리셋";
    const hook = data => {
        // Match this exact prompt, never another concurrent request.
        const ours = data.messages?.some(m => m.content === prompt || (Array.isArray(m.content) && m.content.some(p => p.text === prompt)));
        if (!ours) return;
        if (typeof data.temperature === "number") {
            data.temperature = data.chat_completion_source === "minimax" ? Math.max(Number.EPSILON, Math.min(1, settings.temperature)) : ["claude", "cohere"].includes(data.chat_completion_source) ? Math.min(1, settings.temperature) : settings.temperature;
            state.effectiveApi.temperature = data.temperature;
        } else state.effectiveApi.temperature = "모델에서 온도 미지원";
        if ("max_completion_tokens" in data) data.max_completion_tokens = settings.maxTokens;
        else data.max_tokens = settings.maxTokens;
        state.effectiveApi.model = data.model || state.effectiveApi.model;
    };
    const event = event_types.CHAT_COMPLETION_SETTINGS_READY;
    if (event) eventSource.on(event, hook);
    try {
        check(signal);
        const response = await ctx.generateRaw({ prompt, responseLength: settings.maxTokens, quietToLoud: false, trimNames: false });
        check(signal);
        if (typeof response !== "string" || !response.trim()) throw new Error("현재 연결의 응답이 비어 있습니다.");
        return response;
    } finally { if (event) eventSource.removeListener(event, hook); }
}
export async function testApiConnection() {
    if (state.isGenerating) { toastr.info("생성 완료 후 연결을 시험해 주세요."); return false; }
    try { await sendApiRequest('Return exactly {"ok":true}', null, { ...settingsSnapshot(), maxTokens: 100 }); updateApiStatus(true); return true; }
    catch (e) { toastr.error(e.message); updateApiStatus(false); return false; }
}
export function updateApiStatus(connected) {
    const div = document.getElementById("nps-api-status");
    if (div) div.style.display = "flex";
    const text = document.getElementById("nps-api-status-text");
    if (text) text.textContent = connected ? "연결됨" : "연결 실패";
    const indicator = document.getElementById("nps-api-status-indicator");
    if (indicator) indicator.className = "nps-api-status-indicator " + (connected ? "connected" : "disconnected");
}
