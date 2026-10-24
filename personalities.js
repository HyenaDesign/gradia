export const personalities = [
  { id: 'ink', name: 'Ink', description: 'Feathered edges. Restless eddies. Fine pigment.', flow: [.06, 1.15, 3.4, 1.1], substance: [1.1, 0, .1, 1], grain: .035 },
  { id: 'silk', name: 'Silk', description: 'Long ribbons. Gentle folds. A satin sheen.', flow: [.48, .45, 1.7, .75], substance: [.65, 0, 1.1, 1.5], grain: .016 },
  { id: 'smoke', name: 'Smoke', description: 'Airy plumes. Rising curls. Soft diffusion.', flow: [.02, 1.8, 5.2, 1.3], substance: [2.8, .12, .15, .65], grain: .045 },
  { id: 'lava', name: 'Lava', description: 'Heavy pools. Slow currents. Luminous ridges.', flow: [.88, .28, 1.5, .42], substance: [.22, -.035, .15, 1.65], grain: .022 },
  { id: 'chrome', name: 'Liquid Chrome', description: 'Cohesive metal. Rolling reflections. Polished light.', flow: [.64, .65, 2.2, .8], substance: [.35, 0, .4, 1.15], grain: .008 },
];
export function createPersonalityControls(onChange) {
  const root = document.getElementById('personalityChoices');
  let selected = 'ink';
  try { const saved = localStorage.getItem('chromelt-personality'); if (personalities.some(p => p.id === saved)) selected = saved; } catch {}
  function select(id, notify = true) {
    const preset = personalities.find(p => p.id === id);
    if (!preset) return;
    selected = id;
    for (const button of root.children) button.setAttribute('aria-pressed', String(button.dataset.personality === id));
    document.getElementById('personalityDescription').textContent = preset.description;
    try { localStorage.setItem('chromelt-personality', id); } catch {}
    if (notify) onChange(preset);
  }
  for (const preset of personalities) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = preset.name; button.dataset.personality = preset.id;
    button.title = preset.description; button.addEventListener('click', () => select(preset.id)); root.append(button);
  }
  select(selected, false);
  return { select, get preset() { return personalities.find(p => p.id === selected); } };
}
