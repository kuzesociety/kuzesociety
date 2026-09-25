// Contenido de las tarjetas de cada pieza (circuito frigorífico y esquema).

import { h } from './dom.js';
import { DESCRIPTIONS, liveText } from './panels.js';
import { stepper, slider, toggle, seg, values, section } from './cards.js';
import { REFRIGERANTS, SIM_REFRIGERANT_IDS, getRefrigerant, satFromGauge, psatDew, psatBubble, gauge } from '../refrig/refrigerants.js';
import { TYPES } from '../elec/components.js';
import { explainLoad, whyOpen } from '../elec/explain.js';

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

// Averías mecánicas: la pieza puede tener tensión y aun así no funcionar.
const BROKEN = {
  compresor: ['compLocked', 'Tiene tensión, pero el compresor está agarrotado: no gira.'],
  vent_evap: ['evapFanBroken', 'Tiene tensión, pero el ventilador está averiado: no gira.'],
  vent_cond: ['condFanBroken', 'Tiene tensión, pero el ventilador está averiado: no gira.'],
  solenoide: ['solenoidStuck', 'Tiene tensión, pero la bobina está quemada: la válvula no abre.'],
};

function whyBox(app, fns) {
  const box = h('div', { class: 'card-why' });
  let last = '';
  box.refresh = () => {
    const lines = fns.flatMap((fn) => app.explainFunc(fn).map((l) => {
      const b = BROKEN[fn];
      const broken = b && l.on && app.faults()[b[0]] && !app.practiceHideFaults;
      return broken ? { on: false, text: `${l.text} ${b[1]}` } : l;
    }));
    const key = JSON.stringify(lines);
    if (key === last) return;
    last = key;
    box.innerHTML = '';
    if (!lines.length) {
      box.append(h('p', {}, 'Esta pieza no está en el esquema eléctrico.'));
      return;
    }
    box.append(h('span', { class: 'why-k' }, 'Por qué (esquema eléctrico)'));
    for (const l of lines) box.append(h('p', { class: l.on ? 'on' : 'off' }, l.text));
  };
  return box;
}

function faultCtl(app, el) {
  // En modo práctica no se enseñan los mandos de averías.
  return app.practiceHideFaults ? null : el;
}

function chargeCtls(app) {
  const F = app.faults();
  const ch = slider('Carga de refrigerante', F.chargePct, { min: 20, max: 140, step: 1, unit: '%' }, (v) => app.setFault('chargePct', v));
  const lk = seg('Fuga', { 0: 'Sin fuga', 5: 'Lenta', 20: 'Media', 60: 'Rápida' }, String(F.leakRate || 0), (v) => app.setFault('leakRate', +v));
  const fix = h('button', { class: 'btn small', type: 'button', onclick: () => { app.setFault('leakRate', 0); app.setFault('chargePct', 100); ch.setValue(100); lk.setValue('0'); } }, 'Reparar la fuga y recargar al 100 %');
  const box = section('Carga y fugas', ch, lk, fix);
  box.sync = () => ch.setValue(Math.round(app.faults().chargePct));
  return box;
}

export function partCard(app, part) {
  const o0 = app.out();
  if (!o0) return null;
  const F = () => app.faults();
  const P = () => app.params();
  const cards = {
    room() {
      const th = app.thermostat();
      let vals, why;
      return {
        kicker: 'CÁMARA',
        title: 'Temperatura y termostato',
        what: 'El termostato mide el aire de la cámara: al llegar a la consigna para el frío y vuelve a darlo cuando la temperatura sube el diferencial. Cuanto más fría la quieras, más baja evapora el refrigerante (menos presión de baja) y menos rinde la máquina.',
        render(b) {
          vals = values([['air', 'Aire'], ['prod', 'Género'], ['th', 'Termostato'], ['door', 'Puerta']]);
          b.append(vals);
          if (th) {
            b.append(section('Termostato ' + th.props.tag,
              stepper('Consigna (para a)', +th.props.sp, { step: 0.5, min: -35, max: 20, unit: '°C' }, (v) => app.setThermostat('sp', v)),
              stepper('Diferencial', +th.props.diff, { step: 0.5, min: 0.5, max: 10, unit: 'K' }, (v) => app.setThermostat('diff', v)),
            ));
          } else b.append(h('p', { class: 'note' }, 'Este esquema no tiene termostato de cámara.'));
          b.append(section('Cámara',
            toggle('Puerta abierta', o0.door, () => app.toggleDoor()),
            h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', disabled: !app.sim, onclick: () => app.addProductLoad() }, 'Meter género caliente')),
            seg('Aislamiento', { 0.025: 'Bueno', 0.04: 'Normal', 0.07: 'Malo' }, String(P().roomUA), (v) => app.setRefrig('roomUA', +v)),
            faultCtl(app, toggle('Burlete de la puerta dañado', F().doorSeal, (v) => app.setFault('doorSeal', v), { danger: true })),
          ));
          why = whyBox(app, ['compresor']);
          b.append(why);
        },
        update() {
          const o = app.out();
          const t = app.thermostat();
          const st = t && app.sim ? app.sim.elec.cstate.get(t.id) : null;
          vals.set({
            air: `${fmt(o.Troom)} °C`,
            prod: `${fmt(o.Tprod)} °C`,
            th: t ? `${st && st.actuated ? 'satisfecho (no pide frío)' : 'pide frío'} · para a ${fmt(+t.props.sp)} °C, arranca a ${fmt(+t.props.sp + +t.props.diff)} °C` : '—',
            door: o.door ? 'ABIERTA' : 'cerrada',
          });
          why.refresh();
        },
      };
    },

    unit() {
      let vals;
      return {
        kicker: 'EXTERIOR',
        title: 'Temperatura exterior',
        what: 'El condensador echa el calor al aire de fuera. Con más calor fuera sube la presión de alta, el compresor consume más y da menos frío.',
        render(b) {
          vals = values([['amb', 'Aire exterior'], ['tc', 'Condensación'], ['dt', 'Salto condensador']]);
          b.append(vals, stepper('Temperatura exterior', P().Tamb, { step: 1, min: -10, max: 46, unit: '°C' }, (v) => app.setRefrig('Tamb', v)));
        },
        update() {
          const o = app.out();
          vals.set({ amb: `${fmt(o.Tamb)} °C`, tc: `${fmt(o.Tc)} °C · ${fmt(o.PcG, 2)} bar`, dt: o.running ? `${fmt(o.condDT)} K` : '— (parado)' });
        },
      };
    },

    refrigerant() {
      let info, conv;
      return {
        kicker: 'REFRIGERANTE',
        title: 'Cambiar el refrigerante',
        what: 'La máquina se recalcula para dar la misma potencia con el refrigerante elegido. Fíjate en cómo cambian las presiones para las mismas temperaturas.',
        render(b) {
          const opts = Object.fromEntries(SIM_REFRIGERANT_IDS.map((id) => [id, REFRIGERANTS[id].label]));
          const sel = h('select', { class: 'ctl-select', 'aria-label': 'Refrigerante' }, Object.entries(opts).map(([k, l]) => h('option', { value: k, selected: k === P().refrigerant }, l)));
          sel.addEventListener('change', () => {
            app.setRefrig('refrigerant', sel.value);
            info.refresh();
          });
          info = h('div', { class: 'refinfo' });
          info.refresh = () => {
            const r = getRefrigerant(app.params().refrigerant);
            info.innerHTML = '';
            info.append(values([['c', 'Composición'], ['s', 'Seguridad'], ['g', 'PCA (GWP)'], ['gl', 'Deslizamiento'], ['p0', 'Presión a 0 °C'], ['p40', 'Presión a 40 °C']]));
            info.firstChild.set({
              c: r.composition,
              s: { A1: 'A1 (no inflamable)', A2L: 'A2L (poco inflamable)', A3: 'A3 (inflamable)', B2L: 'B2L (tóxico, poco inflamable)' }[r.safety] || r.safety,
              g: String(r.gwp),
              gl: r.zeotropic ? `${fmt(psatBubble(r, 0) ? satFromGauge(r, gauge(psatDew(r, -10))).glide : 0)} K (mezcla zeotrópica)` : 'no (se comporta como puro)',
              p0: r.zeotropic ? `${fmt(gauge(psatDew(r, 0)), 2)} bar rocío · ${fmt(gauge(psatBubble(r, 0)), 2)} bar burbuja` : `${fmt(gauge(psatDew(r, 0)), 2)} bar`,
              p40: r.zeotropic ? `${fmt(gauge(psatDew(r, 40)), 2)} rocío · ${fmt(gauge(psatBubble(r, 40)), 2)} burbuja` : `${fmt(gauge(psatBubble(r, 40)), 2)} bar`,
            });
          };
          conv = ptConverter(app);
          b.append(h('div', { class: 'ctl' }, h('span', { class: 'ctl-l' }, 'Refrigerante de la máquina'), sel), info, conv);
          info.refresh();
        },
        update() {},
      };
    },

    evap() {
      let vals, why;
      return {
        kicker: 'EVAPORADOR',
        title: 'Batería y ventiladores',
        what: 'Aquí el refrigerante hierve a baja presión y roba el calor del aire de la cámara. Si entra menos aire (ventilador parado, hielo), llega menos calor y la presión de baja cae; si entra aire caliente, la baja sube.',
        render(b) {
          vals = values([['te', 'Evaporación'], ['td', 'Salto térmico'], ['sh', 'Recalentamiento'], ['ice', 'Escarcha'], ['fan', 'Ventilador'], ['heat', 'Resistencia']]);
          const acts = h('div', { class: 'row' });
          if (app.clockDevice()) acts.append(h('button', { class: 'btn small', type: 'button', onclick: () => app.forceDefrost() }, 'Forzar / terminar desescarche'));
          acts.append(h('button', { class: 'btn small', type: 'button', onclick: () => app.manualDefrost() }, 'Quitar el hielo a mano'));
          b.append(vals, section('Acciones', acts));
          const fc = faultCtl(app, toggle('Ventilador averiado', F().evapFanBroken, (v) => app.setFault('evapFanBroken', v), { danger: true }));
          if (fc) b.append(section('Averías', fc));
          why = whyBox(app, ['vent_evap', 'desescarche']);
          b.append(why);
        },
        update() {
          const o = app.out();
          vals.set({
            te: `${fmt(o.Te)} °C · ${fmt(o.PeG, 2)} bar`,
            td: o.running ? `${fmt(o.TD)} K (aire ${fmt(o.Troom)} °C)` : '— (compresor parado)',
            sh: o.running ? `${fmt(o.SHevap)} K` : '—',
            ice: `${fmt(o.ice, 2)} kg · paso de aire ${Math.round(o.frostFactor * 100)} %`,
            fan: o.fanE ? 'gira' : F().evapFanBroken ? { text: 'AVERIADO', cls: 'bad' } : 'parado',
            heat: o.heater ? { text: 'CALENTANDO', cls: 'warn' } : 'apagada',
          });
          why.refresh();
        },
      };
    },

    txv() {
      const cap = P().expansion === 'capilar';
      let vals;
      if (cap) {
        return {
          kicker: 'EXPANSIÓN',
          title: 'Tubo capilar',
          what: 'Un tubo largo y muy fino frena el líquido y le baja la presión. No regula: el caudal depende de las presiones y de la carga. Al parar deja pasar refrigerante hasta que las presiones se igualan.',
          render(b) {
            vals = values([['in', 'Entrada evaporador'], ['sh', 'Recalentamiento'], ['dp', 'Diferencia alta−baja']]);
            b.append(vals);
            const fc = faultCtl(app, slider('Obstrucción del capilar', Math.round(F().filterClog * 100), { min: 0, max: 100, step: 5, unit: '%' }, (v) => app.setFault('filterClog', v / 100)));
            if (fc) b.append(section('Averías', fc));
          },
          update() {
            const o = app.out();
            vals.set({ in: `${fmt(o.TevapIn)} °C`, sh: o.running ? `${fmt(o.SHevap)} K` : '—', dp: `${fmt(o.PcG - o.PeG, 2)} bar` });
          },
        };
      }
      return {
        kicker: 'VÁLVULA DE EXPANSIÓN',
        title: 'Válvula termostática (VET)',
        what: 'Deja pasar el líquido justo para que el vapor salga del evaporador con unos grados de recalentamiento. El bulbo mide la salida del evaporador: si el recalentamiento sube, abre; si baja, cierra.',
        render(b) {
          vals = values([['sh', 'Recalentamiento'], ['set', 'Ajuste'], ['in', 'Entrada evaporador'], ['feed', 'Caudal que deja pasar']]);
          b.append(vals, section('Ajuste', stepper('Recalentamiento de ajuste', P().shSet, { step: 0.5, min: 2, max: 15, unit: 'K' }, (v) => app.setRefrig('shSet', v))));
          const fc = faultCtl(app, seg('Estado de la válvula', { ok: 'Correcta', cerrada: 'Casi cerrada', abierta: 'Atascada abierta' }, F().txv, (v) => app.setFault('txv', v)));
          if (fc) b.append(section('Averías', fc));
        },
        update() {
          const o = app.out();
          vals.set({
            sh: o.running ? `${fmt(o.SHevap)} K` : '— (parado)',
            set: `${fmt(P().shSet)} K`,
            in: `${fmt(o.TevapIn)} °C (mezcla líquido + vapor)`,
            feed: `${fmt(o.mFeed * 3600, 0)} kg/h`,
          });
        },
      };
    },

    suction() {
      let vals;
      return {
        kicker: 'LÍNEA DE ASPIRACIÓN',
        title: 'Vapor frío hacia el compresor',
        what: 'Lleva el vapor del evaporador al compresor. Debe llegar recalentado, sin gotas de líquido: el recalentamiento protege al compresor del golpe de líquido.',
        render(b) {
          vals = values([['p', 'Presión (baja)'], ['t', 'Temperatura tubería'], ['sh', 'Recalentamiento total'], ['st', 'Estado del refrigerante']]);
          b.append(vals);
        },
        update() {
          const o = app.out();
          vals.set({
            p: `${fmt(o.PeG, 2)} bar (evapora a ${fmt(o.Te)} °C)`,
            t: `${fmt(o.Tsuc)} °C`,
            sh: o.running ? `${fmt(o.SH)} K` : '—',
            st: o.floodback ? { text: '¡RETORNO DE LÍQUIDO!', cls: 'bad' } : o.running ? 'vapor recalentado' : 'sin circulación',
          });
        },
      };
    },

    discharge() {
      let vals;
      return {
        kicker: 'LÍNEA DE DESCARGA',
        title: 'Gas caliente a alta presión',
        what: 'El compresor comprime el vapor: sale muy caliente y a alta presión hacia el condensador. Si la descarga pasa de unos 110 °C el aceite se degrada.',
        render(b) {
          vals = values([['p', 'Presión (alta)'], ['t', 'Temperatura descarga'], ['pr', 'Relación de compresión']]);
          b.append(vals);
        },
        update() {
          const o = app.out();
          vals.set({ p: `${fmt(o.PcG, 2)} bar`, t: `${fmt(o.Tdis, 0)} °C`, pr: o.running ? fmt(o.pr, 1) : '—' });
        },
      };
    },

    liquid() {
      let vals;
      return {
        kicker: 'LÍNEA DE LÍQUIDO',
        title: 'Líquido hacia la válvula de expansión',
        what: 'El refrigerante condensado va del recipiente a la válvula pasando por el filtro, el visor y la solenoide. Debe ir subenfriado (unos grados por debajo de la condensación) para que no se formen burbujas.',
        render(b) {
          vals = values([['t', 'Temperatura'], ['sc', 'Subenfriamiento'], ['glass', 'Visor']]);
          b.append(vals, chargeCtls(app));
        },
        update() {
          const o = app.out();
          vals.set({ t: `${fmt(o.Tliq)} °C`, sc: o.running ? `${fmt(o.SC)} K` : '—', glass: o.flash > 0.08 && o.running ? { text: 'burbujas', cls: 'warn' } : 'lleno' });
        },
      };
    },

    comp() {
      let vals, why;
      return {
        kicker: 'COMPRESOR',
        title: app.funcTags('compresor') || 'Compresor',
        what: 'Es la bomba del circuito: aspira vapor del evaporador (baja la presión allí) y lo empuja al condensador (sube la presión allí). Su intensidad sube con la presión de alta y con la carga térmica.',
        render(b) {
          vals = values([['st', 'Estado'], ['i', 'Intensidad'], ['w', 'Consumo'], ['q', 'Potencia frigorífica'], ['td', 'Descarga'], ['m', 'Caudal']]);
          b.append(vals, section('Tamaño', stepper('Potencia frigorífica (a −10/+40 °C)', P().capacityKW, { step: 0.5, min: 0.5, max: 30, unit: 'kW' }, (v) => app.setRefrig('capacityKW', v))));
          const f1 = faultCtl(app, toggle('Válvulas rotas (bombea mal)', F().compValves, (v) => app.setFault('compValves', v), { danger: true }));
          const f2 = faultCtl(app, toggle('Agarrotado (no gira)', F().compLocked, (v) => app.setFault('compLocked', v), { danger: true }));
          if (f1) b.append(section('Averías', f1, f2));
          why = whyBox(app, ['compresor']);
          b.append(why);
        },
        update() {
          const o = app.out();
          vals.set({
            st: o.locked ? { text: 'BLOQUEADO', cls: 'bad' } : o.running ? { text: 'en marcha', cls: 'ok' } : 'parado',
            i: `${fmt(o.current)} A (nominal ${fmt(o.nominalCurrent)} A)`,
            w: o.running ? `${fmt(o.Wel, 2)} kW` : '—',
            q: o.running ? `${fmt(o.Qref, 2)} kW · COP ${fmt(o.cop, 2)}` : '—',
            td: `${fmt(o.Tdis, 0)} °C`,
            m: o.running ? `${fmt(o.mComp * 3600, 0)} kg/h` : '—',
          });
          why.refresh();
        },
      };
    },

    cond() {
      let vals, why;
      return {
        kicker: 'CONDENSADOR',
        title: 'Condensador y ventilador',
        what: 'El gas caliente cede su calor al aire de fuera y se convierte en líquido. Si el condensador está sucio o el ventilador no va, no puede echar el calor y la presión de alta se dispara.',
        render(b) {
          vals = values([['tc', 'Condensación'], ['dt', 'Salto sobre el exterior'], ['q', 'Calor que echa'], ['fan', 'Ventilador']]);
          b.append(vals, stepper('Temperatura exterior', P().Tamb, { step: 1, min: -10, max: 46, unit: '°C' }, (v) => app.setRefrig('Tamb', v)));
          const fs = [
            faultCtl(app, slider('Suciedad del condensador', Math.round(F().condDirt * 100), { min: 0, max: 100, step: 5, unit: '%' }, (v) => app.setFault('condDirt', v / 100))),
            faultCtl(app, toggle('Ventilador averiado', F().condFanBroken, (v) => app.setFault('condFanBroken', v), { danger: true })),
            faultCtl(app, toggle('Aire (incondensables) en el circuito', F().nonCondensables, (v) => app.setFault('nonCondensables', v), { danger: true })),
          ].filter(Boolean);
          if (fs.length) b.append(section('Averías', ...fs));
          why = whyBox(app, ['vent_cond']);
          b.append(why);
        },
        update() {
          const o = app.out();
          vals.set({
            tc: `${fmt(o.Tc)} °C${o.zeotropic ? ` burbuja · ${fmt(o.TcDew)} °C rocío` : ''} · ${fmt(o.PcG, 2)} bar`,
            dt: o.running ? `${fmt(o.condDT)} K` : '— (parado)',
            q: o.running ? `${fmt(o.Qref + o.Wel * 0.95, 2)} kW` : '—',
            fan: o.fanC ? 'gira' : F().condFanBroken ? { text: 'AVERIADO', cls: 'bad' } : 'parado',
          });
          why.refresh();
        },
      };
    },

    receiver() {
      let vals, cc;
      return {
        kicker: 'RECIPIENTE Y CARGA',
        title: 'Carga de refrigerante',
        what: 'El recipiente guarda el líquido que sobra según las condiciones. Con falta de gas se vacía y salen burbujas en el visor; con exceso, el líquido inunda el condensador y sube la alta.',
        render(b) {
          vals = values([['c', 'Carga'], ['lv', 'Nivel del recipiente'], ['glass', 'Visor'], ['sc', 'Subenfriamiento']]);
          b.append(vals);
          if (!app.practiceHideFaults) {
            cc = chargeCtls(app);
            b.append(cc);
          }
        },
        update() {
          const o = app.out();
          vals.set({
            c: `${fmt(o.chargeKg, 2)} kg · ${Math.round(o.chargePct)} % de la nominal${F().leakRate ? ' · PERDIENDO' : ''}`,
            lv: `${Math.round(o.receiverLevel * 100)} %`,
            glass: o.flash > 0.08 && o.running ? { text: 'burbujas', cls: 'warn' } : 'lleno',
            sc: o.running ? `${fmt(o.SC)} K` : '—',
          });
          if (cc && F().leakRate) cc.sync();
        },
      };
    },

    glass() {
      const c = cards.receiver();
      return {
        ...c,
        kicker: 'VISOR DE LÍQUIDO',
        title: 'Visor',
        what: 'Por el visor se ve el líquido que va a la válvula. Burbujas = llega gas mezclado: falta de refrigerante, una restricción antes del visor o poco subenfriamiento. Unas burbujas al arrancar son normales.',
      };
    },

    filter() {
      let vals;
      return {
        kicker: 'FILTRO DESHIDRATADOR',
        title: 'Filtro',
        what: 'Retiene la humedad y la suciedad. Si se obstruye frena el líquido: a la salida baja la temperatura (puede sudar o escarchar) y el evaporador se queda sin refrigerante.',
        render(b) {
          vals = values([['dt', 'Caída de temperatura'], ['t', 'Temperatura a la salida']]);
          b.append(vals);
          const fc = faultCtl(app, slider('Obstrucción', Math.round(F().filterClog * 100), { min: 0, max: 100, step: 5, unit: '%' }, (v) => app.setFault('filterClog', v / 100)));
          if (fc) b.append(section('Averías', fc));
        },
        update() {
          const o = app.out();
          vals.set({ dt: o.running ? `${fmt(o.filterDT)} K` : '—', t: `${fmt(o.TafterFilter)} °C` });
        },
      };
    },

    sol() {
      let vals, why;
      return {
        kicker: 'VÁLVULA SOLENOIDE',
        title: 'Solenoide de líquido',
        what: 'Abre o cierra el paso de líquido. En las instalaciones con recogida de gas la manda el termostato, y es el presostato de baja quien para el compresor cuando el evaporador queda vacío.',
        render(b) {
          vals = values([['st', 'Estado']]);
          b.append(vals);
          const fs = [
            faultCtl(app, toggle('No abre (bobina quemada)', F().solenoidStuck, (v) => app.setFault('solenoidStuck', v), { danger: true })),
            faultCtl(app, toggle('No cierra del todo', F().solenoidLeak, (v) => app.setFault('solenoidLeak', v), { danger: true })),
          ].filter(Boolean);
          if (fs.length) b.append(section('Averías', ...fs));
          why = whyBox(app, ['solenoide']);
          b.append(why);
        },
        update() {
          const o = app.out();
          vals.set({ st: o.hasSolenoid ? (o.solOpen ? 'ABIERTA (pasa líquido)' : 'CERRADA') : 'no hay solenoide en el esquema' });
          why.refresh();
        },
      };
    },

    pa() {
      return pressCard(app, 'alta');
    },
    pb() {
      return pressCard(app, 'baja');
    },
    gLP() {
      return gaugeCard(app, 'baja');
    },
    gHP() {
      return gaugeCard(app, 'alta');
    },
  };
  const fn = cards[part];
  if (!fn) return null;
  const spec = fn();
  return { key: `part:${part}`, part, ...spec };
}

function pressCard(app, kind) {
  const c = app.pressostat(kind);
  let vals;
  const alta = kind === 'alta';
  return {
    kicker: alta ? 'PRESOSTATO DE ALTA' : 'PRESOSTATO DE BAJA',
    title: c ? `${c.props.tag}${c.props.name ? ' · ' + c.props.name : ''}` : 'Presostato',
    what: alta
      ? 'Protege contra una presión de alta excesiva (condensador sucio, ventilador parado, exceso de carga): abre el mando del compresor. Suele ser de rearme manual.'
      : 'Para el compresor si la presión de baja cae demasiado (falta de gas, evaporador sin aire, recogida de gas). Vuelve a arrancarlo al subir la presión el diferencial.',
    render(b) {
      if (!c) {
        b.append(h('p', { class: 'note' }, 'Este esquema no tiene este presostato.'));
        return;
      }
      vals = values([['p', 'Presión ahora'], ['st', 'Contacto']]);
      b.append(vals, section('Ajustes',
        stepper('Presión de corte', +c.props.cut, { step: 0.1, min: -0.8, max: 45, unit: 'bar' }, (v) => app.setCompProp(c.id, 'cut', v)),
        stepper('Diferencial', +c.props.diff, { step: 0.1, min: 0.1, max: 10, unit: 'bar' }, (v) => app.setCompProp(c.id, 'diff', v)),
        seg('Rearme', { auto: 'Automático', manual: 'Manual' }, c.props.reset, (v) => app.setCompProp(c.id, 'reset', v)),
        h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => app.clickComp(c.id) }, 'Rearmar')),
      ));
    },
    update() {
      if (!c || !vals) return;
      const o = app.out();
      const st = app.sim ? app.sim.elec.cstate.get(c.id) : null;
      const p = alta ? o.PcG : o.PeG;
      vals.set({
        p: `${fmt(p, 2)} bar`,
        st: !st ? '—' : st.actuated ? { text: alta ? `DISPARADO${st.latched ? ' (rearme manual)' : ''}` : 'ABIERTO por baja', cls: 'bad' } : { text: 'cerrado (normal)', cls: 'ok' },
      });
    },
  };
}

function gaugeCard(app, kind) {
  let vals;
  const baja = kind === 'baja';
  return {
    kicker: baja ? 'MANÓMETRO DE BAJA' : 'MANÓMETRO DE ALTA',
    title: baja ? 'Presión de aspiración' : 'Presión de condensación',
    what: baja
      ? 'Marca la presión relativa (bar) en la aspiración. La escala de temperaturas dice a qué temperatura está hirviendo el refrigerante en el evaporador. En las mezclas se usa el punto de rocío para calcular el recalentamiento.'
      : 'Marca la presión relativa (bar) en la descarga. La escala de temperaturas dice a qué temperatura condensa el refrigerante. En las mezclas se usa el punto de burbuja para calcular el subenfriamiento.',
    render(b) {
      vals = values([['p', 'Presión'], ['t', baja ? 'Evaporación' : 'Condensación'], ['x', baja ? 'Recalentamiento' : 'Subenfriamiento']]);
      b.append(vals, ptConverter(app));
    },
    update() {
      const o = app.out();
      vals.set(baja
        ? { p: `${fmt(o.PeG, 2)} bar (${fmt(o.Pe, 2)} abs.)`, t: `${fmt(o.Te)} °C${o.zeotropic ? ` rocío · ${fmt(o.TeBub)} °C burbuja` : ''}`, x: o.running ? `${fmt(o.SHevap)} K = ${fmt(o.TevapOut)} − (${fmt(o.Te)}) en el bulbo · ${fmt(o.SH)} K en el compresor` : '—' }
        : { p: `${fmt(o.PcG, 2)} bar (${fmt(o.Pc, 2)} abs.)`, t: `${fmt(o.Tc)} °C${o.zeotropic ? ` burbuja · ${fmt(o.TcDew)} °C rocío` : ''}`, x: o.running ? `${fmt(o.SC)} K = ${fmt(o.Tc)} − ${fmt(o.Tliq)}` : '—' });
    },
  };
}

/** Regla P-T del refrigerante de la máquina. */
export function ptConverter(app, refId) {
  const box = h('section', { class: 'card-sec ptconv' }, h('h4', {}, 'Regla P-T'));
  const pIn = h('input', { type: 'text', inputmode: 'decimal', class: 'step-v', value: '2,0', 'aria-label': 'Presión en bar' });
  const tIn = h('input', { type: 'text', inputmode: 'decimal', class: 'step-v', value: '-10', 'aria-label': 'Temperatura en °C' });
  const pOut = h('output', {}, '');
  const tOut = h('output', {}, '');
  const ref = () => getRefrigerant(refId || app.params().refrigerant);
  const calc = () => {
    const r = ref();
    const p = parseFloat(pIn.value.replace(',', '.'));
    if (Number.isFinite(p)) {
      const s = satFromGauge(r, p);
      pOut.textContent = r.zeotropic ? `= ${fmt(s.dew)} °C rocío / ${fmt(s.bub)} °C burbuja` : `= ${fmt(s.dew)} °C`;
    }
    const t = parseFloat(tIn.value.replace(',', '.'));
    if (Number.isFinite(t)) {
      tOut.textContent = r.zeotropic ? `= ${fmt(gauge(psatDew(r, t)), 2)} bar rocío / ${fmt(gauge(psatBubble(r, t)), 2)} bar burbuja` : `= ${fmt(gauge(psatDew(r, t)), 2)} bar`;
    }
  };
  pIn.addEventListener('input', calc);
  tIn.addEventListener('input', calc);
  box.append(
    h('label', { class: 'pt-row' }, pIn, h('span', {}, 'bar'), pOut),
    h('label', { class: 'pt-row' }, tIn, h('span', {}, '°C'), tOut),
  );
  box.refresh = calc;
  calc();
  return box;
}

// ------------------------------------------------------ esquema eléctrico
/** Tarjeta de un componente del esquema (en simulación). */
export function compCard(app, id) {
  const sim = app.sim && app.sim.elec;
  if (!sim) return null;
  const c = sim.compById.get(id);
  if (!c) return null;
  const T = TYPES[c.type];
  let live, why;
  const liveProps = (T.props || []).filter((p) => p.live || ['Iset', 'interval', 'duration', 'reset'].includes(p.key));
  return {
    key: `comp:${id}`,
    comp: id,
    kicker: T.label.toUpperCase(),
    title: `${c.props.tag || T.label}${c.props.name ? ' · ' + c.props.name : ''}`,
    what: DESCRIPTIONS[c.type] || '',
    render(b) {
      live = h('p', { class: 'card-live' });
      why = h('div', { class: 'card-why' });
      b.append(live, why);
      if (liveProps.length) {
        const ctls = liveProps.map((p) => {
          if (p.type === 'select') return seg(p.label, p.options, c.props[p.key], (v) => app.setCompProp(id, p.key, v));
          const step = p.step || 1;
          return stepper(p.label, +c.props[p.key], { step, min: p.min ?? -50, max: p.max ?? 999, unit: '' }, (v) => app.setCompProp(id, p.key, v));
        });
        b.append(section('Ajustes', ...ctls));
      }
      const acts = h('div', { class: 'row' });
      if (T.click && !T.momentary) acts.append(h('button', { class: 'btn small', type: 'button', onclick: () => app.clickComp(id) }, actionLabel(c)));
      if (acts.children.length) b.append(section('Acciones', acts));
    },
    update() {
      const sim2 = app.sim && app.sim.elec;
      if (!sim2) return;
      live.textContent = liveText(app.sim, c);
      why.innerHTML = '';
      if (T.loads) {
        const x = explainLoad(sim2, id);
        why.append(h('span', { class: 'why-k' }, 'Por qué'), h('p', { class: x.on ? 'on' : 'off' }, x.text));
        app.highlight(x.path);
      } else if (T.links) {
        const closed = T.links(sim2.ctx(c)).length > 0;
        const pairs = T.links(sim2.ctx(c)).map(([a, bb]) => `${a}-${bb}`).join(', ');
        const txt = closed ? `Cerrado entre ${pairs}.` : `Abierto: ${whyOpen(sim2, c)}.`;
        why.append(h('span', { class: 'why-k' }, 'Estado'), h('p', { class: closed ? 'on' : 'off' }, txt));
        app.highlight([id]);
      }
    },
    onClose() {
      app.highlight([]);
    },
  };
}

function actionLabel(c) {
  switch (c.type) {
    case 'thermal3':
    case 'th_nc':
    case 'th_no':
      return 'Rearmar el térmico';
    case 'pressostat':
      return 'Rearmar';
    case 'clock':
    case 'clk_c':
      return 'Forzar / terminar desescarche';
    case 'fuse':
      return 'Quitar / reponer fusible';
    case 'door_nc':
    case 'door_no':
      return 'Abrir / cerrar la puerta';
    default:
      return 'Accionar';
  }
}
