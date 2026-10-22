import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinkResolver, resolveLink } from '../dist/resolver.js';

const inventory = [
  ['index.md', 'markdown'], ['root.md', 'markdown'], ['Root.md', 'markdown'],
  ['nested', 'directory'], ['nested/alpha.md', 'markdown'], ['nested/beta.md', 'markdown'],
  ['nested/space name.md', 'markdown'], ['nested/café.md', 'markdown'], ['nested/a%2Fb.md', 'markdown'],
  ['nested/a#b?c.md', 'markdown'], ['nested/%2e%2e', 'asset'],
  ['loose', 'directory'], ['loose/child.md', 'markdown'], ['asset.svg', 'asset'],
].map(([path, kind]) => ({ path, kind, bytes: 0 }));
const resolve = url => resolveLink('nested/alpha.md', url, inventory);

test('root and document-relative paths normalize dots without appending extensions', () => {
  for (const [url, path] of [['/root.md', 'root.md'], ['beta.md', 'nested/beta.md'], ['./beta.md', 'nested/beta.md'], ['../root.md', 'root.md'], ['../nested/./beta.md', 'nested/beta.md'], ['../nested//beta.md', 'nested/beta.md']]) {
    assert.deepEqual(resolve(url), { kind: 'resolved', path, targetKind: 'markdown', query: '', fragment: '' });
  }
  assert.equal(resolve('beta').kind, 'missing');
  assert.equal(resolve('Beta.md').kind, 'missing');
  assert.equal(resolve('/ROOT.md').kind, 'missing');
  assert.equal(resolve('/Root.md').path, 'Root.md');
});

test('queries and fragments remain separate from file identity, with no anchor checks', () => {
  assert.deepEqual(resolve('beta.md?view=compact#unknown?more'), { kind: 'resolved', path: 'nested/beta.md', targetKind: 'markdown', query: 'view=compact', fragment: 'unknown?more' });
  for (const url of ['', '#missing-heading', '?view=compact', '?x=%zz#%not-an-anchor']) {
    assert.equal(resolve(url).kind, 'resolved');
    assert.equal(resolve(url).path, 'nested/alpha.md');
  }
  assert.equal(resolve('missing.md#heading').kind, 'missing');
  assert.equal(resolve('beta.md#fragment?not-a-query').query, '');
});

test('directories and assets resolve without inventing or conflating a child index', () => {
  for (const url of ['../loose', '../loose/', '../loose/.']) {
    assert.deepEqual(resolve(url), { kind: 'resolved', path: 'loose', targetKind: 'directory', query: '', fragment: '' });
  }
  assert.equal(resolve('../loose/index.md').kind, 'missing');
  assert.equal(resolve('/index.md').targetKind, 'markdown');
  assert.equal(resolve('/').targetKind, 'directory');
  assert.equal(resolve('/').path, '');
  assert.equal(resolve('..').path, '');
  assert.equal(resolve('.').path, 'nested');
  assert.equal(resolve('../asset.svg').targetKind, 'asset');
  assert.equal(resolve('../asset.svg/').kind, 'missing');
  assert.equal(resolve('../asset.svg/.').kind, 'missing');
  assert.equal(resolve('beta.md/').kind, 'missing');
});

test('percent escapes decode exactly once per segment and preserve Unicode spelling', () => {
  for (const [url, path] of [['space%20name.md', 'nested/space name.md'], ['caf%C3%A9.md', 'nested/café.md'], ['a%252Fb.md', 'nested/a%2Fb.md'], ['a%23b%3Fc.md', 'nested/a#b?c.md'], ['%252e%252e', 'nested/%2e%2e']]) {
    assert.equal(resolve(url).kind, 'resolved');
    assert.equal(resolve(url).path, path);
  }
  assert.equal(resolve('cafe%CC%81.md').kind, 'missing');
  assert.equal(resolve('%2e%2e/root.md').path, 'root.md');
});

test('malformed encoding, encoded separators, controls and drives are never followed', () => {
  for (const url of ['a%', 'a%2', '%gg', '%FF', '%C0%AF', '%ED%A0%80', '%E2%82', '\ud800']) assert.deepEqual(resolve(url), { kind: 'unsafe', reason: 'malformed-encoding' }, url);
  for (const url of ['a%2Fb.md', 'a%2fb.md', '%5Ca.md']) assert.deepEqual(resolve(url), { kind: 'unsafe', reason: 'encoded-separator' }, url);
  for (const url of ['a\0.md', 'a\n.md', 'a\\b.md', '%00.md', '%0A.md', '%7F.md', '%C2%9B.md', '%E2%80%AE.md', ' leading.md']) assert.equal(resolve(url).kind, 'unsafe', url);
  for (const url of ['C:/root.md', 'C:\\root.md', 'C:root.md', '/C:/root.md', './C:/root.md', '%43%3A/root.md', '/%43%3A/root.md']) assert.equal(resolve(url).kind, 'unsafe', url);
});

test('root containment handles both literal and encoded traversal', () => {
  for (const url of ['../../root.md', '/../../root.md', '../%2E%2E/root.md', './..//../root.md']) assert.deepEqual(resolve(url), { kind: 'unsafe', reason: 'outside-bundle' }, url);
  assert.deepEqual(resolveLink('root.md', '../root.md', inventory), { kind: 'unsafe', reason: 'outside-bundle' });
  assert.equal(resolve('/nested/../root.md').kind, 'resolved');
});

test('external schemes and protocol-relative URLs are classified, never fetched', () => {
  for (const url of ['https://example.invalid/missing.md', 'HTTP://example.invalid/', '//example.invalid/nope', 'mailto:user@example.invalid', 'data:text/plain,hello', 'javascript:alert(1)', 'custom+scheme:target']) assert.deepEqual(resolve(url), { kind: 'external' });
  assert.equal(resolve('https%3Aexample.invalid').kind, 'missing');
});

test('source paths are normalized logical identities, not host paths or URLs', () => {
  for (const source of ['', '/root.md', '../root.md', 'nested/../root.md', 'nested//root.md', 'C:/root.md', 'nested\\root.md', 'root.md/']) assert.deepEqual(resolveLink(source, 'target.md', inventory), { kind: 'unsafe', reason: 'invalid-source' }, source);
  assert.equal(resolveLink('nested/a%2Fb.md', '#same', inventory).path, 'nested/a%2Fb.md');
});

test('reusable resolver snapshots duplicate inventory without mutation or filesystem inference', () => {
  const entries = Object.freeze([...inventory, { ...inventory[0] }].map(Object.freeze));
  const cached = createLinkResolver(entries);
  assert.deepEqual(cached('root.md', '/loose/'), resolveLink('root.md', '/loose/', entries));
  assert.equal(resolveLink('root.md', '/not-in-inventory/', entries).kind, 'missing');
  assert.equal(resolveLink('not-in-inventory.md', '#heading', entries).kind, 'missing');
});
