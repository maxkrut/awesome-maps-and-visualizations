import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const types = { '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
const css = await readFile(path.join(root, 'node_modules/github-markdown-css/github-markdown.css'), 'utf8');
const renderMarkdown = source => marked.parse(source).replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level, title) => {
  const slug = title.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  return '<h' + level + ' id="' + slug + '">' + title + '</h' + level + '>';
});
http.createServer(async (req, res) => {
  try {
    const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = requestPath === '/' ? 'README.md' : requestPath.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || relative.split(/[\\/]/).some(part => part.startsWith('.'))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const extension = path.extname(file);
    if (!['.md', '.svg', '.jpg', '.png'].includes(extension)) { res.writeHead(404); res.end('Not found'); return; }
    let body = await readFile(file);
    let contentType = types[extension] || 'text/plain';
    if (extension === '.md') {
      body = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Awesome Maps &amp; Visualizations · local Markdown preview</title><style>' + css +
        'body{margin:0;background:#fff}.markdown-body{box-sizing:border-box;min-width:200px;max-width:980px;margin:0 auto;padding:32px}@media(max-width:600px){.markdown-body{padding:16px}}' +
        '</style></head><body><article class="markdown-body">' + renderMarkdown(body.toString('utf8')) + '</article></body></html>';
      contentType = 'text/html; charset=utf-8';
    }
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log('Local Markdown preview: http://127.0.0.1:' + port));
