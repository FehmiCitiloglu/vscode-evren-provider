const assert = require('node:assert/strict');
const vscode = require('vscode');
const { VscodeTermsUi } = require('../out/termsUi');
exports.run = async () => {
  const extension = vscode.extensions.getExtension('FehmiCitiloglu.evren-provider');
  assert.ok(extension, 'Development extension is present');
  await extension.activate();
  const models = await vscode.lm.selectChatModels({vendor:'fehmicitiloglu-evren'});
  const high = models.find(model=>model.name === 'MiMo v2.6 Pro · High');
  assert.ok(high, 'Effort model is registered through the stable API');
  assert.ok(models.find(model=>model.id === 'mimo-v2.6-pro'), 'Existing model ID remains available');
  assert.equal(models.filter(model=>model.name.startsWith('MiMo v2.6 Pro ·')).length,6);
  assert.equal(models.filter(model=>model.name.startsWith('Qwen 3 VL 30B ·')).length,0);
  assert.ok((await vscode.commands.getCommands(true)).includes('evren.reviewTerms'), 'Terms command is registered');
  const ui = new VscodeTermsUi();
  const cancellation = new vscode.CancellationTokenSource();
  const review = ui.review({version:1,doc_path:'test/fixture-only.md',content:'# Test fixture only\nThis is not the live Evren agreement. No acceptance will be sent.'},
    'https://terms-fixture.invalid/v1',true,cancellation.token);
  const timer = setTimeout(() => cancellation.cancel(), 500);
  try { assert.equal(await review,false, 'Cancelling the real webview declines consent'); }
  finally {clearTimeout(timer);cancellation.dispose();ui.close();}
  console.log(JSON.stringify({version:vscode.version,models:models.map(({id,name})=>({id,name})),passed:true},null,2));
};
