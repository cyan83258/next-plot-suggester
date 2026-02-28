/**
 * 다음 전개 추천 확장 프로그램 - 응답 파싱
 * (prompt.js에서 분리)
 *
 * API 응답에서 추천/프리뷰/머지 결과를 파싱
 * JSON 모드 + 정규식 폴백
 */
import { extension_settings } from "../../../extensions.js";
import { extensionName } from "./constants.js";
import { log } from "./utils.js";

/**
 * 추천 응답 파싱 (JSON + 정규식 폴백)
 */
export function parseSuggestions(response) {
    const settings = extension_settings[extensionName];
    const useJsonMode = settings.useJsonMode !== false;

    // 1. JSON 파싱 시도
    if (useJsonMode) {
        try {
            let jsonStr = response;
            const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                    const results = parsed.suggestions
                        .filter(s => s && typeof s === "string")
                        .map(s => s.trim());
                    if (results.length > 0) {
                        log("JSON parsing successful:", results.length, "suggestions");
                        return results;
                    }
                }
            }
        } catch (e) {
            log("JSON parsing failed, falling back to regex:", e.message);
        }
    }

    // 2. 정규식 폴백
    const suggestions = [];
    const lines = response.split("\n");

    for (const line of lines) {
        const match = line.match(/^\s*(\d+)[.\)]\s*(.+)/);
        if (match?.[2]) suggestions.push(match[2].trim());
    }

    if (suggestions.length === 0) {
        const nonEmptyLines = lines
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith("#") && !l.startsWith("{") && !l.startsWith("}"));
        for (let j = 0; j < Math.min(nonEmptyLines.length, settings.suggestionCount); j++) {
            suggestions.push(nonEmptyLines[j]);
        }
    }

    return suggestions;
}

/**
 * 프리뷰 응답 파싱
 */
export function parsePreviewResponse(response) {
    const settings = extension_settings[extensionName];
    const useJsonMode = settings.useJsonMode !== false;

    if (useJsonMode) {
        try {
            let jsonStr = response;
            const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const arr = parsed.previews || parsed.suggestions || parsed.results;
                if (Array.isArray(arr)) {
                    const results = arr.filter(s => s && typeof s === "string").map(s => s.trim());
                    if (results.length > 0) return results;
                }
            }
        } catch (e) {
            log("Preview JSON parsing failed, falling back to regex:", e.message);
        }
    }

    // 정규식 폴백
    const suggestions = [];
    const lines = response.split("\n");
    for (const line of lines) {
        const match = line.match(/^\s*(\d+)[.\)]\s*(.+)/);
        if (match?.[2]) suggestions.push(match[2].trim());
    }
    return suggestions;
}

/**
 * 머지 응답 파싱
 */
export function parseMergeResponse(response) {
    try {
        let jsonStr = response;
        const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.merged && typeof parsed.merged === "string") {
                return parsed.merged.trim();
            }
        }
    } catch (e) { /* fallback */ }

    // 단순 텍스트 폴백
    return response.trim().replace(/^\d+[.)\s]+/, "");
}
