/** Planning controls, evidence cards and editable scoped preferences. */
import { extension_settings, getContext } from "../../../extensions.js";
import { extensionName } from "./constants.js";
import { state } from "./state.js";
import { resultHistory, toggleFavorite, rateResult } from "./results.js";
import { escapeHtml as esc, escapeAttr } from "./utils.js";
import { MEMORY_KEY, validMemory, recordFeedback, messages, validateMemory, storyId } from "./story.js";

let callbacks = {};
const labels = { fact: "확정 사실", goal: "인물 목표", relationship: "관계 변화", open: "미회수 복선", resolved: "해결된 사건", hypothesis: "추측 / 해석" };
const reasons = { cliché: "뻔함", character: "캐릭터 불일치", rush: "너무 급함", canon: "설정 오류", repeat: "반복", prose: "문체", choice: "인물의 선택", payoff: "복선 회수", relationship: "관계 변화", other: "직접 입력" };
const opt = (values, selected) => Object.entries(values).map(([v, text]) => `<option value="${v}" ${v === selected ? "selected" : ""}>${esc(text)}</option>`).join("");
function persist() { state.contextRevision = (state.contextRevision || 0) + 1; getContext().saveSettingsDebounced(); }
export function installStudio(actions) {
    callbacks = actions;
    const tabs = document.querySelector("#nps-settings-popup .nps-tabs");
    if (!tabs || document.getElementById("nps-tab-studio")) return;
    const button = document.createElement("button"); button.className = "nps-tab-btn"; button.dataset.tab = "studio"; button.textContent = "이야기 설계";
    tabs.appendChild(button);
    const panel = document.createElement("div"); panel.className = "nps-tab-content"; panel.id = "nps-tab-studio";
    panel.innerHTML = `<div class="nps-settings-section nps-studio">
      <h3>추천 방식</h3>
      <label>생성 모드 <select data-nps-setting="generationMode"><option value="fast">빠른 모드 · 1회 생성</option><option value="quality">품질 모드 · 후보 생성 + 검토 (부족하면 1회 보충)</option></select></label>
      <label>기본 출력 <select data-nps-setting="outputMode"><option value="outline">플롯 개요 · 계기 → 선택 → 결과</option><option value="prose">소설 문장</option></select></label>
      <label>품질 모드 후보 수 <input type="number" min="3" max="10" data-nps-setting="candidateCount"></label>
      <p>문체·감각 묘사 옵션은 소설 문장과 ‘문장으로 확장’에 적용됩니다. 프리뷰에도 같은 설정·기억·장면 조건을 사용합니다.</p>
      <button type="button" id="nps-recommended">추천 기본값 적용</button>
      <label>전개 범위 <select data-nps-setting="planningScope"><option value="scene">현재 장면 심화</option><option value="next">다음 사건 진행</option><option value="arc">장기 전개 · 연결된 2~4개 사건</option></select></label>
      <label>새 요소 허용 <select data-nps-setting="noveltyPolicy"><option value="established">기존 요소만</option><option value="organic">자연스러운 새 요소</option><option value="open">새 사건·인물 허용</option></select></label>
      <label>직접 API 응답 제한 시간 (ms) <input type="number" min="10000" max="600000" data-nps-setting="requestTimeoutMs"></label>
      <label>반드시 읽을 맥락 <textarea data-nps-setting="pinnedContext" placeholder="현재 목표, 꼭 유지할 설정, 과거 복선의 원문 등을 고정하세요"></textarea></label>
      <h3>이전 결과 · 즐겨찾기</h3><p>이 채팅에 최근 20회와 즐겨찾기 최대 20회를 보관합니다. 다른 장면의 결과도 열람·복사할 수 있습니다.</p><button type="button" id="nps-export-ratings">품질 평가 내보내기</button><div id="nps-result-history"></div>
      <h3>장면 고정 조건</h3>
      <label><input type="checkbox" data-nps-lock="noNewCharacters"> 새 인물 등장 금지</label>
      <label><input type="checkbox" data-nps-lock="keepLocation"> 장소 유지</label>
      <label><input type="checkbox" data-nps-lock="noTimeSkip"> 시간 점프 금지</label>
      <label><input type="checkbox" data-nps-lock="userAgency"> 사용자 캐릭터의 선택은 사용자에게 맡기기</label>
      <textarea data-nps-lock="custom" placeholder="이 장면에서 지킬 추가 조건"></textarea>
      <h3>이야기 기억</h3>
      <label><input type="checkbox" data-nps-setting="useStoryMemory"> 검증된 원문 근거가 있는 기억 사용</label>
      <p>갱신 한 번마다 API를 1회 호출해 다음 구간을 처리합니다. 긴 메시지는 여러 구간으로 나눕니다. 생성된 추천은 소설의 사실로 저장하지 않습니다. 메시지 수정·분기는 이후 기억을 무효화합니다.</p>
      <button type="button" id="nps-memory-update">다음 구간 기억 갱신</button>
      <button type="button" id="nps-memory-cancel">갱신 취소</button>
      <div id="nps-memory-status"></div><div id="nps-memory-list"></div>
      <h3>취향 기록</h3><p>추천의 좋아요 / 아쉬워요에서 이유와 적용 범위를 선택하세요. 내용은 아래에서 수정하거나 삭제할 수 있습니다.</p>
      <div id="nps-preferences"></div><div id="nps-legacy-feedback"></div>
      <h3>이번에 무엇을 읽었나</h3><div id="nps-context-report"></div>
    </div>`;
    tabs.parentElement.appendChild(panel);
    button.addEventListener("click", () => {
        document.querySelectorAll("#nps-settings-popup .nps-tab-btn, #nps-settings-popup .nps-tab-content").forEach(el => el.classList.remove("active"));
        button.classList.add("active"); panel.classList.add("active"); refreshStudio();
    });
    panel.addEventListener("input", e => {const record=e.target.closest(".nps-managed-record");if(record)record.dataset.dirty="1";if(e.target.matches("[data-nps-setting],[data-nps-lock]"))e.target.dataset.dirty="1";});
    panel.addEventListener("change", e => {
        const settings = extension_settings[extensionName];
        const key = e.target.dataset.npsSetting, lock = e.target.dataset.npsLock;
        if (!key && !lock) return;
        const value = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Math.max(Number(e.target.min), Math.min(Number(e.target.max), Number(e.target.value) || Number(e.target.min))) : e.target.value;
        if (key) settings[key] = value;
        if (lock) settings.sceneLocks[lock] = value;
        delete e.target.dataset.dirty;
        persist();
    });
    panel.querySelector("#nps-recommended").addEventListener("click", () => {
        const s = extension_settings[extensionName];
        Object.assign(s, { maxContextTokens: 8000, maxTokens: 2400, generationMode: "quality", candidateCount: 6, outputMode: "outline", selectedWritingStyle: "conciseReport", creativityLevel: 7, suggestionSpectrum: false });
        s.narrativeArc = { autoDetect: false, manualStage: "" };
        s.inputSources.charDescription = true;
        persist(); refreshStudio(); toastr.success("개요 중심 기본값을 적용했습니다. 일반·퀄리티 탭은 다시 열면 갱신됩니다.");
    });
    panel.querySelector("#nps-export-ratings").addEventListener("click",()=>{
        const cases=resultHistory().filter(r=>r.ratings).map(r=>({caseId:r.scene,ratings:r.ratings,note:r.ratingNote,candidates:r.candidates,configuration:r.configuration,at:r.at}));
        if(!cases.length){toastr.info("먼저 이전 결과에 품질 점수를 저장해 주세요.");return;}
        const url=URL.createObjectURL(new Blob([JSON.stringify({version:"2.2.0",cases},null,2)],{type:"application/json"}));
        const link=document.createElement("a");link.href=url;link.download="nps-quality-evaluation.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    panel.querySelector("#nps-memory-update").addEventListener("click", () => callbacks.updateMemory());
    panel.querySelector("#nps-memory-cancel").addEventListener("click", () => callbacks.cancelGeneration());
    panel.addEventListener("click", e=>{const id=e.target.dataset.restore, fav=e.target.dataset.favorite;if(id)callbacks.restore(id);if(fav){if(toggleFavorite(fav)===false)toastr.info("즐겨찾기는 최대 20개입니다. 먼저 하나를 해제해 주세요.");refreshStudio();}});
    panel.addEventListener("click", handleManager);
    refreshStudio();
}
export function refreshStudio() {
    const panel = document.getElementById("nps-tab-studio"); if (!panel) return;
    const s = extension_settings[extensionName];
    const sameStory=panel.dataset.story===storyId();
    const drafts = new Map();
    if(sameStory)panel.querySelectorAll(".nps-managed-record").forEach(el=>{
        const key=el.dataset.result||el.dataset.feedback||"memory:"+el.dataset.memory;
        drafts.set(key,{open:el.open,dirty:el.dataset.dirty,values:[...el.querySelectorAll("input,textarea,select")].map(input=>input.value)});
    });
    panel.dataset.story=storyId();
    panel.querySelectorAll("[data-nps-setting], [data-nps-lock]").forEach(el => {
        if(sameStory && el.dataset.dirty)return;
        delete el.dataset.dirty;
        const value = el.dataset.npsSetting ? s[el.dataset.npsSetting] : s.sceneLocks[el.dataset.npsLock];
        if (el.type === "checkbox") el.checked = !!value; else el.value = value ?? "";
    });
    panel.querySelector("#nps-result-history").innerHTML=resultHistory().slice().reverse().map(r=>`<details data-result="${escapeAttr(r.id)}"><summary>${esc(new Date(r.at).toLocaleString())} · ${r.favorite?"★ ":""}${esc(r.candidates[0]?.text.slice(0,70)||"결과")}</summary><p>${r.candidates.map(c=>esc(c.text)).join("<br><br>")}</p><button type="button" data-restore="${escapeAttr(r.id)}">이 결과 복원</button><button type="button" data-favorite="${escapeAttr(r.id)}">${r.favorite?"즐겨찾기 해제":"즐겨찾기"}</button></details>`).join("")||"<p>아직 저장된 결과가 없습니다.</p>";
    panel.querySelectorAll("#nps-result-history details").forEach((el,i)=>{
        el.classList.add("nps-managed-record");
        const r=resultHistory().slice().reverse()[i],form=document.createElement("div");
        form.innerHTML='<p>복사 '+(r.interactions?.copy||0)+' · 전송 '+(r.interactions?.send||0)+' · 다시 생성 '+(r.interactions?.regenerate||0)+' · 수정 '+(r.interactions?.revise||0)+'</p><p>품질 평가 (1~5점)</p>'+Object.entries({continuity:"개연성",motivation:"인물 동기",interest:"재미",freshness:"신선함",usability:"사용성"}).map(([k,label])=>'<label>'+label+'<input type="number" min="1" max="5" data-score="'+k+'" value="'+(r.ratings?.[k]||3)+'"></label>').join("")+'<textarea placeholder="평가 메모">'+esc(r.ratingNote||"")+'</textarea><button type="button">평가 저장</button>';
        form.querySelector("button").addEventListener("click",()=>{rateResult(r.id,Object.fromEntries([...form.querySelectorAll("[data-score]")].map(input=>[input.dataset.score,input.value])),form.querySelector("textarea").value);delete el.dataset.dirty;toastr.success("평가를 저장했습니다.");});
        el.appendChild(form);
    });
    const ctx = getContext(), memory = validMemory(ctx), all = messages(ctx);
    panel.querySelector("#nps-memory-status").textContent = `${memory.covered}/${all.length}개 메시지까지 처리 · 사용 가능한 기억 ${memory.items.length}개`;
    panel.querySelector("#nps-memory-update").disabled = state.isGenerating;
    panel.querySelector("#nps-memory-list").innerHTML = memory.items.map((m, i) => `<details class="nps-managed-record" data-memory="${i}"><summary>${esc(labels[m.category])}: ${esc(m.text)}</summary><select class="nps-memory-category">${opt(labels, m.category)}</select><textarea class="nps-memory-text">${esc(m.text)}</textarea><p>${m.evidence.map(e => `M${e.id}: ${esc(e.quote)}`).join("<br>")}</p><button type="button" data-manager="memory-save">저장</button><button type="button" data-manager="memory-delete">삭제</button></details>`).join("") || "<p>저장된 기억이 없습니다. 최근 원문과 과거 발췌는 기억 없이도 사용합니다.</p>";
    panel.querySelector("#nps-preferences").innerHTML = (s.feedbackRecords || []).map(f => `<details class="nps-managed-record" data-feedback="${escapeAttr(f.id)}"><summary>${f.polarity === "positive" ? "좋아요" : "아쉬워요"} · ${esc(reasons[f.reason] || f.reason)} · ${esc({ scene: "이번 장면", story: "이 작품", global: "전체" }[f.scope])}</summary><p>${esc(f.suggestion)}</p><textarea class="nps-preference-note" placeholder="구체적인 취향">${esc(f.note)}</textarea><button type="button" data-manager="feedback-save">저장</button><button type="button" data-manager="feedback-delete">삭제</button></details>`).join("") || "<p>기록이 없습니다.</p>";
    panel.querySelector("#nps-legacy-feedback").innerHTML = s.legacyFeedbackKeywords?.length ? `<details><summary>이전 자동 키워드 ${s.legacyFeedbackKeywords.length}개 (추천에는 미적용)</summary><p>${esc(s.legacyFeedbackKeywords.join(", "))}</p><button type="button" data-manager="legacy-delete">옛 키워드 삭제</button></details>` : "";
    panel.querySelector("#nps-context-report").innerHTML = contextReportHtml();
    panel.querySelectorAll("[data-feedback]").forEach(el => {
        const f = s.feedbackRecords.find(f => f.id === el.dataset.feedback);
        const controls = document.createElement("div");
        controls.innerHTML = `<label>이유 <select class="nps-preference-reason">${opt(reasons, f.reason)}</select></label><label>적용 범위 <select class="nps-preference-scope">${opt({ scene: "이번 장면", story: "이 작품", global: "전체 취향" }, f.scope)}</select></label>`;
        el.insertBefore(controls, el.querySelector("textarea"));
    });
    panel.querySelectorAll(".nps-managed-record").forEach(el=>{
        const saved=drafts.get(el.dataset.result||el.dataset.feedback||"memory:"+el.dataset.memory);
        if(!saved)return;el.open=saved.open;
        if(saved.dirty){el.dataset.dirty="1";[...el.querySelectorAll("input,textarea,select")].forEach((input,i)=>{if(saved.values[i]!==undefined)input.value=saved.values[i];});}
    });
}
function handleManager(e) {
    const action = e.target.dataset.manager; if (!action) return;
    const s = extension_settings[extensionName], ctx = getContext();
    const record=e.target.closest(".nps-managed-record");if(record)delete record.dataset.dirty;
    if (action.startsWith("feedback-")) {
        const el = e.target.closest("[data-feedback]"), f = s.feedbackRecords.find(f => f.id === el.dataset.feedback);
        if (action === "feedback-save") { f.note = el.querySelector("textarea").value.slice(0, 1000); f.reason = el.querySelector(".nps-preference-reason").value; f.scope = el.querySelector(".nps-preference-scope").value; }
        else s.feedbackRecords = s.feedbackRecords.filter(r => r.id !== f.id);
        persist();
    } else if (action.startsWith("memory-")) {
        const el = e.target.closest("[data-memory]"), memory = validMemory(ctx), i = Number(el.dataset.memory), item = memory.items[i];
        if (!item) return;
        const stored = ctx.chatMetadata[MEMORY_KEY];
        const index = stored.items.indexOf(item);
        if (action === "memory-delete") stored.items.splice(index, 1);
        else { item.text = el.querySelector("textarea").value.slice(0, 800); item.category = el.querySelector("select").value; }
        ctx.saveMetadataDebounced(); state.contextRevision = (state.contextRevision || 0) + 1;
    } else if (action === "legacy-delete") { s.legacyFeedbackKeywords = []; persist(); }
    refreshStudio();
}
export function contextReportHtml() {
    const r = state.lastContextReport;
    if (!r) return "<p>추천 생성 후 실제 입력 범위와 적용 설정을 표시합니다.</p>";
    const ids = list => list?.length ? list.map(id => "M" + id).join(", ") : "없음";
    return `<div class="nps-context-report"><p>입력 ${r.total} + 출력 예약 ${r.outputReserve} / 예산 ${r.budget} 토큰 · ${esc(r.method || "SillyTavern tokenizer")}${r.cacheHit ? " · 캐시 결과" : ""}</p>
      <p>원문: ${ids(r.recent)}<br>발췌: ${ids(r.excerpts)}<br>부분 생략: ${ids(r.partial)}<br>이번 입력에서 제외: ${ids(r.omitted)}</p>
      <p>자료: ${(r.sources || []).map(s => esc(s.name) + (s.truncated ? " (일부 생략)" : "")).join(", ") || "없음"}<br>제외된 자료: ${esc((r.excluded || []).join(", ")) || "없음"}</p>
      ${(r.warnings || []).map(w => `<p>${esc(w)}</p>`).join("")}
      <p>맥락 수집 ${Math.round(r.contextMs || 0)}ms · API 대기 ${Math.round(r.apiMs || 0)}ms · 호출 ${r.calls || 0}회</p>
      ${r.effectiveApi ? `<p>모델 ${esc(String(r.effectiveApi.model))} · 온도 ${esc(String(r.effectiveApi.temperature))} · 출력 ${r.effectiveApi.maxTokens}<br>${esc(r.effectiveApi.cancel)}</p>` : ""}
      <details><summary>확장이 전송한 프롬프트 보기</summary><p>현재 연결은 SillyTavern에서 추가 변환할 수 있습니다. 호출별 입력을 아래에 표시합니다.</p>${(r.stages || [{ prompt: r.prompt }]).map((s, i) => `<label>호출 ${i + 1}<textarea readonly rows="12">${esc(s.prompt || "")}</textarea></label>`).join("")}</details></div>`;
}
export function openFeedback(item, polarity = "negative") {
    if (!item) return;
    item.querySelector(".nps-feedback-form")?.remove();
    const form = document.createElement("div"); form.className = "nps-feedback-form";
    const choices = polarity === "positive" ? { choice: reasons.choice, payoff: reasons.payoff, relationship: reasons.relationship, prose: reasons.prose, other: reasons.other } : reasons;
    form.innerHTML = `<label>이유 <select class="reason">${opt(choices)}</select></label><label>적용 범위 <select class="scope">${opt({ scene: "이번 장면", story: "이 작품", global: "전체 취향" }, "scene")}</select></label><textarea placeholder="어떤 점이 좋거나 아쉬웠나요? 인물 이름을 자동 금지하지 않습니다."></textarea><button type="button" class="save">기록</button><button type="button" class="dismiss">닫기</button>`;
    form.addEventListener("click", e => {
        e.stopPropagation();
        if (e.target.classList.contains("dismiss")) form.remove();
        if (e.target.classList.contains("save")) {
            recordFeedback({ polarity, reason: form.querySelector(".reason").value, scope: form.querySelector(".scope").value, note: form.querySelector("textarea").value, suggestion: item.dataset.suggestion });
            form.remove(); refreshStudio(); toastr.success("취향을 기록했습니다.");
        }
    });
    item.appendChild(form);
}
export function decorateCandidates(container, candidates = state.candidates || [], singleItem = null) {
    const items = singleItem ? [singleItem] : [...container.querySelectorAll(".nps-suggestion-item")];
    items.forEach((item, i) => {
        if (item.querySelector(".nps-candidate-tools")) return;
        const c = candidates[i]; if (!c) return;
        item.dataset.candidateId=c.id||"";
        const tools = document.createElement("div"); tools.className = "nps-candidate-tools";
        tools.innerHTML = `<details><summary>이 추천의 근거와 변화</summary><p>${esc(c.mechanism || "구조 설명 없음")}</p><p>${esc(c.change || "")}</p>${c.evidence.length ? c.evidence.map(e => `<p><button type="button" data-source="${e.id}">M${e.id} 보기</button> ${esc(e.quote)}</p>`).join("") : "<p>검증된 원문 인용 없음 · 설정과의 일치 여부를 확인해 주세요.</p>"}<p>${esc(c.caveat || "")}</p></details><button type="button" class="nps-expand-one">문장으로 확장</button><details><summary>이 후보만 수정</summary><textarea placeholder="예: 핵심 아이디어는 유지하고 외부인 등장만 빼줘"></textarea><button type="button" class="nps-revise-one">수정 생성</button></details>`;
        tools.addEventListener("click", e => {
            e.stopPropagation();
            const source = e.target.dataset.source;
            if (source) document.querySelector(`#chat .mes[mesid="${Number(source) - 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            if (e.target.classList.contains("nps-expand-one")) callbacks.revise(item, "핵심 전개를 그대로 유지하며 소설 문장으로 확장", true);
            if (e.target.classList.contains("nps-revise-one")) {
                const value = tools.querySelector("textarea").value.trim();
                if (value) callbacks.revise(item, value, false);
            }
        });
        item.appendChild(tools);
    });
    if (!singleItem && !container.querySelector(".nps-result-context")) {
        const details = document.createElement("details"); details.className = "nps-result-context";
        details.innerHTML = "<summary>이번에 무엇을 읽었나</summary>" + contextReportHtml(); container.appendChild(details);
    }
}
