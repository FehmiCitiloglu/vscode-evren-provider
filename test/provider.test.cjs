const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EvrenClient } = require('../out/evrenClient');
const config = { serverUrl: 'https://example.invalid/v1', apiKey: 'test-only-placeholder', enableThinking: false, reasoningEffort: 'medium', enableToolCalling: true, maxOutputTokens: 128, requestTimeout: 1000 };
const callbacks = () => ({ text: '', calls: [], onContent(text) { this.text += text; }, onToolCall(id, name, input) { this.calls.push({id,name,input}); } });
const stream = (chunks) => new Response(new ReadableStream({start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); }}));
async function withFetch(fake, run) { const original = global.fetch; global.fetch = fake; try { await run(); } finally { global.fetch = original; } }
const bind = c => ({onContent: c.onContent.bind(c), onToolCall: c.onToolCall.bind(c)});

test('streaming handles fragmented events, final event without newline, and tool mode', async () => {
  const c = callbacks(); let payload;
  await withFetch(async (_url, options) => {payload = JSON.parse(options.body); return stream([
    'data: {"choices":[{"delta":{"content":"hel',
    'lo"}}]}\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call1","function":{"name":"lookup","arguments":"{\\"q\\":"}}]}}]}\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"test\\"}"}}]}}]}'
  ]); }, async () => new EvrenClient(config).streamChat('test-model', [{role:'user',content:'hello'}], [{type:'function'}], bind(c), undefined, true));
  assert.equal(c.text, 'hello'); assert.deepEqual(c.calls, [{id:'call1',name:'lookup',input:{q:'test'}}]); assert.equal(payload.tool_choice, 'required');
});

test('upstream error bodies are excluded from errors', async () => {
  await withFetch(async () => new Response('private-secret-and-conversation', {status:401}), async () => {
    await assert.rejects(new EvrenClient(config).streamChat('test', [], undefined, bind(callbacks())), err => err.message.includes('HTTP 401') && !err.message.includes('private-secret'));
  });
});

test('malformed tool arguments never become executable calls', async () => {
  const c = callbacks();
  await withFetch(async () => stream(['data: {"choices":[{"delta":{"tool_calls":[{"id":"x","function":{"name":"run","arguments":"invalid"}}]}}]}\n']), async () => {
    await assert.rejects(new EvrenClient(config).streamChat('test', [], undefined, bind(c)));
  });
  assert.equal(c.calls.length, 0);
});

test('DONE terminates the stream without processing later content', async () => {
  const c = callbacks();
  await withFetch(async () => stream(['data: [DONE]\ndata: {"choices":[{"delta":{"content":"ignored"}}]}\n']), async () => new EvrenClient(config).streamChat('test', [], undefined, bind(c)));
  assert.equal(c.text, '');
});

test('timeout covers stalled response bodies', async () => {
  await withFetch(async (_url, options) => new Response(new ReadableStream({start(controller) {options.signal.addEventListener('abort', () => controller.error(new Error('aborted')));}})), async () => {
    await assert.rejects(new EvrenClient({...config,requestTimeout:25}).streamChat('test', [], undefined, bind(callbacks())), /cancelled or timed out/);
  });
});

test('pre-cancelled requests carry an aborted signal', async () => {
  const abort = new AbortController(); abort.abort();
  await withFetch(async (_url, options) => {assert.equal(options.signal.aborted, true); throw new Error('aborted');}, async () => {
    await assert.rejects(new EvrenClient(config).streamChat('test', [], undefined, bind(callbacks()), abort.signal), /cancelled or timed out/);
  });
});

const settings = {};
const vscode = {
  EventEmitter: class { constructor() {this.event = () => ({dispose(){}});} fire() {} dispose() {} },
  LanguageModelTextPart: class {constructor(value) {this.value = value;}},
  LanguageModelToolCallPart: class {constructor(callId,name,input) {Object.assign(this,{callId,name,input});}},
  LanguageModelToolResultPart: class {},
  LanguageModelChatMessageRole: {User:1, Assistant:2},
  LanguageModelChatToolMode: {Required:2},
  CancellationError: class extends Error {},
  workspace: {getConfiguration() {return {get(key, fallback) {return settings[key] ?? fallback;}};}}
};
const oldLoad = Module._load;
Module._load = function(name, ...rest) {return name === 'vscode' ? vscode : oldLoad.call(this,name,...rest);};
const {EvrenLanguageModelProvider} = require('../out/evrenProvider');
const {ConfigManager} = require('../out/configManager');
Module._load = oldLoad;
const token = {isCancellationRequested:false,onCancellationRequested(){return {dispose(){}};}};

test('provider implements token count and advertises only supported inputs', async () => {
  const provider = new EvrenLanguageModelProvider({getConfig:async()=>config}, {appendLine(){}});
  const models = provider.provideLanguageModelChatInformation({silent:true}, token);
  assert.ok(models.length > 0); assert.ok(models.every(m => m.capabilities.imageInput === false));
  assert.equal(await provider.provideTokenCount(models[0], 'Türkçe', token), Buffer.byteLength('Türkçe'));
  await assert.rejects(provider.provideTokenCount(models[0], 'x', {...token,isCancellationRequested:true}));
  provider.dispose();
});

test('text, tool calls, and tool results survive conversion to the API', async () => {
  let payload;
  const provider = new EvrenLanguageModelProvider({getConfig:async()=>config}, {appendLine(){}});
  const messages = [
    {role:1,content:[new vscode.LanguageModelTextPart('hello')]},
    {role:2,content:[new vscode.LanguageModelToolCallPart('c1','lookup',{q:'x'})]},
    {role:1,content:[Object.assign(new vscode.LanguageModelToolResultPart(), {callId:'c1',content:[new vscode.LanguageModelTextPart('result')]})]}
  ];
  await withFetch(async (_url, options) => {payload=JSON.parse(options.body); return stream(['data: [DONE]\n']);}, async()=>provider.provideLanguageModelChatResponse({id:'test'},messages,{}, {report(){}},token));
  assert.equal(payload.messages[0].content,'hello'); assert.equal(payload.messages[1].tool_calls[0].id,'c1'); assert.equal(payload.messages[2].tool_call_id,'c1'); assert.equal(payload.messages[2].content,'result');
  await assert.rejects(provider.provideLanguageModelChatResponse({id:'test'},[{role:1,content:[{mimeType:'image/png'}]}],{}, {report(){}},token), /text and tool/);
  provider.dispose();
});

test('endpoint configuration rejects insecure URLs and URL credentials', async () => {
  const manager = new ConfigManager({secrets:{get:async()=> 'test-only-placeholder'}});
  for (const value of ['http://example.invalid/v1', 'https://user:password@example.invalid/v1', 'https://example.invalid/v1?key=secret']) {
    settings.serverUrl=value; await assert.rejects(manager.getConfig());
  }
  settings.serverUrl='https://example.invalid/v1/'; assert.equal((await manager.getConfig()).serverUrl,'https://example.invalid/v1');
  delete settings.serverUrl;
});
