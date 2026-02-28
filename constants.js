/**
 * 다음 전개 추천 확장 프로그램 - 상수 및 기본 설정
 * @version 1.7.0
 */

export const extensionName = "next-plot-suggester";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

/** 기본 설정 */
export const defaultSettings = {
    enabled: true,
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
        charDescription: false,
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
    selectedWritingStyle: "literaryStyle",
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
    maxTokens: 1000,
    // v1.3.0: 토큰/컨텍스트
    maxContextTokens: 4000,
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
    narrativeArc: { autoDetect: true, manualStage: "" },
    focusTarget: { type: "auto", characterName: "", customFocus: "" },
    suggestionSpectrum: true,
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
    negativeFeedbackKeywords: []
};

/** 기본 퀄리티 프롬프트 — 문체/스타일 선택 (v1.8.0: 6종) */
export const defaultQualityPrompts = {
    literaryStyle: {
        id: "literaryStyle",
        name: "문학적 산문",
        nameEn: "Literary Prose",
        icon: "fa-feather-pointed",
        prompt: "Write with rich literary prose and vivid imagery. Create multi-dimensional characters with complex emotions, internal conflicts, and nuanced psychological depth. Include sensory details (sight, sound, smell, touch, taste), metaphors, and show rather than tell. Use varied sentence structures — mix short punchy sentences with longer flowing ones to create rhythm."
    },
    conciseReport: {
        id: "conciseReport",
        name: "요약/리포트",
        nameEn: "Concise Report",
        icon: "fa-file-lines",
        prompt: "Write in a concise, report-style format. Focus on what happens, to whom, and the key outcome. Strip away flowery language — be direct, clear, and informative. Use short declarative sentences. Prioritize plot-relevant actions and decisions over description or internal monologue."
    },
    screenplayStyle: {
        id: "screenplayStyle",
        name: "각본/시나리오",
        nameEn: "Screenplay",
        icon: "fa-clapperboard",
        prompt: "Write in a screenplay-like style. Emphasize sharp, natural-sounding dialogue and concise action lines. Describe character actions and reactions visually — as a camera would capture them. Minimize internal narration; let behavior, expression, and dialogue convey emotions. Include brief scene-setting descriptions."
    },
    lightNovel: {
        id: "lightNovel",
        name: "라이트노벨",
        nameEn: "Light Novel",
        icon: "fa-book-open",
        prompt: "Write in a light novel style — conversational, energetic, and character-driven. Use first-person or close third-person perspective with casual inner monologue. Include comedic timing, exaggerated reactions, and snappy dialogue. Keep descriptions brief but vivid. The tone should feel like a fun, engaging read."
    },
    poeticStyle: {
        id: "poeticStyle",
        name: "시적/서정적",
        nameEn: "Poetic / Lyrical",
        icon: "fa-pen-nib",
        prompt: "Write with a poetic, lyrical quality. Use evocative imagery, metaphor, and rhythmic language. Prioritize emotional resonance and atmosphere over plot mechanics. Let descriptions linger on beauty, pain, or wonder. Sentences should flow musically — pay attention to cadence, alliteration, and the sound of words."
    },
    casualChat: {
        id: "casualChat",
        name: "일상 대화체",
        nameEn: "Casual / Chatty",
        icon: "fa-comments",
        prompt: "Write in a casual, everyday conversational tone. Characters speak naturally with contractions, slang, and incomplete sentences. Keep narration light and informal, as if telling a friend what happened. Avoid formality or literary flourish — prioritize relatability and natural flow."
    }
};

/** 기본 분위기 프롬프트 */
export const defaultMoods = [
    { id: "hopeful", name: "희망적/긍정적", nameEn: "Hopeful/Positive", prompt: "Create an uplifting, optimistic atmosphere. Focus on hope, joy, warmth, and positive developments. Characters should experience moments of happiness, connection, or triumph. Include heartwarming interactions and silver linings even in difficult situations. Let the optimism feel earned rather than naive." },
    { id: "dark", name: "어둡고 절망적", nameEn: "Dark/Desperate", prompt: "Create a dark, heavy atmosphere filled with despair or tension. Focus on struggles, losses, moral dilemmas, or overwhelming challenges. Characters may face difficult truths, betrayals, or seemingly hopeless situations. Emphasize emotional weight and dramatic tension. Use environmental and sensory details to reinforce the oppressive mood." },
    { id: "mysterious", name: "신비롭고 미스터리", nameEn: "Mysterious", prompt: "Create an atmosphere of mystery and intrigue. Include unexplained events, hidden secrets, cryptic hints, or subtle supernatural elements. Keep readers guessing with ambiguous details and skillful foreshadowing. Plant seeds of questions that beg to be answered. Maintain an air of the unknown without resorting to cheap confusion." },
    { id: "romantic", name: "로맨틱/감성적", nameEn: "Romantic/Emotional", prompt: "Create a romantic, emotionally charged atmosphere. Focus on deep feelings, intimate moments, meaningful glances, and heart-fluttering interactions. Emphasize emotional vulnerability, attraction, and the development of romantic bonds. Use subtext — what characters don't say can be as powerful as what they do." },
    { id: "tense", name: "긴장감/서스펜스", nameEn: "Tense/Suspenseful", prompt: "Create a tense, suspenseful atmosphere. Build anticipation and anxiety through pacing, uncertain outcomes, and high stakes. Include moments of danger, close calls, or psychological pressure. Use dramatic irony — let the reader sense danger the characters may not. Keep the tension palpable throughout." },
    { id: "comedic", name: "유머러스/코믹", nameEn: "Humorous/Comedic", prompt: "Create a light-hearted, humorous atmosphere. Include witty dialogue, situational irony, comedic timing, and playful interactions. Focus on fun, laughter, and entertaining moments while maintaining character authenticity. Humor should arise naturally from character personalities and situations, not forced gags." },
    { id: "melancholic", name: "우울/감상적", nameEn: "Melancholic/Wistful", prompt: "Create a melancholic, reflective atmosphere. Focus on bittersweet moments, nostalgia, loss, or quiet sadness. Characters may contemplate the past, missed opportunities, or the passage of time. Emphasize emotional depth and poignant beauty. Mix sorrow with glimpses of tenderness to avoid monotone bleakness." },
    { id: "epic", name: "웅장/서사적", nameEn: "Epic/Grand", prompt: "Create an epic, grand atmosphere. Focus on momentous events, heroic actions, or pivotal turning points. Include sweeping descriptions, dramatic confrontations, and a sense of historical significance. Make the stakes feel world-changing while keeping individual character stakes personal and relatable." }
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
    { label: "위기 구출", icon: "fa-shield-halved", condition: "캐릭터가 위험에 처하면", action: "구출 장면 또는 긴박한 탈출 제안" },
    { label: "소강 타파", icon: "fa-bolt", condition: "대화가 소강 상태일 때", action: "예상치 못한 이벤트로 긴장감 생성" },
    { label: "로맨스 견제", icon: "fa-heart-crack", condition: "로맨스 분위기가 무르익으면", action: "역전/방해 요소로 긴장감 조성" },
    { label: "전투 전환", icon: "fa-burst", condition: "전투/액션 중이면", action: "전세 역전 또는 새로운 위협 등장" },
    { label: "인물 등장", icon: "fa-user-plus", condition: "새로운 캐릭터가 등장하면", action: "캐릭터 소개 및 관계 설정 전개" },
    { label: "절정 극대화", icon: "fa-fire-flame-curved", condition: "이야기가 절정에 다다르면", action: "클라이막스에 걸맞은 극적 전개 제안" }
];

/** 퀄리티 강화 옵션 (v1.8.0) — 문장 기법/글쓰기 기술 (전개 유형과 겹치지 않는 순수 필력 향상) */
export const qualityEnhancements = [
    { id: "subtext", name: "서브텍스트 활용", nameEn: "Subtext & Implication", icon: "fa-mask", prompt: "Layer every interaction with subtext. What characters say should carry hidden meaning beneath the surface. Use implication, loaded silences, double meanings, and body language that contradicts spoken words. The reader should sense unspoken tensions, desires, and agendas." },
    { id: "figurative", name: "비유/수사법", nameEn: "Figurative Language", icon: "fa-feather-pointed", prompt: "Enrich the prose with vivid figurative language. Use fresh metaphors, similes, and personification. Avoid clichéd comparisons. Let abstract concepts be expressed through concrete, unexpected imagery that deepens the reader's emotional connection." },
    { id: "deepPOV", name: "시점 몰입 강화", nameEn: "Deep POV Immersion", icon: "fa-street-view", prompt: "Write in deep point-of-view. Filter every description through the POV character's perception, biases, and emotional state. Avoid omniscient narrator intrusions. The world should feel colored by the character's psychology — a scared character notices threats, a lover notices beauty." },
    { id: "proseRhythm", name: "문장 리듬 변화", nameEn: "Prose Rhythm Variety", icon: "fa-wave-square", prompt: "Vary sentence rhythm deliberately. Alternate short, punchy fragments with longer, flowing sentences. Use sentence length to control pacing — staccato for tension, flowing for calm. Avoid monotonous sentence patterns. Let the prose itself breathe and pulse." },
    { id: "concise", name: "간결함 우선", nameEn: "Concise Writing", icon: "fa-scissors", prompt: "Prioritize concise, tight prose. Every word must earn its place. Cut filler words, redundant descriptions, and unnecessary qualifiers. Favor strong verbs over adverb-adjective combinations. Deliver maximum impact with minimum word count." }
];

/** 장면 분위기 선택지 (v1.8.0) */
export const sceneAtmospheres = [
    { id: "none", name: "선택 안 함", icon: "fa-circle-xmark" },
    { id: "cozy", name: "아늑하고 포근한", icon: "fa-mug-hot", prompt: "Create a cozy, warm setting — soft lighting, comfortable surroundings, a sense of safety and intimacy." },
    { id: "eerie", name: "서늘하고 불길한", icon: "fa-ghost", prompt: "Create an eerie, unsettling atmosphere — something feels wrong. Subtle disturbances, unexplained details, creeping unease." },
    { id: "grandiose", name: "웅장하고 장엄한", icon: "fa-mountain-sun", prompt: "Create a grand, awe-inspiring setting — vast landscapes, towering structures, or breathtaking natural phenomena." },
    { id: "claustrophobic", name: "폐쇄적/압박감", icon: "fa-lock", prompt: "Create a claustrophobic, pressured atmosphere — confined spaces, no escape routes, walls closing in." },
    { id: "dreamlike", name: "몽환적/초현실", icon: "fa-cloud-moon", prompt: "Create a dreamlike, surreal atmosphere — blurred boundaries between real and imagined, symbolic imagery, fluid logic." },
    { id: "festive", name: "화기애애/축제", icon: "fa-champagne-glasses", prompt: "Create a festive, lively setting — celebrations, crowds, music, energy, and social interaction." }
];

/** 감각 포커스 선택지 (v1.8.0) */
export const sensoryOptions = [
    { id: "visual", name: "시각", icon: "fa-eye", prompt: "Emphasize visual details: colors, lighting, movement, facial expressions, body language." },
    { id: "auditory", name: "청각", icon: "fa-ear-listen", prompt: "Emphasize sounds: dialogue tone, ambient noise, music, silence, echoes." },
    { id: "tactile", name: "촉각", icon: "fa-hand", prompt: "Emphasize touch: textures, temperature, physical contact, pain, comfort." },
    { id: "olfactory", name: "후각/미각", icon: "fa-wind", prompt: "Emphasize smell and taste: scents, flavors, the atmosphere they create." },
    { id: "emotional", name: "감정/내면", icon: "fa-heart-pulse", prompt: "Emphasize emotional and psychological sensations: internal feelings, gut reactions, emotional undercurrents." }
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
