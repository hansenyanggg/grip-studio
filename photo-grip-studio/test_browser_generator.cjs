const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname + '/assets/template.js','utf8'), context);
vm.runInContext(fs.readFileSync(__dirname + '/assets/generator.js','utf8'), context);
const hand = JSON.parse(fs.readFileSync(__dirname + '/hand_template.json'));
for (const [name, input, side] of [
  ['right', hand, 'right'], ['left', hand, 'left'],
  ['missing thumb', {...hand, thumb_length: null, thumb_breadth: null}, 'right'],
  ['missing middle', {...hand, finger_lengths: [75, null, 73, 62]}, 'right'],
  ['smaller grip', {...hand, grip_diameter_inside: 45}, 'right']
]) {
  const result = context.GEN.generate(input, side);
  assert.equal(result.error, undefined);
  assert.equal(result.stats.watertight, true);
  assert.equal(result.stats.envelope_ok, true);
  assert.equal(result.stl.byteLength, 84 + 50 * result.stats.triangles);
  console.log('PASS:', name);
}
