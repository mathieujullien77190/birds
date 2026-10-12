import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from '@/components/Header';
import { NestCard } from '@/components/NestCard';
import { OutsideCard } from '@/components/OutsideCard';
import { BatteryCard } from '@/components/BatteryCard';
import { ConsumptionCard } from '@/components/ConsumptionCard';
import { CameraCard } from '@/components/CameraCard';
import { FanCard } from '@/components/FanCard';
import { AutoFan } from '@/components/AutoFan';
import { HistoryChart } from '@/components/HistoryChart';
import type { DeviceState } from '@/types';
import { makeState, point } from './fixtures';

const text = (c: HTMLElement, sel: string) => c.querySelector(sel)?.textContent;

describe('Header', () => {
  it('titre, lecture, pas de bandeau en fonctionnement normal', () => {
    const { container } = render(<Header state={makeState()} unreachable={false} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Nichoir');
    expect(text(container, '#maj')).toBe('12:34:56');
    expect(container.querySelector('.banner')).toBeNull();
  });
  it('bandeau du mode simulé', () => {
    const { container } = render(<Header state={makeState({ erreurs: { mock: 'MODE SIMULÉ' } })} unreachable={false} />);
    expect(text(container, '.banner')).toBe('MODE SIMULÉ');
  });
  it('programme injoignable', () => {
    const { container } = render(<Header state={makeState()} unreachable />);
    expect(text(container, '#maj')).toBe('programme injoignable');
  });
  it("sans état : tiret", () => {
    const { container } = render(<Header state={null} unreachable={false} />);
    expect(text(container, '#maj')).toBe('—');
  });
});

describe('NestCard', () => {
  it('température, humidité et écart plus chaud', () => {
    const { container } = render(<NestCard state={makeState()} />);
    expect(text(container, '#t_nid')).toBe('24.5');
    expect(text(container, '#hum_nid')).toBe('55');
    expect(text(container, '#ecart_nid')).toBe('4.5 °C plus chaud que dehors.');
  });
  it('plus froid, écart affiché en positif', () => {
    const { container } = render(<NestCard state={makeState({ t_nid: 15, ext: { ...makeState().ext, t: 18.5 } })} />);
    expect(text(container, '#ecart_nid')).toBe('3.5 °C plus froid que dehors.');
  });
  it('écart nul = « plus chaud » de 0', () => {
    const { container } = render(<NestCard state={makeState({ t_nid: 20 })} />);
    expect(text(container, '#ecart_nid')).toBe('0 °C plus chaud que dehors.');
  });
  it('capteur muet : tirets, pas d\'écart, erreur BME280 affichée', () => {
    const { container } = render(<NestCard state={makeState({ t_nid: null, hum_nid: null, erreurs: { bme280: 'BME280 introuvable' } })} />);
    expect(text(container, '#t_nid')).toBe('—');
    expect(text(container, '#hum_nid')).toBe('—');
    expect(container.querySelector('#ecart_nid')).toBeNull();
    expect(text(container, '.err')).toBe('BME280 introuvable');
  });
  it('sonde sans mesure : pas d\'écart', () => {
    const { container } = render(<NestCard state={makeState({ ext: { ...makeState().ext, t: null } })} />);
    expect(container.querySelector('#ecart_nid')).toBeNull();
  });
  it('sans état', () => {
    const { container } = render(<NestCard state={null} />);
    expect(text(container, '#t_nid')).toBe('—');
    expect(container.querySelector('.err')).toBeNull();
  });
});

describe('OutsideCard', () => {
  it('mesure en direct : valeur, écart et état', () => {
    const { container } = render(<OutsideCard state={makeState()} />);
    expect(container.textContent).toContain('Dehors (sonde)');
    expect(text(container, '#t_ext')).toBe('20');
    expect(text(container, '#ecart_sonde')).toBe('Nid − dehors : +4.5 °C');
    expect(text(container, '#etat_sonde')).toBe('Sonde DS18B20 : mesure en direct, 12:30');
    expect(container.textContent).not.toContain('ne démarre pas');
  });
  it('sonde simulée sans heure, nid plus froid : écart négatif', () => {
    const { container } = render(<OutsideCard state={makeState({ t_nid: 15, ext: { t: 18.5, source: 'simulée', maj: null } })} />);
    expect(text(container, '#etat_sonde')).toBe('Sonde simulée : mesure en direct');
    expect(text(container, '#ecart_sonde')).toBe('Nid − dehors : -3.5 °C');
  });
  it('écart nul : sans signe', () => {
    const { container } = render(<OutsideCard state={makeState({ t_nid: 20 })} />);
    expect(text(container, '#ecart_sonde')).toBe('Nid − dehors : 0 °C');
  });
  it('sonde muette : tirets, erreur affichée, l\'automatique ne démarre pas', () => {
    const { container } = render(<OutsideCard state={makeState({ ext: { t: null, source: null, maj: null }, erreurs: { sonde_ext: 'CRC mauvais' } })} />);
    expect(text(container, '#t_ext')).toBe('—');
    expect(container.querySelector('#ecart_sonde')).toBeNull();
    expect(text(container, '#etat_sonde')).toBe('Sonde absente ou muette : pas de mesure');
    expect(text(container, '.err')).toBe('CRC mauvais');
    expect(container.textContent).toContain('la ventilation automatique ne démarre pas');
  });
  it('rien reçu et pas d\'erreur : « Pas encore de mesure »', () => {
    const { container } = render(<OutsideCard state={makeState({ ext: { t: null, source: null, maj: null } })} />);
    expect(text(container, '#etat_sonde')).toBe('Pas encore de mesure');
    expect(container.querySelector('.err')).toBeNull();
  });
  it('sans état : tirets, aucun message', () => {
    const { container } = render(<OutsideCard state={null} />);
    expect(text(container, '#t_ext')).toBe('—');
    expect(container.querySelector('#etat_sonde')).toBeNull();
    expect(container.textContent).not.toContain('ne démarre pas');
    expect(container.querySelector('.err')).toBeNull();
  });
});

describe('BatteryCard', () => {
  it('niveau, tension, source, Wh restants, solaire', () => {
    const { container } = render(<BatteryCard state={makeState()} />);
    expect(text(container, '#batt_pct')).toBe('80');
    expect(text(container, '#batt_v')).toBe('13.1 V');
    const t = container.textContent!;
    expect(t).toContain('· mesurée');
    expect(t).toContain('≈ 61.4 Wh sur 76.8');
    expect(t).toContain('solaire 12 W');
    expect((container.querySelector('.gauge-fill') as HTMLElement).style.width).toBe('80%');
    expect((container.querySelector('.gauge-fill') as HTMLElement).style.background).toBe('rgb(5, 150, 105)');
    expect(t).not.toContain('Niveau inconnu');
  });
  it('batterie faible : jauge rouge, erreurs de batterie et de délestage', () => {
    const batterie = { pourcent: 12, tension: 11.8, source: 'simulée' as const };
    const { container } = render(<BatteryCard state={makeState({ batterie, erreurs: { batterie: 'batterie faible', delestage: 'ventilateur délesté' } })} />);
    expect((container.querySelector('.gauge-fill') as HTMLElement).style.background).toBe('rgb(220, 38, 38)');
    expect((container.querySelector('.gauge-fill') as HTMLElement).style.width).toBe('12%');
    expect([...container.querySelectorAll('.err')].map((e) => e.textContent)).toEqual(['batterie faible', 'ventilateur délesté']);
    expect(container.textContent).toContain('· simulée');
    expect(container.textContent).not.toContain('solaire');
  });
  it('niveau moyen : jauge orange', () => {
    const { container } = render(<BatteryCard state={makeState({ batterie: { pourcent: 35, tension: 12.5, source: null } })} />);
    expect((container.querySelector('.gauge-fill') as HTMLElement).style.background).toBe('rgb(217, 119, 6)');
  });
  it('mesure absente : tirets, message « Niveau inconnu », jauge vide grise', () => {
    const { container } = render(<BatteryCard state={makeState({ batterie: { pourcent: null, tension: null, source: null } })} />);
    expect(text(container, '#batt_pct')).toBe('—');
    expect(text(container, '#batt_v')).toBe('— V');
    expect(container.textContent).toContain('Niveau inconnu : pas de mesure de batterie.');
    expect(container.textContent).not.toContain('Wh');
    expect((container.querySelector('.gauge-fill') as HTMLElement).style.width).toBe('0%');
    expect((container.querySelector('.gauge-fill') as HTMLElement).style.background).toBe('rgb(168, 162, 158)');
  });
  it('sans état', () => {
    const { container } = render(<BatteryCard state={null} />);
    expect(text(container, '#batt_pct')).toBe('—');
    expect(text(container, '#batt_v')).toBe('— V');
    expect(container.textContent).toContain('Niveau inconnu');
  });
});

describe('ConsumptionCard', () => {
  it('total, une ligne par poste, autonomie', () => {
    const { container } = render(<ConsumptionCard state={makeState()} />);
    expect(text(container, '#conso_w')).toBe('10');
    const lines = [...container.querySelectorAll('.conso-line')];
    expect(lines.map((l) => l.textContent)).toEqual(['Raspberry Pi5 W', 'Caméras3 W', 'LED infrarouges2 W', 'Ventilateur0 W']);
    expect(lines.map((l) => l.className)).toEqual(['conso-line', 'conso-line', 'conso-line', 'conso-line off']);
    expect(lines.map((l) => (l.querySelector('.gauge-fill') as HTMLElement).style.width)).toEqual(['50%', '30%', '20%', '0%']);
    // 80 % de 76,8 Wh = 61,44 Wh / 10 W = 6,144 h = 6 h 09
    expect(text(container, '#autonomie')).toBe('Autonomie estimée : 6 h 09');
  });
  it('détail partiel : les postes manquants valent 0 W', () => {
    const { container } = render(<ConsumptionCard state={makeState({ conso: { total_w: 4, detail: { pi: 4 } } })} />);
    const lines = [...container.querySelectorAll('.conso-line')];
    expect(lines.map((l) => l.querySelector('.conso-w')?.textContent)).toEqual(['4 W', '0 W', '0 W', '0 W']);
    expect(lines[0].className).toBe('conso-line');
    expect(lines[1].className).toBe('conso-line off');
  });
  it('total inconnu : tiret, jauges vides, pas d\'autonomie', () => {
    const { container } = render(<ConsumptionCard state={makeState({ conso: { total_w: null, detail: {} } })} />);
    expect(text(container, '#conso_w')).toBe('—');
    expect(container.querySelector('#autonomie')).toBeNull();
    for (const g of container.querySelectorAll('.gauge-fill')) expect((g as HTMLElement).style.width).toBe('0%');
  });
  it('total à 0 W : affiché « 0 », pas d\'autonomie, pas de division par zéro', () => {
    const { container } = render(<ConsumptionCard state={makeState({ conso: { total_w: 0, detail: { pi: 0 } } })} />);
    expect(text(container, '#conso_w')).toBe('0');
    expect(container.querySelector('#autonomie')).toBeNull();
    for (const g of container.querySelectorAll('.gauge-fill')) expect((g as HTMLElement).style.width).toBe('0%');
  });
  it('batterie inconnue : pas d\'autonomie', () => {
    const { container } = render(<ConsumptionCard state={makeState({ batterie: { pourcent: null, tension: null, source: null } })} />);
    expect(container.querySelector('#autonomie')).toBeNull();
  });
  it('plusieurs jours', () => {
    const { container } = render(<ConsumptionCard state={makeState({ conso: { total_w: 0.5, detail: { pi: 0.5 } } })} />);
    // 61,44 / 0,5 = 122,9 h -> 5 jours
    expect(text(container, '#autonomie')).toBe('Autonomie estimée : 5 jours');
  });
  it('sans état', () => {
    const { container } = render(<ConsumptionCard state={null} />);
    expect(text(container, '#conso_w')).toBe('—');
    expect(container.querySelectorAll('.conso-line.off')).toHaveLength(4);
    expect(container.querySelector('#autonomie')).toBeNull();
  });
});

describe('CameraCard', () => {
  const setup = (over: Partial<Parameters<typeof CameraCard>[0]> = {}) => {
    const onCamera = vi.fn(), onLed = vi.fn();
    const r = render(<CameraCard title="Caméra 1 (nid)" num={1} cameraOn ledOn={false} onCamera={onCamera} onLed={onLed} {...over} />);
    return { ...r, onCamera, onLed };
  };
  it('caméra allumée : image visible, boutons, clics', () => {
    const { container, onCamera, onLed } = setup();
    expect(screen.getByRole('heading').textContent).toBe('Caméra 1 (nid)');
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/video/1');
    expect(img.alt).toBe('caméra 1');
    expect(img.style.visibility).toBe('visible');
    expect(container.querySelector('.cam-off')).toBeNull();
    const cam = container.querySelector('#c_1') as HTMLElement, led = container.querySelector('#l_nid') as HTMLElement;
    expect(cam.className).toBe('on');
    expect(led.hasAttribute('class')).toBe(false);
    fireEvent.click(cam);
    expect(onCamera).toHaveBeenCalledWith(false);
    fireEvent.click(led);
    expect(onLed).toHaveBeenCalledWith(true);
  });
  it('caméra éteinte : image cachée, « éteinte », clic = allumer', () => {
    const { container, onCamera, onLed } = setup({ cameraOn: false, ledOn: true });
    expect((container.querySelector('img') as HTMLElement).style.visibility).toBe('hidden');
    expect(text(container, '.cam-off')).toBe('éteinte');
    fireEvent.click(container.querySelector('#c_1')!);
    expect(onCamera).toHaveBeenCalledWith(true);
    fireEvent.click(container.querySelector('#l_nid')!);
    expect(onLed).toHaveBeenCalledWith(false);
  });
  it('caméra 2 : ids, image et erreur propres', () => {
    const { container } = setup({ title: 'Caméra 2 (entrée)', num: 2, errors: { camera1: 'non', camera2: 'câble débranché' } });
    expect(container.querySelector('#c_2')).not.toBeNull();
    expect(container.querySelector('#l_ext')).not.toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/video/2');
    expect(text(container, '.err')).toBe('câble débranché');
  });
  it('l\'erreur picamera2 prime', () => {
    const { container } = setup({ errors: { picamera2: 'picamera2 absent', camera1: 'autre' } });
    expect([...container.querySelectorAll('.err')].map((e) => e.textContent)).toEqual(['picamera2 absent']);
  });
  it('aucune erreur', () => {
    const { container } = setup({ errors: {} });
    expect(container.querySelector('.err')).toBeNull();
  });
});

describe('AutoFan', () => {
  const autoOf = (over: Partial<DeviceState['auto']> = {}) => ({ ...makeState().auto, ...over });
  const field = (c: HTMLElement, k: string) => c.querySelector(`#auto_${k}`) as HTMLInputElement;

  it('sans état : ne rend rien', () => {
    const { container } = render(<AutoFan state={null} onAuto={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
  it('état, bouton, réglages préremplis, Appliquer désactivé', () => {
    const onAuto = vi.fn();
    const { container } = render(<AutoFan state={makeState({ auto: autoOf({ etat: 'ventile', raison: 'nid chaud' }) })} onAuto={onAuto} />);
    expect(text(container, '#auto_etat')).toBe('Ventile — nid chaud');
    expect(container.querySelector('#auto_etat')?.className).toContain('auto-ventile');
    expect(container.querySelector('#v_auto')?.hasAttribute('class')).toBe(false);
    expect(field(container, 'seuil_marche').value).toBe('28');
    expect(field(container, 'hysteresis').value).toBe('1');
    expect(field(container, 'alerte_chaleur').value).toBe('38');
    expect(container.querySelectorAll('.auto-fields input')).toHaveLength(7);
    expect((container.querySelector('#auto_appliquer') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('.err')).toBeNull();
    expect(container.querySelector('#auto_hiver_rappel')).toBeNull();
  });
  it('le bouton bascule actif', () => {
    const onAuto = vi.fn();
    const { container, rerender } = render(<AutoFan state={makeState()} onAuto={onAuto} />);
    fireEvent.click(container.querySelector('#v_auto')!);
    expect(onAuto).toHaveBeenLastCalledWith({ actif: true });
    rerender(<AutoFan state={makeState({ auto: autoOf({ actif: true }) })} onAuto={onAuto} />);
    expect(container.querySelector('#v_auto')?.className).toBe('on');
    fireEvent.click(container.querySelector('#v_auto')!);
    expect(onAuto).toHaveBeenLastCalledWith({ actif: false });
  });
  it('avertissements et alerte de chaleur', () => {
    const { container } = render(<AutoFan state={makeState({ auto: autoOf({ avertissements: ['seuil bas', 'plage courte'] }), erreurs: { alerte_chaleur: 'Nid à 40 °C' } })} onAuto={vi.fn()} />);
    expect(container.textContent).toContain('⚠ seuil bas');
    expect(container.textContent).toContain('⚠ plage courte');
    expect(text(container, '.err')).toBe('Nid à 40 °C');
  });
  it('modifier un réglage active Appliquer, qui envoie tous les réglages en nombres', () => {
    const onAuto = vi.fn();
    const { container } = render(<AutoFan state={makeState()} onAuto={onAuto} />);
    fireEvent.change(field(container, 'seuil_marche'), { target: { value: '30.5' } });
    expect(field(container, 'seuil_marche').value).toBe('30.5');
    const apply = container.querySelector('#auto_appliquer') as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    expect(onAuto).toHaveBeenCalledWith({
      seuil_marche: 30.5, ecart_ext: 2, hysteresis: 1, vitesse_min: 30, vitesse_max: 100, plage: 6, alerte_chaleur: 38,
    });
  });
  it('revenir à la valeur enregistrée désactive Appliquer', () => {
    const { container } = render(<AutoFan state={makeState()} onAuto={vi.fn()} />);
    const apply = container.querySelector('#auto_appliquer') as HTMLButtonElement;
    fireEvent.change(field(container, 'plage'), { target: { value: '8' } });
    expect(apply.disabled).toBe(false);
    fireEvent.change(field(container, 'plage'), { target: { value: '6' } });
    expect(apply.disabled).toBe(true);
  });
  it('le brouillon repart des nouvelles valeurs quand le programme les change', () => {
    const { container, rerender } = render(<AutoFan state={makeState()} onAuto={vi.fn()} />);
    fireEvent.change(field(container, 'plage'), { target: { value: '8' } });
    rerender(<AutoFan state={makeState({ auto: autoOf({ plage: 10, seuil_marche: 33 }) })} onAuto={vi.fn()} />);
    expect(field(container, 'plage').value).toBe('10');
    expect(field(container, 'seuil_marche').value).toBe('33');
    expect((container.querySelector('#auto_appliquer') as HTMLButtonElement).disabled).toBe(true);
  });
  it('une relecture identique ne perd pas le brouillon', () => {
    const { container, rerender } = render(<AutoFan state={makeState()} onAuto={vi.fn()} />);
    fireEvent.change(field(container, 'plage'), { target: { value: '8' } });
    rerender(<AutoFan state={makeState({ t_nid: 30 })} onAuto={vi.fn()} />);
    expect(field(container, 'plage').value).toBe('8');
  });
  it('mode hiver : case cochée, rappel, et la case envoie { hiver }', () => {
    const onAuto = vi.fn();
    const { container, rerender } = render(<AutoFan state={makeState()} onAuto={onAuto} />);
    const box = container.querySelector('#auto_hiver') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(onAuto).toHaveBeenLastCalledWith({ hiver: true });
    rerender(<AutoFan state={makeState({ auto: autoOf({ hiver: true }) })} onAuto={onAuto} />);
    expect((container.querySelector('#auto_hiver') as HTMLInputElement).checked).toBe(true);
    expect(text(container, '#auto_hiver_rappel')).toContain('remettre la cassette du ventilateur');
    fireEvent.click(container.querySelector('#auto_hiver')!);
    expect(onAuto).toHaveBeenLastCalledWith({ hiver: false });
  });
  it('les champs ont leurs bornes (min, max, pas)', () => {
    const { container } = render(<AutoFan state={makeState()} onAuto={vi.fn()} />);
    const f = field(container, 'vitesse_min');
    expect([f.min, f.max, f.step, f.type]).toEqual(['30', '100', '5', 'number']);
    expect(within(container).getByText('Démarrer si le nid dépasse')).toBeTruthy();
  });
});

describe('FanCard', () => {
  const fanState = (fan: Partial<DeviceState['ventilo']>, over: Partial<DeviceState> = {}) =>
    makeState({ ventilo: { ...makeState().ventilo, ...fan }, ...over });
  const setup = (state: DeviceState | null) => {
    const onFan = vi.fn(), onAuto = vi.fn();
    const r = render(<FanCard state={state} onFan={onFan} onAuto={onAuto} />);
    return { ...r, onFan, onAuto };
  };

  it('arrêté : 0 %, bouton Arrêt actif, Marche inactif', () => {
    const { container } = setup(makeState());
    expect(text(container, '#ventilo_pct')).toBe('0');
    expect(text(container, '#ventilo_etat')).toBe('0 % · arrêté');
    expect(container.querySelector('#v_arret')?.className).toBe('on');
    expect(container.querySelector('#v_marche')?.hasAttribute('class')).toBe(false);
    expect(container.querySelector('#hiver_alerte')).toBeNull();
  });
  it('à la main : Marche actif, vitesse et tr/min', () => {
    const { container } = setup(fanState({ pourcent: 70, rpm: 2100, mode: 'manuel' }));
    expect(text(container, '#ventilo_pct')).toBe('70');
    expect(text(container, '#ventilo_etat')).toBe('70 % · 2100 tr/min · à la main');
    expect(container.querySelector('#v_marche')?.className).toBe('on');
    expect(container.querySelector('#v_arret')?.hasAttribute('class')).toBe(false);
  });
  it('automatique : Marche inactif (ce n\'est pas la main)', () => {
    const { container } = setup(fanState({ pourcent: 50, mode: 'auto' }));
    expect(container.querySelector('#v_marche')?.hasAttribute('class')).toBe(false);
    expect(container.querySelector('#v_arret')?.hasAttribute('class')).toBe(false);
  });
  it('Arrêt envoie 0 ; Marche envoie la vitesse du curseur (60 au départ, puis la nouvelle)', () => {
    const { container, onFan } = setup(makeState());
    expect((container.querySelector('#vitesse') as HTMLInputElement).value).toBe('60');
    expect(text(container, '#vitesse_v')).toBe('60');
    fireEvent.click(container.querySelector('#v_arret')!);
    expect(onFan).toHaveBeenLastCalledWith(0);
    fireEvent.click(container.querySelector('#v_marche')!);
    expect(onFan).toHaveBeenLastCalledWith(60);
    fireEvent.change(container.querySelector('#vitesse')!, { target: { value: '85' } });
    expect(text(container, '#vitesse_v')).toBe('85');
    expect(onFan).toHaveBeenCalledTimes(2);
    fireEvent.click(container.querySelector('#v_marche')!);
    expect(onFan).toHaveBeenLastCalledWith(85);
  });
  it('le curseur a ses bornes 30 à 100', () => {
    const { container } = setup(makeState());
    const r = container.querySelector('#vitesse') as HTMLInputElement;
    expect([r.min, r.max, r.type]).toEqual(['30', '100', 'range']);
  });
  it('lâcher le curseur en mode manuel applique la vitesse', () => {
    const { container, onFan } = setup(fanState({ pourcent: 60, mode: 'manuel' }));
    fireEvent.change(container.querySelector('#vitesse')!, { target: { value: '45' } });
    expect(onFan).not.toHaveBeenCalled();
    fireEvent.pointerUp(container.querySelector('#vitesse')!);
    expect(onFan).toHaveBeenCalledWith(45);
  });
  it.each(['arret', 'auto'] as const)('lâcher le curseur en mode %s n\'envoie rien', (mode) => {
    const { container, onFan } = setup(fanState({ mode }));
    fireEvent.pointerUp(container.querySelector('#vitesse')!);
    expect(onFan).not.toHaveBeenCalled();
  });
  it('lâcher le curseur sans état n\'envoie rien', () => {
    const { container, onFan } = setup(null);
    fireEvent.pointerUp(container.querySelector('#vitesse')!);
    expect(onFan).not.toHaveBeenCalled();
  });
  it('sans état : tirets, aucun bouton actif, pas de bloc auto', () => {
    const { container } = setup(null);
    expect(text(container, '#ventilo_pct')).toBe('—');
    expect(text(container, '#ventilo_etat')).toBe('—');
    expect(container.querySelector('#v_arret')?.hasAttribute('class')).toBe(false);
    expect(container.querySelector('#v_marche')?.hasAttribute('class')).toBe(false);
    expect(container.querySelector('#v_auto')).toBeNull();
  });
  it('ventilateur coupé (12 V) : texte dédié', () => {
    const { container } = setup(fanState({ alimente: false, pourcent: 0 }));
    expect(text(container, '#ventilo_etat')).toBe('coupé (12 V)');
  });
  it('ventilateur en panne : toutes les erreurs affichées', () => {
    const { container } = setup(makeState({ erreurs: {
      ventilo: 'ventilateur absent', ventilo_gpio: 'GPIO12 refusé', ventilo_pwm: 'PWM impossible', tachymetre: 'pas de signal tachymètre', gpio: 'GPIO indisponible',
    } }));
    expect([...container.querySelectorAll('.err')].map((e) => e.textContent)).toEqual([
      'ventilateur absent', 'GPIO12 refusé', 'PWM impossible', 'pas de signal tachymètre', 'GPIO indisponible',
    ]);
  });
  it('mode hiver avec ventilateur qui tourne : alerte', () => {
    const { container } = setup(fanState({ pourcent: 40, mode: 'manuel' }, { auto: { ...makeState().auto, hiver: true } }));
    expect(text(container, '#hiver_alerte')).toBe('Mode hiver actif : le ventilateur est censé être retiré.');
  });
  it('mode hiver avec ventilateur arrêté : pas d\'alerte', () => {
    const { container } = setup(makeState({ auto: { ...makeState().auto, hiver: true } }));
    expect(container.querySelector('#hiver_alerte')).toBeNull();
  });
  it('relaie onAuto depuis la ventilation automatique', () => {
    const { container, onAuto } = setup(makeState());
    fireEvent.click(container.querySelector('#v_auto')!);
    expect(onAuto).toHaveBeenCalledWith({ actif: true });
  });
});

describe('HistoryChart', () => {
  const pts = [point('10:00', 20, 15, 0), point('10:05', 22, 16, 50), point('10:10', null, 17, 100), point('10:15', 24, null, 0)];
  const vide = "Pas encore de données : un point est enregistré toutes les 5 minutes.";

  it.each([
    ['aucun point', []],
    ['un seul point', [point('a', 20, 15)]],
    ['des points sans mesure', [point('a', null, null), point('b', null, null)]],
    ['une seule mesure', [point('a', 20, null), point('b', null, null)]],
  ])('message d\'attente : %s', (_n, points) => {
    const { container } = render(<HistoryChart points={points} />);
    expect(text(container, '#histo_vide')).toBe(vide);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.card')?.className).toBe('card wide');
  });

  it('trace le graphique : titre, axes, repères d\'heure, légende', () => {
    const { container } = render(<HistoryChart points={pts} />);
    expect(screen.getByRole('heading').textContent).toBe('Températures (24 h)');
    expect(container.querySelector('#histo_vide')).toBeNull();
    const svg = container.querySelector('svg#histo')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 640 240');
    expect(svg.getAttribute('aria-label')).toBe('Températures du nid et de dehors sur 24 heures');
    // plage 14..25 -> pas 3 -> 14, 17, 20, 23
    const labels = [...svg.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['14 °C', '17 °C', '20 °C', '23 °C', '10:00', '10:05', '10:10', '10:15']));
    expect(container.querySelector('.chart-legend')?.textContent).toBe('NidDehorsVentilateur (0 à 100 %)');
  });

  it('une courbe par tronçon : nid coupé par le capteur muet, dehors coupée en fin', () => {
    const { container } = render(<HistoryChart points={pts} />);
    const paths = [...container.querySelectorAll('svg path')];
    const nid = paths.filter((p) => p.getAttribute('stroke') === '#ea580c');
    const ext = paths.filter((p) => p.getAttribute('stroke') === '#2563eb');
    expect(nid).toHaveLength(2); // 20,22 | 24
    expect(ext).toHaveLength(1); // 15,16,17
    expect(ext[0].getAttribute('d')!.match(/L/g)).toHaveLength(2);
    expect(nid[0].getAttribute('d')!.match(/L/g)).toHaveLength(1);
    expect(nid[1].getAttribute('d')!.match(/L/g)).toBeNull();
    const fan = paths.find((p) => p.getAttribute('fill') === '#93c5fd')!;
    expect(fan.getAttribute('d')!.startsWith('M40.0,212L40.0,')).toBe(true);
    expect(fan.getAttribute('d')!.endsWith('Z')).toBe(true);
  });

  it('la zone du ventilateur suit sa vitesse (100 % = haut du graphique)', () => {
    const { container } = render(<HistoryChart points={[point('a', 20, 20, 100), point('b', 21, 21, 0)]} />);
    const fan = [...container.querySelectorAll('svg path')].find((p) => p.getAttribute('fill') === '#93c5fd')!;
    // h = 240 - 12 - 28 = 200 ; haut = top 12, bas = 212
    expect(fan.getAttribute('d')).toBe('M40.0,212L40.0,12.0L628.0,212.0L628.0,212Z');
  });

  it('beaucoup de points : repères d\'heure espacés', () => {
    const many = Array.from({ length: 50 }, (_, i) => point(`h${i}`, 20 + (i % 5), 15, 0));
    const { container } = render(<HistoryChart points={many} />);
    const times = [...container.querySelectorAll('svg text')].map((t) => t.textContent).filter((t) => t!.startsWith('h'));
    expect(times.length).toBeGreaterThanOrEqual(5);
    expect(times.length).toBeLessThanOrEqual(8);
    expect(times[0]).toBe('h0');
  });
});
