const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const t = require('../src/tour');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-test-'));
try {
  const tour = t.toTour([{line: 1,say:'first'}, {line: 2,say:'second'}], {title:'Test',file:'src/a.js',firstLine: 1});
  assert.deepEqual(tour.steps.map(x => x.line), [1,2]);
  assert.deepEqual(tour.steps[0].selection.start, {line:1,character:1});
  const file = t.saveTour(root,tour);
  assert.deepEqual(t.loadTour(file).steps.map(x=>x.line), [1,2]);
  const offset = t.toTour([{line:2,say:'x'}], {title:'Other',file:'x',firstLine:10,startColumn:2,endColumn:4});
  assert.equal(offset.steps[0].line,11);
  assert.equal(offset.steps[0].selection.start.character,3);
  assert.equal(offset.steps[0].selection.end.character,5);
  const foreign = path.join(root,'foreign.tour');
  fs.writeFileSync(foreign,JSON.stringify({title:'external',steps:[{file:'a',line:3,description:'**hello**'}]}));
  assert.equal(t.loadTour(foreign).steps[0].line,3);
  assert.equal(t.loadTour(foreign).steps[0].say,'hello');
  console.log('PASS CodeTour one-based write/read, selection coordinates, offset, external fixture');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
