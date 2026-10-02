import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const {chromium}=createRequire(import.meta.url)(process.env.NPS_NODE_MODULES ? path.join(process.env.NPS_NODE_MODULES,"playwright") : "playwright");
const mocks={
"extensions.js":'export const extension_settings=window.fixture.settings;export const getContext=()=>window.fixture.ctx;',
"script.js":'export const eventSource=window.fixture.events;export const event_types=window.fixture.types;export const saveSettingsDebounced=()=>{};export const getRequestHeaders=()=>({"Content-Type":"application/json"});',
"secrets.js":'export const SECRET_KEYS={OPENAI:"openai",CLAUDE:"claude",MAKERSUITE:"google",COHERE:"cohere"};export const secret_state={};',
"world-info.js":'export const selected_world_info=[];export const loadWorldInfo=async()=>({entries:{}});',
"openai.js":'export const createGenerationParameters=async()=>({generate_data:{}});'
};
const pageHtml=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{background:#242424;color:white;font-family:sans-serif}#chat{height:300px;overflow:auto}#stop_but{display:none}input,textarea,select{color:white;background:#333}button{color:white;background:#444}#nps-settings-popup.open{display:flex}#nps-generate-btn{width:40px;height:40px}</style><div id="extensionsMenu"></div><div id="chat"></div><div id="rightSendForm"></div><div id="form_sheld"><textarea id="send_textarea"></textarea><button id="send_but">전송</button><button id="stop_but">중단</button></div><script>
const handlers=new Map();window.fixture={settings:{"next-plot-suggester":{generationMode:"fast",suggestionCount:3,similarityThreshold:0}},calls:[],sent:[],notices:[],events:{on(n,cb){const set=handlers.get(n)||new Set();set.add(cb);handlers.set(n,set)},removeListener(n,cb){handlers.get(n)?.delete(cb)}},types:{APP_READY:"ready",CHAT_CHANGED:"chat",CHARACTER_MESSAGE_RENDERED:"render"}};
window.toastr=Object.fromEntries(["info","error","success","warning"].map(k=>[k,text=>fixture.notices.push({k,text})]));
window.jQuery=cb=>cb();
fixture.ctx={chat:[{mes:"민서는 약속한 편지를 서랍에 숨겼다.",name:"민서"},{mes:"편지를 돌려준다는 약속을 기억했다.",is_user:true}],characters:[{name:"민서",description:"약속을 지키려 한다.",avatar:"a.png"}],characterId:0,chatId:"fixture-a",name1:"사용자",name2:"민서",chatMetadata:{},chatCompletionSettings:{},textCompletionSettings:{},mainApi:"openai",saveSettingsDebounced(){},saveMetadataDebounced(){},async generateRaw({prompt}){
fixture.calls.push(prompt);const n=Number(prompt.match(/Return exactly (\\d+) candidates/)?.[1]||1);
return JSON.stringify({suggestions:Array.from({length:n},(_,i)=>({text:["민서는 편지를 돌려주는 대신 공개할 때까지 동행을 제안한다.","서랍을 열어 편지를 건네고 약속의 이행을 직접 확인시킨다.","편지의 전달 조건을 협상하고 두 사람의 책임 범위를 정한다."][i%3],mechanism:["동행","약속 이행","책임 협상"][i%3],change:"선택지가 달라진다.",evidence:[{id:1,quote:"편지를 서랍에 숨겼다."}]}))});
}};
document.querySelector("#send_but").onclick=()=>{fixture.sent.push(document.querySelector("#send_textarea").value);document.querySelector("#send_textarea").value="";};
</script><script type="module">import "/index.js";import * as ui from "/ui.js";import {state} from "/state.js";import * as results from "/results.js";import * as studio from "/studio.js";fixture.studio=studio;fixture.ui=ui;fixture.state=state;fixture.results=results;fixture.ready=true;</script>`;
const server=http.createServer(async(req,res)=>{
try{
const name=decodeURIComponent(new URL(req.url,"http://localhost").pathname).slice(1);
if(!name){res.setHeader("Content-Type","text/html; charset=utf-8");res.end(pageHtml);return;}
if(mocks[name]){res.setHeader("Content-Type","text/javascript; charset=utf-8");res.end(mocks[name]);return;}
if(!/^[a-z-]+\.(js|css)$/.test(name)){res.writeHead(404);res.end();return;}
let text=await fs.readFile(path.join(root,name),"utf8");
if(name.endsWith(".js"))text=text.replace(/from "\.\.\/[^"]+\/([^/"]+)"/g,'from "/$1"');
res.setHeader("Content-Type",name.endsWith(".css")?"text/css; charset=utf-8":"text/javascript; charset=utf-8");res.end(text);
}catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try{
browser=await chromium.launch({headless:true,...(process.env.NPS_BROWSER_PATH?{executablePath:process.env.NPS_BROWSER_PATH}:{})});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on("pageerror",error=>errors.push(error.message));
await page.goto("http://127.0.0.1:"+server.address().port);
await page.waitForFunction(()=>window.fixture?.ready);
await page.evaluate(()=>fixture.ui.openSettingsPopup());
await page.locator("#nps-popup-sentence-count").fill("");
assert.equal(await page.locator("#nps-popup-sentence-count").inputValue(),"");
await page.locator("#nps-popup-sentence-count").fill("10");
await page.locator("#nps-popup-sentence-count").blur();
assert.equal(await page.evaluate(()=>fixture.settings["next-plot-suggester"].sentenceCount),10);
console.log("PASS browser: multi-digit and temporary blank numeric input");
await page.locator('.nps-textarea-expand-btn[data-target="nps-popup-custom-prompt"]').click();
await page.locator("#nps-textarea-expand-input").fill("편지는 반드시 돌려준다");
await page.locator("#nps-textarea-expand-save-btn").click();
assert.equal(await page.evaluate(()=>fixture.settings["next-plot-suggester"].customPrompt),"편지는 반드시 돌려준다");
console.log("PASS browser: expanded prompt saves to generation settings");
await page.keyboard.press("Escape");
assert.equal(await page.locator("#nps-settings-popup").evaluate(el=>el.classList.contains("open")),false);
console.log("PASS browser: Escape closes dialog");
await page.locator("#nps-generate-btn").click();
await page.waitForSelector(".nps-suggestion-item");
assert.equal(await page.locator(".nps-suggestion-item").count(),3);
console.log("PASS browser: generation and result rendering");
const original=await page.evaluate(()=>fixture.state.candidates.map(c=>c.id));
await page.locator(".nps-suggestion-content").first().focus();
await page.keyboard.press("Control+ArrowDown");
assert.equal(await page.evaluate(()=>fixture.state.candidates[1].id),original[0]);
console.log("PASS browser: keyboard reorder synchronizes data");
await page.locator("#send_textarea").fill("작성 중인 초안");
await page.locator(".nps-send-action").first().click();
assert.equal(await page.locator("#send_textarea").inputValue(),"작성 중인 초안");
assert.equal(await page.locator(".nps-suggestion-item").count(),3);
assert.equal(await page.evaluate(()=>fixture.sent.length),0);
console.log("PASS browser: draft and candidates survive refused send");
await page.locator(".nps-edit-action").first().click();
await page.locator(".nps-edit-textarea").first().fill("직접 편집한 후보");
await page.locator('[data-action="edit-copy"]').first().click();
assert.equal(await page.evaluate(()=>fixture.state.candidates[0].text),"직접 편집한 후보");
console.log("PASS browser: direct edit updates internal data");
await page.evaluate(()=>fixture.ui.openSettingsPopup());
await page.locator('button[data-tab="studio"]').click();
await page.locator("#nps-result-history details").first().locator("summary").click();
await page.locator("[data-restore]").first().click();
await page.keyboard.press("Escape");
await page.waitForSelector(".nps-suggestion-item");
assert.equal(await page.locator(".nps-suggestion-text").first().textContent(),"직접 편집한 후보");
console.log("PASS browser: history restores revision");
await page.locator(".nps-regenerate-btn").click();
await page.waitForFunction(()=>!fixture.state.isGenerating);
assert.ok(await page.evaluate(()=>fixture.calls.at(-1).includes("직접 편집한 후보")));
console.log("PASS browser: regenerate avoids edited candidates");
await page.evaluate(()=>fixture.ui.openSettingsPopup());
await page.locator('button[data-tab="studio"]').click();
await page.locator("#nps-result-history details").first().locator("summary").click();
await page.locator("[data-favorite]").first().click();
assert.ok(await page.evaluate(()=>fixture.results.resultHistory().some(r=>r.favorite)));
if(!await page.locator("#nps-result-history details").first().evaluate(el=>el.open))await page.locator("#nps-result-history details").first().locator("summary").click();
await page.locator("#nps-result-history details").first().locator('[data-score="interest"]').fill("5");
await page.evaluate(()=>fixture.studio.refreshStudio());
assert.equal(await page.locator("#nps-result-history details").first().locator('[data-score="interest"]').inputValue(),"5");
console.log("PASS browser: unsaved evaluation survives refresh");
await page.locator("#nps-result-history details").first().getByRole("button",{name:"평가 저장"}).click();
assert.equal(await page.evaluate(()=>fixture.results.resultHistory().at(-1).ratings.interest),5);
console.log("PASS browser: favorite and quality rating persist");
await page.setViewportSize({width:390,height:844});
assert.ok(await page.locator("#nps-settings-popup").isVisible());
if(process.env.NPS_SCREENSHOT)await page.screenshot({path:process.env.NPS_SCREENSHOT});
assert.ok(await page.locator("#nps-settings-popup").evaluate(el=>el.scrollWidth<=el.clientWidth+2));
console.log("PASS browser: mobile has no horizontal dialog overflow");
await page.keyboard.press("Escape");
await page.locator("#send_textarea").fill("");
await page.evaluate(()=>{document.querySelector("#send_but").onclick=()=>setTimeout(()=>{fixture.sent.push(document.querySelector("#send_textarea").value);document.querySelector("#send_textarea").value="";},200);});
await page.locator(".nps-send-action").first().click();
await page.locator(".nps-send-action").first().click();
await page.waitForFunction(()=>fixture.sent.length===1 && !document.querySelector(".nps-suggestion-item"));
assert.equal(await page.locator("#send_textarea").inputValue(),"");
console.log("PASS browser: delayed native send is awaited before removing results");
assert.deepEqual(errors,[]);
console.log("PASS browser: mobile dialog and no uncaught errors");
console.log("14/14 browser integration checks passed");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
