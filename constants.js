/**
 * 다음 전개 추천 확장 프로그램 - 상수 및 기본 설정
 * @version 1.7.0
 */

export const extensionName = "next-plot-suggester";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

/** 기본 설정 */
export const defaultSettings = {
    enabled: true,
    planningScope: "next",
    noveltyPolicy: "organic",
    pinnedContext: "",
    requestTimeoutMs: 120000,
    autoSuggest: false,
    autoSuggestDelay: 1000,
    autoPasteToInput: false,
    showInputButton: true,
    outputLanguage: "ko",
    sentenceCount: 2,
    suggestionCount: 3,
    selectedGenres: [],
    customGenres: [],
    customPrompt: "",
    inputSources: {
        charDescription: true,
        personaDescription: false,
        worldInfo: false,
        scenarioSummary: false,
        auWorldBuilder: false,
        chatHistory: true
    },
    apiType: "current",
    connectionProfile: "",
    llmProvider: "openai",
    llmModel: "gpt-5.2",
    apiEndpoint: "",
    apiKey: "",
    apiModel: "",
    qualityPrompts: {
        literaryStyle: true,
        conciseReport: false,
        screenplayStyle: false,
        lightNovel: false,
        poeticStyle: false,
        casualChat: false
    },
    selectedWritingStyle: "conciseReport",
    qualityEnhancements: {
        subtext: false,
        figurative: false,
        deepPOV: false,
        proseRhythm: false,
        concise: false
    },
    customQualityPrompts: [],
    useCustomDirection: false,
    moodSettings: {
        enabled: false,
        selectedMood: "",
        sceneAtmosphere: "",
        sensoryFocus: [],
        emotionalIntensity: 5
    },
    // v1.3.0: 생성 파라미터
    temperature: 0.8,
    maxTokens: 2400,
    // v1.3.0: 토큰/컨텍스트
    maxContextTokens: 8000,
    // v1.3.0: JSON 구조화 출력
    useJsonMode: true,
    // v1.3.0: 캐싱
    enableCache: true,
    // v1.4.0: 네거티브 프롬프트
    negativePrompt: "",
    // v1.5.0: 플롯 세분화
    plotBeats: [],
    // v1.5.1: 프리뷰 모드
    previewMode: false,
    previewCount: 5,
    // v1.5.2: 프롬프트 압축
    enableCompression: true,
    compressionThreshold: 20,
    narrativeArc: { autoDetect: false, manualStage: "" },
    focusTarget: { type: "auto", characterName: "", customFocus: "" },
    suggestionSpectrum: false,
    emotionCurve: { enabled: false, currentEmotion: "", targetEmotion: "", transitionSpeed: "gradual" },
    pacingEnabled: false,
    pacing: { timeframe: "immediate", speed: 5 },
    dialogueRatio: 5,
    includeInnerThought: false,
    includeEnvironment: false,
    // v1.7.0: 유사도 필터
    similarityThreshold: 0.6,
    // v1.7.0: 추천 길이 슬라이더
    suggestionLength: 5,
    // v1.7.0: 창의성 수준
    creativityLevel: 5,
    // v1.7.0: 설정 프로필
    settingsProfiles: [],
    // v1.7.0: 조건부 규칙 (If-Then)
    conditionalRules: [],
    // v1.7.0: 퀵 템플릿
    quickTemplates: [],
    // v1.7.0: 피드백 히스토리
    negativeFeedbackKeywords: [],
    schemaVersion: 2,
    generationMode: "quality",
    candidateCount: 6,
    outputMode: "outline",
    useStoryMemory: true,
    feedbackRecords: [],
    sceneLocks: { noNewCharacters: false, keepLocation: false, noTimeSkip: false, userAgency: true, custom: "" }
};

/** 기본 퀄리티 프롬프트 — 문체/스타일 선택 (v1.8.0: 6종) */
export const defaultQualityPrompts = {
    literaryStyle: {
        id: "literaryStyle",
        name: "문학적 산문",
        nameEn: "Literary Prose",
        icon: "fa-feather-pointed",
        prompt: "Write polished literary prose with precise, selective imagery. Reveal psychological depth through perception, behavior, choice, and subtext rather than explanatory labels. Use only sensory details that sharpen the conflict or emotional turn; do not inventory all five senses. Prefer fresh concrete language, controlled rhythm, and one telling image over purple prose or stacked metaphors. Causality and scene movement remain clear."
    },
    conciseReport: {
        id: "conciseReport",
        name: "요약/리포트",
        nameEn: "Concise Report",
        icon: "fa-file-lines",
        prompt: "Write a concise, high-information development summary. Preserve the specific trigger, motive, decisive action, immediate consequence, and changed story state. Use strong verbs and concrete nouns; remove filler, vague evaluation, and decorative description. Brevity must not collapse the causal chain into a generic one-line premise."
    },
    screenplayStyle: {
        id: "screenplayStyle",
        name: "각본/시나리오",
        nameEn: "Screenplay",
        icon: "fa-clapperboard",
        prompt: "Write with screenplay-like immediacy: playable actions, observable reactions, purposeful blocking, and dialogue whose wording changes the situation. Let behavior and subtext carry emotion; avoid camera directions, screenplay headers, exposition speeches, and dialogue that only restates known facts. Keep scene-setting brief and functional."
    },
    lightNovel: {
        id: "lightNovel",
        name: "라이트노벨",
        nameEn: "Light Novel",
        icon: "fa-book-open",
        prompt: "Write accessible, character-driven light-novel prose with a close viewpoint, clean momentum, vivid but brief description, and dialogue shaped by each character's established voice. Use inner commentary, humor, or heightened reactions only when the current tone supports them; do not force comedy, stock anime mannerisms, or generic banter."
    },
    poeticStyle: {
        id: "poeticStyle",
        name: "시적/서정적",
        nameEn: "Poetic / Lyrical",
        icon: "fa-pen-nib",
        prompt: "Write lyrical but disciplined prose. Let cadence and one or two concrete images intensify the scene's decisive emotional turn. Metaphor must arise from the viewpoint and setting, not decorate every sentence. Never obscure who acts, why, what changes, or the immediate consequence; emotional resonance should deepen the plot movement rather than replace it."
    },
    casualChat: {
        id: "casualChat",
        name: "일상 대화체",
        nameEn: "Casual / Chatty",
        icon: "fa-comments",
        prompt: "Write in a natural, unforced conversational register. Give each character distinct diction based on the supplied material; use slang, fragments, and informality only when they fit that speaker. Keep narration light and concrete. Avoid filler banter, generic modern slang, and voices that all sound alike."
    }
};

/** 기본 분위기 프롬프트 */
export const defaultMoods = [
    { id: "hopeful", name: "희망적/긍정적", nameEn: "Hopeful/Positive", prompt: "Shape the consequence toward earned hope: a believable opening, repaired connection, demonstrated competence, or chosen commitment. Preserve existing difficulty and cost; do not solve problems through luck or compulsory cheerfulness." },
    { id: "dark", name: "어둡고 절망적", nameEn: "Dark/Desperate", prompt: "Emphasize the credible cost of existing pressures: narrowed options, compromised values, isolation, or a difficult truth. Darkness must follow from character choices and established conditions; do not add arbitrary betrayal, cruelty, tragedy, or hopelessness." },
    { id: "mysterious", name: "신비롭고 미스터리", nameEn: "Mysterious", prompt: "Create intrigue by making an established detail inconsistent, newly meaningful, or incomplete. Let a character pursue a testable question. Do not invent a hidden secret, cryptic stranger, supernatural event, or unexplained clue unless the source already supports it." },
    { id: "romantic", name: "로맨틱/감성적", nameEn: "Romantic/Emotional", prompt: "Develop intimacy or romantic tension through a concrete choice, boundary, act of care, risk, or vulnerable exchange. Preserve each character's agency and current relationship state; do not assume mutual attraction, force a confession, or rely only on meaningful glances." },
    { id: "tense", name: "긴장감/서스펜스", nameEn: "Tense/Suspenseful", prompt: "Build suspense from incomplete knowledge, a deadline, exposure risk, conflicting goals, or a costly choice already latent in the scene. Escalate through consequences and narrowing options, not an unsupported attack, chase, accident, or sudden threat." },
    { id: "comedic", name: "유머러스/코믹", nameEn: "Humorous/Comedic", prompt: "Let humor emerge from established personality, mismatched goals, social friction, timing, or an action's unintended consequence. The joke should reveal character or alter the situation; avoid random gags, humiliation without purpose, and interchangeable quips." },
    { id: "melancholic", name: "우울/감상적", nameEn: "Melancholic/Wistful", prompt: "Create bittersweet weight through a present choice shaped by loss, distance, memory, or an ending already supported by the story. Reflection must change what a character accepts, refuses, preserves, or does next; avoid static sadness and generic nostalgia." },
    { id: "epic", name: "웅장/서사적", nameEn: "Epic/Grand", prompt: "Give the current choice a sense of scale through accumulated consequence, sacrifice, public meaning, or commitment. Scale is relative to the established story; do not inflate a personal scene into a world-ending event or invent armies, prophecies, and spectacle." }
];

/** 전개 유형 (Feature 1) */
export const plotBeats = [
    { id: "transition", name: "전환", nameEn: "Transition", icon: "fa-right-left", desc: "장면/분위기 전환점" },
    { id: "deepen", name: "심화", nameEn: "Deepen", icon: "fa-arrow-down", desc: "현재 상황을 더 깊이" },
    { id: "twist", name: "반전", nameEn: "Twist", icon: "fa-shuffle", desc: "예상을 뒤집는 전개" },
    { id: "resolve", name: "해소", nameEn: "Resolution", icon: "fa-check-circle", desc: "갈등/긴장의 해소" },
    { id: "foreshadow", name: "복선", nameEn: "Foreshadow", icon: "fa-eye", desc: "나중을 위한 떡밥/암시" },
    { id: "daily", name: "일상", nameEn: "Daily Life", icon: "fa-mug-hot", desc: "자연스러운 교류" },
    { id: "escalate", name: "위기 고조", nameEn: "Escalation", icon: "fa-fire", desc: "스테이크를 높이는 전개" },
    { id: "introspect", name: "회상/내면", nameEn: "Introspection", icon: "fa-brain", desc: "캐릭터의 내면 묘사" }
];

/** v1.6.0: 플롯 비트 프리셋 — 장르별 비트 조합 */
export const plotBeatPresets = [
    { id: "mystery", name: "미스터리", icon: "fa-magnifying-glass", beats: ["twist", "foreshadow", "introspect"] },
    { id: "romance", name: "로맨스", icon: "fa-heart", beats: ["deepen", "daily", "introspect"] },
    { id: "battle", name: "배틀/액션", icon: "fa-hand-fist", beats: ["escalate", "transition", "resolve"] },
    { id: "drama", name: "드라마", icon: "fa-masks-theater", beats: ["deepen", "introspect", "resolve"] },
    { id: "horror", name: "호러", icon: "fa-ghost", beats: ["escalate", "foreshadow", "twist"] },
    { id: "slice", name: "일상", icon: "fa-mug-hot", beats: ["daily", "deepen"] },
    { id: "adventure", name: "모험", icon: "fa-mountain-sun", beats: ["transition", "escalate", "foreshadow"] },
    { id: "thriller", name: "스릴러", icon: "fa-bolt", beats: ["escalate", "twist", "foreshadow"] }
];

/** 서사 단계 (Feature 2) */
export const narrativeStages = [
    { id: "intro", name: "도입", nameEn: "Introduction" },
    { id: "rising", name: "전개", nameEn: "Rising Action" },
    { id: "crisis", name: "위기", nameEn: "Crisis" },
    { id: "climax", name: "절정", nameEn: "Climax" },
    { id: "falling", name: "결말", nameEn: "Falling Action" }
];

/** 감정 목록 (Feature 7) */
export const emotions = [
    { id: "joy", name: "기쁨/행복" },
    { id: "sadness", name: "슬픔/우울" },
    { id: "anger", name: "분노/짜증" },
    { id: "fear", name: "공포/불안" },
    { id: "surprise", name: "놀라움/충격" },
    { id: "love", name: "사랑/애정" },
    { id: "tension", name: "긴장/초조" },
    { id: "calm", name: "평온/안도" },
    { id: "hope", name: "희망/기대" },
    { id: "despair", name: "절망/무력감" },
    { id: "curiosity", name: "호기심/궁금" },
    { id: "nostalgia", name: "향수/그리움" }
];

/** 기본 장르 목록 */
export const defaultGenres = [
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

/** 조건부 규칙 프리셋 (v1.8.0) */
export const conditionalRulePresets = [
    { label: "위기 대응", icon: "fa-shield-halved", condition: "캐릭터가 위험에 처하면", action: "기존 능력·관계·환경을 활용한 선택을 만들고, 구조나 탈출에는 대가와 이후의 관계 변화를 남긴다" },
    { label: "소강 전환", icon: "fa-bolt", condition: "대화가 소강 상태일 때", action: "새 사건을 투입하기보다 회피하던 쟁점·미완의 행동·관계의 경계를 한 인물의 구체적 선택으로 움직인다" },
    { label: "로맨스 심화", icon: "fa-heart-crack", condition: "로맨스 분위기가 무르익으면", action: "억지 방해물 대신 취약성·경계·상충하는 목표·감수할 대가를 드러내 관계 상태를 실제로 바꾼다" },
    { label: "전투 전환", icon: "fa-burst", condition: "전투/액션 중이면", action: "새 적을 추가하지 않고 기존 공간·목표·부상·자원의 의미를 바꾸는 선택으로 전세와 비용을 함께 변화시킨다" },
    { label: "인물 정착", icon: "fa-user-plus", condition: "새로운 캐릭터가 등장하면", action: "설명식 소개 대신 즉각적인 목표와 행동으로 기존 인물과의 역할·이해관계·긴장을 확정한다" },
    { label: "절정 회수", icon: "fa-fire-flame-curved", condition: "이야기가 절정에 다다르면", action: "새로운 반전보다 누적된 선택과 복선을 결정적 행동으로 회수하고 되돌릴 수 없는 결과를 만든다" }
];

/** 퀄리티 강화 옵션 (v1.8.0) — 문장 기법/글쓰기 기술 (전개 유형과 겹치지 않는 순수 필력 향상) */
export const qualityEnhancements = [
    { id: "subtext", name: "서브텍스트 활용", nameEn: "Subtext & Implication", icon: "fa-mask", prompt: "Use subtext at the scene's pressure points. Let wording, omission, timing, or body language reveal a supported want or conflict without making every line cryptic. The subtext should affect interpretation or choice, not merely add vagueness." },
    { id: "figurative", name: "비유/수사법", nameEn: "Figurative Language", icon: "fa-feather-pointed", prompt: "Use a small number of fresh, viewpoint-specific metaphors or comparisons where they clarify emotion or sharpen the turn. Avoid clichés, mixed metaphors, decorative personification, and imagery that obscures concrete action." },
    { id: "deepPOV", name: "시점 몰입 강화", nameEn: "Deep POV Immersion", icon: "fa-street-view", prompt: "Keep perception inside the established viewpoint and its knowledge limits. Select details according to that character's immediate goal, bias, and emotional pressure; let interpretation remain fallible. Avoid omniscient explanation, mind-reading other characters, and generic emotion filters." },
    { id: "proseRhythm", name: "문장 리듬 변화", nameEn: "Prose Rhythm Variety", icon: "fa-wave-square", prompt: "Vary sentence rhythm deliberately. Alternate short, punchy fragments with longer, flowing sentences. Use sentence length to control pacing — staccato for tension, flowing for calm. Avoid monotonous sentence patterns. Let the prose itself breathe and pulse." },
    { id: "concise", name: "간결함 우선", nameEn: "Concise Writing", icon: "fa-scissors", prompt: "Prioritize concise, tight prose. Every word must earn its place. Cut filler words, redundant descriptions, and unnecessary qualifiers. Favor strong verbs over adverb-adjective combinations. Deliver maximum impact with minimum word count." }
];

/** 장면 분위기 선택지 (v1.8.0) */
export const sceneAtmospheres = [
    { id: "none", name: "선택 안 함", icon: "fa-circle-xmark" },
    { id: "cozy", name: "아늑하고 포근한", icon: "fa-mug-hot", prompt: "Render the established setting as warm and sheltered through a few available details. Use comfort to enable honesty, trust, or a lowered guard; do not invent a new cozy location or erase unresolved tension." },
    { id: "eerie", name: "서늘하고 불길한", icon: "fa-ghost", prompt: "Make an existing ordinary detail feel subtly wrong because of context, absence, repetition, or character knowledge. Keep the disturbance explainable within established reality unless supernatural rules already exist." },
    { id: "grandiose", name: "웅장하고 장엄한", icon: "fa-mountain-sun", prompt: "Find awe in the established scale, history, ritual, collective attention, or personal significance of the setting. Do not invent vast scenery or phenomena that are not present." },
    { id: "claustrophobic", name: "폐쇄적/압박감", icon: "fa-lock", prompt: "Use established physical or social constraints to narrow movement, privacy, time, or conversational escape. Do not conjure a literal trap when the setting does not support one." },
    { id: "dreamlike", name: "몽환적/초현실", icon: "fa-cloud-moon", prompt: "Create a dreamlike surface through subjective perception, rhythm, association, and established sensory details while keeping events and world rules causally coherent. Do not blur reality into an unsupported dream or hallucination." },
    { id: "festive", name: "화기애애/축제", icon: "fa-champagne-glasses", prompt: "Use an established gathering, ritual, shared activity, or social energy to create liveliness. Let public mood complicate or expose private goals; do not invent a crowd or celebration when none exists." }
];

/** 감각 포커스 선택지 (v1.8.0) */
export const sensoryOptions = [
    { id: "visual", name: "시각", icon: "fa-eye", prompt: "Use one or two established visual details—movement, expression, light, spatial relation—that reveal intention or sharpen the turn. Do not pause for a visual inventory." },
    { id: "auditory", name: "청각", icon: "fa-ear-listen", prompt: "Use one or two meaningful sounds—tone, pause, ambient change, silence—that affect attention or interpretation. Do not add decorative soundscape." },
    { id: "tactile", name: "촉각", icon: "fa-hand", prompt: "Use touch, texture, temperature, pain, or comfort only where physically available and emotionally consequential. Preserve boundaries and agency around contact." },
    { id: "olfactory", name: "후각/미각", icon: "fa-wind", prompt: "Use smell or taste selectively when grounded in the setting and capable of triggering recognition, memory, appetite, disgust, or another scene-relevant response." },
    { id: "emotional", name: "감정/내면", icon: "fa-heart-pulse", prompt: "Render emotion as a specific perception, impulse, conflict, or bodily response that shapes the next choice. Avoid naming the same feeling repeatedly or substituting introspection for action." }
];

/** 언어별 프롬프트 설정 */
export const langConfig = {
    ko: {
        langName: "Korean",
        langNative: "한국어",
        first: "첫 번째 추천 - 한국어로 작성",
        second: "두 번째 추천 - 한국어로 작성",
        third: "세 번째 추천 - 한국어로 작성"
    },
    en: {
        langName: "English",
        langNative: "English",
        first: "First suggestion - Write in English",
        second: "Second suggestion - Write in English",
        third: "Third suggestion - Write in English"
    },
    ja: {
        langName: "Japanese",
        langNative: "日本語",
        first: "最初の提案 - 日本語で書く",
        second: "2番目の提案 - 日本語で書く",
        third: "3番目の提案 - 日本語で書く"
    }
};
