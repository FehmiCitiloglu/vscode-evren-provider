const assert = require('node:assert/strict');
const vscode = require('vscode');
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
  console.log(JSON.stringify({version:vscode.version,models:models.map(({id,name})=>({id,name})),passed:true},null,2));
};
