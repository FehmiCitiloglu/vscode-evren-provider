const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TermsClient } = require('../out/termsClient');
const { TermsService } = require('../out/termsService');
const { apiError, readJson } = require('../out/apiErrors');

const config = {serverUrl:'https://terms-fixture.invalid/v1',apiKey:'test-only-placeholder',requestTimeout:1000,enableThinking:true,reasoningEffort:'medium',enableToolCalling:true,maxOutputTokens:128};
const document = {version:7,doc_path:'terms/usage.md',content:'# Terms fixture\nRead this example before accepting.'};
const status = accepted => ({current_version:7,is_material:true,doc_path:document.doc_path,accepted});
const callbacks = () => ({reviews:0,prompts:0,notices:[],closes:0,promptToReview:async function(){this.prompts++;return true;},review:async function(){this.reviews++;return true;},info(message){this.notices.push(message);},close(){this.closes++;}});
async function withFetch(fake,run) {const original=global.fetch;global.fetch=fake;try{await run();}finally{global.fetch=original;}}
function fixture(options={}) {
  let accepted=options.accepted??false;
  const requests=[];
  const fetch = async (url,init) => {
    assert.ok(url.startsWith(config.serverUrl+'/terms/'),'only fixture terms endpoints are used');
    assert.equal(init.headers.Authorization,'Bearer test-only-placeholder');
    assert.equal(init.redirect,'error');
    const route=url.split('/').at(-1);requests.push({route,method:init.method,body:init.body});
    if (route==='status') return Response.json(options.getStatus?options.getStatus(accepted):status(accepted));
    if (route==='text') return Response.json(options.getText?options.getText():document);
    assert.equal(route,'accept');assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{version:7});
    if(options.acceptResponse)return options.acceptResponse();
    accepted=true;return Response.json({accepted_version:7,accepted_at:'2026-11-06T14:00:00Z'});
  };
  return {fetch,requests,posts:()=>requests.filter(r=>r.method==='POST')};
}
function cancellation() {
  const listeners = new Set();
  return {isCancellationRequested:false,onCancellationRequested(fn){listeners.add(fn);return{dispose(){listeners.delete(fn);}};},cancel(){this.isCancellationRequested=true;for(const fn of [...listeners])fn();},listeners};
}

test('already accepted account passes without displaying or posting terms',async()=>{
  const f=fixture({accepted:true});const ui=callbacks();const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>assert.equal(await service.ensureAccepted(config),true));
  assert.equal(ui.reviews,0);assert.equal(ui.prompts,0);assert.equal(f.posts().length,0);assert.deepEqual(f.requests.map(r=>r.route),['status']);
});

test('declining the review prompt never reads or accepts the terms',async()=>{
  const f=fixture();const ui=callbacks();ui.promptToReview=async()=>false;const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>assert.equal(await service.ensureAccepted(config),false));
  assert.equal(ui.reviews,0);assert.equal(f.posts().length,0);
});

test('closing or declining the document does not record acceptance',async()=>{
  const f=fixture();const ui=callbacks();ui.review=async()=>false;const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>assert.equal(await service.ensureAccepted(config,undefined,true),false));
  assert.equal(f.posts().length,0);assert.equal(ui.prompts,0);
});

test('explicit consent posts exactly the displayed version and verifies server status',async()=>{
  const f=fixture();const ui=callbacks();let refreshed=0;ui.review=async(text,url,required)=>{assert.deepEqual(text,document);assert.equal(url,config.serverUrl);assert.equal(required,true);assert.equal(f.posts().length,0);return true;};
  const service=new TermsService({getConfig:async()=>config},ui,async()=>{refreshed++;});
  await withFetch(f.fetch,async()=>assert.equal(await service.ensureAccepted(config,undefined,true),true));
  assert.equal(f.posts().length,1);assert.equal(f.requests.at(-1).route,'status');assert.equal(refreshed,1);
});

test('manual command can review an already accepted document without another POST',async()=>{
  const f=fixture({accepted:true});const ui=callbacks();ui.review=async(_doc,_url,required)=>{assert.equal(required,false);return false;};
  const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>assert.equal(await service.reviewAndAccept(config),true));assert.equal(f.posts().length,0);
});

test('terms version change during review requires a fresh user decision',async()=>{
  let changed=false;const f=fixture({getStatus:accepted=>({...status(accepted),current_version:changed?8:7}),getText:()=>({...document,version:changed?8:7})});
  const ui=callbacks();ui.review=async()=>{changed=true;return true;};const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>assert.equal(await service.reviewAndAccept(config),false));
  assert.equal(f.posts().length,0);assert.ok(ui.notices.some(m=>m.includes('changed during review')));
});

test('even a same-version document replacement invalidates old consent',async()=>{
  let changed=false;const f=fixture({getText:()=>({...document,content:changed?'Different legal text':document.content})});const ui=callbacks();ui.review=async()=>{changed=true;return true;};
  const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>assert.equal(await service.reviewAndAccept(config),false));assert.equal(f.posts().length,0);
});

test('mismatched status and document versions are not displayed as acceptable',async()=>{
  const f=fixture({getText:()=>({...document,version:8})});const ui=callbacks();const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>assert.equal(await service.reviewAndAccept(config),false));assert.equal(ui.reviews,0);assert.equal(f.posts().length,0);
});

for(const field of ['apiKey','serverUrl'])test(`${field} change while reading prevents acceptance for the old connection`,async()=>{
  let current={...config};const f=fixture();const ui=callbacks();ui.review=async()=>{current={...current,[field]:'changed'};return true;};const service=new TermsService({getConfig:async()=>current},ui);
  await withFetch(f.fetch,async()=>assert.equal(await service.reviewAndAccept(config),false));assert.equal(f.posts().length,0);
});

test('invalidation on sign-out or endpoint change cancels pending consent',async()=>{
  const f=fixture();const ui=callbacks();const service=new TermsService({getConfig:async()=>config},ui);ui.review=async()=>{service.invalidate();return true;};
  await withFetch(f.fetch,async()=>assert.equal(await service.reviewAndAccept(config),false));assert.equal(f.posts().length,0);assert.equal(ui.closes,1);
});

test('request cancellation before or during review sends no acceptance POST',async()=>{
  const f=fixture();const ui=callbacks();const token=cancellation();const service=new TermsService({getConfig:async()=>config},ui);ui.review=async()=>{token.cancel();return true;};
  await withFetch(f.fetch,async()=>{assert.equal(await service.reviewAndAccept(config,token),false);assert.equal(await service.ensureAccepted(config,token),false);});assert.equal(f.posts().length,0);
});

test('concurrent reviewers share one consent document and one acceptance POST',async()=>{
  const f=fixture();const ui=callbacks();const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>assert.deepEqual(await Promise.all([service.reviewAndAccept(config),service.reviewAndAccept(config)]),[true,true]));
  assert.equal(ui.reviews,1);assert.equal(f.posts().length,1);
});

test('manual review remains usable while a startup notification awaits a choice',async()=>{
  const f=fixture();const ui=callbacks();let answerPrompt;ui.promptToReview=()=>new Promise(resolve=>{answerPrompt=resolve;});const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>{const startup=service.ensureAccepted(config);while(!answerPrompt)await new Promise(resolve=>setImmediate(resolve));assert.equal(await service.reviewAndAccept(config),true);answerPrompt(false);assert.equal(await startup,false);});
  assert.equal(ui.reviews,1);assert.equal(f.posts().length,1);
});

test('a rejected acceptance request is not retried automatically',async()=>{
  const f=fixture({acceptResponse:()=>new Response('private upstream contents',{status:409})});const ui=callbacks();const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>await assert.rejects(service.reviewAndAccept(config),error=>error.status===409&&!error.message.includes('private')));assert.equal(f.posts().length,1);
});

test('server must confirm acceptance after the POST',async()=>{
  const f=fixture({getStatus:()=>status(false)});const ui=callbacks();const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>assert.equal(await service.reviewAndAccept(config),false));assert.equal(f.posts().length,1);assert.ok(ui.notices.some(m=>m.includes('still requires')));
});

test('acceptance is checked again on later requests instead of trusting a local flag',async()=>{
  let expired=false;const f=fixture({getStatus:()=>status(!expired)});const ui=callbacks();ui.promptToReview=async()=>false;const service=new TermsService({getConfig:async()=>config},ui);
  await withFetch(f.fetch,async()=>{assert.equal(await service.ensureAccepted(config),true);expired=true;assert.equal(await service.ensureAccepted(config),false);});assert.equal(f.requests.length,2);
});

test('malformed terms status fails closed without an acceptance POST',async()=>{
  const client=new TermsClient(config);await withFetch(async()=>Response.json({accepted:'true',current_version:7,is_material:true,doc_path:'terms.md'}),async()=>await assert.rejects(client.status(),/invalid terms status/));
});

test('malformed or empty terms text cannot be accepted',async()=>{
  const client=new TermsClient(config);await withFetch(async()=>Response.json({...document,content:''}),async()=>await assert.rejects(client.text(),/invalid terms document/));
});

test('unexpected acceptance version is rejected',async()=>{
  const client=new TermsClient(config);await withFetch(async()=>Response.json({accepted_version:8,accepted_at:'now'}),async()=>await assert.rejects(client.accept(7),/did not confirm/));
});

test('missing keys and invalid version types never make an API request',async()=>{
  let calls=0;await withFetch(async()=>{calls++;throw new Error('unexpected');},async()=>{await assert.rejects(new TermsClient({...config,apiKey:''}).status(),/Set your Evren/);await assert.rejects(new TermsClient(config).accept('7'),/valid reviewed/);await assert.rejects(new TermsClient(config).accept(true),/valid reviewed/);});assert.equal(calls,0);
});

test('only an exact terms_not_accepted code on HTTP 403 opens the terms path',async()=>{
  for(const body of [{error:{code:'terms_not_accepted'}},{detail:{error:'terms_not_accepted'}},{detail:'terms_not_accepted'}]){
    const error=await apiError(Response.json(body,{status:403}));assert.equal(error.code,'terms_not_accepted');
  }
  for(const [body,code] of [[{error:{code:'insufficient_scope'}},403],[{detail:'private input terms_not_accepted'},403],[{code:'terms_not_accepted'},401]]){
    const error=await apiError(Response.json(body,{status:code}));assert.equal(error.code,undefined);assert.ok(!error.message.includes('private'));
  }
});

test('oversized or non-JSON service responses do not expose contents',async()=>{
  await assert.rejects(readJson(new Response('private not json')),error=>error.message==='The Evren API returned invalid JSON.');
  await assert.rejects(readJson(new Response('x'.repeat(100)),50),/exceeded/);
  const error=await apiError(new Response('secret'.repeat(20000),{status:403}));assert.equal(error.code,undefined);assert.ok(!error.message.includes('secret'));
});

test('terms timeout covers response bodies as well as headers',async()=>{
  await withFetch(async(_url,init)=>new Response(new ReadableStream({start(c){init.signal.addEventListener('abort',()=>c.error(new Error('aborted')));}})),async()=>await assert.rejects(new TermsClient({...config,requestTimeout:20}).status(),/cancelled or timed out/));
});
