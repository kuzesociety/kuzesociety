// Acoplamiento entre el esquema eléctrico y el circuito frigorífico.
//
//   eléctrico → frigorífico: qué cargas con "función frigorífica" están
//   funcionando (compresor, ventiladores, resistencia, solenoide, luz).
//   frigorífico → eléctrico: termostatos y presostatos leen temperaturas y
//   presiones del modelo; los contactos de puerta leen la puerta.

import { ElecSim } from './elec/solver.js';
import { FridgeModel } from './refrig/model.js';

export function ioFromElec(sim) {
  const io = {
    comp: 'off',
    compPhase: '3F',
    evapFan: false,
    condFan: false,
    heater: false,
    light: false,
    solenoid: null,
    present: { comp: false, evapFan: false, condFan: false, heater: false, light: false },
  };
  if (sim.fault) return io;
  let hasSol = false;
  let solOn = false;
  for (const c of sim.comps) {
    const fn = c.props.func;
    if (!fn || fn === 'ninguna') continue;
    const L = sim.loadOf(c.id) || { on: false, state: 'off' };
    switch (fn) {
      case 'compresor':
        io.present.comp = true;
        io.compPhase = c.type === 'motor3' ? '3F' : '1F';
        if (L.state === 'run') io.comp = 'run';
        else if (L.state === 'hum' && io.comp !== 'run') io.comp = 'locked';
        break;
      case 'vent_evap':
        io.present.evapFan = true;
        if (L.state === 'run') io.evapFan = true;
        break;
      case 'vent_cond':
        io.present.condFan = true;
        if (L.state === 'run') io.condFan = true;
        break;
      case 'desescarche':
        io.present.heater = true;
        if (L.on) io.heater = true;
        break;
      case 'luz':
        io.present.light = true;
        if (L.on) io.light = true;
        break;
      case 'solenoide':
        hasSol = true;
        if (L.on) solOn = true;
        break;
      default:
    }
  }
  io.solenoid = hasSol ? solOn : null;
  return io;
}

/**
 * Simulación conjunta. Avanza en pasos de 0.5 s de tiempo simulado:
 * sensores/temporizadores → resolver el esquema → modelo frigorífico.
 */
export class CoupledSim {
  constructor(project, { log } = {}) {
    this.project = project;
    this.logFn = log || (() => {});
    this.refrigOn = !!(project.refrig && project.refrig.enabled !== false);
    this.fridge = new FridgeModel(project.refrig || {}, project.faults || {});
    this.elec = new ElecSim(project, {
      log: (level, msg, t) => this.logFn(level, msg, t),
      refrig: () => (this.refrigOn ? this.fridge.out : null),
      setDoor: (open) => this.setDoor(open),
    });
    this.io = ioFromElec(this.elec);
    this.time = 0;
    this.elec.tick(0);
    this.elec.solve();
    this.io = ioFromElec(this.elec);
  }

  setDoor(open) {
    this.fridge.door = open;
    this.elec.setDoor(open);
    this.logFn('info', open ? '🚪 Puerta de la cámara ABIERTA.' : '🚪 Puerta de la cámara cerrada.', this.time);
  }

  /** Avanza dt segundos de tiempo simulado. Devuelve true si cambió el esquema. */
  step(dt) {
    let changed = false;
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(0.5, left);
      this.elec.tick(h);
      if (this.elec.dirty) {
        this.elec.solve();
        this.io = ioFromElec(this.elec);
        changed = true;
      }
      if (this.refrigOn) this.fridge.step(h, this.io);
      this.time += h;
      left -= h;
      if (this.elec.fault) break;
    }
    return changed;
  }

  /** Aplica un cambio de interacción (pulsador, clic...) y resuelve. */
  resolve() {
    if (this.elec.dirty) {
      this.elec.solve();
      this.io = ioFromElec(this.elec);
      return true;
    }
    return false;
  }
}
