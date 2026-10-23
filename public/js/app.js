// Точка входа: загрузка данных, оболочка, регистрация разделов.
import { $, setCurrency } from './util.js';
import { load, store, onChange } from './store.js';
import { buildShell, registerViews, initPeriod, render, rerender } from './ui.js';
import { viewOverview, viewOps, viewPnl, viewCash, viewBudget, viewDebts } from './views-finance.js';
import { viewCapacity, viewDoctors, viewServices, viewMarketing, viewStock } from './views-clinic.js';
import { viewImport, viewRefs, viewSettings } from './views-data.js';

function boot() {
  load();
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
  onChange(() => { setCurrency(store.s.settings.currency); name(); rerender(); });
  render();
}
boot();
