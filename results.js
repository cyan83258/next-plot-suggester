import { extension_settings, getContext } from "../../../extensions.js";
import { extensionName } from "./constants.js";
import { state } from "./state.js";
import { clone, sceneId, storyId } from "./story.js";
const KEY="npsResultHistoryV1";
export function resultHistory() { const records=getContext().chatMetadata?.[KEY];return Array.isArray(records)?records:[]; }
export function saveResult(candidates=state.candidates, mode=state.resultMode || "outline", direction=state.resultDirection || "") {
    if(!candidates?.length || state.resultStory && state.resultStory!==storyId())return;
    const ctx=getContext();ctx.chatMetadata ||= {};
    const records=ctx.chatMetadata[KEY] = resultHistory();
    const fingerprint=JSON.stringify(candidates);
    if(records.at(-1)?.fingerprint===fingerprint)return records.at(-1);
    const record={id:crypto.randomUUID(),at:Date.now(),scene:state.resultScene||sceneId(),mode,direction,favorite:false,candidates:clone(candidates),fingerprint};
    const settings=extension_settings[extensionName];
    record.configuration={version:"2.2.0",mode,generationMode:settings.generationMode,planningScope:settings.planningScope,noveltyPolicy:settings.noveltyPolicy,sentenceCount:settings.sentenceCount,apiType:settings.apiType,model:state.effectiveApi?.model,temperature:state.effectiveApi?.temperature};
    records.push(record);
    const favorites=records.filter(r=>r.favorite).slice(-20);
    const recent=records.filter(r=>!r.favorite).slice(-20);
    ctx.chatMetadata[KEY]=[...favorites,...recent].sort((a,b)=>a.at-b.at);
    ctx.saveMetadataDebounced();
    return record;
}
export function toggleFavorite(id) { const r=resultHistory().find(r=>r.id===id);if(r){if(!r.favorite && resultHistory().filter(item=>item.favorite).length>=20)return false;r.favorite=!r.favorite;getContext().saveMetadataDebounced();return true;} }
export function updateCandidate(id,text,candidate) {
    const i=(state.candidates||[]).findIndex(c=>c.id===id);
    if(i<0)return;
    saveResult();
    state.candidates[i]=candidate?{...candidate,id}:{...state.candidates[i],text,mechanism:"",trigger:"",action:"",outcome:"",change:"",caveat:"직접 편집한 내용입니다. 이전 근거와 구조 설명은 초기화했습니다.",evidence:[]};
    saveResult();
}
export function reorderCandidates(ids) {
    const byId=new Map((state.candidates||[]).map(c=>[c.id,c]));
    if(ids.length===byId.size&&new Set(ids).size===byId.size&&ids.every(id=>byId.has(id))){state.candidates=ids.map(id=>byId.get(id));saveResult();}
}
export function restoreResult(id) {
    const record=resultHistory().find(r=>r.id===id);if(!record)return null;
    saveResult();state.candidates=clone(record.candidates);state.resultScene=record.scene;state.resultStory=storyId();state.resultMode=record.mode;state.resultDirection=record.direction;state.lastContextReport=null;
    return record;
}

export function rateResult(id,ratings,note="") {
    const record=resultHistory().find(r=>r.id===id);if(!record)return;
    record.ratings=Object.fromEntries(["continuity","motivation","interest","freshness","usability"].map(k=>[k,Math.max(1,Math.min(5,Number(ratings[k])||3))]));
    record.ratingNote=String(note).slice(0,1000);getContext().saveMetadataDebounced();
}
export function recordInteraction(event) {
    if(state.resultStory && state.resultStory!==storyId())return;
    const record=resultHistory().findLast(r=>r.fingerprint===JSON.stringify(state.candidates));
    if(record){record.interactions ||= {};record.interactions[event]=(record.interactions[event]||0)+1;getContext().saveMetadataDebounced();}
}
