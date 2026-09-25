// Empaqueta la aplicación en un único HTML (sin dependencias).
//
//   node build.mjs                → dist/FrigoSIMU.html (se abre con doble clic)
//   node build.mjs --fragment X   → X: mismo contenido sin <html>/<head>/<body>
//
// Cada módulo ES se envuelve en su propia función para que sus variables no
// choquen; los import/export se traducen a un registro de módulos.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

function bundle(entry) {
  const order = [];
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^import\s+[\s\S]*?\s+from\s+'([^']+)';/gm)) visit(resolve(dirname(file), m[1]));
    order.push(file);
  };
  visit(entry);

  const parts = order.map((file) => {
    const id = relative(ROOT, file);
    let src = readFileSync(file, 'utf8');
    const exported = [];
    src = src.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+'([^']+)';/gm, (_, names, from) => {
      const dep = relative(ROOT, resolve(dirname(file), from));
      const list = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/\s+as\s+/, ': '));
      return `const { ${list.join(', ')} } = __mods[${JSON.stringify(dep)}];`;
    });
    src = src.replace(/^export\s+(const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
      exported.push(name);
      return `${kind} ${name}`;
    });
    src = src.replace(/^export\s+\{([^}]*)\};?/gm, (_, names) => {
      for (const n of names.split(',').map((x) => x.trim()).filter(Boolean)) exported.push(n);
      return '';
    });
    if (/^\s*(import|export)\s/m.test(src)) throw new Error(`Sintaxis de módulo no soportada en ${id}`);
    return `// ---- ${id}\n__mods[${JSON.stringify(id)}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();`;
  });
  return `(() => {\n'use strict';\nconst __mods = {};\n${parts.join('\n\n')}\n})();\n`;
}

function build({ fragment = false } = {}) {
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const css = readFileSync(join(ROOT, 'css/app.css'), 'utf8');
  const js = bundle(join(ROOT, 'js/main.js')).replace(/<\/script/gi, '<\\/script');
  html = html.replace('<link rel="stylesheet" href="css/app.css">', () => `<style>\n${css}</style>`);
  html = html.replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${js}</script>`);
  if (fragment) {
    html = html
      .replace(/<!doctype html>\s*/i, '')
      .replace(/<html[^>]*>\s*/i, '')
      .replace(/<\/?head>\s*/gi, '')
      .replace(/<meta charset[^>]*>\s*/i, '')
      .replace(/<meta name="viewport"[^>]*>\s*/i, '')
      .replace(/<body>\s*/i, '')
      .replace(/<\/body>\s*<\/html>\s*$/i, '');
  }
  return html;
}

const args = process.argv.slice(2);
const fi = args.indexOf('--fragment');
if (fi >= 0) {
  const out = resolve(args[fi + 1]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, build({ fragment: true }));
  console.log(`Fragmento: ${out}`);
} else {
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const out = join(ROOT, 'dist/FrigoSIMU.html');
  writeFileSync(out, build());
  console.log(`Generado ${relative(ROOT, out)}`);
}
