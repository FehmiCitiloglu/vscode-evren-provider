const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const panels=[];
let informationAnswer=undefined;
const vscode={ViewColumn:{Active:1},window:{
  showInformationMessage:async()=>informationAnswer,
  createWebviewPanel(type,title,column,options){
    const messageListeners=new Set();const disposeListeners=new Set();
    const panel={type,title,options,disposed:false,webview:{html:'',onDidReceiveMessage(fn){messageListeners.add(fn);return{dispose(){messageListeners.delete(fn);}};}},
      onDidDispose(fn){disposeListeners.add(fn);return{dispose(){disposeListeners.delete(fn);}};},
      dispose(){if(this.disposed)return;this.disposed=true;for(const fn of [...disposeListeners])fn();},
      message(value){for(const fn of [...messageListeners])fn(value);}};
    panels.push(panel);return panel;
  }
}};
const load=Module._load;Module._load=function(name,...args){return name==='vscode'?vscode:load.call(this,name,...args);};
const {VscodeTermsUi,termsHtml}=require('../out/termsUi');Module._load=load;
const document={version:7,doc_path:'legal/terms.md',content:'# Fixture terms'};
const server='https://terms-fixture.invalid/v1';
function token(){const callbacks=new Set();return{isCancellationRequested:false,onCancellationRequested(fn){callbacks.add(fn);return{dispose(){callbacks.delete(fn);}};},cancel(){this.isCancellationRequested=true;for(const fn of [...callbacks])fn();}};}

test('document content, source labels, and endpoints are escaped rather than executable',()=>{
  const html=termsHtml({...document,content:'</pre><script>evil()</script><img src="https://tracker.invalid">',doc_path:'<iframe>'},server+'/<script>',true,'fixture-nonce');
  assert.ok(html.includes('&lt;/pre&gt;&lt;script&gt;evil()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>evil()'));
  assert.ok(html.includes('default-src \'none\''));assert.ok(html.includes("script-src 'nonce-fixture-nonce'"));
  assert.ok(html.includes('id="consent" type="checkbox"'));assert.ok(!html.includes('type="checkbox" checked'));
  assert.ok(html.includes('id="accept" disabled'));assert.ok(!html.includes('test-only-placeholder'));
});

test('unrecognized messages, missing consent, and wrong versions do not accept',async()=>{
  const ui=new VscodeTermsUi();const promise=ui.review(document,server,true);const panel=panels.at(-1);
  assert.deepEqual(panel.options.localResourceRoots,[]);
  panel.message({action:'accept',consent:false,version:7});panel.message({action:'accept',consent:true,version:8});panel.message({action:'arbitrary'});
  assert.equal(panel.disposed,false);
  panel.message({action:'accept',consent:true,version:7});assert.equal(await promise,true);assert.equal(panel.disposed,true);
});

test('cancel button and closing the tab both decline acceptance',async()=>{
  for(const action of ['cancel','dispose']){
    const ui=new VscodeTermsUi();const promise=ui.review(document,server,true);const panel=panels.at(-1);
    if(action==='cancel')panel.message({action});else panel.dispose();
    assert.equal(await promise,false);
  }
});

test('already accepted accounts have a read-only view without an acceptance button',async()=>{
  const ui=new VscodeTermsUi();const promise=ui.review(document,server,false);const panel=panels.at(-1);
  assert.ok(!panel.webview.html.includes('id="accept"'));
  panel.message({action:'accept',consent:true,version:7});assert.equal(panel.disposed,false);panel.dispose();assert.equal(await promise,false);
});

test('request cancellation disposes the document and declines late acceptance messages',async()=>{
  const ui=new VscodeTermsUi();const cancellation=token();const promise=ui.review(document,server,true,cancellation);const panel=panels.at(-1);cancellation.cancel();
  panel.message({action:'accept',consent:true,version:7});assert.equal(await promise,false);assert.equal(panel.disposed,true);
});

test('a new review closes the old document without accepting it',async()=>{
  const ui=new VscodeTermsUi();const first=ui.review(document,server,true);const second=ui.review({...document,version:8},server,true);
  assert.equal(await first,false);ui.close();assert.equal(await second,false);
});

test('cancelled callers do not open panels or act on late notification clicks',async()=>{
  const ui=new VscodeTermsUi();const cancellation=token();cancellation.cancel();const before=panels.length;
  assert.equal(await ui.review(document,server,true,cancellation),false);assert.equal(panels.length,before);
  informationAnswer='Review Terms';assert.equal(await ui.promptToReview(server,cancellation),false);
});
