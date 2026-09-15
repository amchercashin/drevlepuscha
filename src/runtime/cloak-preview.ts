import {CLOAK_COLORS} from '../domain/cloak-colors.ts';
import type {createRanger} from './ranger.ts';

type Ranger = Awaited<ReturnType<typeof createRanger>>;
/** CLOAK_COLORS order: moss, pine, slate, ochre, heather, clay. */
export const CLOAK_PREVIEW_LABELS = ['Мох', 'Сосна', 'Сланец', 'Охра', 'Вереск', 'Глина'] as const;
export const CLOAK_PREVIEW_DAY_HOUR = 12;
export const CLOAK_PREVIEW_TWILIGHT_HOUR = 17.5;

/** Query-only offline inspection. It never opens the network or changes the camera. */
export function cloakPreviewRequested(search = location.search) {
  return new URLSearchParams(search).get('cloakPreview') === '1';
}

/**
 * The multiplayer panel refreshes the solo dye twice a second. While this
 * preview is open its own buttons own the colour, so that refresher must not
 * overwrite the inspected dye. Only the local ranger is wrapped; remote
 * walkers keep their normal colours and no material or pass is added.
 */
export function createCloakPreview(ranger: Ranger, setTime: (hour: number) => void) {
  const apply = ranger.setCloak;
  let suspended = true;
  ranger.setCloak = (color: string) => { if (!suspended) apply(color); };
  let selected = CLOAK_COLORS[0] as string;
  let lightHour = CLOAK_PREVIEW_DAY_HOUR;

  const panel = document.createElement('section');
  panel.className = 'cloak-preview';
  panel.setAttribute('aria-label', 'Просмотр расцветок плаща');
  panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:20;display:flex;flex-direction:column;gap:7px;padding:10px 11px;border-radius:10px;background:rgba(14,22,18,.88);color:#e6ede8;font:13px/1.3 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.4)';
  const heading = document.createElement('strong');
  heading.textContent = 'Расцветки плаща';
  panel.append(heading);
  const swatches = document.createElement('div');
  swatches.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;max-width:320px';
  panel.append(swatches);
  const buttons = CLOAK_COLORS.map((_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cloakIndex = String(index);
    button.textContent = CLOAK_PREVIEW_LABELS[index];
    button.style.cssText = 'padding:5px 9px;border:1px solid rgba(255,255,255,.35);border-radius:6px;background:#1d2a23;color:#e6ede8;cursor:pointer;font:inherit';
    button.onclick = () => select(index);
    swatches.append(button);
    return button;
  });
  const light = document.createElement('div');
  light.style.cssText = 'display:flex;gap:6px';
  panel.append(light);
  const lightButtons: HTMLButtonElement[] = [];
  const addLight = (label: string, hour: number) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cloakLight = String(hour);
    button.textContent = label;
    button.style.cssText = 'padding:4px 9px;border:1px solid rgba(255,255,255,.25);border-radius:6px;background:#16201b;color:#cfd9d2;cursor:pointer;font:inherit';
    button.onclick = () => { lightHour = hour; setTime(hour); sync(); };
    light.append(button);
    lightButtons.push(button);
  };
  addLight('День', CLOAK_PREVIEW_DAY_HOUR);
  addLight('Сумерки', CLOAK_PREVIEW_TWILIGHT_HOUR);
  document.body.append(panel);

  function select(index: number) {
    selected = CLOAK_COLORS[index] as string;
    apply(selected);
    sync();
  }
  function sync() {
    for (const [index, button] of buttons.entries()) button.setAttribute('aria-pressed', String(CLOAK_COLORS[index] === selected));
    for (const button of lightButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.cloakLight) === lightHour));
  }
  // Deterministic first dye for screenshots; the user can still pick any of six.
  select(0);
  Object.assign(window, { cloakPreview: {
    colors: [...CLOAK_COLORS], labels: [...CLOAK_PREVIEW_LABELS],
    select, day: () => { lightHour = CLOAK_PREVIEW_DAY_HOUR; setTime(lightHour); sync(); },
    twilight: () => { lightHour = CLOAK_PREVIEW_TWILIGHT_HOUR; setTime(lightHour); sync(); },
    state: () => ({ color: selected, hour: lightHour }),
  } });

  return { dispose() { suspended = false; panel.remove(); } };
}
