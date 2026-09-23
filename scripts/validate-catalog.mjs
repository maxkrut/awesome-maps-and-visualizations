import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(path.join(root, name), 'utf8');
const links = JSON.parse(await read('data/links.json'));
const categories = JSON.parse(await read('data/categories.json'));
const statuses = JSON.parse(await read('data/link-status.json'));
const previews = JSON.parse(await read('data/previews.json'));
const project = JSON.parse(await read('data/project.json'));
const pkg = JSON.parse(await read('package.json'));
assert.equal(pkg.name, project.name, 'Repository name must match package name');
assert.equal(pkg.description, project.description, 'Descriptions must agree');
assert.deepEqual(pkg.keywords, project.topics, 'Package keywords must match GitHub topics');
assert.equal(new Set(project.topics).size, project.topics.length, 'Duplicate topics');
assert(project.topics.every(topic => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic)), 'Invalid topic spelling');
const readme = await read('README.md');
assert(readme.startsWith('# ' + project.title + '\n'));
assert(readme.includes(project.description));
assert(!readme.includes('assets/banner.svg'), 'The removed hero banner must not return');
assert.equal(new Set(links.map(item => item.id)).size, links.length, 'Duplicate IDs');
assert.equal(new Set(links.map(item => item.url)).size, links.length, 'Duplicate URLs');
assert.equal(statuses.length, links.length, 'One status per URL is required');
const ids = new Set(links.map(item => item.id));
const urls = new Set(links.map(item => item.url));
for (const status of statuses) {
  assert(urls.has(status.url), 'Status for a removed URL');
  if (status.last_ok) assert.match(status.last_ok, /^\d{4}-\d{2}-\d{2}$/);
  assert(!('error' in status), 'Error explanations must not be published');
}
for (const preview of previews) {
  assert(ids.has(preview.id), 'Preview for a removed entry');
  assert.equal(preview.url, links.find(link => link.id === preview.id).url, 'Preview must belong to the current URL');
  assert(!('reason' in preview), 'Capture explanations belong in local diagnostics');
  if (preview.image) await access(path.join(root, preview.image));
}
const pages = ['README.md', 'catalog/index.md', ...categories.map(item => 'catalog/' + item.id + '.md')];
for (const file of pages) {
  const text = await read(file);
  assert(!/Check blocked|Unreachable|HTTP \d{3}|Last online:/.test(text), 'Unexpected public status wording: ' + file);
  for (const match of text.matchAll(/(?:src|href)="([^"#]+)(?:#[^"]*)?"/g)) {
    if (/^https?:/.test(match[1])) continue;
    await access(path.resolve(root, path.dirname(file), match[1]));
  }
}
for (const link of links) {
  assert(project.formats.includes(link.type), 'Unknown format: ' + link.id);
  assert(Object.hasOwn(project.languages, link.language), 'Unknown language: ' + link.id);
  const page = await read('catalog/' + link.category + '.md');
  const escapedUrl = link.url.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const card = [...page.matchAll(/<td\b[\s\S]*?<\/td>/g)].map(match => match[0])
    .find(html => html.includes('href="' + escapedUrl + '"'));
  assert(card, 'Missing card markup: ' + link.id);
  assert.match(card, /^<td[^>]*align="center"/, 'Card title and metadata must be centered: ' + link.id);
  assert(card.includes('<p align="left">'), 'Descriptions must remain left-aligned: ' + link.id);
  const languageIcon = { RU: 'ru', EN: 'gb', Multilingual: 'globe' }[link.language];
  if (languageIcon) {
    assert(card.includes('src="../assets/languages/' + languageIcon + '.svg"'), 'Missing language icon: ' + link.id);
    assert(card.includes('&nbsp;' + link.language + '</sub>'), 'Written language label must remain visible: ' + link.id);
  } else {
    assert(!card.includes('assets/languages/'), 'Do not assign a country flag to Latin');
  }
  assert(page.includes(link.title.replaceAll('&', '&amp;').replaceAll("'", '&#39;')), 'Missing card: ' + link.id);
  const status = statuses.find(item => item.url === link.url);
  if (status.last_ok) assert(page.includes('Last available: ' + status.last_ok), 'Missing last successful date');
  await access(path.join(root, 'assets/status', link.id + '.svg'));
}
const workflow = await read('.github/workflows/check-links.yml');
assert(!ids.has('globe4r') && !ids.has('location-history-r'), 'Removed R entries must not return');
assert.equal(links.filter(link => new URL(link.url).hostname === 'nakarte.me').length, 1, 'Keep one generic Nakarte entry');
assert.equal(links.find(link => link.id === 'nakarte')?.url, 'https://nakarte.me/');
assert.equal(links.find(link => link.id === 'geo-heatmap')?.url, 'https://github.com/luka1199/geo-heatmap');
for (const category of categories) assert(ids.has(category.cover), 'Category cover must reference an active entry');
assert(workflow.includes("cron: '17 3 1 * *'"), 'Expected monthly schedule');
console.log('Validated ' + links.length + ' entries, local assets, availability dates and monthly workflow.');
