/**
 * 다음 전개 추천 확장 프로그램 - 프롬프트 빌드
 *
 * 컨텍스트 수집(context.js), 서사 분석(analysis.js), 응답 파싱(parser.js)은
 * 별도 모듈로 분리. 이 파일은 캐시 래퍼, 플롯 지시사항 빌더, 프롬프트 조립만 담당.
 *
 * B.5: 프롬프트 템플릿 캐싱 (정적 NARRATIVE QUALITY RULES / 시스템 프리앰블)
 * C.3: prompt.js 분할 (context / analysis / parser)
 * C.4: var → let/const
 */
import { extension_settings, getContext } from "../../../extensions.js";
import {
    extensionName, defaultSettings, defaultQualityPrompts,
    defaultMoods, langConfig, plotBeats, narrativeStages, emotions,
    sceneAtmospheres, sensoryOptions, qualityEnhancements
} from "./constants.js";
import { state } from "./state.js";
import { log, estimateTokens, simpleHash, getAllGenres, buildRhythmPromptHint } from "./utils.js";
import { cacheGet, cacheSet, cacheClear } from "./cache.js";

// 분리 모듈 임포트
import {
    loadContextSource, getChatHistory,
    getCharacterDescription, getPersonaDescription,
    getWorldInfoBefore, getScenarioSummary, getAUWorldBuilderSettings
} from "./context.js";
import { runAnalysisInWorker, detectNarrativeStage } from "./analysis.js";

// 하위 호환 re-export (index.js / ui.js 에서 prompt.js 를 통해 임포트)
export { parseSuggestions, parsePreviewResponse, parseMergeResponse } from "./parser.js";
export { detectNarrativeStage };

// ═══════════════════════════════════════════
// B.5: 프롬프트 템플릿 캐싱 — 정적 문자열은 모듈 상수로 캐시
// ═══════════════════════════════════════════

const SYSTEM_PREAMBLE =
    "You are an expert narrative consultant and master storyteller with deep understanding of dramatic structure, character psychology, and narrative pacing. Your task is to suggest compelling, specific, and diverse next plot developments.\n\n";

const NARRATIVE_QUALITY_RULES =
    "=== NARRATIVE QUALITY RULES ===\n" +
    "1. DIVERSITY: Each suggestion MUST take a distinctly different narrative direction. Vary in: tone (light vs dark), pace (fast vs slow), focus (action vs emotion vs dialogue), and scale (intimate vs grand). Never suggest variations of the same idea.\n" +
    "2. SPECIFICITY: Be concrete and vivid. Instead of 'something bad happens', describe what specifically happens, to whom, and the immediate sensory/emotional impact. Use character names from the context.\n" +
    "3. CAUSALITY: Every suggestion must logically follow from what has already happened. Reference specific details, character traits, or events from the context. Good fiction is a chain of cause and effect.\n" +
    "4. FRESHNESS: Avoid clichés, predictable outcomes, and generic stock scenarios. If a trope is used, subvert or recontextualize it. Surprise the reader while remaining plausible within the established world.\n" +
    "5. CHARACTER CONSISTENCY: Characters must act in ways consistent with their established personality, but allow for growth, pressure-induced changes, or revealing hidden depths. Internal contradiction makes characters feel real.\n" +
    "6. HOOKS: Each suggestion should end with implicit forward momentum — a question raised, a tension unresolved, or a new possibility opened — making the reader want to see what happens next.\n" +
    "7. SHOW DON'T TELL: Describe actions, sensory details, and behaviors rather than abstract states. Instead of 'she was sad', describe what sadness looks like for this specific character.\n\n";

// ═══════════════════════════════════════════
// 캐시 래퍼
// ═══════════════════════════════════════════

function buildCacheKey() {
    try {
        const context = getContext();
        const chatHistory = context.chat || [];
        const lastMsgs = chatHistory.slice(-5)
            .map(m => (m.mes || "").substring(0, 100))
            .join("|");
        const settings = extension_settings[extensionName];
        const settingsKey = [
            settings.sentenceCount,
            settings.suggestionCount,
            settings.outputLanguage,
            (settings.selectedGenres || []).join(","),
            settings.temperature,
            settings.negativePrompt || "",
            (settings.plotBeats || []).join(","),
            settings.suggestionSpectrum ? "1" : "0",
            settings.dialogueRatio,
            (settings.pacing || {}).timeframe || "",
            (settings.pacing || {}).speed || 5,
            state.currentCustomDirection
        ].join("|");
        return simpleHash(lastMsgs + "|" + settingsKey);
    } catch (e) {
        return null;
    }
}

export async function getCachedSuggestions() {
    const settings = extension_settings[extensionName];
    if (!settings.enableCache) return null;
    const key = buildCacheKey();
    if (!key) return null;
    const result = await cacheGet(key);
    if (result) log("Cache hit (IndexedDB)");
    return result;
}

export async function setCachedSuggestions(suggestions) {
    const key = buildCacheKey();
    if (key) await cacheSet(key, suggestions);
}

export async function invalidateCache() {
    await cacheClear();
}

// ═══════════════════════════════════════════
// 플롯 세분화 헬퍼 (지시사항 빌더)
// ═══════════════════════════════════════════

/** 전개 유형 지시사항 */
function buildPlotBeatInstruction(settings) {
    const beats = settings.plotBeats || [];
    if (beats.length === 0) return "";

    const beatNames = beats.map(id => {
        const beat = plotBeats.find(b => b.id === id);
        return beat ? beat.nameEn : id;
    }).join(", ");

    return "=== PLOT BEAT DIRECTION ===\n" +
        "The user wants the following narrative beat type(s): " + beatNames + ".\n" +
        "All suggestions MUST incorporate at least one of these beat types. Each suggestion should use a different beat or combine them differently.\n" +
        "Beat definitions:\n" +
        "- Transition: A shift in scene, location, time, or emotional register\n" +
        "- Deepen: Explore the current situation/emotion in greater depth and nuance\n" +
        "- Twist: Subvert expectations with a surprising but logical development\n" +
        "- Resolution: Resolve a tension, conflict, or question that has been building\n" +
        "- Foreshadow: Plant subtle hints or setups for future developments\n" +
        "- Daily Life: Natural, everyday interaction that deepens character bonds\n" +
        "- Escalation: Raise the stakes, increase tension or urgency\n" +
        "- Introspection: Explore a character's inner world, memories, or psychology\n\n";
}

/** 서사 단계 지시사항 */
function buildNarrativeArcInstruction(settings, chatHistory) {
    const arcSettings = settings.narrativeArc || {};
    if (!arcSettings.autoDetect && !arcSettings.manualStage) return "";

    const stage = arcSettings.manualStage || (arcSettings.autoDetect ? detectNarrativeStage(chatHistory) : "");
    if (!stage) return "";

    const stageInfo = narrativeStages.find(s => s.id === stage);
    const stageName = stageInfo ? stageInfo.nameEn : stage;

    const stageGuidance = {
        "intro": "Focus on establishing characters, setting, and initial dynamics. Introduce compelling hooks.",
        "rising": "Build tensions, deepen relationships, introduce complications. Escalate engagement.",
        "crisis": "Push conflicts to a breaking point. Force difficult decisions. Maximum dramatic tension.",
        "climax": "Deliver the peak moment. Powerful revelations, decisive actions, irreversible changes.",
        "falling": "Show consequences and aftermath. Begin resolving threads. Allow characters to process and grow."
    };

    return "=== NARRATIVE ARC POSITION ===\n" +
        "Current story stage: " + stageName + " (" + (stageInfo ? stageInfo.name : "") + ")\n" +
        (stageGuidance[stage] || "") + "\n" +
        "Suggestions should be appropriate for this stage while potentially setting up the next stage.\n\n";
}

/** 포커스 대상 지시사항 */
function buildFocusTargetInstruction(settings) {
    const focus = settings.focusTarget || {};
    if (focus.type === "auto" || (!focus.characterName && !focus.customFocus)) return "";

    let instruction = "=== FOCUS TARGET ===\n";
    if (focus.type === "character" && focus.characterName) {
        instruction += "Center all suggestions around the character: " + focus.characterName + ". Show their actions, reactions, inner thoughts, or impact.\n\n";
    } else if (focus.type === "relationship" && focus.characterName) {
        instruction += "Focus on relationship dynamics involving: " + focus.characterName + ". Show how their bond develops, tensions arise, or connections deepen.\n\n";
    } else if (focus.type === "environment") {
        instruction += "Focus on worldbuilding and environmental storytelling. Expand the setting, reveal new aspects, or use the environment as a narrative device.\n\n";
    } else if (focus.type === "custom" && focus.customFocus) {
        instruction += "Focus the suggestions on: " + focus.customFocus + "\n\n";
    }
    return instruction;
}

/** 추천 스펙트럼 지시사항 */
function buildSpectrumInstruction(settings, suggestionCount) {
    if (!settings.suggestionSpectrum) return "";
    if (suggestionCount < 2) return "";

    let instruction = "=== SUGGESTION SPECTRUM ===\n";
    instruction += "Each suggestion MUST have a different risk/surprise level. ";
    if (suggestionCount >= 3) {
        instruction += "Tag each suggestion with its type:\n";
        instruction += "- [안전] SAFE: The most natural, logical continuation\n";
        instruction += "- [의외] UNEXPECTED: A surprising but plausible direction\n";
        instruction += "- [극적] DRAMATIC: A bold, high-stakes development with maximum impact\n";
        if (suggestionCount > 3) {
            instruction += "For additional suggestions, vary between these categories.\n";
        }
    } else {
        instruction += "One should be [안전] safe/natural, the other [의외] unexpected or [극적] dramatic.\n";
    }
    instruction += "Prepend each suggestion text with its tag (e.g., '[안전] ...').\n\n";
    return instruction;
}

/** 감정 곡선 지시사항 */
function buildEmotionCurveInstruction(settings) {
    const ec = settings.emotionCurve || {};
    if (!ec.enabled || !ec.currentEmotion || !ec.targetEmotion) return "";

    const currentEm = emotions.find(e => e.id === ec.currentEmotion);
    const targetEm = emotions.find(e => e.id === ec.targetEmotion);
    if (!currentEm || !targetEm) return "";

    const speedText = ec.transitionSpeed === "sudden" ? "sudden and sharp" : "gradual and organic";

    return "=== EMOTION CURVE ===\n" +
        "Guide the emotional trajectory from [" + currentEm.name + "] → [" + targetEm.name + "].\n" +
        "The transition should feel " + speedText + ".\n" +
        "Each suggestion should move the emotional register in this direction, taking different paths.\n\n";
}

/** 페이싱 제어 지시사항 */
function buildPacingInstruction(settings) {
    if (settings.pacingEnabled === false) return "";

    const pacing = settings.pacing || {};
    const timeframe = pacing.timeframe || "immediate";
    const speed = pacing.speed !== undefined ? pacing.speed : 5;

    const timeframeTexts = {
        "immediate": "happening right now — immediate reactions, actions, and sensory details",
        "short": "a short time later (minutes to hours) — what happens next after a brief passage",
        "scene_change": "transitioning to a new scene — different time, place, or both",
        "montage": "compressing multiple scenes/moments in rapid succession"
    };

    let speedText;
    if (speed <= 3) speedText = "SLOW pacing: Rich description, internal reflection, detailed sensory experience.";
    else if (speed <= 7) speedText = "MODERATE pacing: Balance between description and action.";
    else speedText = "FAST pacing: Focus on action, sharp dialogue, rapid developments.";

    if (timeframe === "immediate" && speed >= 4 && speed <= 6) return "";

    return "=== PACING CONTROL ===\n" +
        "Timeframe: " + (timeframeTexts[timeframe] || timeframeTexts["immediate"]) + "\n" +
        speedText + "\n\n";
}

/** 대화/서술 비율 지시사항 */
function buildCompositionInstruction(settings) {
    const ratio = settings.dialogueRatio !== undefined ? settings.dialogueRatio : 5;
    const innerThought = settings.includeInnerThought;
    const environment = settings.includeEnvironment;

    if (ratio === 5 && !innerThought && !environment) return "";

    const parts = [];
    if (ratio <= 2) parts.push("Composition: Almost entirely narrative/descriptive prose. Minimal dialogue.");
    else if (ratio <= 4) parts.push("Composition: Primarily narrative with selective dialogue for key moments.");
    else if (ratio <= 6) parts.push("Composition: Balanced mix of narrative and dialogue.");
    else if (ratio <= 8) parts.push("Composition: Dialogue-driven with brief narrative bridges.");
    else parts.push("Composition: Almost entirely dialogue/conversation. Minimal narrative.");

    if (innerThought) parts.push("Include character inner thoughts/internal monologue.");
    if (environment) parts.push("Include vivid environmental/atmospheric description.");

    return "=== COMPOSITION STYLE ===\n" + parts.join("\n") + "\n\n";
}

/** 추천 길이 지시사항 */
function buildLengthInstruction(settings) {
    const level = settings.suggestionLength;
    if (level === undefined || level === null || level === 5) return "";

    let desc;
    if (level <= 2) desc = "VERY SHORT: Each suggestion should be extremely concise, just 1-2 brief sentences. Prioritize impact and brevity.";
    else if (level <= 4) desc = "SHORT: Keep suggestions concise and punchy. 2-3 sentences maximum.";
    else if (level <= 6) return "";
    else if (level <= 8) desc = "DETAILED: Write longer, more detailed suggestions with rich description. 4-6 sentences.";
    else desc = "VERY DETAILED: Write extensively detailed suggestions with full scene description, dialogue snippets, and sensory details. 6-8 sentences.";

    return "=== SUGGESTION LENGTH ===\n" + desc + "\n\n";
}

/** 창의성 수준 지시사항 */
function buildCreativityInstruction(settings) {
    const level = settings.creativityLevel;
    if (level === undefined || level === null || level === 5) return "";

    let desc;
    if (level <= 2) desc = "CONSERVATIVE creativity: Stick closely to established patterns, character behaviors, and logical plot progression. Avoid surprises. Prioritize believability and consistency.";
    else if (level <= 4) desc = "MODERATE-LOW creativity: Mostly predictable with occasional subtle twists. Keep suggestions grounded.";
    else if (level <= 6) return "";
    else if (level <= 8) desc = "HIGH creativity: Be imaginative and inventive. Include unexpected connections, creative metaphors, and surprising but plausible developments.";
    else desc = "MAXIMUM creativity: Push boundaries aggressively. Wildly creative, experimental, surreal twists are encouraged. Subvert EVERY expectation. Dream-logic and abstract developments welcome.";

    return "=== CREATIVITY LEVEL ===\n" + desc + "\n\n";
}

/** 조건부 규칙 (If-Then) 지시사항 */
function buildConditionalRulesInstruction(settings) {
    const rules = settings.conditionalRules || [];
    const active = rules.filter(r => r.enabled && r.condition && r.action);
    if (active.length === 0) return "";

    let instruction = "=== CONDITIONAL NARRATIVE RULES ===\n";
    instruction += "Apply these rules when their conditions match the current story state:\n";
    active.forEach((rule, i) => {
        instruction += (i + 1) + ". IF [" + rule.condition + "] THEN [" + rule.action + "]\n";
    });
    instruction += "Check each rule against recent context and incorporate matching rules into suggestions.\n\n";
    return instruction;
}

/** 피드백 키워드 지시사항 */
function buildFeedbackInstruction(settings) {
    const keywords = settings.negativeFeedbackKeywords || [];
    if (keywords.length === 0) return "";

    let instruction = "=== USER FEEDBACK (AVOID THESE) ===\n";
    instruction += "The user has previously rejected suggestions containing these themes/elements. AVOID them:\n";
    instruction += keywords.slice(-10).join(", ") + "\n\n";
    return instruction;
}

// ═══════════════════════════════════════════
// 프리뷰 프롬프트 빌드
// ═══════════════════════════════════════════

export async function buildPreviewPrompt() {
    const settings = extension_settings[extensionName];
    const sources = settings.inputSources || defaultSettings.inputSources;
    const maxContextTokens = settings.maxContextTokens || 4000;
    const previewCount = settings.previewCount || 5;

    const contextParts = [];
    let usedTokens = 0;
    const reservedTokens = 600;
    const availableTokens = maxContextTokens - reservedTokens;

    function addContextIfBudget(label, content) {
        if (!content) return false;
        const tokens = estimateTokens(content);
        if (usedTokens + tokens <= availableTokens) {
            contextParts.push(content);
            usedTokens += tokens;
            return true;
        }
        return false;
    }

    if (sources.charDescription) {
        const charDesc = await loadContextSource("charDesc", getCharacterDescription);
        if (charDesc) addContextIfBudget("Char", "[Character Description]\n" + charDesc + "\n[/Character Description]");
    }
    if (sources.personaDescription) {
        const personaDesc = await loadContextSource("personaDesc", getPersonaDescription);
        if (personaDesc) addContextIfBudget("Persona", "[Persona Description]\n" + personaDesc + "\n[/Persona Description]");
    }
    if (sources.worldInfo) {
        const worldInfo = await loadContextSource("worldInfo", getWorldInfoBefore);
        if (worldInfo) addContextIfBudget("World", "[World Info]\n" + worldInfo + "\n[/World Info]");
    }
    if (sources.chatHistory !== false) {
        const remainingTokens = availableTokens - usedTokens;
        const chatHistoryText = getChatHistory(remainingTokens);
        if (chatHistoryText) contextParts.push("[Chat History]\n" + chatHistoryText + "\n[/Chat History]");
    }

    const outputLang = settings.outputLanguage || "ko";
    const lang = langConfig[outputLang] || langConfig.ko;
    const useJsonMode = settings.useJsonMode !== false;

    let prompt = "You are a narrative consultant. Analyze the story context and suggest " + previewCount + " distinct possible next plot directions.\n\n";
    prompt += "LANGUAGE: Write ALL suggestions in " + lang.langName + " (" + lang.langNative + ").\n\n";

    const beatHint = buildPlotBeatInstruction(settings);
    if (beatHint) prompt += beatHint;

    const negativePrompt = (settings.negativePrompt || "").trim();
    if (negativePrompt) prompt += "AVOID these themes/elements: " + negativePrompt + "\n\n";

    prompt += "=== STORY CONTEXT ===\n" + contextParts.join("\n\n") + "\n=== END CONTEXT ===\n\n";
    prompt += "=== RULES ===\n";
    prompt += "1. Each suggestion must be EXACTLY 1 sentence — a brief summary of a possible next development.\n";
    prompt += "2. Each suggestion must take a distinctly DIFFERENT direction.\n";
    prompt += "3. Be specific: mention character names and concrete events, not vague descriptions.\n";
    prompt += "4. Vary the tone: mix safe/expected directions with surprising/dramatic ones.\n\n";

    if (useJsonMode) {
        prompt += "Respond ONLY with a valid JSON object (no markdown, no code blocks):\n";
        prompt += '{"previews": ["one sentence summary 1", "one sentence summary 2", ...]}\n\n';
        prompt += "Provide exactly " + previewCount + " previews in " + lang.langName + ".";
    } else {
        prompt += "Provide exactly " + previewCount + " suggestions as a numbered list:\n";
        for (let i = 1; i <= previewCount; i++) prompt += i + ". [1문장 요약]\n";
    }

    return prompt;
}

// ═══════════════════════════════════════════
// 추천 합치기(머지) 프롬프트
// ═══════════════════════════════════════════

export async function buildMergePrompt(selectedSuggestions) {
    const settings = extension_settings[extensionName];
    const sources = settings.inputSources || defaultSettings.inputSources;
    const maxContextTokens = settings.maxContextTokens || 4000;

    const contextParts = [];
    let usedTokens = 0;
    const reservedTokens = 800;
    const availableTokens = maxContextTokens - reservedTokens;

    if (sources.chatHistory !== false) {
        const chatHistoryText = getChatHistory(availableTokens * 0.7);
        if (chatHistoryText) {
            contextParts.push("[Chat History]\n" + chatHistoryText + "\n[/Chat History]");
            usedTokens += estimateTokens(chatHistoryText);
        }
    }

    const outputLang = settings.outputLanguage || "ko";
    const lang = langConfig[outputLang] || langConfig.ko;
    const useJsonMode = settings.useJsonMode !== false;
    const sentenceCount = settings.sentenceCount || 2;

    let prompt = "You are a narrative consultant. Your task is to MERGE the following plot suggestions into ONE coherent, unified suggestion that combines the best elements of each.\n\n";
    prompt += "LANGUAGE: Write in " + lang.langName + " (" + lang.langNative + ").\n\n";
    prompt += "=== SUGGESTIONS TO MERGE ===\n";
    selectedSuggestions.forEach((s, i) => { prompt += (i + 1) + ". " + s + "\n"; });
    prompt += "\n=== STORY CONTEXT ===\n" + contextParts.join("\n\n") + "\n=== END CONTEXT ===\n\n";
    prompt += "=== RULES ===\n";
    prompt += "1. Combine the key elements, characters, and events from ALL the provided suggestions.\n";
    prompt += "2. Create a natural flow that weaves these elements together coherently.\n";
    prompt += "3. The merged result should be approximately " + sentenceCount + " sentence(s) long.\n";
    prompt += "4. Maintain consistency with the story context.\n\n";

    if (useJsonMode) {
        prompt += 'Respond ONLY with: {"merged": "the merged suggestion text"}\n';
    } else {
        prompt += "Respond with ONLY the merged suggestion text, no numbering or prefixes.";
    }

    return prompt;
}

// ═══════════════════════════════════════════
// 토큰 사용량 분석 (시각화용)
// ═══════════════════════════════════════════

export async function getTokenBreakdown() {
    const settings = extension_settings[extensionName];
    const sources = settings.inputSources || defaultSettings.inputSources;
    const budget = settings.maxContextTokens || 4000;
    const reserved = 1200;
    const result = { total: reserved, budget, reserved, sources: [] };

    result.sources.push({ name: "시스템 프롬프트", tokens: reserved, color: "#8b5cf6" });

    try {
        if (sources.charDescription) {
            const charDesc = getCharacterDescription();
            const charTokens = charDesc ? estimateTokens(charDesc) : 0;
            if (charTokens > 0) {
                result.sources.push({ name: "캐릭터 설명", tokens: charTokens, color: "#3b82f6" });
                result.total += charTokens;
            }
        }
        if (sources.personaDescription) {
            const personaDesc = getPersonaDescription();
            const personaTokens = personaDesc ? estimateTokens(personaDesc) : 0;
            if (personaTokens > 0) {
                result.sources.push({ name: "페르소나", tokens: personaTokens, color: "#10b981" });
                result.total += personaTokens;
            }
        }
        if (sources.worldInfo) {
            const worldInfo = await getWorldInfoBefore();
            const worldTokens = worldInfo ? estimateTokens(worldInfo) : 0;
            if (worldTokens > 0) {
                result.sources.push({ name: "월드 인포", tokens: worldTokens, color: "#f59e0b" });
                result.total += worldTokens;
            }
        }
        if (sources.scenarioSummary) {
            const summary = getScenarioSummary();
            const sumTokens = summary ? estimateTokens(summary) : 0;
            if (sumTokens > 0) {
                result.sources.push({ name: "시나리오", tokens: sumTokens, color: "#ef4444" });
                result.total += sumTokens;
            }
        }
        if (sources.auWorldBuilder) {
            const auData = getAUWorldBuilderSettings();
            const auTokens = auData ? estimateTokens(auData) : 0;
            if (auTokens > 0) {
                result.sources.push({ name: "AU월드빌더", tokens: auTokens, color: "#ec4899" });
                result.total += auTokens;
            }
        }
        const context = getContext();
        const chat = context.chat || [];
        const visible = chat.filter(m => !m.is_system);
        const chatText = visible.slice(-50).map(m => m.mes || "").join("\n");
        const chatTokens = estimateTokens(chatText);
        if (chatTokens > 0) {
            result.sources.push({ name: "채팅 기록", tokens: chatTokens, color: "#6366f1" });
            result.total += chatTokens;
        }
    } catch (e) {
        log("Token breakdown error:", e);
    }

    return result;
}

// ═══════════════════════════════════════════
// 메인 프롬프트 빌드
// ═══════════════════════════════════════════

export async function buildPrompt() {
    const settings = extension_settings[extensionName];
    const sources = settings.inputSources || defaultSettings.inputSources;
    const maxContextTokens = settings.maxContextTokens || 4000;

    const contextParts = [];
    let usedTokens = 0;
    const reservedTokens = 1200;
    const availableTokens = maxContextTokens - reservedTokens;

    log("Building prompt, max context:", maxContextTokens, "available:", availableTokens);

    function addContextIfBudget(label, content) {
        if (!content) return false;
        const tokens = estimateTokens(content);
        if (usedTokens + tokens <= availableTokens) {
            contextParts.push(content);
            usedTokens += tokens;
            return true;
        }
        log(label + " skipped: would exceed token budget (" + tokens + " tokens)");
        return false;
    }

    // 컨텍스트 수집 (context.js 모듈 활용)
    if (sources.charDescription) {
        const charDesc = await loadContextSource("charDesc", getCharacterDescription);
        if (charDesc) addContextIfBudget("Char Desc", "[Character Description]\n" + charDesc + "\n[/Character Description]");
    }
    if (sources.personaDescription) {
        const personaDesc = await loadContextSource("personaDesc", getPersonaDescription);
        if (personaDesc) addContextIfBudget("Persona Desc", "[Persona Description]\n" + personaDesc + "\n[/Persona Description]");
    }
    if (sources.worldInfo) {
        const worldInfo = await loadContextSource("worldInfo", getWorldInfoBefore);
        if (worldInfo) addContextIfBudget("World Info", "[World Info / Lorebook]\n" + worldInfo + "\n[/World Info / Lorebook]");
    }
    if (sources.scenarioSummary) {
        const summary = await loadContextSource("scenarioSummary", getScenarioSummary);
        if (summary) addContextIfBudget("Scenario Summary", "[Scenario Summary]\n" + summary + "\n[/Scenario Summary]");
    }
    if (sources.auWorldBuilder) {
        const auData = await loadContextSource("auWorldBuilder", getAUWorldBuilderSettings);
        if (auData) addContextIfBudget("AU-WB", auData);
    }

    let chatHistoryText = "";
    if (sources.chatHistory !== false) {
        const remainingTokens = availableTokens - usedTokens;
        chatHistoryText = getChatHistory(remainingTokens);
        if (chatHistoryText) {
            contextParts.push("[Chat History]\n" + chatHistoryText + "\n[/Chat History]");
            usedTokens += estimateTokens(chatHistoryText);
        }
    }

    log("Context parts:", contextParts.length, "used tokens: ~" + usedTokens);

    // 서사 분석 (analysis.js Worker — B.4 조건부 실행)
    const analysisResult = await runAnalysisInWorker(chatHistoryText);
    const pacingAnalysis = analysisResult.pacing;
    const unresolvedThreads = analysisResult.threads;

    // 장르
    const allGenres = getAllGenres();
    const selectedGenreNames = settings.selectedGenres
        .map(id => allGenres.find(g => g.id === id))
        .filter(Boolean)
        .map(g => g.name)
        .join(", ");

    const genreInstruction = selectedGenreNames
        ? "Genre/Style context: " + selectedGenreNames + ". Let these genres inform the tone and tropes, but don't be bound by clichés — subvert expectations where possible.\n\n"
        : "";

    const customInstruction = settings.customPrompt
        ? "Additional user instructions: " + settings.customPrompt + "\n\n"
        : "";

    const directionInstruction = state.currentCustomDirection
        ? "USER REQUESTED PLOT DIRECTION: \"" + state.currentCustomDirection + "\"\nAll suggestions MUST follow this direction. However, each suggestion should interpret this direction differently — one could take it literally, another could approach it from an unexpected angle, and another could combine it with an existing narrative thread.\n\n"
        : "";

    // 분위기 (v1.8.0)
    let moodInstruction = "";
    const moodSettings = settings.moodSettings || defaultSettings.moodSettings;
    if (moodSettings.enabled && moodSettings.selectedMood) {
        const selectedMood = defaultMoods.find(m => m.id === moodSettings.selectedMood);
        if (selectedMood) moodInstruction = "ATMOSPHERE/MOOD: " + selectedMood.prompt + "\n";
    }
    if (moodSettings.sceneAtmosphere && moodSettings.sceneAtmosphere !== "none") {
        const atmo = sceneAtmospheres.find(a => a.id === moodSettings.sceneAtmosphere);
        if (atmo) moodInstruction += "SCENE ATMOSPHERE: " + atmo.prompt + "\n";
    }
    const sf = moodSettings.sensoryFocus || [];
    if (sf.length > 0) {
        const sensoryDescs = sf
            .map(sid => sensoryOptions.find(o => o.id === sid))
            .filter(Boolean)
            .map(opt => opt.prompt);
        if (sensoryDescs.length > 0) moodInstruction += "SENSORY FOCUS: " + sensoryDescs.join(" ") + "\n";
    }
    const ei = moodSettings.emotionalIntensity !== undefined ? moodSettings.emotionalIntensity : 5;
    if (ei !== 5) {
        const intensityDesc = ei <= 3
            ? "Write with restrained, understated emotions. Keep descriptions cool and detached."
            : "Write with heightened emotional intensity. Amplify feelings, use visceral descriptions and dramatic reactions.";
        moodInstruction += "EMOTIONAL INTENSITY (" + ei + "/10): " + intensityDesc + "\n";
    }
    if (moodInstruction) moodInstruction += "\n";

    const outputLang = settings.outputLanguage || "ko";
    const lang = langConfig[outputLang] || langConfig.ko;
    const useJsonMode = settings.useJsonMode !== false;
    const suggestionCount = settings.suggestionCount || 3;
    const sentenceCount = settings.sentenceCount || 2;

    // ═══ 프롬프트 조립 (B.5: 정적 섹션은 캐시 상수 사용) ═══

    let prompt = SYSTEM_PREAMBLE;

    prompt += "=== TASK ===\n";
    prompt += "Analyze the story context below and suggest exactly " + suggestionCount + " possible next plot developments. Each suggestion should be " + sentenceCount + " sentence(s) long.\n\n";
    prompt += "LANGUAGE: You MUST write ALL suggestions in " + lang.langName + " (" + lang.langNative + "). Do NOT use any other language.\n\n";

    // 퀄리티 프롬프트 (문체 스타일)
    const qualityParts = [];
    const selectedStyle = settings.selectedWritingStyle || "literaryStyle";
    if (defaultQualityPrompts[selectedStyle]) qualityParts.push(defaultQualityPrompts[selectedStyle].prompt);
    (settings.customQualityPrompts || []).forEach(cqp => {
        if (cqp.enabled && cqp.prompt) qualityParts.push(cqp.prompt);
    });
    if (qualityParts.length > 0) prompt += "=== STYLE GUIDELINES ===\n" + qualityParts.join("\n\n") + "\n\n";

    // 퀄리티 강화 옵션
    const qeSettings = settings.qualityEnhancements || {};
    const qeParts = [];
    qualityEnhancements.forEach(qe => { if (qeSettings[qe.id]) qeParts.push(qe.prompt); });
    if (qeParts.length > 0) prompt += "=== QUALITY ENHANCEMENTS ===\n" + qeParts.join("\n") + "\n\n";

    // 서사 품질 규칙 (B.5: 캐시된 상수)
    prompt += NARRATIVE_QUALITY_RULES;

    // 서사 분석 결과
    if (pacingAnalysis.hint) prompt += "=== PACING ANALYSIS ===\n" + pacingAnalysis.hint + "\n\n";
    if (unresolvedThreads) prompt += unresolvedThreads + "\n";

    // 장르 / 분위기 / 방향
    prompt += genreInstruction;
    prompt += customInstruction;
    prompt += directionInstruction;
    prompt += moodInstruction;

    // 플롯 세분화
    prompt += buildPlotBeatInstruction(settings);
    prompt += buildNarrativeArcInstruction(settings, chatHistoryText);
    prompt += buildFocusTargetInstruction(settings);
    prompt += buildSpectrumInstruction(settings, suggestionCount);
    prompt += buildEmotionCurveInstruction(settings);
    prompt += buildPacingInstruction(settings);
    prompt += buildCompositionInstruction(settings);

    // 길이 / 창의성 / 조건부 규칙 / 피드백 / 리듬
    prompt += buildLengthInstruction(settings);
    prompt += buildCreativityInstruction(settings);
    prompt += buildConditionalRulesInstruction(settings);
    prompt += buildFeedbackInstruction(settings);
    prompt += buildRhythmPromptHint();

    // 네거티브 프롬프트
    const negativePrompt = (settings.negativePrompt || "").trim();
    if (negativePrompt) {
        prompt += "=== EXCLUSIONS (NEGATIVE PROMPT) ===\n";
        prompt += "The following themes, scenarios, or elements must be COMPLETELY AVOIDED in all suggestions. Do NOT include anything similar to these:\n";
        prompt += negativePrompt + "\n\n";
    }

    // 컨텍스트
    prompt += "=== STORY CONTEXT ===\n" + contextParts.join("\n\n") + "\n=== END CONTEXT ===\n\n";

    // 출력 형식
    if (useJsonMode) {
        prompt += "=== OUTPUT FORMAT ===\n";
        prompt += "Respond ONLY with a valid JSON object (no markdown, no code blocks, no explanations):\n";
        prompt += '{"suggestions": ["suggestion 1 in ' + lang.langName + '", "suggestion 2 in ' + lang.langName + '", ...]}\n\n';
        prompt += "Provide exactly " + suggestionCount + " suggestions. Each must be a complete, vivid, and distinct narrative development written in " + lang.langName + ". Quality over quantity — make each one count.";
    } else {
        prompt += "=== OUTPUT FORMAT ===\n";
        prompt += "Provide exactly " + suggestionCount + " suggestions as a numbered list:\n";
        prompt += "1. [" + lang.first + "]\n";
        prompt += "2. [" + lang.second + "]\n";
        if (suggestionCount > 2) prompt += "3. [" + lang.third + "]\n";
        if (suggestionCount > 3) prompt += "...\n";
        prompt += "\nEach must be a complete, vivid, and distinct narrative development. Quality over quantity. Write in " + lang.langName + " only.";
    }

    return prompt;
}
