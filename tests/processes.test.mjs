// "How it works": architecture.json `processes` become graph.processes, steps link to the map,
// a step pointing at something gone is only a warning, and the viewer gets the view.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { shopApp, scanAndBuild, run, readGraph, readJson, writeJson, cleanup } from './helpers.mjs';

let root;
before(() => { root = shopApp(); scanAndBuild(root); });
after(() => cleanup(root));

const withProcesses = (processes) => {
  const file = path.join(root, 'floorplan', 'architecture.json');
  writeJson(file, { ...readJson(file), processes });
  return run('build.mjs', root, '--no-claude-md');
};

test('a process becomes a chain of steps, linked to the map, with labelled arrows', () => {
  const out = withProcesses([{ id: 'buy', title: '🛒 Buying something', steps: [
    { emoji: '👤', label: 'You pick a product', node: 'web', arrow: 'pays' },
    { emoji: '🧾', label: 'The shop records the order', node: 'shop-api/routes/orders.js' },
    { emoji: '📦', label: 'It ships' },
  ] }]);
  assert.doesNotMatch(out, /processes\[/);
  const [p] = readGraph(root).processes;
  assert.equal(p.title, '🛒 Buying something');
  assert.deepEqual(p.steps.map((s) => s.ref || null), ['n:web', 'f:shop-api/routes/orders.js', null]);
  assert.deepEqual(p.arrows, [{ a: 's0', b: 's1', label: 'pays' }, { a: 's1', b: 's2' }]);
  const html = fs.readFileSync(path.join(root, 'floorplan', 'index.html'), 'utf8');
  assert.match(html, /How it works/);
});

test('explicit arrows can branch and loop back', () => {
  withProcesses([{ id: 'big', title: 'Big picture', steps: [
    { id: 'a', label: 'App' }, { id: 'b', label: 'Server', node: 'api' }, { id: 'c', label: 'Database' },
  ], arrows: [{ from: 'a', to: 'b', label: 'asks' }, { from: 'b', to: 'c' }, { from: 'b', to: 'a', label: 'answer' }] }]);
  assert.equal(readGraph(root).processes[0].arrows.length, 3);
});

test('a step pointing at something not on the map warns and stays, unlinked', () => {
  const out = withProcesses([{ id: 'x', title: 'X', steps: [{ label: 'Gone', node: 'no-such-part' }, { label: 'Here', node: 'api' }] }]);
  assert.match(out, /processes\[0\]\.steps\[0\]\.node "no-such-part" is not on the map/);
  assert.deepEqual(readGraph(root).processes[0].steps.map((s) => s.ref || null), [null, 'n:api']);
});

test('an arrow to an unknown step is an error', () => {
  assert.throws(() => withProcesses([{ id: 'x', title: 'X', steps: [{ id: 'a', label: 'A' }], arrows: [{ from: 'a', to: 'zz' }] }]),
    (e) => /arrows\[0\]\.to must be the id of a step/.test(String(e.stdout) + String(e.stderr)));
});

test('no processes, no view', () => {
  withProcesses(undefined);
  assert.equal(readGraph(root).processes, undefined);
});

test('the map export carries How it works, and --export-how saves it on its own', async () => {
  const { execFileSync } = await import('node:child_process');
  withProcesses([{ id: 'buy', title: 'Buying', steps: [{ label: 'Pick', node: 'web' }, { label: 'Pay', node: 'shop-api/routes/orders.js' }] }]);
  const serve = path.join(root, 'floorplan', 'serve.mjs');
  const data = (file) => { const h = fs.readFileSync(file, 'utf8'); const a = h.indexOf('window.FLOORPLAN = ') + 19; return JSON.parse(h.slice(a, h.indexOf(';</script>', a))); };
  const full = path.join(root, 'full.html'), how = path.join(root, 'how.html');
  execFileSync('node', [serve, '--export', full], { encoding: 'utf8' });
  assert.equal(data(full).processes.length, 1);
  execFileSync('node', [serve, '--export', full, '--include', 'flows'], { encoding: 'utf8' });
  assert.equal(data(full).processes, undefined);
  execFileSync('node', [serve, '--export-how', how], { encoding: 'utf8' });
  const g = data(how);
  assert.equal(g.meta.exported.howOnly, true);
  assert.deepEqual([g.files.length, g.links.length], [0, 0]);
  assert.deepEqual(g.processes[0].steps.map((s) => s.ref || null), ['n:web', null]); // file links dropped with the files
});
