const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const elements = {
  clients: { hidden: true },
  'clients-nav': { hidden: true },
};
const context = vm.createContext({
  document: {
    addEventListener() {},
    getElementById: (id) => elements[id],
    createElement: () => ({
      textContent: '',
      get innerHTML() {
        return this.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      },
    }),
  },
});
vm.runInContext(fs.readFileSync(path.join(root, 'js/sheet-data.js'), 'utf8'), context);

test('client showcase hides empty/unsafe rows and escapes company names and URLs', () => {
  const container = { innerHTML: '' };
  context.renderClientLogos(container, [
    { title: 'Unapproved URL', image_url: 'javascript:alert(1)' },
    { title: '', image_url: 'https://example.com/logo.png' },
  ], null);
  assert.equal(container.innerHTML, '');
  assert.equal(elements.clients.hidden, true);
  assert.equal(elements['clients-nav'].hidden, true);

  context.renderClientLogos(container, [
    { title: 'A "Company" <script>', image_url: 'https://example.com/logo.png?x=" onerror="alert(1)' },
  ], null);
  assert.equal(elements.clients.hidden, false);
  assert.equal(elements['clients-nav'].hidden, false);
  assert.match(container.innerHTML, /alt="A &quot;Company&quot; &lt;script&gt;"/);
  assert.doesNotMatch(container.innerHTML, / onerror="/);
  assert.match(container.innerHTML, /width="600" height="300"/);

  context.renderClientLogos(container, [], null);
  assert.equal(elements.clients.hidden, true);
  assert.equal(elements['clients-nav'].hidden, true);
});

test('activities sort newest first without separating grouped photos', () => {
  const groups = context.groupRowsByOrder([
    { date: 'May 2025', title: 'Older', order: '1' },
    { date: 'September 22-24, 2026', title: 'Newest', order: '2' },
    { date: '', title: '', order: '2.1', image_url: 'https://example.com/photo.jpg' },
    { date: '2026-09-21', title: 'ISO date', order: '3' },
    { date: 'Unconfirmed', title: 'Undated', order: '4' },
    { date: 'May 2025', title: 'Same month', order: '5' },
  ]);
  const result = context.sortActivityGroups(groups);
  assert.equal(Array.from(result, (group) => group.items[0].title).join('|'), 'Newest|ISO date|Older|Same month|Undated');
  assert.equal(result[0].items.length, 2);
  assert.equal(groups[0].items[0].title, 'Older');
  assert.equal(context.activityDateValue(''), -Infinity);
  assert.equal(context.activityDateValue('2026-09-22'), Date.parse('2026-09-22'));
});

test('branch call links handle international and local numbers without linking postal codes', () => {
  const links = context.branchContacts('23 Lirio St, 9000 Misamis Oriental | Tel No.: (+6388) 858-3906 / Mobile: +63908-8938738');
  assert.match(links, /href="tel:\+63888583906"/);
  assert.match(links, /href="tel:\+639088938738"/);
  assert.equal(context.branchContacts('23 Lirio St, 9000 Misamis Oriental'), '');
  assert.match(context.branchContacts('Office | Mobile: 0998-5929385'), /href="tel:09985929385"/);
});

test('homepage preserves existing anchors and provides complete inquiry paths', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'IDs must be unique');
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.includes(id), `Missing anchor target: ${id}`);
  }
  for (const id of ['foundation', 'membership', 'board', 'philosophy', 'hero-photo-target', 'main-gallery', 'branch-list', 'contact-form']) {
    assert.ok(ids.includes(id), `Existing target must survive: ${id}`);
  }
  assert.equal((html.match(/class="text-link service-link"/g) || []).length, 6);
  assert.match(html, /data-inquiry="Employment inquiry"/);
  assert.match(html, /<textarea[^>]*\brequired/);
  assert.doesNotMatch(html, /href="#"[^>]*>Instagram/);
  assert.doesNotMatch(html, /7 branch offices/);
  assert.match(html, /action="\/api\/submit"/);
  assert.match(html, /<altcha-widget challengeurl="\/api\/challenge"/);
});
