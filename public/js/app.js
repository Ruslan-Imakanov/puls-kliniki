// Точка входа: загрузка данных, оболочка, регистрация разделов.
import { $, setCurrency } from './util.js';
import { load, store, onChange, hooks } from './store.js';
import { cloudBoot } from './cloud.js';
import { buildShell, registerViews, initPeriod, render, rerender } from './ui.js';
import { viewOverview, viewOps, viewPnl, viewCash, viewBudget, viewDebts } from './views-finance.js';
import { viewCapacity, viewDoctors, viewServices, viewMarketing, viewStock } from './views-clinic.js';
import { viewImport, viewRefs, viewSettings } from './views-data.js';

function start() {
  document.querySelector('.app').hidden = false;
  setCurrency(store.s.settings.currency);
  buildShell();
  registerViews({
    overview: viewOverview, ops: viewOps, pnl: viewPnl, cash: viewCash, budget: viewBudget, debts: viewDebts,
    capacity: viewCapacity, doctors: viewDoctors, services: viewServices, marketing: viewMarketing, stock: viewStock,
    import: viewImport, refs: viewRefs, settings: viewSettings,
  });
  initPeriod();
  const name = () => { $('#clinicName').textContent = store.s.settings.clinicName || ''; };
  name();
  const changed = () => { setCurrency(store.s.settings.currency); name(); rerender(); };
  onChange(changed);
  hooks.changed = changed;
  render();
}
// Демо — данные в браузере, без входа. Иначе — вход и данные клиники в базе.
const demo = window.PULSE_DEMO_ONLY || new URLSearchParams(location.search).has('demo');
if (demo) { load(); start(); } else cloudBoot(start);
