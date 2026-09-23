import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (file, fallback) => {
  try { return JSON.parse(await readFile(path.join(root, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};
const links = await read('data/links.json', []);
const project = await read('data/project.json', {});
const categories = await read('data/categories.json', []);
const statuses = await read('data/link-status.json', []);
const previews = await read('data/previews.json', []);
const statusByUrl = new Map(statuses.map(item => [item.url, item]));
const previewById = new Map(previews.map(item => [item.id, item]));
const ids = new Set();
for (const link of links) {
  if (!/^[a-z0-9-]+$/.test(link.id) || ids.has(link.id)) throw new Error('Invalid or duplicate id: ' + link.id);
  ids.add(link.id);
  if (!categories.some(category => category.id === link.category)) throw new Error('Unknown category: ' + link.category);
  for (const field of ['title', 'description', 'type', 'language']) {
    if (typeof link[field] !== 'string' || !link[field].trim()) throw new Error('Missing ' + field + ': ' + link.id);
  }
  if (!/^https?:$/.test(new URL(link.url).protocol)) throw new Error('Invalid URL: ' + link.id);
  if (!project.formats.includes(link.type)) throw new Error('Unknown format: ' + link.id);
  if (!Object.hasOwn(project.languages, link.language)) throw new Error('Unknown language: ' + link.id);
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const date = value => value ? String(value).slice(0, 10) : 'Not checked';
await mkdir(path.join(root, 'catalog'), { recursive: true });
await mkdir(path.join(root, 'assets/status'), { recursive: true });
const save = async (file, content) => writeFile(path.join(root, file), content.trimEnd() + '\n', 'utf8');
const lastAvailable = status => status?.last_ok || (status?.state === 'ok' ? date(status.checked_at) : null);
const stateText = status => lastAvailable(status) ? 'Last available' : 'Not verified yet';
function badge(status) {
  const label = stateText(status), stamp = lastAvailable(status) || '';
  const palette = stamp ? ['#eef7f1', '#166534', '#15803d'] : ['#f1f3f5', '#57606a', '#6e7781'];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="230" height="26" role="img" aria-label="' + esc(label + (stamp ? ' on ' + stamp : '')) + '">' +
    '<rect width="230" height="26" rx="5" fill="' + palette[0] + '"/><circle cx="12" cy="13" r="3.5" fill="' + palette[2] + '"/>' +
    '<text x="23" y="17" font-family="Arial,sans-serif" font-size="12" fill="' + palette[1] + '">' +
    esc(label + (stamp ? ' · ' + stamp : '')) + '</text></svg>';
}
await save('assets/preview-unavailable.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" role="img" aria-label="Preview unavailable">' +
  '<rect width="640" height="400" fill="#f1f3f5"/><rect x="280" y="119" width="80" height="62" rx="8" fill="none" stroke="#9aa5ad" stroke-width="3"/>' +
  '<path d="M287 173l23-25 16 16 10-10 17 19" fill="none" stroke="#9aa5ad" stroke-width="3"/><circle cx="337" cy="138" r="6" fill="#9aa5ad"/>' +
  '<text x="320" y="226" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#485661">Preview unavailable</text>' +
  '<text x="320" y="260" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#667782">Open the link to explore</text></svg>');
function imageFor(link) {
  const preview = previewById.get(link.id);
  return preview?.image && existsSync(path.join(root, preview.image)) ? preview.image : 'assets/preview-unavailable.svg';
}
function card(link) {
  const status = statusByUrl.get(link.url), preview = previewById.get(link.id), picture = imageFor(link);
  const alt = picture.endsWith('.svg') ? 'Preview unavailable for ' + link.title : 'Screenshot of ' + link.title;
  const captured = preview?.captured_at ? 'Preview captured ' + date(preview.captured_at) : 'No screenshot available';
  const availability = lastAvailable(status);
  const languageIcon = { RU: 'ru', EN: 'gb', Multilingual: 'globe' }[link.language];
  const languageLabel = (languageIcon ? '<img src="../assets/languages/' + languageIcon + '.svg" width="16" height="12" alt="" title="' + esc(project.languages[link.language]) + '">&nbsp;' : '') + esc(link.language);
  return '<td width="33%" valign="top" align="center">\n<a href="' + esc(link.url) + '"><img src="../' + picture + '" width="240" alt="' + esc(alt) + '" title="' + esc(captured) + '"></a><br>\n' +
    '<strong><a href="' + esc(link.url) + '">' + esc(link.title) + '</a></strong><br>\n<sub>' + esc(link.type) + ' · ' + languageLabel + '</sub>\n<p align="left">' + esc(link.description) + '</p>\n' +
    '<sub>' + (availability ? '🟢 Last available: ' + esc(availability) : '⚪ Not verified yet') + '</sub>\n</td>';
}
function grid(items, render) {
  const rows = [];
  for (let i = 0; i < items.length; i += 3) {
    const row = items.slice(i, i + 3).map(render);
    while (row.length < 3) row.push('<td width="33%"></td>');
    rows.push('<tr>\n' + row.join('\n') + '\n</tr>');
  }
  return '<table>\n' + rows.join('\n') + '\n</table>';
}
function listEntry(link) {
  const status = statusByUrl.get(link.url);
  return '- [' + link.title.replace(/[[\]]/g, '\\$&') + '](<' + link.url + '>) — ' + link.description +
    ' *' + link.type + ' · ' + link.language + ' · ' + stateText(status) +
    (lastAvailable(status) ? ': ' + lastAvailable(status) : '') + '*';
}
for (const link of links) await save('assets/status/' + link.id + '.svg', badge(statusByUrl.get(link.url)));
for (const category of categories) {
  const items = links.filter(link => link.category === category.id);
  await save('catalog/' + category.id + '.md', [
    '[← All categories](../README.md) · [Text index](index.md) · [About status dates](../README.md#availability)',
    '', '# ' + category.title, '', category.description, '', '**' + items.length + ' entries** · Click a preview or title to open the original.',
    '', '<details>', '<summary>Compact text view · useful on small screens</summary>', '',
    ...items.map(listEntry), '', '</details>', '', grid(items, card), '', '[↑ All categories](../README.md)', ''
  ].join('\n'));
}
const activeStatuses = links.map(link => statusByUrl.get(link.url)).filter(Boolean);
const latest = activeStatuses.map(status => status.checked_at).filter(Boolean).sort().at(-1);
const categoryCard = category => {
  const items = links.filter(link => link.category === category.id);
  let cover = items.find(link => link.id === category.cover);
  if (!cover || imageFor(cover).endsWith('.svg')) cover = items.find(link => !imageFor(link).endsWith('.svg')) || items[0];
  return '<td width="33%" valign="top" align="center">\n<a href="catalog/' + category.id + '.md"><img src="' + imageFor(cover) +
    '" width="240" alt="' + esc(category.title + ' — explore this category') + '"></a><br>\n<strong><a href="catalog/' +
    category.id + '.md">' + esc(category.title) + '</a></strong> <sub>' + items.length + ' entries</sub>\n<p align="left">' +
    esc(category.description) + '</p>\n</td>';
};
await save('README.md', [
  '# ' + project.title, '',
  project.description, '',
  '**' + links.length + ' links · ' + categories.length + ' categories**' + (latest ? ' · **Checked ' + date(latest) + '**' : ''), '',
  '[Browse the text index](catalog/index.md) · [Suggest a link](CONTRIBUTING.md) · [How to maintain this collection](MAINTAINING.md)', '',
  '## Explore', '', grid(categories, categoryCard), '', '## Availability', '',
  '🟢 **Last available: YYYY-MM-DD** is the most recent date on which the saved URL returned a successful response. It is a dated observation, not a live uptime indicator or a guarantee that every interactive feature works. Entries without a successful check show **Not verified yet**.', '',
  'The last successful date is preserved until a newer successful check replaces it. Screenshots are separate snapshots; a labeled placeholder is used when no usable preview is available. Hover over a preview to see its capture date.', '',
  'Checks run once a month through GitHub Actions after the repository is published. See [maintenance instructions](MAINTAINING.md) to refresh availability dates or previews locally.', '',
  '## About this collection', '',
  'Maps sit alongside charts, simulations, photographs and illustrated stories. Each entry has a topic (its category), a format and a source-language label: **EN**, **RU** or **Multilingual**. Small UK/Russian flags accompany EN/RU as visual cues for language, not the origin of a project; multilingual sources use a globe. Historical material may use a specific language code, such as **LA** for Latin, without a national flag. Descriptions are in English; linked websites keep their original languages.', '',
  'Previews link to the original work. Screenshots and linked content remain the work of their respective creators.', ''
].join('\n'));
await save('catalog/index.md', [
  '[← Visual directory](../README.md)', '', '# Text index', '', 'A compact, searchable view of all ' + links.length + ' entries.', '',
  ...categories.flatMap(category => ['## ' + category.title, '', ...links.filter(link => link.category === category.id).map(listEntry), ''])
].join('\n'));
console.log('Built ' + links.length + ' cards in ' + categories.length + ' categories.');
