import { defaultSettings, defaultQualityPrompts, narrativeStages, plotBeats } from "./constants.js";
const ranges = { sentenceCount:[1,12], suggestionCount:[1,10], previewCount:[3,10], candidateCount:[3,10], maxTokens:[128,32768], maxContextTokens:[2048,262144], temperature:[0,2], similarityThreshold:[0,1], compressionThreshold:[10,100], autoSuggestDelay:[500,10000], suggestionLength:[1,10], creativityLevel:[1,10], dialogueRatio:[0,10], requestTimeoutMs:[10000,600000] };
const enums={outputLanguage:["ko","en","ja"],apiType:["current","profile","custom"],llmProvider:["openai","claude","google","cohere"],generationMode:["fast","quality"],outputMode:["outline","prose"],planningScope:["scene","next","arc"],noveltyPolicy:["established","organic","open"],selectedWritingStyle:Object.keys(defaultQualityPrompts)};
function shaped(base,value) {
    if (Array.isArray(base)) return Array.isArray(value) ? value : base;
    if (base && typeof base==="object") return Object.fromEntries(Object.entries(base).map(([k,v])=>[k,shaped(v,value?.[k])]));
    return typeof value===typeof base ? value : base;
}
export function sanitizeSettings(saved={}) {
    if(!saved || typeof saved!=="object" || Array.isArray(saved))saved={};
    const result=Object.fromEntries(Object.entries(defaultSettings).map(([k,v])=>[k,shaped(v,saved?.[k])]));
    for(const [k,[min,max]] of Object.entries(ranges)){const n=Number(result[k]);result[k]=Number.isFinite(n)?Math.max(min,Math.min(max,n)):defaultSettings[k];if(!["temperature","similarityThreshold"].includes(k))result[k]=Math.round(result[k]);}
    for(const [k,values] of Object.entries(enums))if(!values.includes(result[k]))result[k]=defaultSettings[k];
    const strings=a=>a.filter(x=>typeof x==="string").slice(0,100);
    result.selectedGenres=strings(result.selectedGenres);
    result.plotBeats=strings(result.plotBeats).filter(id=>plotBeats.some(b=>b.id===id));
    result.customGenres=result.customGenres.filter(g=>g&&typeof g.id==="string"&&typeof g.name==="string").map(g=>({id:g.id,name:g.name,nameKo:typeof g.nameKo==="string"?g.nameKo:g.name})).slice(0,100);
    result.customQualityPrompts=result.customQualityPrompts.filter(q=>q&&typeof q.name==="string"&&typeof q.prompt==="string").map(q=>({id:String(q.id||q.name),name:q.name,prompt:q.prompt,enabled:q.enabled===true})).slice(0,100);
    result.conditionalRules=result.conditionalRules.filter(r=>r&&typeof r.condition==="string"&&typeof r.action==="string").map(r=>({condition:r.condition,action:r.action,enabled:r.enabled===true})).slice(0,100);
    result.quickTemplates=result.quickTemplates.filter(t=>t&&typeof t.text==="string").map(t=>({text:t.text})).slice(0,100);
    result.feedbackRecords=result.feedbackRecords.filter(f=>f&&typeof f.suggestion==="string"&&["positive","negative"].includes(f.polarity)&&["scene","story","global"].includes(f.scope)).map(f=>({...f,id:String(f.id||""),note:typeof f.note==="string"?f.note:"",reason:typeof f.reason==="string"?f.reason:"other"})).slice(-150);
    result.settingsProfiles=result.settingsProfiles.filter(p=>p&&typeof p.name==="string"&&p.data&&typeof p.data==="object"&&!Array.isArray(p.data)).map(p=>({name:p.name,data:Object.fromEntries(Object.entries(p.data).filter(([k])=>k in defaultSettings&&!["apiKey","settingsProfiles","feedbackRecords"].includes(k))),createdAt:Number(p.createdAt)||0})).slice(0,100);
    result.negativeFeedbackKeywords=strings(result.negativeFeedbackKeywords);
    result.moodSettings.sensoryFocus=strings(result.moodSettings.sensoryFocus);
    result.inputSources.chatHistory=true;
    result.narrativeArc.autoDetect=false;
    if(!narrativeStages.some(n=>n.id===result.narrativeArc.manualStage))result.narrativeArc.manualStage="";
    if(!["auto","character","relationship","environment","custom"].includes(result.focusTarget.type))result.focusTarget.type="auto";
    result.pacing.speed=Math.max(1,Math.min(10,Number(result.pacing.speed)||5));
    if(!["immediate","short","scene_change","montage"].includes(result.pacing.timeframe))result.pacing.timeframe="immediate";
    result.moodSettings.emotionalIntensity=Math.max(1,Math.min(10,Number(result.moodSettings.emotionalIntensity)||5));
    if(!["gradual","sudden"].includes(result.emotionCurve.transitionSpeed))result.emotionCurve.transitionSpeed="gradual";
    for(const k of ["previousSettings","legacyFeedbackKeywords"])if(saved[k]!==undefined)result[k]=k==="legacyFeedbackKeywords"?strings(Array.isArray(saved[k])?saved[k]:[]):JSON.parse(JSON.stringify(saved[k],(key,value)=>key==="apiKey"?undefined:value));
    return result;
}
export function mergeSettings(current,incoming) {
    const merged={...current};
    for(const k of Object.keys(defaultSettings))if(k!=="apiKey"&&Object.hasOwn(incoming||{},k)){
        const value=incoming[k];merged[k]=defaultSettings[k]&&typeof defaultSettings[k]==="object"&&!Array.isArray(defaultSettings[k])?{...current[k],...value}:value;
    }
    return sanitizeSettings(merged);
}
