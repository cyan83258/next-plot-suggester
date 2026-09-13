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
const defaults = mod('constants').defaultSettings;
const story = mod('story'), context = mod('context'), parser = mod('parser'), api = mod('api'), engine = mod('engine'), prompt = mod('prompt'), state = mod('state').state;
const reset = () => { settings['next-plot-suggester'] = JSON.parse(JSON.stringify(defaults)); ctx.chat = [{ mes: '민서는 약속한 편지를 서랍에 숨겼다.', name: '민서' }, { mes: '서랍의 편지를 돌려주겠다는 약속을 기억했다.', is_user: true }]; ctx.chatId = 'story-a'; ctx.chatMetadata = {}; ctx.chatCompletionSettings = {}; state.contextRevision = 0; state.activeLore = null; state.lastContextReport = null; context.clearContextCache(); };
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
test('diversity: grounded alternative outranks ungrounded first candidate', () => {
    const result = parser.selectDiverse([{ text: '같은 전개', mechanism: '같은 구조', evidence: [] }, { text: '같은 전개', mechanism: '같은 구조', evidence: [{ id: 1 }] }], 2);
    assert.equal(result.length, 1); assert.equal(result[0].evidence.length, 1);
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
for (const [name, fn] of tests) {
    reset();
    try { await fn(); console.log('PASS', name); } catch (error) { failed++; console.error('FAIL', name, error); }
}
console.log(`${tests.length - failed}/${tests.length} checks passed`);
process.exitCode = failed ? 1 : 0;
