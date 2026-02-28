/**
 * 다음 전개 추천 확장 프로그램 - 컨텍스트 수집
 * (prompt.js에서 분리)
 *
 * 컨텍스트 소스 프로그레시브 로딩, 해시 diff, 프롬프트 압축
 * 월드 인포 병렬 로드 최적화 (Promise.all)
 */
import { extension_settings, getContext } from "../../../extensions.js";
import { extensionName, defaultSettings } from "./constants.js";
import { state } from "./state.js";
import { log, estimateTokens, simpleHash } from "./utils.js";
import { hasContextChanged } from "./cache.js";

// ═══════════════════════════════════════════
// 컨텍스트 소스 프로그레시브 로딩 (해시 diff)
// ═══════════════════════════════════════════

/**
 * 컨텍스트 소스를 프로그레시브하게 로드
 * - 해시가 변경되지 않은 소스는 캐시된 데이터 재사용
 * - 변경된 소스만 다시 로드
 */
export async function loadContextSource(sourceName, loader) {
    try {
        const data = await loader();
        if (!data) {
            state.contextCache[sourceName] = { data: null, hash: null };
            return "";
        }

        const newHash = simpleHash(data.substring(0, 500));
        const cached = state.contextCache[sourceName];

        if (cached && cached.hash === newHash && cached.data) {
            log(sourceName + ": unchanged (hash match), reusing cache");
            return cached.data;
        }

        state.contextCache[sourceName] = { data, hash: newHash };
        await hasContextChanged(sourceName, newHash);
        log(sourceName + ": loaded fresh data");
        return data;
    } catch (e) {
        log("Failed to load " + sourceName + ":", e.message);
        return "";
    }
}

// ═══════════════════════════════════════════
// 채팅 히스토리 (토큰 인식 동적 수집)
// ═══════════════════════════════════════════

export function getChatHistory(maxTokenBudget) {
    const context = getContext();
    const chatHistory = context.chat || [];
    const visibleMessages = chatHistory.filter(msg => msg.is_system !== true);
    const settings = extension_settings[extensionName];

    if (!maxTokenBudget) {
        maxTokenBudget = (settings.maxContextTokens || 4000) * 0.6;
    }

    const useCompression = settings.enableCompression !== false;
    const compressionThreshold = settings.compressionThreshold || 20;

    if (useCompression && visibleMessages.length > compressionThreshold) {
        return getCompressedChatHistory(visibleMessages, maxTokenBudget, compressionThreshold);
    }

    const collected = [];
    let totalTokens = 0;

    for (let i = visibleMessages.length - 1; i >= 0; i--) {
        const msg = visibleMessages[i];
        const role = msg.is_user ? "User" : (msg.name || "Character");
        const text = role + ": " + msg.mes;
        const tokens = estimateTokens(text);

        if (totalTokens + tokens > maxTokenBudget && collected.length > 0) break;
        collected.unshift(text);
        totalTokens += tokens;
    }

    log("Chat history: " + collected.length + " msgs, ~" + totalTokens + " tokens (budget: " + maxTokenBudget + ")");
    return collected.join("\n\n");
}

/**
 * 압축된 채팅 히스토리 빌드
 * - 최근 메시지는 원문 그대로 유지 (최대 예산의 70%)
 * - 오래된 메시지는 추출 요약으로 압축 (나머지 30%)
 */
function getCompressedChatHistory(visibleMessages, maxTokenBudget, recentCount) {
    const recentBudget = Math.floor(maxTokenBudget * 0.7);
    const summaryBudget = Math.floor(maxTokenBudget * 0.3);

    const recentMessages = [];
    let recentTokens = 0;
    const recentStartIdx = Math.max(0, visibleMessages.length - recentCount);

    for (let i = visibleMessages.length - 1; i >= recentStartIdx; i--) {
        const msg = visibleMessages[i];
        const role = msg.is_user ? "User" : (msg.name || "Character");
        const text = role + ": " + msg.mes;
        const tokens = estimateTokens(text);

        if (recentTokens + tokens > recentBudget && recentMessages.length > 0) break;
        recentMessages.unshift(text);
        recentTokens += tokens;
    }

    const olderMessages = visibleMessages.slice(0, recentStartIdx);
    const summary = compressMessages(olderMessages, summaryBudget);

    const parts = [];
    if (summary) {
        parts.push("[Earlier Context — Compressed Summary]\n" + summary + "\n[/Earlier Context]");
    }
    if (recentMessages.length > 0) {
        parts.push("[Recent Messages — Verbatim]\n" + recentMessages.join("\n\n") + "\n[/Recent Messages]");
    }

    const totalTokens = estimateTokens(parts.join("\n\n"));
    log("Compressed history: " + olderMessages.length + " old msgs → summary, " + recentMessages.length + " recent msgs verbatim, ~" + totalTokens + " tokens (budget: " + maxTokenBudget + ")");
    return parts.join("\n\n");
}

/**
 * 추출 요약: 오래된 메시지에서 핵심 문장만 추출 (로컬 처리)
 */
function compressMessages(messages, tokenBudget) {
    if (!messages || messages.length === 0) return "";

    const speakers = new Set();
    const allSentences = [];

    messages.forEach((msg, msgIdx) => {
        const role = msg.is_user ? "User" : (msg.name || "Character");
        speakers.add(role);

        const sentences = msg.mes.split(/(?<=[.!?。！？])\s+|(?<=\n)/);
        sentences.forEach(sentence => {
            const trimmed = sentence.trim();
            if (trimmed.length < 5) return;

            let score = 0;
            if (/했다|갔다|왔다|보았|만났|발견|도착|떠났|돌아|죽|싸우|공격|도망|did|went|came|saw|found|arrived|left|died|fought|attacked|fled/i.test(trimmed)) score += 3;
            if (/울었|웃었|놀랐|두려|화가|기뻐|슬프|사랑|미워|cried|laughed|surprised|feared|angry|happy|sad|loved/i.test(trimmed)) score += 2;
            if (/"|"|「|」|『|』|"/.test(trimmed)) score += 1;
            if (/장소|방|거리|도시|숲|다음 날|아침|저녁|밤|place|room|morning|evening|night|next day/i.test(trimmed)) score += 2;
            if (/\?|？/.test(trimmed)) score += 1;

            allSentences.push({ text: role + ": " + trimmed, score, position: msgIdx });
        });
    });

    allSentences.sort((a, b) => b.score !== a.score ? b.score - a.score : a.position - b.position);

    const selected = [];
    let usedTokens = estimateTokens("Story so far (" + messages.length + " messages involving " + Array.from(speakers).join(", ") + "):\n");

    for (let i = 0; i < allSentences.length; i++) {
        const tokens = estimateTokens(allSentences[i].text);
        if (usedTokens + tokens > tokenBudget) break;
        selected.push(allSentences[i]);
        usedTokens += tokens;
    }

    selected.sort((a, b) => a.position - b.position);
    if (selected.length === 0) return "";

    const header = "Story so far (" + messages.length + " messages involving " + Array.from(speakers).join(", ") + "):";
    const body = selected.map(s => "• " + s.text).join("\n");
    return header + "\n" + body;
}

// ═══════════════════════════════════════════
// 개별 컨텍스트 소스 로더
// ═══════════════════════════════════════════

/** 캐릭터 설명 */
export function getCharacterDescription() {
    try {
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            if (ctx.getCharacterCardFields) {
                const fields = ctx.getCharacterCardFields();
                if (fields.description) return fields.description;
            }
            if (ctx.characters && ctx.characterId !== undefined) {
                const char = ctx.characters[ctx.characterId];
                if (char?.description) return char.description;
            }
        }
        const context = getContext();
        if (context.characters && context.characterId !== undefined) {
            const char = context.characters[context.characterId];
            if (char?.description) return char.description;
        }
    } catch (e) {
        log("Failed to get character description:", e);
    }
    return "";
}

/** 페르소나 설명 */
export function getPersonaDescription() {
    try {
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            if (ctx.getCharacterCardFields) {
                const fields = ctx.getCharacterCardFields();
                if (fields.persona) return fields.persona;
            }
        }
        if (typeof power_user !== "undefined" && power_user.persona_description) {
            return power_user.persona_description;
        }
        if (window.power_user?.persona_description) {
            return window.power_user.persona_description;
        }
        const context = getContext();
        if (context.persona_description) return context.persona_description;
    } catch (e) {
        log("Failed to get persona description:", e);
    }
    return "";
}

/** World Info / Lorebook (병렬 로드 최적화 — Promise.all) */
export async function getWorldInfoBefore() {
    try {
        const context = getContext();
        const entrySet = new Set();
        const allEntries = [];

        const addEntry = (content) => {
            if (content && !entrySet.has(content)) {
                entrySet.add(content);
                allEntries.push(content);
            }
        };

        // 1. 캐릭터에 embedded lorebook
        if (context.characters && context.characterId !== undefined) {
            const char = context.characters[context.characterId];
            if (char?.data?.character_book?.entries && Array.isArray(char.data.character_book.entries)) {
                const book = char.data.character_book;
                for (const entry of book.entries) {
                    const isEnabled = entry.enabled === true || (entry.enabled !== false && entry.disable !== true);
                    if (entry?.content && isEnabled) addEntry(entry.content);
                }
                log("Embedded lorebook:", book.entries.length, "total,", allEntries.length, "enabled");
            }
        }

        // 2. SillyTavern loadWorldInfo — 병렬 로드
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();

            if (ctx.loadWorldInfo && typeof ctx.loadWorldInfo === "function") {
                const worldLoadPromises = [];

                // 캐릭터에 연결된 lorebook
                if (ctx.characters && ctx.characterId !== undefined) {
                    const charCtx = ctx.characters[ctx.characterId];
                    const worldName = charCtx?.data?.extensions?.world;
                    if (worldName) {
                        worldLoadPromises.push(
                            ctx.loadWorldInfo(worldName).catch(err => {
                                log("Failed to load char world info:", err);
                                return null;
                            })
                        );
                    }
                }

                // 전역 선택된 world info — 모두 병렬 로드
                const selectedWorlds = window.selected_world_info || [];
                for (const worldName of selectedWorlds) {
                    worldLoadPromises.push(
                        ctx.loadWorldInfo(worldName).catch(err => {
                            log("Failed to load selected world info:", worldName, err);
                            return null;
                        })
                    );
                }

                // 병렬 실행 후 결과 수집
                const worldResults = await Promise.all(worldLoadPromises);
                for (const wd of worldResults) {
                    if (wd?.entries) {
                        for (const uid of Object.keys(wd.entries)) {
                            const we = wd.entries[uid];
                            if (we?.content && we.disable !== true) addEntry(we.content);
                        }
                    }
                }
            }
        }

        if (allEntries.length > 0) {
            log("Total world info entries:", allEntries.length);
            return allEntries.join("\n\n");
        }
    } catch (e) {
        log("Failed to get world info:", e);
    }
    return "";
}

/** Scenario-Summarizer 요약 */
export function getScenarioSummary() {
    try {
        if (window.SummarizerDebug && typeof window.SummarizerDebug.getSummaryData === "function") {
            const data = window.SummarizerDebug.getSummaryData();
            if (data?.summaries) {
                const texts = Object.keys(data.summaries).map(k => data.summaries[k]?.content).filter(Boolean);
                if (texts.length > 0) return texts.join("\n\n");
            }
        }

        const context = getContext();
        if (context.chatMetadata) {
            const ssData = context.chatMetadata.scenarioSummary || context.chatMetadata["Scenario-Summarizer"];
            if (ssData?.summaries) {
                const texts = Object.keys(ssData.summaries).map(k => ssData.summaries[k]?.content).filter(Boolean);
                if (texts.length > 0) return texts.join("\n\n");
            }
        }

        if (extension_settings?.["Scenario-Summarizer"]?.summaryData?.summaries) {
            const summaries = extension_settings["Scenario-Summarizer"].summaryData.summaries;
            const texts = Object.keys(summaries).map(k => summaries[k]?.content).filter(Boolean);
            if (texts.length > 0) return texts.join("\n\n");
        }
    } catch (e) {
        log("Failed to get scenario summary:", e);
    }
    return "";
}

/** AU-World-Builder 설정 */
export function getAUWorldBuilderSettings() {
    try {
        const context = getContext();
        const chatId = context.chatId;
        if (!chatId) return "";

        const auSettings = extension_settings["AU-World-Builder"];
        if (!auSettings) return "";

        const chatData = auSettings.chatData?.[chatId];
        if (!chatData) return "";

        const parts = [];
        if (chatData.worldSetting) parts.push("[AU World Setting]\n" + chatData.worldSetting + "\n[/AU World Setting]");
        if (chatData.characterSettings?.char) parts.push("[AU Character Setting]\n" + chatData.characterSettings.char + "\n[/AU Character Setting]");
        if (chatData.characterSettings?.user) parts.push("[AU User Setting]\n" + chatData.characterSettings.user + "\n[/AU User Setting]");
        if (chatData.auConcept) parts.push("[AU Concept]\n" + chatData.auConcept + "\n[/AU Concept]");
        if (chatData.genrePrompt) parts.push("[AU Genre]\n" + chatData.genrePrompt + "\n[/AU Genre]");

        if (parts.length > 0) {
            log("AU-World-Builder data:", parts.length, "sections");
            return parts.join("\n\n");
        }
    } catch (e) {
        log("Failed to get AU-World-Builder settings:", e);
    }
    return "";
}
