/**
 * 다음 전개 추천 확장 프로그램 v1.2.0
 * SillyTavern 확장 프로그램
 *
 * 주요 기능:
 * - 채팅 내역을 바탕으로 다음 전개 추천
 * - 추천 내용을 버튼 형태로 표시
 * - 버튼 클릭 시 자동 복사 및 메시지 삭제
 * - 장르 스타일 지정 가능
 * - API 연결 프로필 개별 지정 (Connection Manager 연동)
 * - 새 메시지 수신 시 자동 추천 기능 (on/off)
 * 
 * v1.2.0 변경사항:
 * - generateRaw 사용으로 기존 시스템 프롬프트 제외 (확장 프롬프트만 전송)
 * - Connection Manager 프로필 선택 기능 추가
 * - 슬라이더를 숫자 입력으로 변경
 * - 버튼 텍스트 잘림 문제 수정
 */

import { extension_settings, getContext } from "../../../extensions.js";
import { 
    eventSource, 
    event_types, 
    saveSettingsDebounced,
    getRequestHeaders,
    chat,
    Generate,
    main_api
} from "../../../../script.js";

// 확장 이름 및 경로
const extensionName = "next-plot-suggester";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 기본 설정
const defaultSettings = {
    enabled: true,
    autoSuggest: false,
    autoPasteToInput: false,  // 입력창에 자동 붙여넣기
    sentenceCount: 2,
    suggestionCount: 3,
    selectedGenres: [],
    customGenres: [],
    customPrompt: "",
    // Input 소스 토글
    inputSources: {
        charDescription: false,
        personaDescription: false,
        worldInfo: false,
        scenarioSummary: false,
        auWorldBuilder: false,  // AU-World-Builder 설정
        chatHistory: true  // 기본으로 활성화
    },
    apiType: "current",
    connectionProfile: "",  // SillyTavern 연결 프로필 ID
    apiEndpoint: "",
    apiKey: "",
    apiModel: ""
};

// 기본 장르 목록 (name은 영어로 프롬프트에 사용, nameKo는 한국어로 UI에 표시)
const defaultGenres = [
    { id: "comedy", name: "Comedy", nameKo: "코미디" },
    { id: "slice_of_life", name: "Slice of Life", nameKo: "일상" },
    { id: "noir", name: "Noir", nameKo: "느와르" },
    { id: "fantasy", name: "Fantasy", nameKo: "판타지" },
    { id: "romance", name: "Romance", nameKo: "로맨스" },
    { id: "horror", name: "Horror", nameKo: "호러" },
    { id: "mystery", name: "Mystery", nameKo: "미스터리" },
    { id: "action", name: "Action", nameKo: "액션" },
    { id: "drama", name: "Drama", nameKo: "드라마" },
    { id: "sci_fi", name: "Sci-Fi", nameKo: "SF" },
    { id: "thriller", name: "Thriller", nameKo: "스릴러" },
    { id: "adventure", name: "Adventure", nameKo: "모험" }
];

// 현재 추천 메시지 ID 추적
let currentSuggestionMessageId = null;
let isGenerating = false;

/**
 * 설정 로드
 */
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    const settings = extension_settings[extensionName];

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            if (typeof value === "object" && value !== null) {
                settings[key] = Array.isArray(value) ? [...value] : { ...value };
            } else {
                settings[key] = value;
            }
        }
    }

    log("Settings loaded");
}

/**
 * 설정 저장
 */
function saveSettings() {
    saveSettingsDebounced();
}

/**
 * 로그 출력
 */
function log(...args) {
    console.log("[" + extensionName + "]", ...args);
}

/**
 * 장르 목록 가져오기 (기본 + 사용자 정의)
 */
function getAllGenres() {
    const settings = extension_settings[extensionName];
    const customGenres = settings.customGenres || [];
    return [...defaultGenres, ...customGenres];
}

/**
 * 채팅 히스토리 가져오기
 */
function getChatHistory(maxMessages = 20) {
    const context = getContext();
    const chatHistory = context.chat || [];
    
    const recentMessages = chatHistory.slice(-maxMessages);
    
    return recentMessages.map(msg => {
        const role = msg.is_user ? "User" : (msg.name || "Character");
        return role + ": " + msg.mes;
    }).join("\n\n");
}

/**
 * 캐릭터 설명 가져오기
 */
function getCharacterDescription() {
    try {
        // SillyTavern.getContext() 사용
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            // getCharacterCardFields 우선 사용
            if (ctx.getCharacterCardFields) {
                const fields = ctx.getCharacterCardFields();
                if (fields.description) {
                    return fields.description;
                }
            }
            // characters 배열에서 가져오기
            if (ctx.characters && ctx.characterId !== undefined) {
                const char = ctx.characters[ctx.characterId];
                if (char && char.description) {
                    return char.description;
                }
            }
        }
        // getContext() fallback
        const context = getContext();
        if (context.characters && context.characterId !== undefined) {
            const char = context.characters[context.characterId];
            if (char && char.description) {
                return char.description;
            }
        }
    } catch (e) {
        log("Failed to get character description:", e);
    }
    return "";
}

/**
 * 페르소나 설명 가져오기
 */
function getPersonaDescription() {
    try {
        // SillyTavern.getContext() 사용
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            // getCharacterCardFields에서 persona 가져오기
            if (ctx.getCharacterCardFields) {
                const fields = ctx.getCharacterCardFields();
                if (fields.persona) {
                    return fields.persona;
                }
            }
        }
        // power_user에서 persona_description 가져오기
        if (typeof power_user !== "undefined" && power_user.persona_description) {
            return power_user.persona_description;
        }
        // window.power_user 시도
        if (window.power_user && window.power_user.persona_description) {
            return window.power_user.persona_description;
        }
        // getContext에서 시도
        const context = getContext();
        if (context.persona_description) {
            return context.persona_description;
        }
    } catch (e) {
        log("Failed to get persona description:", e);
    }
    return "";
}

/**
 * World Info / Lorebook 가져오기 (캐릭터에 연결된 lorebook)
 */
async function getWorldInfoBefore() {
    try {
        const context = getContext();
        const allEntries = [];
        
        // 1. 캐릭터에 직접 연결된 character_book (embedded lorebook)
        if (context.characters && context.characterId !== undefined) {
            const char = context.characters[context.characterId];
            if (char && char.data && char.data.character_book) {
                const book = char.data.character_book;
                if (book.entries && Array.isArray(book.entries)) {
                    for (const entry of book.entries) {
                        // embedded lorebook은 enabled 필드 사용 (enabled=true면 활성화)
                        // 또는 disable 필드 사용 (disable=true면 비활성화)
                        const isEnabled = entry.enabled === true || (entry.enabled !== false && entry.disable !== true);
                        if (entry && entry.content && isEnabled) {
                            allEntries.push(entry.content);
                        }
                    }
                    log("Embedded lorebook entries checked:", book.entries.length, "enabled:", allEntries.length);
                }
            }
        }
        
        // 2. SillyTavern.getContext()를 통해 loadWorldInfo 사용
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            
            // 캐릭터에 연결된 lorebook 이름 찾기
            if (ctx.characters && ctx.characterId !== undefined) {
                const char = ctx.characters[ctx.characterId];
                // extensions.world에서 연결된 world info 이름 확인
                if (char && char.data && char.data.extensions && char.data.extensions.world) {
                    const worldName = char.data.extensions.world;
                    log("Found linked world info:", worldName);
                    
                    // loadWorldInfo 함수로 로드
                    if (ctx.loadWorldInfo && typeof ctx.loadWorldInfo === "function") {
                        try {
                            const worldData = await ctx.loadWorldInfo(worldName);
                            if (worldData && worldData.entries) {
                                let enabledCount = 0;
                                let totalCount = 0;
                                for (const [uid, entry] of Object.entries(worldData.entries)) {
                                    totalCount++;
                                    // disable===true이면 비활성화된 항목
                                    const isDisabled = entry.disable === true;
                                    if (entry && entry.content && !isDisabled) {
                                        allEntries.push(entry.content);
                                        enabledCount++;
                                    }
                                }
                                log("Linked lorebook", worldName, "- total:", totalCount, "enabled:", enabledCount);
                            }
                        } catch (loadErr) {
                            log("Failed to load world info:", loadErr);
                        }
                    }
                }
            }
            
            // 전역 선택된 world info도 가져오기
            if (ctx.loadWorldInfo && typeof ctx.loadWorldInfo === "function") {
                // selected_world_info 배열 가져오기 시도 (전역 변수)
                const selectedWorlds = window.selected_world_info || [];
                for (const worldName of selectedWorlds) {
                    try {
                        const worldData = await ctx.loadWorldInfo(worldName);
                        if (worldData && worldData.entries) {
                            let enabledCount = 0;
                            let totalCount = 0;
                            for (const [uid, entry] of Object.entries(worldData.entries)) {
                                totalCount++;
                                // disable===true이면 비활성화된 항목
                                const isDisabled = entry.disable === true;
                                if (entry && entry.content && !isDisabled && !allEntries.includes(entry.content)) {
                                    allEntries.push(entry.content);
                                    enabledCount++;
                                }
                            }
                            log("Selected lorebook", worldName, "- total:", totalCount, "enabled:", enabledCount);
                        }
                    } catch (loadErr) {
                        log("Failed to load selected world info:", worldName, loadErr);
                    }
                }
            }
        }
        
        if (allEntries.length > 0) {
            log("Total world info entries found:", allEntries.length);
            return allEntries.join("\n\n");
        }
    } catch (e) {
        log("Failed to get world info:", e);
    }
    return "";
}

/**
 * Scenario-Summarizer 요약 내용 가져오기
 */
function getScenarioSummary() {
    try {
        // window.SummarizerDebug.getSummaryData 사용 (Scenario-Summarizer 확장)
        if (window.SummarizerDebug && typeof window.SummarizerDebug.getSummaryData === "function") {
            const data = window.SummarizerDebug.getSummaryData();
            if (data && data.summaries) {
                const summaryTexts = [];
                for (const [index, summary] of Object.entries(data.summaries)) {
                    if (summary && summary.content) {
                        summaryTexts.push(summary.content);
                    }
                }
                if (summaryTexts.length > 0) {
                    return summaryTexts.join("\n\n");
                }
            }
        }
        
        // chatMetadata에서 scenarioSummary 시도
        const context = getContext();
        if (context.chatMetadata) {
            // scenarioSummary 키로 시도
            const ssData = context.chatMetadata.scenarioSummary || context.chatMetadata["Scenario-Summarizer"];
            if (ssData && ssData.summaries) {
                const summaryTexts = [];
                for (const [index, summary] of Object.entries(ssData.summaries)) {
                    if (summary && summary.content) {
                        summaryTexts.push(summary.content);
                    }
                }
                if (summaryTexts.length > 0) {
                    return summaryTexts.join("\n\n");
                }
            }
        }
        
        // extension_settings에서 시도
        if (extension_settings && extension_settings["Scenario-Summarizer"]) {
            const ssSettings = extension_settings["Scenario-Summarizer"];
            if (ssSettings.summaryData && ssSettings.summaryData.summaries) {
                const summaryTexts = [];
                for (const [index, summary] of Object.entries(ssSettings.summaryData.summaries)) {
                    if (summary && summary.content) {
                        summaryTexts.push(summary.content);
                    }
                }
                if (summaryTexts.length > 0) {
                    return summaryTexts.join("\n\n");
                }
            }
        }
    } catch (e) {
        log("Failed to get scenario summary:", e);
    }
    return "";
}

/**
 * AU-World-Builder 설정 가져오기
 */
function getAUWorldBuilderSettings() {
    try {
        // AU-World-Builder는 채팅별로 데이터를 저장함
        const context = getContext();
        const chatId = context.chatId;
        
        if (!chatId) {
            log("No chat ID for AU-World-Builder");
            return "";
        }
        
        // extension_settings에서 AU-World-Builder 데이터 가져오기
        const auSettings = extension_settings["AU-World-Builder"];
        if (!auSettings) {
            log("AU-World-Builder settings not found");
            return "";
        }
        
        // 채팅별 데이터
        const chatData = auSettings.chatData && auSettings.chatData[chatId];
        if (!chatData) {
            log("AU-World-Builder chat data not found for:", chatId);
            return "";
        }
        
        const parts = [];
        
        // 1. World Setting
        if (chatData.worldSetting) {
            parts.push("[AU World Setting]\n" + chatData.worldSetting + "\n[/AU World Setting]");
        }
        
        // 2. Character Settings
        if (chatData.characterSettings) {
            if (chatData.characterSettings.char) {
                parts.push("[AU Character Setting]\n" + chatData.characterSettings.char + "\n[/AU Character Setting]");
            }
            if (chatData.characterSettings.user) {
                parts.push("[AU User Setting]\n" + chatData.characterSettings.user + "\n[/AU User Setting]");
            }
        }
        
        // 3. AU Concept
        if (chatData.auConcept) {
            parts.push("[AU Concept]\n" + chatData.auConcept + "\n[/AU Concept]");
        }
        
        // 4. Genre Prompt
        if (chatData.genrePrompt) {
            parts.push("[AU Genre]\n" + chatData.genrePrompt + "\n[/AU Genre]");
        }
        
        if (parts.length > 0) {
            log("AU-World-Builder data found, parts:", parts.length);
            return parts.join("\n\n");
        }
    } catch (e) {
        log("Failed to get AU-World-Builder settings:", e);
    }
    return "";
}

/**
 * 프롬프트 생성 (한국어 응답 요청)
 */
async function buildPrompt() {
    const settings = extension_settings[extensionName];
    const sources = settings.inputSources || defaultSettings.inputSources;
    
    // Input 소스들 수집
    let contextParts = [];
    
    log("Building prompt with sources:", JSON.stringify(sources));
    
    // 1. Character Description
    if (sources.charDescription) {
        const charDesc = getCharacterDescription();
        log("Character Description length:", charDesc ? charDesc.length : 0);
        if (charDesc) {
            contextParts.push("[Character Description]\n" + charDesc + "\n[/Character Description]");
        }
    }
    
    // 2. Persona Description
    if (sources.personaDescription) {
        const personaDesc = getPersonaDescription();
        log("Persona Description length:", personaDesc ? personaDesc.length : 0);
        if (personaDesc) {
            contextParts.push("[Persona Description]\n" + personaDesc + "\n[/Persona Description]");
        }
    }
    
    // 3. World Info / Lorebook (async)
    if (sources.worldInfo) {
        const worldInfo = await getWorldInfoBefore();
        log("World Info length:", worldInfo ? worldInfo.length : 0);
        if (worldInfo) {
            contextParts.push("[World Info / Lorebook]\n" + worldInfo + "\n[/World Info / Lorebook]");
        }
    }
    
    // 4. Scenario Summary
    if (sources.scenarioSummary) {
        const summary = getScenarioSummary();
        log("Scenario Summary length:", summary ? summary.length : 0);
        if (summary) {
            contextParts.push("[Scenario Summary]\n" + summary + "\n[/Scenario Summary]");
        }
    }
    
    // 5. AU-World-Builder 설정
    if (sources.auWorldBuilder) {
        const auSettings = getAUWorldBuilderSettings();
        log("AU-World-Builder length:", auSettings ? auSettings.length : 0);
        if (auSettings) {
            contextParts.push(auSettings);
        }
    }
    
    // 6. Chat History (기본)
    if (sources.chatHistory !== false) {
        const chatHistory = getChatHistory();
        log("Chat History length:", chatHistory ? chatHistory.length : 0);
        if (chatHistory) {
            contextParts.push("[Chat History]\n" + chatHistory + "\n[/Chat History]");
        }
    }
    
    log("Total context parts:", contextParts.length);
    
    // 선택된 장르들 (영어 이름 사용)
    const allGenres = getAllGenres();
    const selectedGenreNames = settings.selectedGenres
        .map(id => allGenres.find(g => g.id === id))
        .filter(g => g)
        .map(g => g.name)
        .join(", ");
    
    const genreInstruction = selectedGenreNames 
        ? "Genre/Style to consider: " + selectedGenreNames + "\n\n"
        : "";
    
    const customInstruction = settings.customPrompt 
        ? "Additional instructions: " + settings.customPrompt + "\n\n"
        : "";
    
    let prompt = "Based on the following context, suggest " + settings.suggestionCount + " possible next plot developments or responses. Each suggestion should be " + settings.sentenceCount + " sentence(s) long.\n\n";
    prompt += "CRITICAL: You MUST write ALL suggestions in Korean (한국어). Do NOT write in English.\n\n";
    prompt += genreInstruction;
    prompt += customInstruction;
    prompt += "=== Context ===\n" + contextParts.join("\n\n") + "\n=== End Context ===\n\n";
    prompt += "Please provide exactly " + settings.suggestionCount + " suggestions for what could happen next. Format your response as a numbered list:\n";
    prompt += "1. [첫 번째 추천 - 한국어로 작성]\n";
    prompt += "2. [두 번째 추천 - 한국어로 작성]\n";
    if (settings.suggestionCount > 2) {
        prompt += "3. [세 번째 추천 - 한국어로 작성]\n";
    }
    if (settings.suggestionCount > 3) {
        prompt += "...\n";
    }
    prompt += "\nEach suggestion should be creative, contextually appropriate, and advance the story in an interesting direction. Remember: Write in Korean only.";

    return prompt;
}

/**
 * API 요청 보내기
 */
async function sendApiRequest(prompt) {
    const settings = extension_settings[extensionName];
    
    try {
        if (settings.apiType === "current") {
            return await generateWithCurrentApi(prompt);
        } else if (settings.apiType === "profile") {
            return await generateWithProfileApi(prompt);
        } else {
            return await generateWithCustomApi(prompt);
        }
    } catch (error) {
        log("API request error:", error);
        throw error;
    }
}

/**
 * SillyTavern 연결 프로필 목록 가져오기
 */
function getConnectionProfiles() {
    try {
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            if (ctx && ctx.extensionSettings && ctx.extensionSettings.connectionManager) {
                return ctx.extensionSettings.connectionManager.profiles || [];
            }
        }
        const ctx = getContext();
        if (ctx && ctx.extensionSettings && ctx.extensionSettings.connectionManager) {
            return ctx.extensionSettings.connectionManager.profiles || [];
        }
        if (window.extension_settings && window.extension_settings.connectionManager) {
            return window.extension_settings.connectionManager.profiles || [];
        }
        return [];
    } catch (error) {
        log("Failed to get connection profiles:", error);
        return [];
    }
}

/**
 * 프로필 ID로 프로필 이름 가져오기
 */
function getProfileNameById(profileId) {
    try {
        const profiles = getConnectionProfiles();
        const profile = profiles.find(p => p.id === profileId);
        return profile ? profile.name : null;
    } catch (e) {
        return null;
    }
}

/**
 * 현재 선택된 프로필 이름 가져오기
 */
function getCurrentProfileName() {
    try {
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            if (ctx.extensionSettings && ctx.extensionSettings.connectionManager) {
                const selectedId = ctx.extensionSettings.connectionManager.selectedProfile;
                if (selectedId) {
                    const profile = ctx.extensionSettings.connectionManager.profiles.find(p => p.id === selectedId);
                    return profile ? profile.name : null;
                }
            }
        }
    } catch (e) {
        log("Failed to get current profile:", e);
    }
    return null;
}

/**
 * 프로필로 전환
 */
async function switchToProfile(profileName) {
    if (!profileName) return false;
    try {
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            if (ctx.executeSlashCommandsWithOptions) {
                await ctx.executeSlashCommandsWithOptions("/profile " + profileName);
                log("Switched to profile: " + profileName);
                await new Promise(function(resolve) { setTimeout(resolve, 1500); });
                return true;
            } else if (ctx.executeSlashCommands) {
                await ctx.executeSlashCommands("/profile " + profileName);
                log("Switched to profile: " + profileName);
                await new Promise(function(resolve) { setTimeout(resolve, 1500); });
                return true;
            }
        }
        if (typeof executeSlashCommands === "function") {
            await executeSlashCommands("/profile " + profileName);
            log("Switched to profile: " + profileName);
            await new Promise(function(resolve) { setTimeout(resolve, 1500); });
            return true;
        }
    } catch (e) {
        log("Failed to switch profile:", e);
    }
    return false;
}

/**
 * 현재 연결된 API로 생성 (확장 프로그램 전용 프롬프트만 사용)
 */
async function generateWithCurrentApi(prompt) {
    let result = "";
    
    // SillyTavern API 사용 - generateRaw를 우선 사용하여 기존 프롬프트 제외
    if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
        const ctx = SillyTavern.getContext();
        
        // generateRaw 사용: skipWIAN, skipAN으로 기존 프롬프트 제외
        if (ctx.generateRaw) {
            result = await ctx.generateRaw({
                prompt: prompt,
                maxContext: null,
                quietToLoud: false,
                skipWIAN: true,
                skipAN: true
            });
        } else if (ctx.generateQuietPrompt) {
            // fallback: generateQuietPrompt (기존 방식)
            result = await ctx.generateQuietPrompt(prompt, false, false);
        }
    }
    
    // 전역 함수 fallback
    if (!result && typeof generateQuietPrompt === "function") {
        result = await generateQuietPrompt(prompt, false, false);
    }
    
    if (!result) {
        // 직접 API 호출 fallback
        const response = await fetch("/api/backends/chat-completions/generate", {
            method: "POST",
            headers: getRequestHeaders(),
            body: JSON.stringify({
                prompt: prompt,
                max_tokens: 1000,
                temperature: 0.8
            })
        });
        
        if (!response.ok) {
            throw new Error("API request failed: " + response.status);
        }
        
        const data = await response.json();
        result = data.response || data.text || data.content || "";
    }
    
    return result;
}

/**
 * 선택한 프로필로 전환 후 API 생성
 */
async function generateWithProfileApi(prompt) {
    const settings = extension_settings[extensionName];
    const selectedProfileId = settings.connectionProfile;
    
    if (!selectedProfileId) {
        throw new Error("프로필을 선택해주세요.");
    }
    
    const targetProfileName = getProfileNameById(selectedProfileId);
    if (!targetProfileName) {
        throw new Error("선택한 프로필을 찾을 수 없습니다.");
    }
    
    const originalProfile = getCurrentProfileName();
    let switchedProfile = false;
    
    try {
        // 현재 프로필과 다르면 전환
        if (originalProfile !== targetProfileName) {
            log("Switching from profile '" + originalProfile + "' to '" + targetProfileName + "'");
            switchedProfile = await switchToProfile(targetProfileName);
            if (!switchedProfile) {
                throw new Error("프로필 전환에 실패했습니다: " + targetProfileName);
            }
        }
        
        let result = "";
        
        // SillyTavern API 사용
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            
            if (ctx.generateRaw) {
                result = await ctx.generateRaw({
                    prompt: prompt,
                    maxContext: null,
                    quietToLoud: false,
                    skipWIAN: true,
                    skipAN: true
                });
            } else if (ctx.generateQuietPrompt) {
                result = await ctx.generateQuietPrompt(prompt, false, false);
            }
        }
        
        if (!result && typeof generateQuietPrompt === "function") {
            result = await generateQuietPrompt(prompt, false, false);
        }
        
        if (!result) {
            throw new Error("API 응답이 비어있습니다.");
        }
        
        return result;
        
    } finally {
        // 원래 프로필로 복원
        if (switchedProfile && originalProfile) {
            log("Restoring original profile: " + originalProfile);
            await switchToProfile(originalProfile);
        }
    }
}

/**
 * 커스텀 API로 생성
 */
async function generateWithCustomApi(prompt) {
    const settings = extension_settings[extensionName];
    
    if (!settings.apiEndpoint) {
        throw new Error("API endpoint not configured");
    }
    
    const headers = {
        "Content-Type": "application/json"
    };
    
    if (settings.apiKey) {
        headers["Authorization"] = "Bearer " + settings.apiKey;
    }
    
    const body = {
        model: settings.apiModel || "gpt-3.5-turbo",
        messages: [
            {
                role: "user",
                content: prompt
            }
        ],
        max_tokens: 1000,
        temperature: 0.8
    };
    
    const response = await fetch(settings.apiEndpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        throw new Error("Custom API request failed: " + response.status);
    }
    
    const data = await response.json();
    
    if (data.choices && data.choices[0]) {
        return data.choices[0].message?.content || data.choices[0].text || "";
    }
    
    return data.response || data.text || data.content || "";
}

/**
 * 응답 파싱하여 추천 목록 추출
 */
function parseSuggestions(response) {
    const suggestions = [];
    const lines = response.split("\n");
    
    for (const line of lines) {
        const match = line.match(/^\s*(\d+)[.\)]\s*(.+)/);
        if (match && match[2]) {
            suggestions.push(match[2].trim());
        }
    }
    
    if (suggestions.length === 0) {
        const nonEmptyLines = lines
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith("#"));
        
        suggestions.push(...nonEmptyLines.slice(0, extension_settings[extensionName].suggestionCount));
    }
    
    return suggestions;
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 속성용 이스케이프 (data 속성에 사용)
 */
function escapeAttr(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * 추천 메시지 HTML 생성
 */
function createSuggestionMessageHtml(suggestions) {
    let buttonsHtml = "";
    suggestions.forEach((suggestion, index) => {
        buttonsHtml += '<button class="nps-suggestion-btn" data-suggestion="' + escapeAttr(suggestion) + '" data-index="' + index + '">';
        buttonsHtml += '<span class="nps-suggestion-number">' + (index + 1) + '</span>';
        buttonsHtml += '<span class="nps-suggestion-text">' + escapeHtml(suggestion) + '</span>';
        buttonsHtml += '</button>';
    });
    
    let html = '<div class="nps-suggestion-container">';
    html += '<div class="nps-suggestion-header">';
    html += '<span class="nps-suggestion-title">다음 전개 추천</span>';
    html += '<button class="nps-close-btn" title="닫기">&times;</button>';
    html += '</div>';
    html += '<div class="nps-suggestion-buttons">' + buttonsHtml + '</div>';
    html += '<div class="nps-suggestion-footer">';
    html += '<button class="nps-regenerate-btn" title="다시 생성">다시 생성</button>';
    html += '</div>';
    html += '</div>';
    
    return html;
}

/**
 * 추천 메시지 표시
 * @param {boolean} silent - true이면 경고 메시지 표시 안함
 */
async function showSuggestions(silent = false) {
    if (isGenerating) {
        if (!silent) {
            toastr.warning("이미 생성 중입니다. 잠시 기다려주세요.");
        }
        return;
    }
    
    const settings = extension_settings[extensionName];
    if (!settings.enabled) {
        toastr.info("다음 전개 추천 기능이 비활성화되어 있습니다.");
        return;
    }
    
    removeSuggestionMessage();
    
    isGenerating = true;
    
    try {
        showLoadingMessage();
        
        const prompt = await buildPrompt();
        log("Sending prompt:", prompt);
        
        const response = await sendApiRequest(prompt);
        log("Received response:", response);
        
        const suggestions = parseSuggestions(response);
        
        if (suggestions.length === 0) {
            throw new Error("No suggestions parsed from response");
        }
        
        removeLoadingMessage();
        displaySuggestionMessage(suggestions);
        
    } catch (error) {
        log("Error generating suggestions:", error);
        removeLoadingMessage();
        toastr.error("추천 생성 중 오류가 발생했습니다: " + error.message);
    } finally {
        isGenerating = false;
    }
}

/**
 * 로딩 메시지 표시
 */
function showLoadingMessage() {
    const chatElement = document.getElementById("chat");
    if (!chatElement) return;
    
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "nps-loading-message";
    loadingDiv.className = "mes nps-loading-mes";
    
    let loadingHtml = '<div class="nps-loading-container">';
    loadingHtml += '<div class="nps-loading-spinner"></div>';
    loadingHtml += '<span>다음 전개 추천 생성 중...</span>';
    loadingHtml += '</div>';
    
    loadingDiv.innerHTML = loadingHtml;
    
    chatElement.appendChild(loadingDiv);
    scrollToBottom();
}

/**
 * 로딩 메시지 제거
 */
function removeLoadingMessage() {
    const loadingMsg = document.getElementById("nps-loading-message");
    if (loadingMsg) {
        loadingMsg.remove();
    }
}

/**
 * 추천 메시지 표시
 */
function displaySuggestionMessage(suggestions) {
    const chatElement = document.getElementById("chat");
    if (!chatElement) return;
    
    currentSuggestionMessageId = "nps-suggestion-" + Date.now();
    
    const messageDiv = document.createElement("div");
    messageDiv.id = currentSuggestionMessageId;
    messageDiv.className = "mes nps-suggestion-mes";
    messageDiv.innerHTML = createSuggestionMessageHtml(suggestions);
    
    chatElement.appendChild(messageDiv);
    bindSuggestionEvents(messageDiv);
    scrollToBottom();
}

/**
 * 추천 버튼 이벤트 바인딩
 */
function bindSuggestionEvents(container) {
    container.querySelectorAll(".nps-suggestion-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const suggestion = btn.dataset.suggestion;
            const settings = extension_settings[extensionName];
            
            // 클립보드에 복사
            await copyToClipboard(suggestion);
            
            // 자동 붙여넣기 활성화 시 입력창에 OOC 형식으로 붙여넣기
            if (settings.autoPasteToInput) {
                const oocText = "<ooc: " + suggestion + ">";
                pasteToInputField(oocText);
                toastr.success("입력창에 붙여넣기 되었습니다!");
            } else {
                toastr.success("클립보드에 복사되었습니다!");
            }
            
            removeSuggestionMessage();
        });
    });
    
    const closeBtn = container.querySelector(".nps-close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            removeSuggestionMessage();
        });
    }
    
    const regenerateBtn = container.querySelector(".nps-regenerate-btn");
    if (regenerateBtn) {
        regenerateBtn.addEventListener("click", () => {
            showSuggestions();
        });
    }
}

/**
 * 입력창에 텍스트 붙여넣기
 */
function pasteToInputField(text) {
    try {
        // SillyTavern 입력창 찾기
        const textarea = document.getElementById("send_textarea");
        if (textarea) {
            // 현재 커서 위치에 삽입 또는 기존 내용에 추가
            const currentValue = textarea.value;
            if (currentValue) {
                textarea.value = currentValue + "\n" + text;
            } else {
                textarea.value = text;
            }
            // input 이벤트 발생시켜 SillyTavern이 인식하도록
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            textarea.focus();
        }
    } catch (e) {
        log("Failed to paste to input field:", e);
    }
}

/**
 * 클립보드에 복사
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
    }
}

/**
 * 추천 메시지 제거
 */
function removeSuggestionMessage() {
    if (currentSuggestionMessageId) {
        const msgElement = document.getElementById(currentSuggestionMessageId);
        if (msgElement) {
            msgElement.remove();
        }
        currentSuggestionMessageId = null;
    }
    
    document.querySelectorAll(".nps-suggestion-mes").forEach(el => el.remove());
}

/**
 * 채팅 하단으로 스크롤
 */
function scrollToBottom() {
    const chatElement = document.getElementById("chat");
    if (chatElement) {
        chatElement.scrollTop = chatElement.scrollHeight;
    }
}

/**
 * 새 메시지 수신 시 자동 추천
 */
function onNewMessage(messageId) {
    const settings = extension_settings[extensionName];
    
    if (settings.enabled && settings.autoSuggest) {
        // 이미 생성 중이면 조용히 무시
        if (isGenerating) {
            log("Auto-suggest skipped: already generating");
            return;
        }
        setTimeout(() => {
            showSuggestions(true); // silent=true
        }, 500);
    }
}

/**
 * API 연결 테스트
 */
async function testApiConnection() {
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

/**
 * API 상태 표시 업데이트
 */
function updateApiStatus(connected) {
    const statusDiv = document.getElementById("nps-api-status");
    const indicator = document.getElementById("nps-api-status-indicator");
    const text = document.getElementById("nps-api-status-text");
    
    if (statusDiv) {
        statusDiv.style.display = "flex";
    }
    if (indicator) {
        indicator.className = "nps-api-status-indicator " + (connected ? "connected" : "disconnected");
    }
    if (text) {
        text.textContent = connected ? "연결됨" : "연결 실패";
    }
}

/**
 * 설정 팝업 열기
 */
function openSettingsPopup() {
    const popup = document.getElementById("nps-settings-popup");
    if (popup) {
        popup.style.display = "flex";
        updatePopupUIFromSettings();
    }
}

/**
 * 설정 팝업 닫기
 */
function closeSettingsPopup() {
    const popup = document.getElementById("nps-settings-popup");
    if (popup) {
        popup.style.display = "none";
    }
}

/**
 * 팝업 UI 업데이트
 */
function updatePopupUIFromSettings() {
    const settings = extension_settings[extensionName];
    
    const enabledEl = document.getElementById("nps-popup-enabled");
    const autoSuggestEl = document.getElementById("nps-popup-auto-suggest");
    const autoPasteEl = document.getElementById("nps-popup-auto-paste");
    const sentenceCountEl = document.getElementById("nps-popup-sentence-count");
    const suggestionCountEl = document.getElementById("nps-popup-suggestion-count");
    const customPromptEl = document.getElementById("nps-popup-custom-prompt");
    const apiTypeEl = document.getElementById("nps-popup-api-type");
    const connectionProfileEl = document.getElementById("nps-popup-connection-profile");
    const apiEndpointEl = document.getElementById("nps-popup-api-endpoint");
    const apiKeyEl = document.getElementById("nps-popup-api-key");
    const apiModelEl = document.getElementById("nps-popup-api-model");
    
    // Input 소스 체크박스
    const inputCharEl = document.getElementById("nps-popup-input-char");
    const inputPersonaEl = document.getElementById("nps-popup-input-persona");
    const inputWorldEl = document.getElementById("nps-popup-input-world");
    const inputSummaryEl = document.getElementById("nps-popup-input-summary");
    const inputAuEl = document.getElementById("nps-popup-input-au");
    const inputChatEl = document.getElementById("nps-popup-input-chat");
    
    if (enabledEl) enabledEl.checked = settings.enabled;
    if (autoSuggestEl) autoSuggestEl.checked = settings.autoSuggest;
    if (autoPasteEl) autoPasteEl.checked = settings.autoPasteToInput;
    if (sentenceCountEl) sentenceCountEl.value = settings.sentenceCount;
    if (suggestionCountEl) suggestionCountEl.value = settings.suggestionCount;
    if (customPromptEl) customPromptEl.value = settings.customPrompt || "";
    if (apiTypeEl) apiTypeEl.value = settings.apiType;
    if (apiEndpointEl) apiEndpointEl.value = settings.apiEndpoint || "";
    if (apiKeyEl) apiKeyEl.value = settings.apiKey || "";
    if (apiModelEl) apiModelEl.value = settings.apiModel || "";
    
    // Input 소스 설정
    const sources = settings.inputSources || defaultSettings.inputSources;
    if (inputCharEl) inputCharEl.checked = sources.charDescription;
    if (inputPersonaEl) inputPersonaEl.checked = sources.personaDescription;
    if (inputWorldEl) inputWorldEl.checked = sources.worldInfo;
    if (inputSummaryEl) inputSummaryEl.checked = sources.scenarioSummary;
    if (inputAuEl) inputAuEl.checked = sources.auWorldBuilder;
    if (inputChatEl) inputChatEl.checked = true; // 항상 체크 (필수)
    
    // 연결 프로필 드롭다운 업데이트
    populateConnectionProfiles();
    if (connectionProfileEl && settings.connectionProfile) {
        connectionProfileEl.value = settings.connectionProfile;
    }
    
    updatePopupApiSettingsVisibility();
    renderPopupGenreSelection();
    renderPopupCustomGenres();
}

/**
 * 연결 프로필 드롭다운 채우기
 */
function populateConnectionProfiles() {
    const select = document.getElementById("nps-popup-connection-profile");
    if (!select) return;
    
    const profiles = getConnectionProfiles();
    select.innerHTML = '<option value="">현재 프로필 유지</option>';
    
    profiles.forEach(profile => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.name || profile.id;
        select.appendChild(option);
    });
    
    const settings = extension_settings[extensionName];
    if (settings.connectionProfile) {
        select.value = settings.connectionProfile;
    }
}

/**
 * 팝업 API 설정 가시성 업데이트
 */
function updatePopupApiSettingsVisibility() {
    const settings = extension_settings[extensionName];
    const apiType = settings.apiType;
    const customSettings = document.querySelector("#nps-settings-popup .nps-custom-api-settings");
    const profileSettings = document.querySelector("#nps-settings-popup .nps-profile-settings");
    
    if (customSettings) {
        customSettings.style.display = apiType === "custom" ? "block" : "none";
    }
    if (profileSettings) {
        profileSettings.style.display = apiType === "profile" ? "block" : "none";
    }
}

/**
 * 팝업 장르 선택 렌더링
 */
function renderPopupGenreSelection() {
    const container = document.getElementById("nps-popup-default-genres");
    if (!container) return;
    
    const settings = extension_settings[extensionName];
    container.innerHTML = "";
    
    defaultGenres.forEach(genre => {
        const genreDiv = document.createElement("div");
        genreDiv.className = "nps-genre-item";
        
        const isChecked = settings.selectedGenres.includes(genre.id);
        
        let labelHtml = '<label>';
        labelHtml += '<input type="checkbox" class="nps-popup-genre-checkbox" data-genre-id="' + genre.id + '"' + (isChecked ? ' checked' : '') + '>';
        labelHtml += '<span>' + escapeHtml(genre.nameKo) + '</span>';
        labelHtml += '</label>';
        
        genreDiv.innerHTML = labelHtml;
        container.appendChild(genreDiv);
    });
    
    container.querySelectorAll(".nps-popup-genre-checkbox").forEach(cb => {
        cb.addEventListener("change", onPopupGenreChange);
    });
}

/**
 * 팝업 커스텀 장르 렌더링
 */
function renderPopupCustomGenres() {
    const container = document.getElementById("nps-popup-custom-genres-list");
    if (!container) return;
    
    const settings = extension_settings[extensionName];
    container.innerHTML = "";
    
    if (!settings.customGenres || settings.customGenres.length === 0) {
        container.innerHTML = '<p class="nps-no-custom-genres">사용자 정의 장르가 없습니다.</p>';
        return;
    }
    
    settings.customGenres.forEach(genre => {
        const genreDiv = document.createElement("div");
        genreDiv.className = "nps-custom-genre-item";
        
        const isChecked = settings.selectedGenres.includes(genre.id);
        
        let itemHtml = '<label>';
        itemHtml += '<input type="checkbox" class="nps-popup-genre-checkbox" data-genre-id="' + genre.id + '"' + (isChecked ? ' checked' : '') + '>';
        itemHtml += '<span>' + escapeHtml(genre.nameKo) + ' (' + escapeHtml(genre.name) + ')</span>';
        itemHtml += '</label>';
        itemHtml += '<button class="nps-delete-genre-btn" data-genre-id="' + genre.id + '" title="삭제">&times;</button>';
        
        genreDiv.innerHTML = itemHtml;
        container.appendChild(genreDiv);
    });
    
    container.querySelectorAll(".nps-delete-genre-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const genreId = btn.dataset.genreId;
            deleteCustomGenre(genreId);
            renderPopupCustomGenres();
        });
    });
    
    container.querySelectorAll(".nps-popup-genre-checkbox").forEach(cb => {
        cb.addEventListener("change", onPopupGenreChange);
    });
}

/**
 * 팝업 장르 선택 변경
 */
function onPopupGenreChange(e) {
    const settings = extension_settings[extensionName];
    const genreId = e.target.dataset.genreId;
    const isChecked = e.target.checked;
    
    if (isChecked) {
        if (!settings.selectedGenres.includes(genreId)) {
            settings.selectedGenres.push(genreId);
        }
    } else {
        settings.selectedGenres = settings.selectedGenres.filter(id => id !== genreId);
    }
    
    saveSettings();
}

/**
 * 커스텀 장르 추가
 */
function addCustomGenre(name, nameKo) {
    const settings = extension_settings[extensionName];
    
    if (!settings.customGenres) {
        settings.customGenres = [];
    }
    
    const id = "custom_" + Date.now();
    settings.customGenres.push({
        id: id,
        name: name,
        nameKo: nameKo
    });
    
    saveSettings();
    toastr.success("장르가 추가되었습니다.");
}

/**
 * 커스텀 장르 삭제
 */
function deleteCustomGenre(genreId) {
    const settings = extension_settings[extensionName];
    
    settings.customGenres = settings.customGenres.filter(g => g.id !== genreId);
    settings.selectedGenres = settings.selectedGenres.filter(id => id !== genreId);
    
    saveSettings();
    toastr.info("장르가 삭제되었습니다.");
}

/**
 * 팝업 이벤트 바인딩
 */
function bindPopupEvents() {
    // 닫기 버튼
    const closeBtn = document.getElementById("nps-popup-close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", closeSettingsPopup);
    }
    
    // 배경 클릭으로 닫기
    const popup = document.getElementById("nps-settings-popup");
    if (popup) {
        popup.addEventListener("click", (e) => {
            if (e.target === popup) {
                closeSettingsPopup();
            }
        });
    }
    
    // 활성화 토글
    const enabledEl = document.getElementById("nps-popup-enabled");
    if (enabledEl) {
        enabledEl.addEventListener("change", function() {
            extension_settings[extensionName].enabled = this.checked;
            saveSettings();
        });
    }
    
    // 자동 추천 토글
    const autoSuggestEl = document.getElementById("nps-popup-auto-suggest");
    if (autoSuggestEl) {
        autoSuggestEl.addEventListener("change", function() {
            extension_settings[extensionName].autoSuggest = this.checked;
            saveSettings();
        });
    }
    
    // 자동 붙여넣기 토글
    const autoPasteEl = document.getElementById("nps-popup-auto-paste");
    if (autoPasteEl) {
        autoPasteEl.addEventListener("change", function() {
            extension_settings[extensionName].autoPasteToInput = this.checked;
            saveSettings();
        });
    }
    
    // Input 소스 토글들
    const inputCharEl = document.getElementById("nps-popup-input-char");
    if (inputCharEl) {
        inputCharEl.addEventListener("change", function() {
            if (!extension_settings[extensionName].inputSources) {
                extension_settings[extensionName].inputSources = { ...defaultSettings.inputSources };
            }
            extension_settings[extensionName].inputSources.charDescription = this.checked;
            saveSettings();
        });
    }
    
    const inputPersonaEl = document.getElementById("nps-popup-input-persona");
    if (inputPersonaEl) {
        inputPersonaEl.addEventListener("change", function() {
            if (!extension_settings[extensionName].inputSources) {
                extension_settings[extensionName].inputSources = { ...defaultSettings.inputSources };
            }
            extension_settings[extensionName].inputSources.personaDescription = this.checked;
            saveSettings();
        });
    }
    
    const inputWorldEl = document.getElementById("nps-popup-input-world");
    if (inputWorldEl) {
        inputWorldEl.addEventListener("change", function() {
            if (!extension_settings[extensionName].inputSources) {
                extension_settings[extensionName].inputSources = { ...defaultSettings.inputSources };
            }
            extension_settings[extensionName].inputSources.worldInfo = this.checked;
            saveSettings();
        });
    }
    
    const inputSummaryEl = document.getElementById("nps-popup-input-summary");
    if (inputSummaryEl) {
        inputSummaryEl.addEventListener("change", function() {
            if (!extension_settings[extensionName].inputSources) {
                extension_settings[extensionName].inputSources = { ...defaultSettings.inputSources };
            }
            extension_settings[extensionName].inputSources.scenarioSummary = this.checked;
            saveSettings();
        });
    }
    
    const inputAuEl = document.getElementById("nps-popup-input-au");
    if (inputAuEl) {
        inputAuEl.addEventListener("change", function() {
            if (!extension_settings[extensionName].inputSources) {
                extension_settings[extensionName].inputSources = { ...defaultSettings.inputSources };
            }
            extension_settings[extensionName].inputSources.auWorldBuilder = this.checked;
            saveSettings();
        });
    }
    
    // 문장 수 설정
    const sentenceCountEl = document.getElementById("nps-popup-sentence-count");
    if (sentenceCountEl) {
        sentenceCountEl.addEventListener("input", function() {
            let value = parseInt(this.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 10) value = 10;
            extension_settings[extensionName].sentenceCount = value;
            saveSettings();
        });
        sentenceCountEl.addEventListener("change", function() {
            let value = parseInt(this.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 10) value = 10;
            this.value = value;
            extension_settings[extensionName].sentenceCount = value;
            saveSettings();
        });
    }
    
    // 추천 개수 설정
    const suggestionCountEl = document.getElementById("nps-popup-suggestion-count");
    if (suggestionCountEl) {
        suggestionCountEl.addEventListener("input", function() {
            let value = parseInt(this.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 10) value = 10;
            extension_settings[extensionName].suggestionCount = value;
            saveSettings();
        });
        suggestionCountEl.addEventListener("change", function() {
            let value = parseInt(this.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 10) value = 10;
            this.value = value;
            extension_settings[extensionName].suggestionCount = value;
            saveSettings();
        });
    }
    
    // 커스텀 프롬프트
    const customPromptEl = document.getElementById("nps-popup-custom-prompt");
    if (customPromptEl) {
        customPromptEl.addEventListener("change", function() {
            extension_settings[extensionName].customPrompt = this.value;
            saveSettings();
        });
    }
    
    // API 타입 변경
    const apiTypeEl = document.getElementById("nps-popup-api-type");
    if (apiTypeEl) {
        apiTypeEl.addEventListener("change", function() {
            extension_settings[extensionName].apiType = this.value;
            updatePopupApiSettingsVisibility();
            saveSettings();
        });
    }
    
    // 연결 프로필 변경
    const connectionProfileEl = document.getElementById("nps-popup-connection-profile");
    if (connectionProfileEl) {
        connectionProfileEl.addEventListener("change", function() {
            extension_settings[extensionName].connectionProfile = this.value;
            saveSettings();
        });
    }
    
    // API 설정들
    const apiEndpointEl = document.getElementById("nps-popup-api-endpoint");
    if (apiEndpointEl) {
        apiEndpointEl.addEventListener("change", function() {
            extension_settings[extensionName].apiEndpoint = this.value;
            saveSettings();
        });
    }
    
    const apiKeyEl = document.getElementById("nps-popup-api-key");
    if (apiKeyEl) {
        apiKeyEl.addEventListener("change", function() {
            extension_settings[extensionName].apiKey = this.value;
            saveSettings();
        });
    }
    
    const apiModelEl = document.getElementById("nps-popup-api-model");
    if (apiModelEl) {
        apiModelEl.addEventListener("change", function() {
            extension_settings[extensionName].apiModel = this.value;
            saveSettings();
        });
    }
    
    // API 테스트 버튼
    const testApiBtn = document.getElementById("nps-popup-test-api");
    if (testApiBtn) {
        testApiBtn.addEventListener("click", testApiConnection);
    }
    
    // 커스텀 장르 추가
    const addGenreBtn = document.getElementById("nps-popup-add-genre-btn");
    if (addGenreBtn) {
        addGenreBtn.addEventListener("click", function() {
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
}

/**
 * 확장 메뉴에 버튼 추가
 */
function addExtensionMenuButton(retryCount = 0) {
    const MAX_RETRIES = 10;

    if (document.getElementById("nps-menu-item") && document.getElementById("nps-settings-menu-item")) {
        return;
    }

    const extensionsMenu = document.getElementById("extensionsMenu");
    if (!extensionsMenu) {
        if (retryCount < MAX_RETRIES) {
            log("extensionsMenu not found, retrying... (" + (retryCount + 1) + "/" + MAX_RETRIES + ")");
            setTimeout(() => addExtensionMenuButton(retryCount + 1), 1000);
        } else {
            console.error("[" + extensionName + "] extensionsMenu not found after " + MAX_RETRIES + " retries");
        }
        return;
    }

    // 다음 전개 추천 버튼
    if (!document.getElementById("nps-menu-item")) {
        const menuItem = document.createElement("div");
        menuItem.id = "nps-menu-item";
        menuItem.className = "list-group-item flex-container flexGap5 interactable";
        menuItem.tabIndex = 0;
        menuItem.role = "listitem";
        menuItem.innerHTML = '<div class="fa-solid fa-lightbulb extensionsMenuExtensionButton"></div>다음 전개 추천';

        menuItem.addEventListener("click", function() {
            showSuggestions();
            const menu = document.getElementById("extensionsMenu");
            if (menu) menu.style.display = "none";
        });

        extensionsMenu.appendChild(menuItem);
    }
    
    // 설정 버튼
    if (!document.getElementById("nps-settings-menu-item")) {
        const settingsMenuItem = document.createElement("div");
        settingsMenuItem.id = "nps-settings-menu-item";
        settingsMenuItem.className = "list-group-item flex-container flexGap5 interactable";
        settingsMenuItem.tabIndex = 0;
        settingsMenuItem.role = "listitem";
        settingsMenuItem.innerHTML = '<div class="fa-solid fa-gear extensionsMenuExtensionButton"></div>다음 전개 추천 설정';

        settingsMenuItem.addEventListener("click", function() {
            openSettingsPopup();
            const menu = document.getElementById("extensionsMenu");
            if (menu) menu.style.display = "none";
        });

        extensionsMenu.appendChild(settingsMenuItem);
    }
    
    log("Menu buttons added to extensionsMenu");
}

/**
 * 채팅 입력 영역에 버튼 추가
 */
function addChatButton() {
    const existingBtn = document.getElementById("nps-generate-btn");
    if (existingBtn) existingBtn.remove();
    
    const rightSendForm = document.getElementById("rightSendForm");
    if (!rightSendForm) return;
    
    const button = document.createElement("div");
    button.id = "nps-generate-btn";
    button.className = "interactable";
    button.title = "다음 전개 추천";
    button.innerHTML = '<span class="fa-solid fa-lightbulb"></span>';
    
    button.addEventListener("click", function() {
        showSuggestions();
    });
    
    rightSendForm.insertBefore(button, rightSendForm.firstChild);
}

/**
 * 설정 팝업 HTML 생성
 */
function createSettingsPopupHtml() {
    let html = '<div id="nps-settings-popup" class="nps-popup-overlay">';
    html += '<div class="nps-popup-content">';
    
    // 헤더
    html += '<div class="nps-popup-header">';
    html += '<h3>다음 전개 추천 설정</h3>';
    html += '<button id="nps-popup-close-btn" class="nps-popup-close-btn">&times;</button>';
    html += '</div>';
    
    // 바디
    html += '<div class="nps-popup-body">';
    
    // 기본 설정
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-gear"></i><span>기본 설정</span></div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-enabled">기능 활성화</label>';
    html += '<input type="checkbox" id="nps-popup-enabled">';
    html += '</div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-auto-suggest">새 메시지 시 자동 추천</label>';
    html += '<input type="checkbox" id="nps-popup-auto-suggest">';
    html += '</div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-auto-paste">입력창에 자동 붙여넣기</label>';
    html += '<input type="checkbox" id="nps-popup-auto-paste">';
    html += '</div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-sentence-count">추천 당 문장 수</label>';
    html += '<input type="number" id="nps-popup-sentence-count" min="1" max="10" value="2" class="nps-number-input">';
    html += '</div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-suggestion-count">추천 개수</label>';
    html += '<input type="number" id="nps-popup-suggestion-count" min="1" max="10" value="3" class="nps-number-input">';
    html += '</div>';
    
    html += '</div>';
    
    // Input 소스 설정
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-file-import"></i><span>Input 소스 설정</span></div>';
    html += '<p class="nps-section-desc">추천 생성 시 사용할 정보를 선택하세요.</p>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-input-char">캐릭터 설명 (Char Description)</label>';
    html += '<input type="checkbox" id="nps-popup-input-char">';
    html += '</div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-input-persona">페르소나 설명 (Persona Description)</label>';
    html += '<input type="checkbox" id="nps-popup-input-persona">';
    html += '</div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-input-world">월드 인포 (World Info Before)</label>';
    html += '<input type="checkbox" id="nps-popup-input-world">';
    html += '</div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-input-summary">시나리오 요약 (Scenario Summary)</label>';
    html += '<input type="checkbox" id="nps-popup-input-summary">';
    html += '</div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-input-au">AU 월드 빌더 (AU-World-Builder)</label>';
    html += '<input type="checkbox" id="nps-popup-input-au">';
    html += '</div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-input-chat">채팅 기록 (Chat History)</label>';
    html += '<input type="checkbox" id="nps-popup-input-chat" checked disabled>';
    html += '<span class="nps-required-badge">필수</span>';
    html += '</div>';
    
    html += '</div>';
    
    // 장르 설정
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-masks-theater"></i><span>장르/스타일 설정</span></div>';
    html += '<p class="nps-section-desc">선택한 장르가 추천 생성 시 반영됩니다.</p>';
    html += '<div id="nps-popup-default-genres" class="nps-genres-container"></div>';
    
    html += '<div class="nps-settings-section-title nps-subsection"><i class="fa-solid fa-plus"></i><span>사용자 정의 장르</span></div>';
    html += '<div id="nps-popup-custom-genres-list"></div>';
    
    html += '<div class="nps-add-genre-row">';
    html += '<input type="text" id="nps-popup-new-genre-name" placeholder="영문 이름 (예: Cyberpunk)">';
    html += '<input type="text" id="nps-popup-new-genre-name-ko" placeholder="한글 이름 (예: 사이버펑크)">';
    html += '<button id="nps-popup-add-genre-btn" class="nps-btn nps-btn-primary nps-btn-small"><i class="fa-solid fa-plus"></i> 추가</button>';
    html += '</div>';
    html += '</div>';
    
    // 추가 지시사항
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-pen"></i><span>추가 지시사항</span></div>';
    html += '<div class="nps-setting-row nps-setting-row-vertical">';
    html += '<label for="nps-popup-custom-prompt">추천 생성 시 추가할 지시사항 (선택사항)</label>';
    html += '<textarea id="nps-popup-custom-prompt" placeholder="예: 대화체로 작성해주세요, 감정 표현을 풍부하게 해주세요"></textarea>';
    html += '</div>';
    html += '</div>';
    
    // API 설정
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-plug"></i><span>API 설정</span></div>';
    
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-api-type">API 연결 방식</label>';
    html += '<select id="nps-popup-api-type">';
    html += '<option value="current">현재 연결된 API 사용</option>';
    html += '<option value="profile">프로필 선택</option>';
    html += '<option value="custom">커스텀 API 엔드포인트</option>';
    html += '</select>';
    html += '</div>';
    
    // 연결 프로필 선택 (프로필 선택 시)
    html += '<div class="nps-profile-settings">';
    html += '<div class="nps-setting-row nps-profile-row">';
    html += '<label for="nps-popup-connection-profile" class="nps-profile-label">연결 프로필</label>';
    html += '<select id="nps-popup-connection-profile">';
    html += '<option value="">프로필을 선택하세요</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';
    
    html += '<div class="nps-custom-api-settings">';
    
    html += '<div class="nps-setting-row nps-setting-row-vertical">';
    html += '<label for="nps-popup-api-endpoint">API 엔드포인트 URL</label>';
    html += '<input type="text" id="nps-popup-api-endpoint" placeholder="https://api.openai.com/v1/chat/completions">';
    html += '</div>';
    
    html += '<div class="nps-setting-row nps-setting-row-vertical">';
    html += '<label for="nps-popup-api-key">API 키</label>';
    html += '<input type="password" id="nps-popup-api-key" placeholder="sk-...">';
    html += '</div>';
    
    html += '<div class="nps-setting-row nps-setting-row-vertical">';
    html += '<label for="nps-popup-api-model">모델 이름</label>';
    html += '<input type="text" id="nps-popup-api-model" placeholder="gpt-4o-mini">';
    html += '</div>';
    
    html += '</div>';
    
    html += '<div class="nps-api-test-row">';
    html += '<button id="nps-popup-test-api" class="nps-btn nps-btn-secondary"><i class="fa-solid fa-vial"></i> API 연결 테스트</button>';
    html += '<div class="nps-api-status" id="nps-api-status">';
    html += '<span class="nps-api-status-indicator" id="nps-api-status-indicator"></span>';
    html += '<span id="nps-api-status-text"></span>';
    html += '</div>';
    html += '</div>';
    
    html += '</div>';
    
    // 사용 방법
    html += '<div class="nps-settings-section nps-section-last">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-circle-info"></i><span>사용 방법</span></div>';
    html += '<div class="nps-usage-info">';
    html += '<p><strong>수동 생성:</strong> 채팅 입력창 옆의 전구 버튼을 클릭하거나, 확장 메뉴에서 "다음 전개 추천"을 선택하세요.</p>';
    html += '<p><strong>자동 생성:</strong> "새 메시지 시 자동 추천"을 활성화하면 AI가 응답할 때마다 자동으로 추천이 생성됩니다.</p>';
    html += '<p><strong>복사:</strong> 추천 버튼을 클릭하면 해당 내용이 클립보드에 복사되고 추천 메시지가 사라집니다.</p>';
    html += '</div>';
    html += '</div>';
    
    html += '</div>'; // popup-body
    html += '</div>'; // popup-content
    html += '</div>'; // popup-overlay
    
    return html;
}

/**
 * 초기화
 */
async function init() {
    log("Extension loading...");

    loadSettings();

    // 설정 팝업 HTML 추가
    const popupHtml = createSettingsPopupHtml();
    document.body.insertAdjacentHTML("beforeend", popupHtml);
    
    // 팝업 이벤트 바인딩
    bindPopupEvents();

    // 메뉴 버튼 추가
    addExtensionMenuButton();
    
    // 채팅 버튼 추가
    addChatButton();

    log("Extension loaded successfully!");
}

// jQuery ready
jQuery(async () => {
    eventSource.on(event_types.APP_READY, async () => {
        await init();
    });
    
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
        onNewMessage(messageId);
    });
    
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        onNewMessage(messageId);
    });
});

// Export
export { extensionName };
