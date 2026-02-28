/**
 * 다음 전개 추천 확장 프로그램 - HTML 생성
 * (ui.js에서 분리)
 *
 * 설정 팝업, 추천 메시지, 프리뷰 메시지 HTML 생성
 */
import {
    defaultQualityPrompts, defaultMoods, defaultGenres, plotBeats, plotBeatPresets,
    narrativeStages, emotions, conditionalRulePresets, sceneAtmospheres,
    sensoryOptions, qualityEnhancements
} from "./constants.js";
import { escapeHtml, escapeAttr } from "./utils.js";

// ═══════════════════════════════════════════
// 추천 결과 HTML 생성
// ═══════════════════════════════════════════

/** 추천 메시지 HTML 생성 */
export function createSuggestionMessageHtml(suggestions) {
    let itemsHtml = "";
    suggestions.forEach((suggestion, index) => {
        const safeText = escapeHtml(suggestion);
        const safeAttr = escapeAttr(suggestion);
        itemsHtml += '<div class="nps-suggestion-item" draggable="true" data-suggestion="' + safeAttr + '" data-index="' + index + '">';
        itemsHtml += '<input type="checkbox" class="nps-merge-checkbox" data-index="' + index + '" title="합치기에 선택">';
        itemsHtml += '<div class="nps-drag-handle" title="드래그하여 순서 변경"><i class="fa-solid fa-grip-vertical"></i></div>';
        itemsHtml += '<div class="nps-suggestion-content" data-action="copy" data-index="' + index + '">';
        itemsHtml += '<span class="nps-suggestion-number">' + (index + 1) + '</span>';
        itemsHtml += '<span class="nps-suggestion-text">' + safeText + '</span>';
        itemsHtml += '</div>';
        itemsHtml += '<div class="nps-suggestion-actions">';
        itemsHtml += '<button class="nps-action-btn nps-copy-action" data-action="copy" data-index="' + index + '" title="복사"><i class="fa-solid fa-copy"></i></button>';
        itemsHtml += '<button class="nps-action-btn nps-send-action" data-action="send" data-index="' + index + '" title="바로 보내기"><i class="fa-solid fa-paper-plane"></i></button>';
        itemsHtml += '<button class="nps-action-btn nps-edit-action" data-action="edit" data-index="' + index + '" title="편집"><i class="fa-solid fa-pen"></i></button>';
        itemsHtml += '<button class="nps-action-btn nps-feedback-action" data-action="feedback-negative" data-index="' + index + '" title="이건 아니야 (피드백)"><i class="fa-solid fa-thumbs-down"></i></button>';
        itemsHtml += '</div>';
        itemsHtml += '<div class="nps-edit-wrapper">';
        itemsHtml += '<textarea class="nps-edit-textarea">' + safeText + '</textarea>';
        itemsHtml += '<div class="nps-edit-actions">';
        itemsHtml += '<button class="nps-action-btn nps-edit-confirm" data-action="edit-copy" data-index="' + index + '"><i class="fa-solid fa-copy"></i> 복사</button>';
        itemsHtml += '<button class="nps-action-btn nps-edit-confirm" data-action="edit-send" data-index="' + index + '"><i class="fa-solid fa-paper-plane"></i> 보내기</button>';
        itemsHtml += '<button class="nps-action-btn nps-edit-cancel-btn" data-action="edit-cancel" data-index="' + index + '"><i class="fa-solid fa-times"></i> 취소</button>';
        itemsHtml += '</div>';
        itemsHtml += '</div>';
        itemsHtml += '</div>';
    });

    let html = '<div class="nps-suggestion-container">';
    html += '<div class="nps-suggestion-header">';
    html += '<span class="nps-suggestion-title">다음 전개 추천</span>';
    html += '<button class="nps-close-btn" data-action="close" title="닫기">&times;</button>';
    html += '</div>';
    html += '<div class="nps-suggestion-buttons">' + itemsHtml + '</div>';
    html += '<div class="nps-suggestion-footer">';
    html += '<button class="nps-merge-btn" data-action="merge" title="선택한 추천 합치기"><i class="fa-solid fa-code-merge"></i> 합치기</button>';
    html += '<button class="nps-regenerate-btn" data-action="regenerate" title="다시 생성">다시 생성</button>';
    html += '</div>';
    html += '</div>';
    return html;
}

/** 프리뷰 메시지 HTML 생성 */
export function createPreviewMessageHtml(previews) {
    let itemsHtml = "";
    previews.forEach((preview, index) => {
        const safeText = escapeHtml(preview);
        const safeAttr = escapeAttr(preview);
        itemsHtml += '<div class="nps-preview-item" data-preview="' + safeAttr + '" data-index="' + index + '">';
        itemsHtml += '<span class="nps-preview-number">' + (index + 1) + '</span>';
        itemsHtml += '<span class="nps-preview-text">' + safeText + '</span>';
        itemsHtml += '<button class="nps-preview-select-btn" data-action="select-preview" data-index="' + index + '" title="이 방향으로 생성"><i class="fa-solid fa-chevron-right"></i></button>';
        itemsHtml += '</div>';
    });

    let html = '<div class="nps-preview-container">';
    html += '<div class="nps-suggestion-header">';
    html += '<span class="nps-suggestion-title"><i class="fa-solid fa-eye"></i> 전개 방향 프리뷰</span>';
    html += '<button class="nps-close-btn" data-action="close" title="닫기">&times;</button>';
    html += '</div>';
    html += '<p class="nps-preview-desc">마음에 드는 방향을 선택하면 해당 방향으로 본격적으로 추천이 생성됩니다.</p>';
    html += '<div class="nps-preview-list">' + itemsHtml + '</div>';
    html += '<div class="nps-suggestion-footer">';
    html += '<button class="nps-regenerate-btn" data-action="regenerate-preview" title="다시 생성">다시 생성</button>';
    html += '</div>';
    html += '</div>';
    return html;
}

// ═══════════════════════════════════════════
// 설정 팝업 HTML 생성
// ═══════════════════════════════════════════

export function createSettingsPopupHtml() {
    let html = '<div id="nps-settings-popup">';
    html += '<div class="nps-popup-overlay-bg" id="nps-popup-overlay-bg"></div>';
    html += '<div class="nps-popup-content">';

    // 헤더
    html += '<div class="nps-popup-header">';
    html += '<h3>다음 전개 추천 설정</h3>';
    html += '<button id="nps-popup-close-btn" class="nps-popup-close-btn">&times;</button>';
    html += '</div>';

    // 바디
    html += '<div class="nps-popup-body">';

    // 탭
    html += '<div class="nps-tabs">';
    html += '<button class="nps-tab-btn active" data-tab="general"><i class="fa-solid fa-gear"></i> 일반</button>';
    html += '<button class="nps-tab-btn" data-tab="quality"><i class="fa-solid fa-wand-magic-sparkles"></i> 퀄리티</button>';
    html += '<button class="nps-tab-btn" data-tab="mood"><i class="fa-solid fa-cloud-sun"></i> 분위기</button>';
    html += '<button class="nps-tab-btn" data-tab="plot"><i class="fa-solid fa-compass"></i> 플롯</button>';
    html += '<button class="nps-tab-btn" data-tab="api"><i class="fa-solid fa-plug"></i> API</button>';
    html += '</div>';

    html += buildGeneralTabHtml();
    html += buildQualityTabHtml();
    html += buildMoodTabHtml();
    html += buildPlotTabHtml();
    html += buildApiTabHtml();

    html += '</div>'; // nps-popup-body
    html += '</div>'; // nps-popup-content
    html += '</div>'; // nps-settings-popup

    html += buildDirectionPopupHtml();
    html += buildTextareaExpandPopupHtml();

    return html;
}

// ═══════════════════════════════════════════
// 개별 탭 HTML 빌더
// ═══════════════════════════════════════════

function buildGeneralTabHtml() {
    let html = '<div class="nps-tab-content active" id="nps-tab-general">';

    // 기본 설정
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-gear"></i><span>기본 설정</span></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-enabled">기능 활성화</label><input type="checkbox" id="nps-popup-enabled"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-auto-suggest">새 메시지 시 자동 추천<br><small>캐릭터(AI) 응답 수신 시 자동 생성</small></label><input type="checkbox" id="nps-popup-auto-suggest"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-auto-suggest-delay">자동 추천 지연 시간 (ms)</label><input type="number" id="nps-popup-auto-suggest-delay" min="500" max="10000" value="1000" class="nps-number-input"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-auto-paste">입력창에 자동 붙여넣기</label><input type="checkbox" id="nps-popup-auto-paste"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-show-input-btn">입력창 옆 버튼 표시</label><input type="checkbox" id="nps-popup-show-input-btn"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-use-custom-direction">전개 방향 입력 사용</label><input type="checkbox" id="nps-popup-use-custom-direction"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-sentence-count">추천 당 문장 수</label><input type="number" id="nps-popup-sentence-count" min="1" max="10" value="2" class="nps-number-input"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-suggestion-count">추천 개수</label><input type="number" id="nps-popup-suggestion-count" min="1" max="10" value="3" class="nps-number-input"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-output-language">추천 언어</label><select id="nps-popup-output-language"><option value="ko">한국어</option><option value="en">English</option><option value="ja">日本語</option></select></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-max-context">최대 컨텍스트 토큰</label><input type="number" id="nps-popup-max-context" min="1000" max="128000" value="4000" class="nps-number-input"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-json-mode">JSON 구조화 출력</label><input type="checkbox" id="nps-popup-json-mode"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-enable-cache">추천 캐싱</label><input type="checkbox" id="nps-popup-enable-cache"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-enable-compression">프롬프트 압축<br><small>긴 대화에서 오래된 메시지를 자동 요약하여 토큰 절약</small></label><input type="checkbox" id="nps-popup-enable-compression"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-compression-threshold">압축 기준 (메시지 수)<br><small>이 수 이상일 때 오래된 메시지를 요약</small></label><input type="number" id="nps-popup-compression-threshold" min="10" max="100" value="20" class="nps-number-input"></div>';
    html += '</div>';

    // Input 소스
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-file-import"></i><span>Input 소스 설정</span></div>';
    html += '<p class="nps-section-desc">추천 생성 시 사용할 정보를 선택하세요.</p>';
    html += '<div class="nps-setting-row"><label for="nps-popup-input-char">캐릭터 설명 (Char Description)</label><input type="checkbox" id="nps-popup-input-char"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-input-persona">페르소나 설명 (Persona Description)</label><input type="checkbox" id="nps-popup-input-persona"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-input-world">월드 인포 (World Info Before)</label><input type="checkbox" id="nps-popup-input-world"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-input-summary">시나리오 요약 (Scenario Summary)</label><input type="checkbox" id="nps-popup-input-summary"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-input-au">AU 월드 빌더 (AU-World-Builder)</label><input type="checkbox" id="nps-popup-input-au"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-input-chat">채팅 기록 (Chat History)</label><input type="checkbox" id="nps-popup-input-chat" checked disabled><span class="nps-required-badge">필수</span></div>';
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
    html += '<div class="nps-textarea-header"><label for="nps-popup-custom-prompt">추천 생성 시 추가할 지시사항 (선택사항)</label>';
    html += '<button class="nps-textarea-expand-btn" data-target="nps-popup-custom-prompt" title="확대 편집"><i class="fa-solid fa-expand"></i></button></div>';
    html += '<textarea id="nps-popup-custom-prompt" placeholder="예: 대화체로 작성해주세요, 감정 표현을 풍부하게 해주세요"></textarea>';
    html += '</div>';
    html += '</div>';

    // 네거티브 프롬프트
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-ban"></i><span>네거티브 프롬프트</span></div>';
    html += '<div class="nps-setting-row nps-setting-row-vertical">';
    html += '<div class="nps-textarea-header"><label for="nps-popup-negative-prompt">제외할 전개/요소 (추천에서 배제됨)</label>';
    html += '<button class="nps-textarea-expand-btn" data-target="nps-popup-negative-prompt" title="확대 편집"><i class="fa-solid fa-expand"></i></button></div>';
    html += '<textarea id="nps-popup-negative-prompt" placeholder="예: 갑작스러운 고백, 기억상실, 이세계 전이, 폭력적인 전개"></textarea>';
    html += '<p class="nps-section-desc" style="margin-top:4px;">쉼표로 구분하여 여러 항목을 입력할 수 있습니다.</p>';
    html += '</div>';
    html += '</div>';

    // 프리뷰 모드
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-eye"></i><span>프리뷰 모드</span></div>';
    html += '<p class="nps-section-desc">활성화하면 먼저 간단한 1문장 요약을 여러 개 받아보고, 마음에 드는 것을 골라 본격적으로 생성합니다.</p>';
    html += '<div class="nps-setting-row"><label for="nps-popup-preview-mode">프리뷰 모드 사용</label><input type="checkbox" id="nps-popup-preview-mode"></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-preview-count">프리뷰 개수</label><input type="number" id="nps-popup-preview-count" min="3" max="10" value="5" class="nps-number-input"></div>';
    html += '</div>';

    // 추천 길이 슬라이더
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-text-width"></i><span>추천 길이</span></div>';
    html += '<p class="nps-section-desc">생성될 각 추천의 길이를 조절합니다.</p>';
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-suggestion-length">길이 수준</label>';
    html += '<input type="range" id="nps-popup-suggestion-length" min="1" max="10" step="1" value="5">';
    html += '<div class="nps-pacing-labels"><span>짧게</span><span id="nps-suggestion-length-val">5</span><span>길게</span></div>';
    html += '</div>';
    html += '</div>';

    // 유사도 필터
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-filter"></i><span>유사도 필터</span></div>';
    html += '<p class="nps-section-desc">추천들 사이의 유사도를 검사하여 중복 제거합니다. 값이 높을수록 엄격하게 필터링됩니다.</p>';
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-popup-similarity-threshold">유사도 임계값</label>';
    html += '<input type="range" id="nps-popup-similarity-threshold" min="0" max="1" step="0.1" value="0.6">';
    html += '<span id="nps-similarity-threshold-val" class="nps-range-value">0.6</span>';
    html += '</div>';
    html += '</div>';

    // 설정 프로필
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-user-gear"></i><span>설정 프로필</span></div>';
    html += '<p class="nps-section-desc">현재 설정을 프로필로 저장하고, 원클릭으로 전환할 수 있습니다.</p>';
    html += '<div id="nps-profiles-list" class="nps-profiles-list"></div>';
    html += '<div class="nps-profile-save-row">';
    html += '<input type="text" id="nps-profile-name-input" placeholder="프로필 이름 입력" class="nps-profile-name-input">';
    html += '<button id="nps-save-profile-btn" class="nps-btn nps-btn-primary nps-btn-small"><i class="fa-solid fa-save"></i> 저장</button>';
    html += '</div>';
    html += '</div>';

    // 설정 내보내기/불러오기
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-file-arrow-down"></i><span>설정 내보내기 / 불러오기</span></div>';
    html += '<p class="nps-section-desc">현재 설정을 JSON 파일로 저장하거나, 이전에 저장한 설정을 불러올 수 있습니다.</p>';
    html += '<div class="nps-export-import-row">';
    html += '<button id="nps-export-settings-btn" class="nps-btn nps-btn-secondary nps-btn-small"><i class="fa-solid fa-download"></i> 내보내기</button>';
    html += '<button id="nps-import-settings-btn" class="nps-btn nps-btn-secondary nps-btn-small"><i class="fa-solid fa-upload"></i> 불러오기</button>';
    html += '<input type="file" id="nps-import-file-input" accept=".json" style="display:none;">';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // 일반 탭 끝
    return html;
}

function buildQualityTabHtml() {
    let html = '<div class="nps-tab-content" id="nps-tab-quality">';

    // 문체 스타일
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-star"></i><span>문체 스타일</span></div>';
    html += '<p class="nps-section-desc">추천 결과물의 문체를 선택하세요. 하나만 선택 가능합니다.</p>';
    html += '<div class="nps-writing-style-grid">';
    const styleKeys = Object.keys(defaultQualityPrompts);
    styleKeys.forEach((key, index) => {
        const qp = defaultQualityPrompts[key];
        html += '<label class="nps-writing-style-chip" for="nps-ws-' + key + '">';
        html += '<input type="radio" name="nps-writing-style" id="nps-ws-' + key + '" value="' + key + '"' + (index === 0 ? ' checked' : '') + '>';
        html += '<i class="fa-solid ' + qp.icon + '"></i>';
        html += '<span class="nps-ws-name">' + qp.name + '</span>';
        html += '<span class="nps-ws-name-en">' + qp.nameEn + '</span>';
        html += '</label>';
    });
    html += '</div>';
    html += '<p class="nps-section-desc" style="margin-top:8px; color: var(--SmartThemeBodyColor, #aaa); opacity:0.7;"><i class="fa-solid fa-info-circle"></i> 전개 유형(사건/일상/갈등 등)은 <strong>플롯 제어</strong> 탭에서 설정하세요.</p>';
    html += '</div>';

    // 퀄리티 강화 옵션
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-wand-magic-sparkles"></i><span>퀄리티 강화</span></div>';
    html += '<p class="nps-section-desc">추천 결과의 품질을 높이는 옵션입니다. 필요한 것만 켜세요.</p>';
    html += '<div class="nps-quality-enhance-list">';
    qualityEnhancements.forEach(qe => {
        html += '<div class="nps-quality-enhance-item">';
        html += '<div class="nps-qe-info">';
        html += '<i class="fa-solid ' + qe.icon + '"></i>';
        html += '<div class="nps-qe-text"><span class="nps-qe-name">' + qe.name + '</span><span class="nps-qe-name-en">' + qe.nameEn + '</span></div>';
        html += '</div>';
        html += '<input type="checkbox" id="nps-qe-' + qe.id + '" class="nps-qe-toggle">';
        html += '</div>';
    });
    html += '</div>';
    html += '</div>';

    // 사용자 정의 퀄리티 프롬프트
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-plus-circle"></i><span>사용자 정의 프롬프트</span></div>';
    html += '<p class="nps-section-desc">나만의 스타일 프롬프트를 추가하세요.</p>';
    html += '<div id="nps-custom-quality-list"></div>';
    html += '<div class="nps-add-quality-row">';
    html += '<input type="text" id="nps-new-quality-name" placeholder="프롬프트 이름 (예: 로맨틱 무드)">';
    html += '<button id="nps-add-quality-btn" class="nps-btn-small"><i class="fa-solid fa-plus"></i></button>';
    html += '</div>';
    html += '<div class="nps-quality-prompt-input" style="display:none;" id="nps-new-quality-prompt-container">';
    html += '<textarea id="nps-new-quality-prompt" placeholder="프롬프트 내용을 영어로 작성하세요"></textarea>';
    html += '<div class="nps-quality-btn-row">';
    html += '<button id="nps-save-quality-btn" class="nps-btn-primary"><i class="fa-solid fa-save"></i> 저장</button>';
    html += '<button id="nps-cancel-quality-btn" class="nps-btn-secondary"><i class="fa-solid fa-times"></i> 취소</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // 퀄리티 탭 끝
    return html;
}

function buildMoodTabHtml() {
    let html = '<div class="nps-tab-content" id="nps-tab-mood">';

    // 기본 분위기
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-cloud-sun"></i><span>기본 분위기</span></div>';
    html += '<div class="nps-setting-row"><label for="nps-mood-enabled">분위기 설정 사용</label><input type="checkbox" id="nps-mood-enabled"></div>';
    html += '<div class="nps-mood-options">';
    html += '<div class="nps-mood-grid">';
    defaultMoods.forEach((mood, index) => {
        html += '<label class="nps-mood-chip" for="nps-mood-' + mood.id + '">';
        html += '<input type="radio" name="nps-mood-select" id="nps-mood-' + mood.id + '" value="' + mood.id + '"' + (index === 0 ? ' checked' : '') + '>';
        html += '<span class="nps-mood-name">' + mood.name + '</span>';
        html += '<span class="nps-mood-name-en">' + mood.nameEn + '</span>';
        html += '</label>';
    });
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // 장면 분위기
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-film"></i><span>장면 분위기</span></div>';
    html += '<p class="nps-section-desc">현재 장면의 물리적/환경적 분위기를 선택하세요.</p>';
    html += '<div class="nps-scene-atmo-grid">';
    sceneAtmospheres.forEach(atmo => {
        html += '<label class="nps-atmo-chip" for="nps-atmo-' + atmo.id + '">';
        html += '<input type="radio" name="nps-scene-atmosphere" id="nps-atmo-' + atmo.id + '" value="' + atmo.id + '"' + (atmo.id === 'none' ? ' checked' : '') + '>';
        html += '<i class="fa-solid ' + atmo.icon + '"></i>';
        html += '<span>' + atmo.name + '</span>';
        html += '</label>';
    });
    html += '</div>';
    html += '</div>';

    // 감각 포커스
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-hand-sparkles"></i><span>감각 포커스</span></div>';
    html += '<p class="nps-section-desc">묘사에서 강조할 감각을 선택하세요 (복수 선택 가능).</p>';
    html += '<div class="nps-sensory-grid">';
    sensoryOptions.forEach(opt => {
        html += '<label class="nps-sensory-chip" for="nps-sensory-' + opt.id + '">';
        html += '<input type="checkbox" id="nps-sensory-' + opt.id + '" value="' + opt.id + '">';
        html += '<i class="fa-solid ' + opt.icon + '"></i>';
        html += '<span>' + opt.name + '</span>';
        html += '</label>';
    });
    html += '</div>';
    html += '</div>';

    // 감정 강도
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-fire"></i><span>감정 강도</span></div>';
    html += '<p class="nps-section-desc">장면의 감정적 강렬함을 조절합니다.</p>';
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-emotional-intensity">감정 강도</label>';
    html += '<input type="range" id="nps-emotional-intensity" min="1" max="10" step="1" value="5">';
    html += '<div class="nps-pacing-labels"><span>담담</span><span id="nps-emotional-intensity-val">5</span><span>격렬</span></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // 분위기 탭 끝
    return html;
}

function buildPlotTabHtml() {
    let html = '<div class="nps-tab-content" id="nps-tab-plot">';

    // 전개 유형
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-route"></i><span>전개 유형</span></div>';
    html += '<p class="nps-section-desc">원하는 서사적 기능을 선택하세요. 복수 선택 가능, 미선택 시 AI가 자동 판단합니다.</p>';
    html += '<div class="nps-preset-row" id="nps-preset-row">';
    html += '<span class="nps-preset-label">프리셋:</span>';
    plotBeatPresets.forEach(preset => {
        html += '<button class="nps-preset-btn" data-preset="' + preset.id + '" title="' + preset.name + '"><i class="fa-solid ' + preset.icon + '"></i> ' + preset.name + '</button>';
    });
    html += '<button class="nps-preset-btn nps-preset-clear" data-preset="clear" title="초기화"><i class="fa-solid fa-xmark"></i> 초기화</button>';
    html += '</div>';
    html += '<div class="nps-plot-beats-grid" id="nps-plot-beats-grid">';
    plotBeats.forEach(beat => {
        html += '<label class="nps-beat-chip" for="nps-beat-' + beat.id + '">';
        html += '<input type="checkbox" id="nps-beat-' + beat.id + '" value="' + beat.id + '">';
        html += '<i class="fa-solid ' + beat.icon + '"></i>';
        html += '<span class="nps-beat-name">' + beat.name + '</span>';
        html += '<span class="nps-beat-desc">' + beat.desc + '</span>';
        html += '</label>';
    });
    html += '</div>';
    html += '</div>';

    // 서사 단계
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-stairs"></i><span>서사 단계</span></div>';
    html += '<p class="nps-section-desc">현재 스토리가 어느 단계인지 자동 감지하거나, 직접 지정할 수 있습니다.</p>';
    html += '<div class="nps-setting-row"><label for="nps-arc-auto-detect">자동 감지</label><input type="checkbox" id="nps-arc-auto-detect" checked></div>';
    html += '<div class="nps-arc-display" id="nps-arc-display">';
    html += '<span class="nps-arc-label">감지된 단계:</span>';
    html += '<span class="nps-arc-stage" id="nps-arc-detected-stage">-</span>';
    html += '</div>';
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-arc-manual-stage">수동 오버라이드</label>';
    html += '<select id="nps-arc-manual-stage">';
    html += '<option value="">자동 감지 사용</option>';
    narrativeStages.forEach(s => {
        html += '<option value="' + s.id + '">' + s.name + ' (' + s.nameEn + ')</option>';
    });
    html += '</select>';
    html += '</div>';
    html += '</div>';

    // 포커스 대상
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-crosshairs"></i><span>포커스 대상</span></div>';
    html += '<p class="nps-section-desc">추천이 집중할 대상을 지정합니다.</p>';
    html += '<div class="nps-setting-row">';
    html += '<label for="nps-focus-type">포커스 유형</label>';
    html += '<select id="nps-focus-type">';
    html += '<option value="auto">자동 (AI 판단)</option>';
    html += '<option value="character">특정 캐릭터</option>';
    html += '<option value="relationship">관계 (두 캐릭터)</option>';
    html += '<option value="environment">환경/세계관</option>';
    html += '<option value="custom">직접 입력</option>';
    html += '</select>';
    html += '</div>';
    html += '<div class="nps-focus-details" id="nps-focus-details">';
    html += '<div class="nps-setting-row nps-focus-char-row nps-setting-row-vertical" style="display:none;">';
    html += '<label for="nps-focus-character">캐릭터 이름</label>';
    html += '<input type="text" id="nps-focus-character" placeholder="예: 앨리스, 밥">';
    html += '</div>';
    html += '<div class="nps-setting-row nps-focus-custom-row nps-setting-row-vertical" style="display:none;">';
    html += '<label for="nps-focus-custom">커스텀 포커스</label>';
    html += '<input type="text" id="nps-focus-custom" placeholder="예: 캐릭터 A의 내면 갈등, 마법 시스템의 비밀">';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // 추천 스펙트럼
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-layer-group"></i><span>추천 스펙트럼</span></div>';
    html += '<div class="nps-setting-row"><label for="nps-spectrum-enabled">스펙트럼 모드<br><small>각 추천에 [안전]/[의외]/[극적] 태그 부여</small></label><input type="checkbox" id="nps-spectrum-enabled" checked></div>';
    html += '</div>';

    // 감정 곡선
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-heart-pulse"></i><span>감정 곡선</span></div>';
    html += '<div class="nps-setting-row"><label for="nps-emotion-enabled">감정 곡선 사용</label><input type="checkbox" id="nps-emotion-enabled"></div>';
    html += '<div class="nps-emotion-options" id="nps-emotion-options">';
    html += '<div class="nps-emotion-flow">';
    html += '<div class="nps-emotion-col">';
    html += '<label class="nps-emotion-label">현재 감정</label>';
    html += '<select id="nps-emotion-current"><option value="">선택...</option>';
    emotions.forEach(em => { html += '<option value="' + em.id + '">' + em.name + '</option>'; });
    html += '</select></div>';
    html += '<span class="nps-emotion-arrow"><i class="fa-solid fa-arrow-right"></i></span>';
    html += '<div class="nps-emotion-col">';
    html += '<label class="nps-emotion-label">목표 감정</label>';
    html += '<select id="nps-emotion-target"><option value="">선택...</option>';
    emotions.forEach(em => { html += '<option value="' + em.id + '">' + em.name + '</option>'; });
    html += '</select></div>';
    html += '</div>';
    html += '<div class="nps-emotion-speed"><label>전환 속도</label>';
    html += '<div class="nps-radio-group">';
    html += '<label class="nps-radio-label"><input type="radio" name="nps-emotion-speed" value="gradual" checked> 점진적</label>';
    html += '<label class="nps-radio-label"><input type="radio" name="nps-emotion-speed" value="sudden"> 급격</label>';
    html += '</div></div>';
    html += '</div>';
    html += '</div>';

    // 페이싱 제어
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-gauge-high"></i><span>페이싱 제어</span></div>';
    html += '<div class="nps-setting-row"><label for="nps-pacing-enabled">페이싱 제어 사용</label><input type="checkbox" id="nps-pacing-enabled"></div>';
    html += '<div id="nps-pacing-options">';
    html += '<div class="nps-setting-row"><label for="nps-pacing-timeframe">시간 범위</label>';
    html += '<select id="nps-pacing-timeframe"><option value="immediate">즉시 (지금 이 순간)</option><option value="short">짧은 시간 후</option><option value="scene_change">장면 전환</option><option value="montage">몽타주 (압축)</option></select></div>';
    html += '<div class="nps-setting-row"><label for="nps-pacing-speed">전개 속도</label>';
    html += '<input type="range" id="nps-pacing-speed" min="1" max="10" step="1" value="5">';
    html += '<div class="nps-pacing-labels"><span>느림</span><span id="nps-pacing-speed-val">5</span><span>빠름</span></div></div>';
    html += '</div>';
    html += '</div>';

    // 구성 비율
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-sliders"></i><span>구성 비율</span></div>';
    html += '<div class="nps-setting-row"><label for="nps-dialogue-ratio">대화 ↔ 서술</label>';
    html += '<input type="range" id="nps-dialogue-ratio" min="0" max="10" step="1" value="5">';
    html += '<div class="nps-pacing-labels"><span>서술</span><span id="nps-dialogue-ratio-val">5</span><span>대화</span></div></div>';
    html += '<div class="nps-setting-row"><label for="nps-include-inner">내면 묘사 포함</label><input type="checkbox" id="nps-include-inner"></div>';
    html += '<div class="nps-setting-row"><label for="nps-include-env">환경 묘사 포함</label><input type="checkbox" id="nps-include-env"></div>';
    html += '</div>';

    // 창의성 수준
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-palette"></i><span>창의성 수준</span></div>';
    html += '<p class="nps-section-desc">추천의 창의성/실험성을 조절합니다. 낮으면 안전한 전개, 높으면 파격적인 전개가 나옵니다.</p>';
    html += '<div class="nps-setting-row"><label for="nps-creativity-level">창의성</label>';
    html += '<input type="range" id="nps-creativity-level" min="1" max="10" step="1" value="5">';
    html += '<div class="nps-pacing-labels"><span>보수적</span><span id="nps-creativity-level-val">5</span><span>실험적</span></div></div>';
    html += '</div>';

    // 조건부 규칙 (If-Then)
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-code-branch"></i><span>조건부 규칙 (If-Then)</span></div>';
    html += '<p class="nps-section-desc">특정 상황에서 적용될 서사 규칙을 정의합니다. 조건이 충족되면 해당 지시가 추천에 반영됩니다.</p>';
    html += '<div class="nps-rule-presets"><span class="nps-preset-label">예시 규칙:</span>';
    html += '<div class="nps-rule-preset-chips">';
    conditionalRulePresets.forEach((preset, idx) => {
        html += '<button class="nps-rule-preset-chip" data-preset-idx="' + idx + '" title="' + preset.condition + ' → ' + preset.action + '"><i class="fa-solid ' + preset.icon + '"></i> ' + preset.label + '</button>';
    });
    html += '</div></div>';
    html += '<div id="nps-conditional-rules-list" class="nps-conditional-rules-list"></div>';
    html += '<div class="nps-conditional-add-row">';
    html += '<input type="text" id="nps-rule-condition" placeholder="조건: 예) 캐릭터가 위험에 처하면" class="nps-rule-input">';
    html += '<input type="text" id="nps-rule-action" placeholder="결과: 예) 구출 장면을 제안" class="nps-rule-input">';
    html += '<button id="nps-add-rule-btn" class="nps-btn nps-btn-primary nps-btn-small"><i class="fa-solid fa-plus"></i></button>';
    html += '</div>';
    html += '</div>';

    // 대화 리듬 분석
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-wave-square"></i><span>대화 리듬 분석</span></div>';
    html += '<p class="nps-section-desc">현재 대화의 리듬 패턴을 분석합니다. 분석 결과는 추천 생성 시 참고됩니다.</p>';
    html += '<div class="nps-rhythm-display" id="nps-rhythm-display">';
    html += '<div class="nps-rhythm-stat"><span class="nps-rhythm-label">유저 비율</span><span class="nps-rhythm-value" id="nps-rhythm-user">-</span></div>';
    html += '<div class="nps-rhythm-stat"><span class="nps-rhythm-label">AI 비율</span><span class="nps-rhythm-value" id="nps-rhythm-ai">-</span></div>';
    html += '<div class="nps-rhythm-stat"><span class="nps-rhythm-label">유저 평균 길이</span><span class="nps-rhythm-value" id="nps-rhythm-user-len">-</span></div>';
    html += '<div class="nps-rhythm-stat"><span class="nps-rhythm-label">AI 평균 길이</span><span class="nps-rhythm-value" id="nps-rhythm-ai-len">-</span></div>';
    html += '<div class="nps-rhythm-stat"><span class="nps-rhythm-label">패턴</span><span class="nps-rhythm-value" id="nps-rhythm-pattern">-</span></div>';
    html += '</div>';
    html += '<button id="nps-refresh-rhythm" class="nps-btn nps-btn-secondary nps-btn-small" style="margin-top:6px;"><i class="fa-solid fa-sync"></i> 분석</button>';
    html += '</div>';

    html += '</div>'; // 플롯 탭 끝
    return html;
}

function buildApiTabHtml() {
    let html = '<div class="nps-tab-content" id="nps-tab-api">';

    // 생성 파라미터
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-sliders"></i><span>생성 파라미터</span></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-temperature">Temperature</label>';
    html += '<input type="range" id="nps-popup-temperature" min="0" max="2" step="0.1" value="0.8">';
    html += '<span id="nps-popup-temp-value" class="nps-range-value">0.8</span></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-max-tokens">Max Tokens</label><input type="number" id="nps-popup-max-tokens" min="100" max="4000" value="1000" class="nps-number-input"></div>';
    html += '</div>';

    // API 설정
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-plug"></i><span>API 설정</span></div>';
    html += '<div class="nps-setting-row"><label for="nps-popup-api-type">API 연결 방식</label>';
    html += '<select id="nps-popup-api-type"><option value="current">현재 연결된 API 사용</option><option value="profile">모델 직접 선택</option><option value="custom">커스텀 API 엔드포인트</option></select></div>';

    // Profile 설정
    html += '<div class="nps-profile-settings">';
    html += '<div class="nps-setting-row nps-profile-row"><label for="nps-popup-llm-provider" class="nps-profile-label">LLM Provider</label>';
    html += '<select id="nps-popup-llm-provider"><option value="openai">OpenAI</option><option value="claude">Claude (Anthropic)</option><option value="google">Google (Gemini)</option><option value="cohere">Cohere</option></select></div>';
    html += '<div class="nps-setting-row nps-profile-row"><label for="nps-popup-llm-model" class="nps-profile-label">모델 이름</label>';
    html += '<select id="nps-popup-llm-model"></select></div>';
    html += '<p class="nps-hint" style="margin: 5px 0; font-size: 0.85em; color: #888;">SillyTavern에 해당 Provider의 API 키가 이미 설정되어 있어야 합니다.</p>';
    html += '</div>';

    // Custom API
    html += '<div class="nps-custom-api-settings">';
    html += '<div class="nps-setting-row nps-setting-row-vertical"><label for="nps-popup-api-endpoint">API 엔드포인트 URL</label><input type="text" id="nps-popup-api-endpoint" placeholder="https://api.openai.com/v1/chat/completions"></div>';
    html += '<div class="nps-setting-row nps-setting-row-vertical"><label for="nps-popup-api-key">API 키</label><input type="password" id="nps-popup-api-key" placeholder="sk-..."></div>';
    html += '<div class="nps-setting-row nps-setting-row-vertical"><label for="nps-popup-api-model">모델 이름</label><input type="text" id="nps-popup-api-model" placeholder="gpt-4o-mini"></div>';
    html += '</div>';

    // API 테스트
    html += '<div class="nps-api-test-row">';
    html += '<button id="nps-popup-test-api" class="nps-btn nps-btn-secondary"><i class="fa-solid fa-vial"></i> API 연결 테스트</button>';
    html += '<div class="nps-api-status" id="nps-api-status"><span class="nps-api-status-indicator" id="nps-api-status-indicator"></span><span id="nps-api-status-text"></span></div>';
    html += '</div>';
    html += '</div>';

    // 컨텍스트 토큰 시각화
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-chart-pie"></i><span>컨텍스트 토큰 사용량</span></div>';
    html += '<p class="nps-section-desc">현재 설정에서 각 소스가 차지하는 토큰 비중을 시각화합니다.</p>';
    html += '<div class="nps-token-viz" id="nps-token-viz">';
    html += '<div class="nps-token-bar-container" id="nps-token-bar"></div>';
    html += '<div class="nps-token-legend" id="nps-token-legend"></div>';
    html += '<div class="nps-token-summary" id="nps-token-summary"></div>';
    html += '</div>';
    html += '<button id="nps-refresh-token-viz" class="nps-btn nps-btn-secondary nps-btn-small" style="margin-top:6px;"><i class="fa-solid fa-sync"></i> 새로고침</button>';
    html += '</div>';

    // 생성 통계
    html += '<div class="nps-settings-section">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-chart-bar"></i><span>생성 통계</span></div>';
    html += '<div class="nps-analytics-panel" id="nps-analytics-panel">';
    html += '<div class="nps-analytics-row"><span class="nps-analytics-label">총 요청 수</span><span class="nps-analytics-value" id="nps-stat-total">0</span></div>';
    html += '<div class="nps-analytics-row"><span class="nps-analytics-label">성공률</span><span class="nps-analytics-value" id="nps-stat-success-rate">-</span></div>';
    html += '<div class="nps-analytics-row"><span class="nps-analytics-label">평균 소요 시간</span><span class="nps-analytics-value" id="nps-stat-avg-duration">-</span></div>';
    html += '<div class="nps-analytics-row"><span class="nps-analytics-label">평균 프롬프트 토큰</span><span class="nps-analytics-value" id="nps-stat-avg-tokens">-</span></div>';
    html += '<div class="nps-analytics-row"><span class="nps-analytics-label">마지막 요청</span><span class="nps-analytics-value" id="nps-stat-last-request">-</span></div>';
    html += '</div>';
    html += '<button id="nps-refresh-analytics" class="nps-btn nps-btn-secondary nps-btn-small" style="margin-top:6px;"><i class="fa-solid fa-sync"></i> 새로고침</button>';
    html += '</div>';

    // 사용 방법
    html += '<div class="nps-settings-section nps-section-last">';
    html += '<div class="nps-settings-section-title"><i class="fa-solid fa-circle-info"></i><span>사용 방법</span></div>';
    html += '<div class="nps-usage-info">';
    html += '<p><strong>수동 생성:</strong> 채팅 입력창 옆의 전구 버튼을 클릭하거나, 확장 메뉴에서 "다음 전개 추천"을 선택하세요.</p>';
    html += '<p><strong>자동 생성:</strong> "새 메시지 시 자동 추천"을 활성화하면 AI가 응답할 때마다 자동으로 추천이 생성됩니다.</p>';
    html += '<p><strong>복사:</strong> 추천 텍스트를 클릭하면 클립보드에 복사됩니다.</p>';
    html += '<p><strong>바로 보내기:</strong> <i class="fa-solid fa-paper-plane"></i> 버튼을 누르면 추천 내용이 OOC로 즉시 전송됩니다.</p>';
    html += '<p><strong>편집:</strong> <i class="fa-solid fa-pen"></i> 버튼을 누르면 추천 내용을 수정한 후 복사/전송할 수 있습니다.</p>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // API 탭 끝
    return html;
}

function buildDirectionPopupHtml() {
    let html = '<div id="nps-direction-popup" class="nps-direction-popup">';
    html += '<div class="nps-popup-overlay-bg" id="nps-direction-overlay-bg"></div>';
    html += '<div class="nps-direction-popup-content">';
    html += '<div class="nps-popup-header">';
    html += '<h3><i class="fa-solid fa-compass"></i> 전개 방향 입력</h3>';
    html += '<button id="nps-direction-close-btn" class="nps-popup-close-btn">&times;</button>';
    html += '</div>';
    html += '<div class="nps-popup-body">';
    html += '<p class="nps-direction-desc">원하는 스토리 전개 방향을 입력하세요. 입력한 내용을 기반으로 추천이 생성됩니다.</p>';
    html += '<div class="nps-quick-templates" id="nps-quick-templates">';
    html += '<div class="nps-quick-templates-label"><i class="fa-solid fa-bookmark"></i> 퀵 템플릿</div>';
    html += '<div class="nps-quick-templates-chips" id="nps-quick-templates-chips"></div>';
    html += '<div class="nps-quick-template-add">';
    html += '<button id="nps-save-template-btn" class="nps-btn nps-btn-secondary nps-btn-small" title="현재 입력을 템플릿으로 저장"><i class="fa-solid fa-plus"></i> 저장</button>';
    html += '</div></div>';
    html += '<textarea id="nps-direction-input" placeholder="예: 주인공이 여행을 떠남, 갑자기 비가 내리기 시작함, 새로운 인물 등장..."></textarea>';
    html += '<div class="nps-direction-btn-row">';
    html += '<button id="nps-direction-generate-btn" class="nps-btn nps-btn-primary"><i class="fa-solid fa-sparkles"></i> 생성</button>';
    html += '<button id="nps-direction-cancel-btn" class="nps-btn nps-btn-secondary"><i class="fa-solid fa-times"></i> 취소</button>';
    html += '</div></div></div></div>';
    return html;
}

function buildTextareaExpandPopupHtml() {
    let html = '<div id="nps-textarea-expand-popup" class="nps-textarea-expand-popup">';
    html += '<div class="nps-popup-overlay-bg" id="nps-textarea-expand-overlay-bg"></div>';
    html += '<div class="nps-textarea-expand-content">';
    html += '<div class="nps-popup-header">';
    html += '<h3 id="nps-textarea-expand-title"><i class="fa-solid fa-expand"></i> 확대 편집</h3>';
    html += '<button id="nps-textarea-expand-close-btn" class="nps-popup-close-btn">&times;</button>';
    html += '</div>';
    html += '<div class="nps-popup-body">';
    html += '<textarea id="nps-textarea-expand-input" placeholder=""></textarea>';
    html += '</div>';
    html += '<div class="nps-textarea-expand-footer">';
    html += '<button id="nps-textarea-expand-save-btn" class="nps-btn nps-btn-primary"><i class="fa-solid fa-check"></i> 적용</button>';
    html += '<button id="nps-textarea-expand-cancel-btn" class="nps-btn nps-btn-secondary"><i class="fa-solid fa-times"></i> 취소</button>';
    html += '</div>';
    html += '</div></div>';
    return html;
}
