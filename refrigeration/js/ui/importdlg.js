// Diálogo "Abrir o importar un esquema": FrigoSIMU (.json), CADe SIMU (.cad)
// y, con Claude, fotos, capturas, PDF o archivos de otros programas. Antes de
// cargarlo se revisa qué es cada pieza en la instalación frigorífica.

import { h } from './dom.js';
import { importCadeSimu } from '../import/cadesimu.js';
import { ladderToProject } from '../import/ladder.js';
import { roleCandidates, applyRoles, INSTALLS } from '../import/roles.js';
import { buildPrompt, condenseFile, checkSpec } from '../import/ai.js';

const IMG = /\.(png|jpe?g|webp|gif)$/i;
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

export class ImportDialog {
  constructor(app) {
    this.app = app;
    this.back = h('div', { class: 'modal-back', hidden: true });
    this.box = h('div', { class: 'modal keep-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'imp-title' });
    this.back.append(this.box);
    document.body.append(this.back);
    this.back.addEventListener('pointerdown', (e) => {
      if (e.target === this.back && !this.busy) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.back.hidden) {
        e.stopPropagation();
        this.cancel();
      }
    }, true);
    this.sample = null;
    this.limits = null;
    // Claude solo está disponible dentro de claude.ai.
    const cl = typeof window !== 'undefined' ? window.claude : null;
    if (cl && typeof cl.use === 'function') {
      cl.use('sample').then(async (s) => {
        this.sample = s;
        if (s) this.limits = await s.limits().catch(() => null);
        if (!this.back.hidden && this.step === 'pick') this.showPick();
      }).catch(() => {});
    }
  }

  open(file) {
    this.back.hidden = false;
    if (file) this.handleFile(file);
    else this.showPick();
  }

  close() {
    this.back.hidden = true;
    this.box.innerHTML = '';
    this.step = null;
  }

  cancel() {
    if (this.ctl) this.ctl.abort();
    this.busy = false;
    this.close();
  }

  frame(title, ...kids) {
    this.box.innerHTML = '';
    this.box.append(
      h('header', { class: 'modal-head' }, h('h2', { id: 'imp-title' }, title), h('button', { class: 'card-x', type: 'button', 'aria-label': 'Cerrar', onclick: () => this.cancel() }, '×')),
      h('div', { class: 'modal-body' }, ...kids),
    );
  }

  // ----------------------------------------------------------- 1. elegir
  showPick() {
    this.step = 'pick';
    const ai = !!this.sample;
    const input = h('input', { type: 'file', id: 'imp-file', hidden: true });
    input.addEventListener('change', () => input.files[0] && this.handleFile(input.files[0]));
    const drop = h('label', { class: 'imp-drop', for: 'imp-file' },
      h('strong', {}, 'Suelta aquí el archivo o toca para elegirlo'),
      h('span', {}, ai
        ? 'CADe SIMU (.cad), FrigoSIMU (.json), una foto o captura del esquema, un PDF o el archivo de otro programa.'
        : 'CADe SIMU (.cad) o FrigoSIMU (.json).'),
      input);
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) this.handleFile(f);
    });
    const kids = [
      h('p', { class: 'imp-intro' }, 'Abre un esquema eléctrico tuyo y ponlo a funcionar con la cámara frigorífica: cada motor, termostato o presostato mueve el circuito frigorífico igual que en el esquema.'),
      drop,
    ];
    if (ai) {
      const ta = h('textarea', { id: 'imp-desc', rows: 3, placeholder: 'Ejemplo: cámara con marcha-paro, termostato, presostatos de alta y baja, ventilador del evaporador que para al abrir la puerta y luz.' });
      kids.push(
        h('div', { class: 'imp-or' }, 'o descríbelo con palabras'),
        h('label', { class: 'field', for: 'imp-desc' }, ta),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => ta.value.trim() && this.fromAI({ kind: 'text', description: ta.value.trim() }) }, 'Dibujar el esquema con Claude')),
        h('p', { class: 'note' }, 'Las fotos, los PDF, los archivos de otros programas y las descripciones los interpreta Claude con tu cuenta. Revisa siempre el resultado.'),
      );
    } else {
      kids.push(h('p', { class: 'note' }, 'Para leer fotos, PDF o archivos de otros programas, abre FrigoSIMU en claude.ai: allí Claude interpreta el esquema.'));
    }
    this.frame('Abrir o importar un esquema', ...kids);
  }

  // ----------------------------------------------------------- 2. leer
  async handleFile(file) {
    const name = file.name || 'esquema';
    try {
      if (/\.json$/i.test(name)) {
        this.close();
        this.app.openFile(file);
        return;
      }
      if (/\.cad$/i.test(name) || (await looksLikeCade(file))) {
        const txt = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
        const res = importCadeSimu(txt, { name: name.replace(/\.cad$/i, '') });
        this.review({ ...res, source: 'CADe SIMU', fileName: name });
        return;
      }
      if (!this.sample) {
        this.error(`No sé abrir «${name}» sin Claude. Aquí se pueden abrir archivos de CADe SIMU (.cad) y de FrigoSIMU (.json).`);
        return;
      }
      if (IMG.test(name) || /^image\//.test(file.type)) {
        await this.fromAI({ kind: 'images', images: [file], fileName: name });
        return;
      }
      if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
        this.working('Leyendo el PDF…');
        let images;
        try {
          images = await pdfToImages(file, this.maxImages());
        } catch (e) {
          this.error(`No he podido leer el PDF (${e.message}). Haz una captura de pantalla del esquema y súbela como imagen.`);
          return;
        }
        await this.fromAI({ kind: 'images', images, fileName: name });
        return;
      }
      const txt = await file.text();
      if (!txt.trim() || /[\u0000-\u0008]/.test(txt.slice(0, 2000))) {
        this.error(`«${name}» no es un archivo de texto. Exporta el esquema a PDF o haz una captura de pantalla y súbela.`);
        return;
      }
      await this.fromAI({ kind: 'file', text: condenseFile(txt), fileName: name });
    } catch (e) {
      this.error(e.message || String(e));
    }
  }

  maxImages() {
    return (this.limits && this.limits.images && this.limits.images.maxCount) || 1;
  }

  working(text, stop) {
    this.step = 'work';
    const kids = [h('div', { class: 'imp-work' }, h('span', { class: 'imp-spin', 'aria-hidden': 'true' }), h('p', { id: 'imp-status' }, text))];
    if (stop) kids.push(h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => this.cancel() }, 'Parar')));
    this.frame('Importando…', ...kids);
  }

  error(msg) {
    this.busy = false;
    this.frame('No se ha podido importar',
      h('p', { class: 'imp-err' }, msg),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => this.showPick() }, 'Probar con otro archivo')));
  }

  async fromAI(req) {
    const s = this.sample;
    if (!s) return this.error('Claude no está disponible aquí.');
    this.busy = true;
    this.ctl = new AbortController();
    this.working(req.kind === 'text' ? 'Claude está dibujando el esquema…' : 'Claude está leyendo el esquema… Puede tardar uno o dos minutos.', true);
    try {
      let images;
      if (req.images) {
        const max = this.maxImages();
        images = req.images.slice(0, max);
        if (this.limits && !this.limits.images) throw new Error('Aquí no se pueden enviar imágenes a Claude.');
      }
      const spec = await s.json(buildPrompt(req), { signal: this.ctl.signal, modelTier: 'complex', images, onText: () => {
        const st = document.getElementById('imp-status');
        if (st) st.textContent = 'Claude está escribiendo el esquema…';
      } });
      checkSpec(spec);
      const res = ladderToProject(spec);
      const notes = [...(Array.isArray(spec.notes) ? spec.notes.map(String) : []), ...res.notes];
      this.busy = false;
      this.review({ project: res.project, notes, check: null, texts: [], install: spec.install, source: 'Claude', fileName: req.fileName || '' });
    } catch (e) {
      this.busy = false;
      if (e && e.code === 'cancelled') return;
      const msg = {
        not_granted: 'No has dado permiso para usar Claude en esta página.',
        rate_limited: 'Has hecho muchas peticiones seguidas o has llegado a tu límite de uso. Prueba dentro de un rato.',
        image_rejected: 'Claude no ha aceptado la imagen. Prueba con otra captura (PNG o JPG).',
        invalid_json: 'Claude no ha devuelto un esquema válido. Prueba otra vez o con una imagen más nítida.',
        refused: 'Claude no ha querido interpretar este archivo.',
      }[e && e.code] || (e && e.message) || 'Error desconocido.';
      this.error(msg);
    }
  }

  // ----------------------------------------------------------- 3. revisar
  review(res) {
    this.step = 'review';
    const { items, install: guess } = roleCandidates(res.project, res.texts || []);
    let install = INSTALLS[res.install] ? res.install : guess;
    const choices = Object.fromEntries(items.map((i) => [i.id, i.value]));
    const n = res.project.components.filter((c) => c.type !== 'label').length;
    const summary = h('p', { class: 'imp-sum' },
      `${n} piezas y ${res.project.wires.length} tramos de cable${res.fileName ? ` de «${res.fileName}»` : ''}. `,
      res.check ? (res.check.ok
        ? h('span', { class: 'imp-ok' }, 'Conexiones comprobadas: iguales que en CADe SIMU.')
        : h('span', { class: 'imp-bad' }, `${res.check.splits + res.check.merges} conexiones no coinciden con el archivo: revísalas en el editor.`))
        : res.source === 'Claude' ? h('span', {}, 'Dibujado por Claude a partir de lo que ha visto: compáralo con tu esquema.') : null);
    const notes = (res.notes || []).length ? h('ul', { class: 'imp-notes' }, res.notes.map((t) => h('li', {}, t))) : null;

    const insts = h('div', { class: 'segs imp-inst', role: 'radiogroup', 'aria-label': 'Tipo de instalación' });
    for (const [k, v] of Object.entries(INSTALLS)) {
      const b = h('button', { type: 'button', class: `segb${k === install ? ' on' : ''}`, role: 'radio', 'aria-checked': String(k === install) }, v.label);
      b.addEventListener('click', () => {
        install = k;
        for (const x of insts.children) {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-checked', String(x === b));
        }
        warn();
      });
      insts.append(b);
    }

    const rows = items.map((it) => {
      const sel = h('select', { id: `imp-r-${it.id}`, 'aria-label': it.tag }, Object.entries(it.options).map(([k, l]) => h('option', { value: k, selected: k === it.value }, l)));
      sel.addEventListener('change', () => {
        choices[it.id] = sel.value;
        warn();
      });
      return h('tr', {}, h('th', {}, h('b', {}, it.tag), h('small', {}, it.what)), h('td', {}, sel));
    });
    const table = rows.length
      ? h('div', { class: 'imp-scroll' }, h('table', { class: 'imp-table' }, h('tbody', {}, rows)))
      : h('p', { class: 'note' }, 'No hay motores, resistencias ni contactos que asignar.');
    const warnEl = h('p', { class: 'imp-bad', hidden: true });
    const fanEl = h('p', { class: 'note', hidden: true });
    const warn = () => {
      const comp = Object.entries(choices).filter(([id, v]) => v === 'compresor' && items.find((i) => i.id === id && i.kind === 'motor')).length;
      let msg = '';
      if (install !== 'ninguna' && !comp) msg = 'Elige qué motor es el compresor: sin compresor el circuito frigorífico no se mueve.';
      else if (comp > 1) msg = 'Hay más de un motor marcado como compresor: se usará el que tenga tensión.';
      warnEl.textContent = msg;
      warnEl.hidden = !msg;
      const vals = Object.values(choices);
      const noFans = ['vent_evap', 'vent_cond'].filter((f) => !vals.includes(f));
      fanEl.textContent = install !== 'ninguna' && noFans.length
        ? `El esquema no tiene ${noFans.map((f) => (f === 'vent_evap' ? 'ventilador del evaporador' : 'ventilador del condensador')).join(' ni ')}: supondré que ${noFans.length > 1 ? 'giran' : 'gira'} (el del evaporador siempre, el del condensador con el compresor).`
        : '';
      fanEl.hidden = !fanEl.textContent;
    };
    warn();

    const load = (mode) => {
      const p = applyRoles(res.project, choices, install);
      this.close();
      this.app.loadImported(p, mode);
    };
    this.frame('Revisa cómo encaja en la cámara',
      summary,
      notes,
      h('h3', {}, 'Tipo de instalación'),
      insts,
      h('h3', {}, 'Qué es cada pieza'),
      h('p', { class: 'note' }, 'CADe SIMU no sabe de frío: dime qué hace cada motor y qué mide cada contacto. Lo he adivinado por las etiquetas y los textos del esquema.'),
      table,
      warnEl,
      fanEl,
      h('div', { class: 'row imp-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => load('sim') }, 'Cargar y ponerlo en marcha'),
        h('button', { class: 'btn', type: 'button', onclick: () => load('edit') }, 'Abrir en el editor'),
        h('button', { class: 'btn', type: 'button', onclick: () => this.cancel() }, 'Cancelar')),
    );
  }
}

async function looksLikeCade(file) {
  if (file.size > 5e6) return false;
  const head = new TextDecoder('latin1').decode(await file.slice(0, 16).arrayBuffer());
  return /^\s*CADe_SIMU/.test(head);
}

// PDF → imágenes con pdf.js (se carga solo cuando hace falta).
let pdfjsReady = null;
function loadScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error('no se ha podido cargar el lector de PDF'));
    document.head.append(s);
  });
}
async function pdfToImages(file, max) {
  if (!pdfjsReady) {
    pdfjsReady = (async () => {
      await loadScript(`${PDFJS}pdf.min.js`);
      await loadScript(`${PDFJS}pdf.worker.min.js`);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`;
      return window.pdfjsLib;
    })();
  }
  let lib;
  try {
    lib = await pdfjsReady;
  } catch (e) {
    pdfjsReady = null;
    throw e;
  }
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  const pages = Math.min(doc.numPages, Math.max(1, max));
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 2200 / Math.max(vp0.width, vp0.height));
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width);
    cv.height = Math.round(vp.height);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    out.push(await new Promise((ok) => cv.toBlob(ok, 'image/png')));
  }
  if (!out.length) throw new Error('el PDF no tiene páginas');
  return out;
}

