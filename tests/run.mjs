// Run: node --experimental-vm-modules tests/run.mjs
// Offline fixtures; no real API requests, account settings, or story files are read.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settings = {};
let ctx = { chat: [], characters: [{ name: '민서', description: '약속을 지키려 한다.', avatar: 'a.png' }], characterId: 0, chatId: 'story-a', name1: '사용자', name2: '민서', chatMetadata: {}, chatCompletionSettings: {}, textCompletionSettings: {}, mainApi: 'openai', saveSettingsDebounced() {}, saveMetadataDebounced() {} };
const handlers = new Map();
const events = { on(n, cb) { const set = handlers.get(n) || new Set(); set.add(cb); handlers.set(n, set); }, removeListener(n, cb) { handlers.get(n)?.delete(cb); }, async emit(n, data) { for (const cb of handlers.get(n) || []) await cb(data); } };
const eventTypes = { CHAT_COMPLETION_SETTINGS_READY: 'settings', APP_READY: 'ready' };
let fetchImpl = async () => { throw new Error('Unexpected network call'); };
const sandbox = vm.createContext({ console: { ...console, log() {} }, crypto: webcrypto, TextEncoder, TextDecoder, performance, setTimeout, clearTimeout, DOMException, AbortController, URL, Blob, fetch: (...args) => fetchImpl(...args), indexedDB: undefined, document: { getElementById() { return null; }, querySelector() { return null; } }, toastr: { info() {}, error() {}, success() {} }, jQuery() {}, navigator: {} });
function stub(name, exports) { return new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context: sandbox, identifier: name }); }
const external = {
    'extensions.js': stub('extensions', { extension_settings: settings, getContext: () => ctx }),
    'script.js': stub('script', { eventSource: events, event_types: eventTypes, saveSettingsDebounced() {}, getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }),
    'secrets.js': stub('secrets', { SECRET_KEYS: { OPENAI: 'openai', CLAUDE: 'claude', MAKERSUITE: 'google', COHERE: 'cohere' }, secret_state: { openai: true, claude: true, google: true, cohere: true } }),
    'world-info.js': stub('world', { selected_world_info: [], loadWorldInfo: async () => ({ entries: {} }) }),
    'openai.js': stub('openai', { createGenerationParameters: async (s, model, type, messages) => ({ generate_data: { model, messages, temperature: s.temp_openai, max_tokens: s.openai_max_tokens, chat_completion_source: s.chat_completion_source } }) }),
};
const modules = new Map();
function moduleFor(file) {
    file = path.resolve(file);
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context: sandbox, identifier: file }));
    return modules.get(file);
}
const entry = moduleFor(path.join(root, 'index.js'));
await entry.link((specifier, referencing) => specifier.startsWith('../') ? external[path.basename(specifier)] : moduleFor(path.resolve(path.dirname(referencing.identifier), specifier)));
await entry.evaluate();
const mod = name => modules.get(path.join(root, name + '.js')).namespace;
const constants = mod('constants'), defaults = constants.defaultSettings;
const story = mod('story'), context = mod('context'), parser = mod('parser'), api = mod('api'), engine = mod('engine'), prompt = mod('prompt'), ui = mod('ui'), state = mod('state').state;
const reset = () => { settings['next-plot-suggester'] = JSON.parse(JSON.stringify(defaults)); ctx.chat = [{ mes: '민서는 약속한 편지를 서랍에 숨겼다.', name: '민서' }, { mes: '서랍의 편지를 돌려주겠다는 약속을 기억했다.', is_user: true }]; ctx.chatId = 'story-a'; ctx.chatMetadata = {}; ctx.chatCompletionSettings = {}; state.contextRevision = 0; state.activeLore = null; state.lastContextReport = null; state.candidates=[];state.resultStory=null;state.resultScene=null;ctx.getTokenCountAsync=undefined;context.clearContextCache(); };
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
test('migration: nested defaults, safe old feedback, zero temperature', () => {
    const s = entry.namespace.migrateSettings({ temperature: 0, maxTokens: 1000, maxContextTokens: 4000, inputSources: { worldInfo: true }, negativeFeedbackKeywords: ['민서는'] });
    assert.equal(s.temperature, 0); assert.equal(s.maxTokens, 2400); assert.equal(s.maxContextTokens, 8000); assert.equal(s.inputSources.charDescription, true); assert.equal(s.negativeFeedbackKeywords.length, 0); assert.equal(s.legacyFeedbackKeywords[0], '민서는');
});
test('history: zero budget does not silently reset to default', () => assert.equal(context.packChat(story.messages(), 0).text, ''));
test('history: every message is accounted for, including original compression gap', () => {
    const msgs = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, role: '민서', text: i === 90 ? '핵심단서 보라빛편지 약속은 유지된다.' : i === 99 ? '핵심단서 보라빛편지 약속을 물었다.' : '길고 조용한 하루의 이야기를 이어 간다. '.repeat(20) }));
    const p = context.packChat(msgs, 1200, true, 20);
    assert.ok(p.excerpts.includes(91), '91st message used to fall between summary and recent window');
    assert.equal(new Set([...p.recent, ...p.excerpts, ...p.omitted]).size, 100);
    assert.ok(p.recent.includes(100));
});
test('history: oversized last message is clipped visibly and tail retained', () => {
    const p = context.packChat([{ id: 1, role: '민서', text: '긴 원문 '.repeat(1000) + '마지막선택' }], 100);
    assert.ok(p.text.includes('마지막선택')); assert.deepEqual(Array.from(p.partial), [1]);
});
test('history: oversized sentence does not block all remaining excerpts', () => {
    const p = context.packChat([{ id: 1, role: 'A', text: '단서 '.repeat(3000) }, { id: 2, role: 'B', text: '짧은 단서의 약속을 지킨다.' }, { id: 3, role: 'B', text: '단서 '.repeat(500) }], 600, true, 1);
    assert.ok(p.excerpts.length > 0);
});
test('context: exact tokenizer budget includes output reservation', async () => {
    ctx.getTokenCountAsync = async text => Math.ceil(text.length / 2);
    const snap = story.snapshot();
    const built = await context.fitContext('Keep canon.\n', snap, { list: [{ name: 'large lore', text: '자료 '.repeat(10000) }], warnings: [] });
    assert.ok(built.report.total + built.report.outputReserve + 128 <= snap.settings.maxContextTokens);
    assert.ok(built.report.recent.length); delete ctx.getTokenCountAsync;
});
test('context: excessive instructions fail rather than exceed budget', async () => {
    await assert.rejects(() => context.fitContext('x'.repeat(50000), story.snapshot(), { list: [], warnings: [] }), /예산/);
});
test('cache: full content and all settings change fingerprint', async () => {
    const snap = story.snapshot(), source = { list: [{ name: 'a', text: 'A'.repeat(600) + 'old' }], warnings: [] };
    const a = await context.fitContext('rules', snap, source);
    const b = await context.fitContext('rules', snap, { ...source, list: [{ name: 'a', text: 'A'.repeat(600) + 'new' }] });
    assert.notEqual(a.report.key, b.report.key);
    snap.settings.customPrompt = 'new'; const c = await context.fitContext('rules', snap, source); assert.notEqual(a.report.key, c.report.key);
});
test('source loader: unchanged source avoids loader entirely; invalidation reloads', async () => {
    let calls = 0; const loader = () => ++calls;
    await context.loadContextSource('x', loader); await context.loadContextSource('x', loader);
    assert.equal(calls, 1); context.clearContextCache(); await context.loadContextSource('x', loader); assert.equal(calls, 2);
});
test('snapshot: settings, swipe, chat switch and external revision make result stale', () => {
    let snap = story.snapshot(); ctx.chat[0].swipe_id = 1; assert.equal(story.isCurrent(snap), false);
    snap = story.snapshot(); settings['next-plot-suggester'].creativityLevel = 9; assert.equal(story.isCurrent(snap), false);
    snap = story.snapshot(); ctx.chatId = 'other'; assert.equal(story.isCurrent(snap), false);
    snap = story.snapshot(); state.contextRevision++; assert.equal(story.isCurrent(snap), false);
});
test('feedback: scene / story / global scopes do not leak across chats', () => {
    story.recordFeedback({ polarity: 'negative', reason: 'rush', scope: 'scene' });
    story.recordFeedback({ polarity: 'positive', reason: 'choice', scope: 'story' });
    story.recordFeedback({ polarity: 'positive', reason: 'prose', scope: 'global' });
    assert.equal(story.activeFeedback(settings['next-plot-suggester'], ctx).length, 3);
    ctx.chat.push({ mes: '다음 장면' }); assert.equal(story.activeFeedback(settings['next-plot-suggester'], ctx).length, 2);
    ctx.chatId = 'other'; assert.equal(story.activeFeedback(settings['next-plot-suggester'], ctx).length, 1);
});
test('memory: edit invalidates deductions from later messages', () => {
    const msgs = story.messages();
    ctx.chatMetadata[story.MEMORY_KEY] = { story: story.storyId(), sourceMessages: JSON.parse(JSON.stringify(msgs)), items: [{ category: 'fact', text: '편지를 숨겼다', evidence: [{ id: 1, quote: '편지를 서랍에 숨겼다.' }], through: 2 }] };
    assert.equal(story.validMemory(ctx).items.length, 1); ctx.chat[1].mes = '다른 선택'; assert.equal(story.validMemory(ctx).items.length, 0);
});
test('evidence: invented quotes are rejected', () => assert.equal(story.validateEvidence([{ id: 1, quote: '그는 사실 왕자였다.' }], story.messages()).length, 0));
test('parser: preserves structured plot, filters empty entries and false evidence', () => {
    const list = parser.parseCandidates(JSON.stringify({ suggestions: [{ text: '추천', evidence: [{ id: 1, quote: '편지를 서랍에 숨겼다.' }] }, { text: ' ' }, ''] }), story.messages());
    assert.equal(list.length, 1); assert.equal(list[0].evidence.length, 1);
});
test('parser: truncated JSON is not shown as a suggestion', () => assert.throws(() => parser.parseCandidates('{"suggestions":["abc', [], true), /JSON/));
test('diversity: preserves editorial ranking rather than quote-count bias', () => {
    const result = parser.selectDiverse([{ text: '같은 전개', mechanism: '같은 구조', evidence: [] }, { text: '같은 전개', mechanism: '같은 구조', evidence: [{ id: 1 }] }], 2);
    assert.equal(result.length, 1); assert.equal(result[0].evidence.length, 0);
});
test('API: handles Gemini parts and normalized chat completion data', () => {
    assert.equal(api.extractResponse({ candidates: [{ content: { parts: [{ text: 'internal', thought: true }, { text: 'answer' }] } }] }), 'answer');
    assert.equal(api.extractResponse({ choices: [{ message: { content: 'answer' } }] }), 'answer');
});
test('API: 400 is never retried', async () => {
    let calls = 0; await assert.rejects(() => api.withRetry(async () => { calls++; const e = new Error('bad'); e.status = 400; throw e; }, null), /bad/); assert.equal(calls, 1);
});
test('API: backoff is immediately cancellable', async () => {
    const controller = new AbortController(); const waiting = api.delay(10000, controller.signal); controller.abort(); await assert.rejects(waiting, { name: 'AbortError' });
});
test('API: custom route sends temperature zero and output limit', async () => {
    let sent; fetchImpl = async (url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }; };
    await api.sendApiRequest('test', null, { ...defaults, apiType: 'custom', apiEndpoint: 'https://example.invalid', apiModel: 'test', temperature: 0, maxTokens: 333 });
    assert.equal(sent.temperature, 0); assert.equal(sent.max_tokens, 333);
});
test('API: current route changes only matching request, never global preset', async () => {
    ctx.chatCompletionSettings = { temp_openai: 0.7 };
    ctx.generateRaw = async args => {
        assert.equal(args.responseLength, 333);
        const unrelated = { messages: [{ content: 'other' }], temperature: 0.3, max_tokens: 111 };
        await events.emit('settings', unrelated); assert.equal(unrelated.temperature, 0.3);
        const ours = { messages: [{ content: 'test' }], temperature: 0.7, max_tokens: 111 };
        await events.emit('settings', ours); assert.equal(ours.temperature, 0); assert.equal(ours.max_tokens, 333); return 'ok';
    };
    await api.sendApiRequest('test', null, { ...defaults, maxTokens: 333, temperature: 0 });
    assert.equal(ctx.chatCompletionSettings.temp_openai, 0.7); assert.equal(handlers.get('settings').size, 0);
});
test('queue: cancel then enqueue remains serial until previous task settles', async () => {
    const q = mod('queue').requestQueue; let release, secondStarted = false;
    const first = q.enqueue(() => new Promise(resolve => { release = resolve; }));
    q.cancel(); const second = q.enqueue(async () => { secondStarted = true; return 2; });
    await Promise.resolve(); assert.equal(secondStarted, false); release(1); await first; assert.equal(await second, 2);
});
test('preview: shared user constraints, AU, and feedback included', async () => {
    settings['next-plot-suggester'].customPrompt = '장소를 유지한다'; settings['next-plot-suggester'].sceneLocks.noNewCharacters = true;
    settings['next-plot-suggester'].inputSources.auWorldBuilder = true;
    settings['AU-World-Builder'] = { chatData: { 'story-a': { worldSetting: '마법이 사라진 세계' } } };
    const p = await prompt.preparePrompt(story.snapshot(), { mode: 'preview', count: 3 });
    assert.ok(p.prompt.includes('장소를 유지한다')); assert.ok(p.prompt.includes('마법이 사라진 세계')); assert.ok(p.prompt.includes('no new characters')); assert.ok(!p.prompt.includes('Dream-logic'));
});
test('prompt: selected output language overrides foreign story language and sentence count is authoritative', async () => {
    ctx.chat = [{ mes: '彼は駅で手紙を隠した。', name: '민서' }, { mes: 'What happens next?', is_user: true }];
    settings['next-plot-suggester'].outputLanguage = 'ko';
    settings['next-plot-suggester'].sentenceCount = 6;
    settings['next-plot-suggester'].suggestionLength = 1;
    const built = await prompt.preparePrompt(story.snapshot());
    assert.ok(built.prompt.includes('ABSOLUTE REQUIREMENT'));
    assert.ok(built.prompt.includes('regardless of the language used in the story material'));
    assert.ok(built.prompt.includes('approximately 6 sentences'));
});
test('prompt quality: diagnoses the live scene and requires causal, scene-ready progress', () => {
    assert.ok(prompt.PLOT_RULES.includes('SILENT STORY DIAGNOSIS'));
    assert.ok(prompt.PLOT_RULES.includes('exact dramatic moment'));
    assert.ok(prompt.PLOT_RULES.includes('changed set of options'));
    assert.ok(prompt.PLOT_RULES.includes('inevitable in retrospect'));
    assert.ok(prompt.PLOT_RULES.includes('entirely with people, objects, information, and pressures already present'));
});
test('style controls: never trade causality for atmosphere or manufacture genre events', () => {
    const text = [
        ...Object.values(constants.defaultQualityPrompts).map(item => item.prompt),
        ...constants.defaultMoods.map(item => item.prompt),
        ...constants.sceneAtmospheres.map(item => item.prompt || ''),
    ].join('\n').toLowerCase();
    for (const bad of ['prioritize emotional resonance and atmosphere over plot mechanics', 'subtle supernatural elements', 'make the stakes feel world-changing', 'fluid logic', 'include comedic timing, exaggerated reactions']) assert.equal(text.includes(bad), false, bad);
    assert.ok(text.includes('causal'));
    assert.ok(text.includes('do not invent'));
});
test('language guard: detects Japanese or English leakage in Korean output', () => {
    assert.equal(engine.needsLanguageRepair([{ text: '彼は駅へ向かう。' }], 'ko'), true);
    assert.equal(engine.needsLanguageRepair([{ text: 'He walks to the station and decides to reveal the letter.' }], 'ko'), true);
    assert.equal(engine.needsLanguageRepair([{ text: '그는 역으로 가서 편지를 공개하기로 결심한다.' }], 'ko'), false);
});
test('engine: automatically repairs a response written in the source language', async () => {
    ctx.chat = [{ mes: 'He hid the letter at the station.', name: '민서' }];
    settings['next-plot-suggester'].generationMode = 'fast';
    settings['next-plot-suggester'].suggestionCount = 1;
    settings['next-plot-suggester'].similarityThreshold = 0;
    let calls = 0;
    ctx.generateRaw = async () => ++calls === 1
        ? JSON.stringify({ suggestions: [{ text: 'He returns to the station and decides to reveal the hidden letter.', mechanism: 'reveal' }] })
        : JSON.stringify({ suggestions: [{ text: '그는 역으로 돌아가 숨긴 편지를 공개하고 관계의 주도권을 바꾼다.', mechanism: '공개' }] });
    const result = await engine.generate(story.snapshot(), new AbortController().signal, { skipCache: true });
    assert.equal(calls, 2);
    assert.match(result[0].text, /[가-힣]/);
});
test('number input: temporary blank is preserved while typing and normalized only on commit', () => {
    assert.equal(ui.parseLiveInteger('', 1, 10), null);
    assert.equal(ui.parseLiveInteger('10', 1, 10), 10);
    assert.equal(ui.normalizeInteger('', 6, 1, 10), 6);
    assert.equal(ui.normalizeInteger('99', 6, 1, 10), 10);
});
test('regeneration: every attempt carries prior candidates and a new prompt fingerprint', () => {
    const previous = [{ text: '이전 전개', mechanism: '편지 공개' }];
    const first = entry.namespace.buildRegenerationTask(previous);
    const second = entry.namespace.buildRegenerationTask(previous);
    assert.ok(first.includes('이전 전개'));
    assert.ok(first.includes('Do not paraphrase'));
    assert.notEqual(first, second);
});
test('quality review: uses an explicit editorial rubric and rejects fatal story defects', () => {
    const task = engine.buildReviewTask([{ text: '후보' }], 2);
    assert.ok(task.includes('continuity and scene-boundary fit'));
    assert.ok(task.includes('meaningful before->after change'));
    assert.ok(task.includes('Fatal defects'));
    assert.ok(task.includes('REPAIR weak execution'));
    const refill = engine.buildRefillTask([{ text: '선택됨' }], 1);
    assert.ok(refill.includes('Do not paraphrase'));
    assert.ok(refill.includes('different live threads'));
});
test('engine: quality mode reviews candidates using a second call', async () => {
    settings['next-plot-suggester'].generationMode = 'quality'; settings['next-plot-suggester'].suggestionCount = 2; settings['next-plot-suggester'].similarityThreshold = 0;
    let calls = 0;
    ctx.generateRaw = async () => { calls++; return JSON.stringify({ suggestions: [{ text: '민서가 서랍을 열어 약속을 지킬 기회를 만든다.', mechanism: '약속 이행', evidence: [{ id: 1, quote: '편지를 서랍에 숨겼다.' }] }, { text: '편지의 전달 조건을 협상하면서 관계의 주도권이 달라진다.', mechanism: '협상', evidence: [] }] }); };
    const result = await engine.generate(story.snapshot(), new AbortController().signal, { skipCache: true });
    assert.equal(calls, 2); assert.equal(result.length, 2); assert.equal(state.lastContextReport.stages.length, 2);
});
test('engine: chat switch during request cannot cache or display result', async () => {
    ctx.generateRaw = async () => { ctx.chatId = 'switched'; return '{"suggestions":[{"text":"stale"}]}'; };
    await assert.rejects(() => engine.generate(story.snapshot(), new AbortController().signal, { skipCache: true }), { name: 'AbortError' });
});
test('memory: generation stores only validated evidence and coverage', async () => {
    ctx.generateRaw = async () => JSON.stringify({ items: [{ category: 'fact', text: '편지를 숨겼다.', evidence: [{ id: 1, quote: '편지를 서랍에 숨겼다.' }] }, { category: 'fact', text: '왕자였다.', evidence: [{ id: 1, quote: '왕자였다.' }] }] });
    const result = await engine.updateMemory(story.snapshot(), new AbortController().signal);
    assert.equal(result.done, true); assert.equal(result.count, 1); assert.equal(story.validMemory(ctx).items.length, 1);
});
let failed = 0;
test('memory: long message continues from saved offset without skipping its tail', async () => {
    ctx.chat = [{ mes: '편지를 숨겼다. '.repeat(1600) + '마지막에는 편지를 돌려주었다.', name: '민서' }];
    let calls = 0;
    ctx.generateRaw = async ({ prompt: text }) => { calls++; return JSON.stringify({ items: [{ category: text.includes('마지막에는 편지를 돌려주었다.') ? 'resolved' : 'fact', text: '편지의 상태', evidence: [{ id: 1, quote: text.includes('마지막에는 편지를 돌려주었다.') ? '마지막에는 편지를 돌려주었다.' : '편지를 숨겼다.' }] }] }); };
    let result;
    for (let i = 0; i < 8; i++) { result = await engine.updateMemory(story.snapshot(), new AbortController().signal); if (result.done) break; }
    assert.equal(result.done, true); assert.ok(calls > 1); assert.equal(story.validMemory(ctx).items[0].category, 'resolved');
});
test('API: profile route also sends max_tokens and preserves temperature zero', async () => {
    let sent;
    fetchImpl = async (url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) }; };
    await api.sendApiRequest('test', null, { ...defaults, apiType: 'profile', llmProvider: 'claude', llmModel: 'test-model', temperature: 0, maxTokens: 777 });
    assert.equal(sent.max_tokens, 777); assert.equal(sent.temperature, 0); assert.equal(sent.chat_completion_source, 'claude');
});
test('engine: cache reused only for identical final prompt and settings', async () => {
    let calls = 0;
    ctx.generateRaw = async () => { calls++; return '{"suggestions":[{"text":"하나의 방향"}]}'; };
    settings['next-plot-suggester'].generationMode = 'fast';
    settings['next-plot-suggester'].suggestionCount = 1;
    const signal = new AbortController().signal;
    await engine.generate(story.snapshot(), signal, { skipCache: true }); await engine.generate(story.snapshot(), signal);
    assert.equal(calls, 1);
    settings['next-plot-suggester'].customPrompt = '다른 방향';
    await engine.generate(story.snapshot(), signal); assert.equal(calls, 2);
});
test('lore: captured activation belongs only to its story and generation', async () => {
    context.captureActivatedLore({ activated: { entries: new Set([{ content: '실제 활성 항목', uid: 1 }]) } });
    const a = await context.getWorldInfoBefore(story.snapshot()); assert.equal(a.entries.length, 1);
    ctx.chat.push({ mes: '새 응답' }); const b = await context.getWorldInfoBefore(story.snapshot()); assert.equal(b.entries.length, 1);
    ctx.chatId = 'different'; const c = await context.getWorldInfoBefore(story.snapshot()); assert.equal(c.entries.length, 0);
});

const configuration=mod('settings'),results=mod('results');
test('settings: malformed nested data, enums and bounded integers are normalized',()=>{
    const s=configuration.sanitizeSettings({sentenceCount:99.8,temperature:0,inputSources:null,moodSettings:{sensoryFocus:[null,'touch']},outputMode:'wrong',quickTemplates:[null,{text:'문장'}],narrativeArc:{autoDetect:true},legacyFeedbackKeywords:null});
    assert.equal(s.sentenceCount,12);assert.equal(s.temperature,0);assert.equal(s.outputMode,'outline');assert.equal(s.inputSources.chatHistory,true);assert.equal(s.moodSettings.sensoryFocus.length,1);assert.equal(s.narrativeArc.autoDetect,false);assert.equal(configuration.sanitizeSettings(null).sentenceCount,2);assert.equal(entry.namespace.migrateSettings(null).generationMode,'quality');
});
test('settings: imports deeply merge defaults without replacing API secrets',()=>{
    const s=configuration.mergeSettings({...defaults,apiKey:'keep-secret'},{apiKey:'overwrite',sceneLocks:{keepLocation:true},inputSources:{worldInfo:true},maxTokens:'bad'});
    assert.equal(s.apiKey,'keep-secret');assert.equal(s.sceneLocks.keepLocation,true);assert.equal(s.sceneLocks.userAgency,true);assert.equal(s.inputSources.charDescription,true);assert.equal(s.maxTokens,defaults.maxTokens);
    assert.equal(configuration.sanitizeSettings({previousSettings:{apiKey:'secret',nested:{apiKey:'secret'}}}).previousSettings.apiKey,undefined);
});
test('language: one foreign candidate or metadata field cannot hide among Korean outputs',()=>{
    assert.equal(engine.needsLanguageRepair([{text:'한국어 후보가 충분히 길어도 개별 언어를 검사한다.'},{text:'He returns the letter to avoid the broken promise.'}],'ko'),true);
    assert.equal(engine.needsLanguageRepair([{text:'그는 약속을 이행한다.',mechanism:'negotiation'}],'ko'),true);
    assert.equal(engine.needsLanguageRepair([{text:'한국어 The letter changes everything about their previous agreement.'}],'ko'),true);
    assert.equal(engine.needsLanguageRepair([{text:'ミンソ는 편지를 돌려주며 약속을 지킨다.'}],'ko',['ミンソ']),false);
});
test('language: failed correction is rejected rather than silently displayed',async()=>{
    settings['next-plot-suggester'].generationMode='fast';settings['next-plot-suggester'].suggestionCount=1;
    ctx.generateRaw=async()=>JSON.stringify({suggestions:[{text:'He returns the letter and changes their agreement.'}]});
    await assert.rejects(()=>engine.generate(story.snapshot(),new AbortController().signal,{skipCache:true}),/언어 교정 후/);
});
test('review: regeneration request and exact original material survive all stages',async()=>{
    const sent=[];settings['next-plot-suggester'].suggestionCount=1;
    ctx.generateRaw=async({prompt:text})=>{sent.push(text);return JSON.stringify({suggestions:[{text:'민서는 서랍을 열어 편지를 건네고 약속의 이행을 직접 확인시킨다.',trigger:'편지 전달 약속',action:'편지 반환',outcome:'책임 이행',mechanism:'약속 이행',evidence:[]}]});};
    await engine.generate(story.snapshot(),new AbortController().signal,{skipCache:true,task:'CUSTOM REGENERATION KEEP THIS'});
    assert.equal(sent.length,2);assert.ok(sent.every(p=>p.includes('CUSTOM REGENERATION KEEP THIS')));
    const material=p=>p.slice(p.lastIndexOf('<story_material>'));assert.equal(material(sent[0]),material(sent[1]));
});
test('format: one repair is recorded with its actual prompt and no proposal evidence leakage',async()=>{
    settings['next-plot-suggester'].generationMode='fast';settings['next-plot-suggester'].suggestionCount=1;
    let count=0;ctx.generateRaw=async()=>++count===1?'{"suggestions":[{"text":"잘린 결과"':JSON.stringify({suggestions:[{text:'민서는 서랍을 열어 편지를 건네고 약속을 이행한다.',evidence:[{id:1,quote:'없는 증거'}]}]});
    const answer=await engine.generate(story.snapshot(),new AbortController().signal,{skipCache:true});
    assert.equal(count,2);assert.equal(answer[0].evidence.length,0);assert.equal(state.lastContextReport.stages.length,2);assert.equal(state.lastContextReport.calls,2);
});
test('format: malformed response repair never loops',async()=>{
    settings['next-plot-suggester'].generationMode='fast';let count=0;ctx.generateRaw=async()=>{count++;return '{"suggestions":[';};
    await assert.rejects(()=>engine.generate(story.snapshot(),new AbortController().signal,{skipCache:true}));assert.equal(count,2);
    assert.throws(()=>parser.parseCandidates('null'),/JSON 객체/);
});
test('diversity: identical trigger-action-outcome and Japanese near-duplicates are removed',()=>{
    const first={text:'서로 다른 표현이어도 사건 뼈대는 같다.',trigger:'반환 약속',action:'서랍을 열고 편지를 건넨다',outcome:'편지가 돌아간다',evidence:[]};
    assert.equal(parser.selectDiverse([first,{...first,text:'민서가 즉시 편지를 돌려주는 방법이다.'}],2).length,1);
    assert.equal(parser.selectDiverse([{text:'彼は手紙を返して約束を守る。'},{text:'彼は手紙を返して約束を守った。'}],2).length,1);
});
test('history: edits are archived, restored, and isolated across chats',()=>{
    state.candidates=[{id:'one',text:'원래 후보',mechanism:'반환',evidence:[]}];state.resultStory=story.storyId();state.resultScene=story.sceneId();results.saveResult();
    const original=results.resultHistory()[0].id;results.updateCandidate('one','편집 후보');
    assert.equal(results.resultHistory().length,2);assert.equal(state.candidates[0].evidence.length,0);
    results.restoreResult(original);assert.equal(state.candidates[0].text,'원래 후보');
    ctx.chatId='other';ctx.chatMetadata={};results.saveResult();assert.equal(results.resultHistory().length,0);
});
test('history: favorites capped at twenty and reorder keeps stable identities',()=>{
    state.resultStory=story.storyId();state.resultScene=story.sceneId();
    for(let i=0;i<20;i++){state.candidates=[{id:'one',text:'후보 '+i,evidence:[]}];const record=results.saveResult();assert.equal(results.toggleFavorite(record.id),true);}
    state.candidates=[{id:'one',text:'새 후보',evidence:[]},{id:'two',text:'다른 후보',evidence:[]}];const latest=results.saveResult();assert.equal(results.toggleFavorite(latest.id),false);
    results.reorderCandidates(['two','one']);assert.equal(state.candidates[0].id,'two');assert.equal(results.resultHistory().filter(r=>r.favorite).length,20);
});
test('API: timeout covers response body as well as connection headers',async()=>{
    fetchImpl=async(url,options)=>({ok:true,json:()=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}))});
    await assert.rejects(()=>api.sendApiRequest('test',null,{...defaults,apiType:'custom',apiEndpoint:'https://fixture.invalid',apiModel:'test',requestTimeoutMs:20}),{name:'TimeoutError'});
});
test('API: provider errors retain guidance but mask key-like secrets',async()=>{
    fetchImpl=async()=>({ok:false,status:401,headers:{get:()=>null},json:async()=>({error:{message:'invalid sk-private-secret'}})});
    await assert.rejects(()=>api.sendApiRequest('test',null,{...defaults,apiType:'custom',apiEndpoint:'https://fixture.invalid',apiModel:'test'}),error=>error.message.includes('API 키')&&!error.message.includes('sk-private-secret'));
});
test('regeneration: repeated exact results are rejected after one bounded refill',async()=>{
    settings['next-plot-suggester'].generationMode='fast';settings['next-plot-suggester'].suggestionCount=1;let calls=0;
    const previous={text:'민서는 편지를 돌려주며 전달 약속을 이행한다.',evidence:[]};
    ctx.generateRaw=async()=>{calls++;return JSON.stringify({suggestions:[previous]});};
    await assert.rejects(()=>engine.generate(story.snapshot(),new AbortController().signal,{skipCache:true,task:'다른 전개',avoid:[previous]}),/이전 결과와 구별/);assert.equal(calls,2);
});
test('quality: realistic six-candidate review fits the default budget with unchanged long context',async()=>{
    ctx.chat=Array.from({length:35},(_,i)=>({name:'민서',mes:'편지를 돌려주기로 한 약속과 배편을 얻으려는 목표가 맞물렸다. '+i+'번째 화물은 이미 확인했다.'}));
    settings['next-plot-suggester'].similarityThreshold=0;let calls=0;
    ctx.generateRaw=async()=>{calls++;return JSON.stringify({suggestions:Array.from({length:6},(_,i)=>({text:'민서는 봉인을 확인시킨 뒤 전달 조건을 다시 제안한다. 상인이 인수증에 서명하게 해서 배편의 보장을 받아내고, 귀환 목표를 실제로 진전시킨다. '+i,mechanism:'교환 조건 협상',trigger:'출항이 다가오는 상황',action:'전달과 배편의 보장을 묶어 협상한다',outcome:'인수증과 탑승 약속을 받아낸다',change:'불확실한 목표에서 확인 가능한 합의로 바뀐다',evidence:[]}))});};
    const answers=await engine.generate(story.snapshot(),new AbortController().signal,{skipCache:true});
    assert.equal(calls,2);assert.equal(answers.length,3);assert.ok(state.lastContextReport.stages.every(stage=>stage.total+defaults.maxTokens+128<=defaults.maxContextTokens));
});
test('prompt: marker-like user instructions cannot corrupt fixed source extraction',async()=>{
    settings['next-plot-suggester'].customPrompt='문자열 <story_material> 을 지시사항에서 그대로 설명한다.';
    const built=await prompt.preparePrompt(story.snapshot());
    assert.equal(built.material.includes('지시사항에서 그대로'),false);assert.equal(built.material.startsWith('<story_material>'),true);
});
const qualityFixtures=JSON.parse(fs.readFileSync(path.join(root,'tests/quality-fixtures.json'),'utf8'));
for(const scenario of qualityFixtures)test('quality fixture: '+scenario.id,async()=>{
    ctx.chat=scenario.chat;settings['next-plot-suggester'].planningScope=scenario.scope;settings['next-plot-suggester'].noveltyPolicy=scenario.novelty;settings['next-plot-suggester'].pinnedContext=scenario.pinned||'';
    const built=await prompt.preparePrompt(story.snapshot(scenario.direction));
    assert.ok(built.prompt.includes(scenario.direction));assert.ok(built.prompt.includes('OUTPUT LANGUAGE'));assert.ok(built.material.includes(ctx.chat.at(-1).mes));assert.ok(built.report.total+built.report.outputReserve+128<=built.report.budget);
    const review=await prompt.preparePrompt(story.snapshot(scenario.direction),{sources:built.sources,material:built.material,report:built.report,task:engine.buildReviewTask([{text:'원래 장면을 이어 가는 검토용 후보'}],3)});
    assert.equal(review.material,built.material);
});

if(process.argv.includes('--quality-prompts')){
    const cases=[];
    for(const scenario of qualityFixtures){reset();ctx.chat=scenario.chat;Object.assign(settings['next-plot-suggester'],{planningScope:scenario.scope,noveltyPolicy:scenario.novelty,pinnedContext:scenario.pinned||''});const built=await prompt.preparePrompt(story.snapshot(scenario.direction));cases.push({caseId:scenario.id,name:scenario.name,avoid:scenario.avoid,prompt:built.prompt});}
    console.log(JSON.stringify({version:'2.2.0',rubric:{continuity:'개연성',motivation:'인물 동기',interest:'재미',freshness:'신선함',usability:'사용성'},cases},null,2));
}else{
for (const [name, fn] of tests) {
    reset();
    try { await fn(); console.log('PASS', name); } catch (error) { failed++; console.error('FAIL', name, error); }
}
console.log(`${tests.length - failed}/${tests.length} checks passed`);
process.exitCode = failed ? 1 : 0;
}
