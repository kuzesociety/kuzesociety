// Modo práctica: averías misteriosas.

import { h } from './dom.js';
import { diagnoseReadings, FAULTS } from '../diagnose.js';

const LS = 'frigosimu.practice';

export const ANSWERS = {
  fuga: 'Falta de refrigerante (fuga)',
  exceso: 'Exceso de carga',
  restriccion: 'Filtro deshidratador obstruido',
  vet_cerrada: 'Válvula de expansión casi cerrada',
  vet_abierta: 'Válvula de expansión atascada abierta',
  condensacion: 'Condensador sucio o sin aire',
  evaporador: 'Evaporador sin aire (ventilador)',
  compresor: 'Compresor con válvulas rotas',
  incondensables: 'Aire en el circuito',
  solenoide: 'Solenoide que no abre',
  normal: 'Funciona bien, no tiene avería',
};

const HINTS = {
  fuga: ['Mira el visor y el subenfriamiento.', 'Compara el recalentamiento con lo normal (4–9 K).'],
  exceso: ['Compara la presión de alta con el subenfriamiento.', 'El condensador y su ventilador están bien…'],
  restriccion: ['Toca el filtro deshidratador: ¿hay diferencia de temperatura?', 'Recalentamiento alto, pero el subenfriamiento no es cero.'],
  vet_cerrada: ['El recalentamiento está alto… pero ¿el visor está lleno?', 'El filtro no tiene caída de temperatura.'],
  vet_abierta: ['Mira el recalentamiento y la línea de aspiración.', '¿Llega vapor seco al compresor?'],
  condensacion: ['Mira el salto térmico del condensador (condensación − exterior).', '¿Gira el ventilador? ¿Está limpio?'],
  evaporador: ['Mira el salto térmico del evaporador.', '¿Giran los ventiladores de la cámara?'],
  compresor: ['Mira a la vez la baja, la alta y la intensidad.', 'La relación de compresión es muy baja.'],
  incondensables: ['La alta está alta… ¿el condensador está limpio y el ventilador gira?', 'El subenfriamiento es alto.'],
  solenoide: ['El compresor para por baja… ¿llega líquido al evaporador?', 'Toca la solenoide en el dibujo.'],
  normal: ['Compara cada lectura con su rango normal.', 'Mira el visor, el recalentamiento y los saltos térmicos.'],
};

const R = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SCENARIOS = [
  { answer: 'fuga', faults: () => ({ chargePct: Math.round(R(36, 48)) }) },
  { answer: 'exceso', faults: () => ({ chargePct: Math.round(R(130, 140)) }) },
  { answer: 'restriccion', faults: () => ({ filterClog: +R(0.65, 0.85).toFixed(2) }) },
  { answer: 'vet_cerrada', faults: () => ({ txv: 'cerrada' }) },
  { answer: 'vet_abierta', faults: () => ({ txv: 'abierta' }) },
  { answer: 'condensacion', faults: () => ({ condDirt: +R(0.8, 0.92).toFixed(2) }) },
  { answer: 'condensacion', faults: () => ({ condFanBroken: true }) },
  { answer: 'evaporador', faults: () => ({ evapFanBroken: true }) },
  { answer: 'compresor', faults: () => ({ compValves: true }) },
  { answer: 'incondensables', faults: () => ({ nonCondensables: true }) },
  { answer: 'normal', faults: () => ({}) },
  { answer: 'solenoide', faults: () => ({ solenoidStuck: true }), example: 'congelados' },
];

const REFS = {
  positiva: ['R404A', 'R449A', 'R448A', 'R452A', 'R134a', 'R507A', 'R513A'],
  congelados: ['R404A', 'R449A', 'R452A', 'R507A'],
};

export class Practice {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    this.score = { ok: 0, total: 0, streak: 0 };
    try {
      Object.assign(this.score, JSON.parse(localStorage.getItem(LS) || '{}'));
    } catch {
      /* sin almacenamiento */
    }
    this.cur = null;
    this.easy = true;
  }

  save() {
    try {
      localStorage.setItem(LS, JSON.stringify(this.score));
    } catch {
      /* sin almacenamiento */
    }
  }

  /** Prepara una máquina nueva con una avería oculta. */
  start() {
    const sc = pickOne(SCENARIOS);
    const example = sc.example || (Math.random() < 0.3 ? 'congelados' : 'positiva');
    const refrigerant = pickOne(REFS[example]);
    const Tamb = Math.round(R(24, 35));
    const faults = sc.faults();
    this.cur = { ...sc, example, refrigerant, Tamb, faults, answered: false, hints: 0, wrong: [] };
    const opts = new Set([sc.answer]);
    const pool = Object.keys(ANSWERS).filter((k) => k !== sc.answer && (k !== 'solenoide' || example === 'congelados'));
    while (opts.size < 5 && pool.length) opts.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    this.cur.options = [...opts].sort(() => Math.random() - 0.5);
    this.app.setupScenario({ example, refrigerant, Tamb, faults, warm: 3, minutes: 14 });
    this.render();
  }

  answer(id) {
    const c = this.cur;
    if (!c || c.answered) return;
    const ok = id === c.answer;
    if (ok) {
      c.answered = true;
      this.score.total++;
      if (!c.wrong.length) {
        this.score.ok++;
        this.score.streak++;
      } else this.score.streak = 0;
      this.save();
    } else {
      c.wrong.push(id);
    }
    this.render(ok ? null : id);
  }

  hint() {
    const c = this.cur;
    if (!c) return;
    c.hints = Math.min(c.hints + 1, HINTS[c.answer].length);
    this.render();
  }

  giveUp() {
    const c = this.cur;
    if (!c || c.answered) return;
    c.answered = true;
    c.gaveUp = true;
    this.score.total++;
    this.score.streak = 0;
    this.save();
    this.render();
  }

  render(lastWrong) {
    const c = this.cur;
    const el = this.el;
    el.innerHTML = '';
    const sc = this.score;
    const head = h('div', { class: 'pr-head' },
      h('strong', {}, 'Avería misteriosa'),
      h('span', { class: 'pr-score' }, `aciertos ${sc.ok} de ${sc.total}${sc.streak > 1 ? ` · racha ${sc.streak}` : ''}`),
      h('label', { class: 'pr-easy' }, (() => {
        const i = h('input', { type: 'checkbox', checked: this.easy });
        i.addEventListener('change', () => {
          this.easy = i.checked;
          this.app.refreshReadings();
        });
        return i;
      })(), 'Con ayudas (colores normal / alto / bajo)'),
      h('button', { class: 'btn small primary', type: 'button', onclick: () => this.start() }, c ? 'Otra avería' : 'Empezar'),
    );
    el.append(head);
    if (!c) {
      el.append(h('p', {}, 'Te preparo una cámara en marcha con una avería escondida. Mira los manómetros, las temperaturas y el dibujo (puedes tocar las piezas), y elige qué le pasa.'));
      return;
    }
    el.append(h('p', { class: 'pr-q' }, `Máquina con ${c.refrigerant}, exterior a ${c.Tamb} °C. ¿Qué le pasa?`));
    const opts = h('div', { class: 'pr-opts' });
    for (const id of c.options) {
      const cls = c.answered && id === c.answer ? 'ok' : c.wrong.includes(id) ? 'no' : '';
      opts.append(h('button', { class: `pr-opt ${cls}`, type: 'button', disabled: c.answered || c.wrong.includes(id), onclick: () => this.answer(id) }, ANSWERS[id]));
    }
    el.append(opts);
    if (!c.answered) {
      const tools = h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => this.hint(), disabled: c.hints >= HINTS[c.answer].length }, c.hints ? 'Otra pista' : 'Pista'),
        h('button', { class: 'btn small', type: 'button', onclick: () => this.giveUp() }, 'Me rindo'));
      el.append(tools);
      if (lastWrong) el.append(h('p', { class: 'pr-bad' }, `No es «${ANSWERS[lastWrong]}». Vuelve a mirar las lecturas.`));
    }
    if (c.hints) el.append(h('ul', { class: 'pr-hints' }, HINTS[c.answer].slice(0, c.hints).map((t) => h('li', {}, t))));
    if (c.answered) {
      const F = FAULTS.find((f) => f.id === c.answer);
      const box = h('div', { class: `pr-result${c.gaveUp ? ' gave' : ''}` },
        h('p', { class: 'pr-title' }, c.gaveUp ? `Era: ${ANSWERS[c.answer]}.` : c.wrong.length ? `Bien, era «${ANSWERS[c.answer]}» (a la ${c.wrong.length + 1}ª).` : `¡Correcto! Era «${ANSWERS[c.answer]}».`));
      if (F) box.append(h('p', {}, F.what));
      else if (c.answer === 'normal') box.append(h('p', {}, 'Todas las lecturas estaban dentro de lo normal para esta instalación.'));
      const r = this.app.simReadings();
      if (r) {
        const d = diagnoseReadings(r);
        const hyp = d.hypotheses.find((x) => x.id === c.answer);
        if (hyp && hyp.evidence.length) {
          box.append(h('p', { class: 'pr-sub' }, 'Las pistas estaban en:'), h('ul', { class: 'dg-ev' }, hyp.evidence.map((e) => h('li', { class: e.ok ? 'ok' : 'no' }, e.text))));
        }
      }
      box.append(h('div', { class: 'row' },
        h('button', { class: 'btn small primary', type: 'button', onclick: () => this.start() }, 'Siguiente avería'),
        h('button', { class: 'btn small', type: 'button', onclick: () => this.app.revealFaults() }, 'Enséñame la pieza averiada')));
      el.append(box);
    }
  }
}
