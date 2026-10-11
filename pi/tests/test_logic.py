"""Logique : ventilo(), ventilation automatique, caméras, LED, batterie, alertes, météo, simulation, réglages, historique."""
import io
import json
import struct
import zlib

import pytest

from conftest import StopLoop


def set_nid(m, t, ext=None):
    m.etat["t_nid"] = t
    m.etat["meteo"]["t_ext"] = ext


def auto_on(m, **kw):
    m.etat["auto"].update(actif=True, **kw)


# ------------------------------------------------------------------ conversions batterie / consommation
@pytest.mark.parametrize("v,attendu", [(9.0, 0.0), (10.0, 0.0), (11.0, 5.0), (12.8, 20.0), (13.05, 55.0), (13.4, 100.0), (14.5, 100.0)])
def test_pourcent_depuis_tension(m, v, attendu):
    assert m.pourcent_depuis_tension(v) == pytest.approx(attendu)


@pytest.mark.parametrize("p,attendu", [(0, 10.0), (5, 11.0), (20, 12.8), (55, 13.05), (100, 13.4), (120, 13.4)])
def test_tension_depuis_pourcent(m, p, attendu):
    assert m.tension_depuis_pourcent(p) == pytest.approx(attendu)


def test_consommation(m):
    assert m.consommation() == {"total_w": 4.9, "detail": {"pi": 3.5, "cameras": 1.4, "led": 0.0, "ventilo": 0.0}}
    m.etat.update(cam1=False, led_nid=True, led_ext=True)
    m.etat["ventilo"]["pourcent"] = 100
    c = m.consommation()
    assert c["detail"] == {"pi": 3.5, "cameras": 0.7, "led": 2.4, "ventilo": 0.6}
    assert c["total_w"] == 7.2


# ------------------------------------------------------------------ ventilo()
def test_ventilo_clamps_and_cuts_below_minimum(m):
    for entree, attendu in [(55.4, 55), (150, 100), (-5, 0), (29, 0), (30, 30), ("abc", 0), (None, 0), ("70", 70)]:
        m.ventilo(entree)
        assert m.etat["ventilo"]["pourcent"] == attendu, entree


def test_ventilo_start_stop_state(m):
    v = m.etat["ventilo"]
    m.ventilo(60, "manuel", "test")
    assert (v["pourcent"], v["mode"], v["raison"], v["alimente"]) == (60, "manuel", "test", True)
    assert m.ventilo_pwm.value == 0.6 and m.ventilo_12v.value == 1
    depuis = m._vent["depuis"]
    assert depuis == m.time.now
    m.time.now += 50
    m.ventilo(80)          # déjà en marche : l'instant de départ ne bouge pas
    assert m._vent["depuis"] == depuis and v["raison"] == "commande manuelle"
    m.ventilo(0, "auto")   # p == 0 force le mode arret
    assert (v["pourcent"], v["mode"], v["raison"], v["alimente"]) == (0, "arret", "arrêté", False)
    assert m.ventilo_pwm.value == 0 and m.ventilo_12v.value == 0 and m._vent["depuis"] == 0.0


def test_ventilo_real_gpio_waits_for_12v_once(load):
    m = load(mock=False, hw=True)
    m.ventilo(60)
    assert m.time.sleeps == [0.5] and m.ventilo_12v.value == 1
    m.ventilo(70)
    assert m.time.sleeps == [0.5]
    m.ventilo(0)
    assert m.ventilo_12v.value == 0


def test_ventilo_without_gpio_only_tracks_state(m):
    m.LED_OK = m.VENT_OK = False
    m.ventilo_pwm.value = m.ventilo_12v.value = "intact"
    m.ventilo(60)
    assert m.etat["ventilo"]["alimente"] and m.ventilo_pwm.value == "intact" and m.ventilo_12v.value == "intact"
    m.ventilo(0)
    assert not m.etat["ventilo"]["alimente"] and m.ventilo_pwm.value == "intact" and m.ventilo_12v.value == "intact"


def test_ventilo_logs_only_changes(m, capsys):
    m.ventilo(60, "manuel", "go")
    assert "Ventilateur : 60 % (manuel) — go" in capsys.readouterr().out
    m.ventilo(60, "manuel", "go")
    assert capsys.readouterr().out == ""
    m.ventilo(0, silencieux=True)
    assert capsys.readouterr().out == ""
    m.ventilo(70, silencieux=False)
    capsys.readouterr()
    m.ventilo(0, "arret", "fini")
    assert "Ventilateur : arrêt — fini" in capsys.readouterr().out


# ------------------------------------------------------------------ ventilation automatique
def test_auto_inactive(m):
    set_nid(m, 40.0)
    m.regler_auto()
    a = m.etat["auto"]
    assert (a["etat"], a["raison"]) == ("inactif", "mode désactivé") and m.etat["ventilo"]["pourcent"] == 0


def test_warnings(m):
    m.regler_auto()
    assert len(m.etat["auto"]["avertissements"]) == 1 and "extérieure" in m.etat["auto"]["avertissements"][0]
    m.etat["meteo"]["t_ext"] = 10.0
    assert m.avertissements() == []
    m.TACHO_OK = False
    assert "tachymètre absent" in m.avertissements()[0]


def test_hiver_stops_running_auto_fan(m):
    auto_on(m, hiver=True)
    m.ventilo(60, "auto")
    set_nid(m, 40.0)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 0
    assert (m.etat["auto"]["etat"], m.etat["auto"]["raison"]) == ("veille", "mode hiver : ventilateur retiré")
    m.regler_auto()   # rien à arrêter : ne plante pas
    assert m.etat["ventilo"]["pourcent"] == 0


def test_hiver_keeps_manual_fan(m):
    auto_on(m, hiver=True)
    m.ventilo(60, "manuel")
    set_nid(m, 40.0)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 60


@pytest.mark.parametrize("t,erreur,mot", [(None, False, "absent"), (30.0, True, "absent"), (-50.0, False, "aberrante"), (61.0, False, "aberrante")])
def test_auto_blocked_by_bad_sensor(m, t, erreur, mot):
    auto_on(m)
    set_nid(m, t, 10.0)
    if erreur:
        m.etat["erreurs"]["bme280"] = "panne"
    m.ventilo(60, "auto")
    m.regler_auto()
    a = m.etat["auto"]
    assert a["etat"] == "securite" and mot in a["raison"]
    assert m.etat["ventilo"]["pourcent"] == 0 and "sécurité" in m.etat["ventilo"]["raison"]


def test_auto_blocked_when_not_running(m):
    auto_on(m)
    set_nid(m, None)
    m.regler_auto()
    assert m.etat["auto"]["etat"] == "securite" and m.etat["ventilo"]["pourcent"] == 0


def test_auto_plausible_bounds_inclusive(m):
    auto_on(m, seuil_marche=45.0)
    for t in (-40.0, 60.0):
        set_nid(m, t, None)
        m.regler_auto()
        assert m.etat["auto"]["etat"] != "securite"


def test_auto_starts_proportionally(m, capsys):
    auto_on(m)   # seuil 28, vitesse 30..100, plage 5
    set_nid(m, 30.0, None)
    m.regler_auto()
    v, a = m.etat["ventilo"], m.etat["auto"]
    assert (v["pourcent"], v["mode"]) == (58, "auto")      # 30 + 70 * 2/5
    assert a["etat"] == "ventile" and a["raison"] == "nid à 30.0 °C, ventilateur à 58 %"
    assert "Ventilateur : 58 % (auto)" in capsys.readouterr().out   # le démarrage est journalisé
    set_nid(m, 40.0, 20.0)
    m.regler_auto()
    assert v["pourcent"] == 100                              # plafonné à vitesse_max
    assert capsys.readouterr().out == ""                    # silencieux quand ça tourne déjà
    set_nid(m, 28.1, 20.0)
    m.regler_auto()
    assert v["pourcent"] == round(30 + 70 * 0.1 / 5)


def test_auto_small_change_ignored(m):
    auto_on(m)
    set_nid(m, 30.0, None)
    m.regler_auto()
    set_nid(m, 30.2, None)   # 61 % vs 58 : écart < 5
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 58
    assert m.etat["auto"]["raison"].endswith("ventilateur à 58 %")


def test_auto_speed_range_uses_settings(m):
    auto_on(m, vitesse_min=40.0, vitesse_max=60.0, plage=10.0, seuil_marche=20.0)
    set_nid(m, 25.0, None)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 50
    m.etat["auto"]["vitesse_max"] = 10.0   # incohérent : max est relevé au min
    m.ventilo(0)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 40


def test_auto_stops_below_hysteresis(m):
    auto_on(m)
    set_nid(m, 31.0, None)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] > 0
    set_nid(m, 26.5, None)          # entre seuil - hyst (26) et seuil : continue
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] > 0
    set_nid(m, 26.0, None)          # <= seuil - hyst : s'arrête
    m.regler_auto()
    v, a = m.etat["ventilo"], m.etat["auto"]
    assert v["pourcent"] == 0 and a["etat"] == "veille"
    assert a["raison"] == "nid à 26.0 °C, sous le seuil de 28.0 °C"


def test_auto_stops_when_outside_is_warmer(m):
    auto_on(m)
    set_nid(m, 31.0, 20.0)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] > 0
    set_nid(m, 30.0, 29.6)          # nid <= dehors + 0,5
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 0
    assert "plus plus chaud que dehors" in m.etat["ventilo"]["raison"]
    assert m.etat["auto"]["etat"] == "veille" and "dehors est plus chaud (29.6 °C)" in m.etat["auto"]["raison"]


def test_auto_waits_when_difference_too_small(m):
    auto_on(m)
    set_nid(m, 30.0, 29.0)          # chaud mais seulement 1 °C de plus que dehors (ecart_ext = 2)
    m.regler_auto()
    a = m.etat["auto"]
    assert m.etat["ventilo"]["pourcent"] == 0 and a["etat"] == "veille"
    assert a["raison"] == "nid à 30.0 °C, seulement 1.0 °C de plus que dehors (écart minimal 2.0 °C)"
    set_nid(m, 31.5, 29.0)          # 2,5 °C de plus : démarre
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] > 0


def test_auto_takes_over_a_manual_fan_when_hot(m):
    auto_on(m)
    m.ventilo(80, "manuel")
    set_nid(m, 33.0, None)
    m.regler_auto()
    assert m.etat["ventilo"]["mode"] == "auto"


# ------------------------------------------------------------------ caméras et LED
def test_camera_mock_toggle(m, capsys):
    m.camera(0, False)
    assert m.etat["cam1"] is False and "Caméra 1 : éteinte" in capsys.readouterr().out
    m.camera(1, True)
    assert m.etat["cam2"] is True and "Caméra 2 : allumée" in capsys.readouterr().out


@pytest.mark.parametrize("pc,attendu", [(5, False), (9.9, False), (10, True), (None, True)])
def test_camera_refused_on_critical_battery(m, pc, attendu, capsys):
    m.etat["batterie"]["pourcent"] = pc
    m.etat["cam2"] = False
    m.camera(1, True)
    assert m.etat["cam2"] is attendu
    assert ("refusée" in capsys.readouterr().out) is (not attendu)


def test_camera_off_allowed_on_critical_battery(m):
    m.etat["batterie"]["pourcent"] = 2
    m.camera(0, False)
    assert m.etat["cam1"] is False


def test_camera_controls_real_recorder(load):
    m = load(mock=False, hw=True)
    cam = m.capteurs_cam[0][0]
    m.camera(0, False)
    m.camera(0, True)
    assert cam.calls[-2:] == ["stop", "start"] and m.etat["cam1"] is True
    cam.boom = True
    m.camera(0, False)
    assert m.etat["erreurs"]["camera1"] == "commande de la caméra 1 : stop"
    m.camera(0, True)
    assert m.etat["erreurs"]["camera1"] == "commande de la caméra 1 : start"


def test_leds(m, capsys):
    m.leds()
    assert m.etat["led_nid"] is False and m.led_nid.value == 0
    m.leds(nid=True)
    assert m.etat["led_nid"] is True and m.led_nid.value == 1 and m.etat["led_ext"] is False and m.led_ext.value == 0
    m.leds(ext=1)
    assert m.etat["led_ext"] is True and m.led_ext.value == 1
    m.leds(nid=False, ext=False)
    assert not m.etat["led_nid"] and not m.etat["led_ext"] and m.led_nid.value == 0
    assert "LED du nid : éteintes" in capsys.readouterr().out


def test_leds_without_gpio(m):
    m.LED_OK = False
    m.led_nid.value = m.led_ext.value = "intact"
    m.leds(True, True)
    assert m.etat["led_nid"] and m.etat["led_ext"] and m.led_nid.value == "intact" and m.led_ext.value == "intact"


# ------------------------------------------------------------------ délestage (batterie)
def delest(m, wh_fraction):
    m.sim["wh"] = wh_fraction * m.CAPACITE_WH
    m.MOCK_NUIT = True
    m.lecture()


def test_load_shedding_critical(m, capsys):
    m.etat.update(led_nid=True, cam1=True, cam2=False)
    delest(m, 0.05)
    assert "caméras et LED coupées" in m.etat["erreurs"]["delestage"]
    assert not m.etat["led_nid"] and not m.etat["cam1"] and not m.etat["cam2"]
    assert capsys.readouterr().out.count("DÉLESTAGE") == 1
    m.lecture()   # déjà signalé : pas de nouvelle ligne
    assert "DÉLESTAGE" not in capsys.readouterr().out


def test_load_shedding_critical_with_only_ext_led_and_cam2(m):
    m.etat.update(led_ext=True, cam1=False, cam2=True)
    delest(m, 0.05)
    assert not m.etat["led_ext"] and not m.etat["cam2"]


def test_load_shedding_critical_nothing_on(m):
    m.etat.update(cam1=False, cam2=False)
    delest(m, 0.05)
    assert "delestage" in m.etat["erreurs"]


def test_low_battery_only_warns(m):
    m.etat.update(led_nid=True, cam1=True)
    delest(m, 0.15)
    assert "économie d'énergie" in m.etat["erreurs"]["delestage"]
    assert m.etat["led_nid"] and m.etat["cam1"]


def test_delestage_cleared_when_battery_recovers(m):
    delest(m, 0.15)
    assert "delestage" in m.etat["erreurs"]
    delest(m, 0.8)
    assert "delestage" not in m.etat["erreurs"]


# ------------------------------------------------------------------ alerte chaleur / panne ventilateur / notifications
def fake_urlopen(m, monkeypatch, fail=False):
    calls = []

    def f(req, timeout=None):
        calls.append((req, timeout))
        if fail:
            raise OSError("réseau")
        return io.BytesIO(b"")
    monkeypatch.setattr(m.urllib.request, "urlopen", f)
    return calls


def test_notifier_without_topic_or_in_mock(m, monkeypatch, capsys):
    calls = fake_urlopen(m, monkeypatch)
    m.NTFY_TOPIC = ""
    m.notifier("titre", "msg")
    m.NTFY_TOPIC = "sujet"       # topic mais mode simulé
    m.notifier("titre", "msg")
    assert calls == [] and "NOTIFICATION : titre — msg" in capsys.readouterr().out


def test_notifier_sends_ntfy(m, monkeypatch):
    calls = fake_urlopen(m, monkeypatch)
    m.MOCK, m.NTFY_TOPIC = False, "sujet"
    m.notifier("alerte chaleur é", "il fait chaud")
    (req, timeout), = calls
    assert req.full_url == "https://ntfy.sh/sujet" and req.data == "il fait chaud".encode()
    assert req.get_header("Title") == "Nichoir alerte chaleur " and timeout == 8


def test_notifier_failure_is_logged(m, monkeypatch, capsys):
    fake_urlopen(m, monkeypatch, fail=True)
    m.MOCK, m.NTFY_TOPIC = False, "sujet"
    m.notifier("t", "m")
    assert "notification non envoyée : réseau" in capsys.readouterr().out


def test_heat_alert_lifecycle(m, monkeypatch):
    sent = []
    monkeypatch.setattr(m, "notifier", lambda t, msg: sent.append((t, msg)))
    m.time.now = 10000.0
    set_nid(m, 36.0)
    m.verifier_alerte()
    assert m.etat["erreurs"]["alerte_chaleur"] == "ALERTE : le nid est à 36.0 °C (> 35.0 °C)" and len(sent) == 1
    m.time.now += 100
    m.verifier_alerte()                       # moins d'une heure : pas de nouvelle notification
    assert len(sent) == 1
    m.time.now += 3600
    m.verifier_alerte()
    assert len(sent) == 2
    set_nid(m, 34.5)                          # entre seuil - 1 et seuil : l'alerte reste affichée
    m.verifier_alerte()
    assert "alerte_chaleur" in m.etat["erreurs"]
    set_nid(m, 33.9)
    m.verifier_alerte()
    assert "alerte_chaleur" not in m.etat["erreurs"]
    set_nid(m, 36.0)
    m.time.now += 5000
    m.verifier_alerte()
    assert len(sent) == 3
    set_nid(m, None)                          # capteur muet : alerte levée
    m.verifier_alerte()
    assert "alerte_chaleur" not in m.etat["erreurs"]


def test_alert_exactly_at_threshold_is_not_alert(m):
    set_nid(m, 35.0)
    m.verifier_alerte()
    assert "alerte_chaleur" not in m.etat["erreurs"]


def test_fan_failure_detection(m, monkeypatch):
    sent = []
    monkeypatch.setattr(m, "notifier", lambda t, msg: sent.append(t))
    m.time.now = 10000.0
    m.ventilo(60)
    v = m.etat["ventilo"]
    v["rpm"] = 0
    m.time.now += 5
    m.verifier_ventilo()
    assert "ventilo" not in m.etat["erreurs"]            # pas encore 10 s
    m.time.now += 6
    m.verifier_ventilo()
    assert "ne tourne pas" in m.etat["erreurs"]["ventilo"] and sent == ["panne ventilateur"]
    m.verifier_ventilo()
    assert sent == ["panne ventilateur"]                  # une notification par heure
    m.time.now += 3601
    m.verifier_ventilo()
    assert len(sent) == 2
    v["rpm"] = 1200
    m.verifier_ventilo()
    assert "ventilo" not in m.etat["erreurs"]


@pytest.mark.parametrize("cas", ["tacho_jamais_vu", "rpm_none", "arrete"])
def test_fan_failure_not_reported_when(m, cas):
    m.ventilo(60)
    m.time.now += 60
    m.etat["ventilo"]["rpm"] = 0
    if cas == "tacho_jamais_vu":
        m._vent["tacho_vu"] = False
    elif cas == "rpm_none":
        m.etat["ventilo"]["rpm"] = None
    else:
        m.ventilo(0)
    m.verifier_ventilo()
    assert "ventilo" not in m.etat["erreurs"]


# ------------------------------------------------------------------ météo
class Rep(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


CURRENT = {"current": {"temperature_2m": 12.5, "relative_humidity_2m": 80, "cloud_cover": 40, "wind_speed_10m": 9.5, "is_day": 1, "shortwave_radiation": 300}}


def patch_meteo(m, monkeypatch, payload=CURRENT, fail=None):
    urls = []

    def f(url, timeout=None):
        urls.append((url, timeout))
        if fail:
            raise fail
        return Rep(json.dumps(payload).encode())
    monkeypatch.setattr(m.urllib.request, "urlopen", f)
    return urls


def test_meteo_success_and_throttle(load, monkeypatch):
    m = load(mock=False)
    urls = patch_meteo(m, monkeypatch)
    m.etat["erreurs"]["meteo"] = "ancienne"
    m.maj_meteo()
    mt = m.etat["meteo"]
    assert mt == {"t_ext": 12.5, "hum_ext": 80, "nuages": 40, "vent_kmh": 9.5, "jour": True, "rayonnement": 300, "source": "Open-Meteo", "maj": mt["maj"]}
    assert "meteo" not in m.etat["erreurs"]
    assert "latitude=48.51" in urls[0][0] and "longitude=2.64" in urls[0][0] and urls[0][1] == 8
    m.maj_meteo()
    assert len(urls) == 1                      # moins de 600 s
    m.time.now += 600
    m.maj_meteo()
    assert len(urls) == 2


def test_meteo_failure_sets_error_keeps_data(load, monkeypatch):
    m = load(mock=False)
    patch_meteo(m, monkeypatch, fail=OSError("hors ligne"))
    m.etat["meteo"]["t_ext"] = 7.0
    m.maj_meteo()
    assert m.etat["erreurs"]["meteo"] == "météo indisponible : hors ligne" and m.etat["meteo"]["t_ext"] == 7.0


def test_meteo_bad_payload_is_an_error(load, monkeypatch):
    m = load(mock=False)
    patch_meteo(m, monkeypatch, payload={"current": {}})
    m.maj_meteo()
    assert "météo indisponible" in m.etat["erreurs"]["meteo"]


def test_meteo_skipped_in_mock_unless_real_requested(m, monkeypatch):
    urls = patch_meteo(m, monkeypatch)
    m.maj_meteo()
    assert urls == []
    monkeypatch.setenv("NICHOIR_MOCK_METEO_REEL", "1")
    m.maj_meteo()
    assert len(urls) == 1 and m.etat["meteo"]["source"] == "Open-Meteo"


# ------------------------------------------------------------------ simulation
@pytest.fixture
def calm(m, monkeypatch):
    monkeypatch.setattr(m.random, "random", lambda: 1.0)
    monkeypatch.setattr(m.random, "uniform", lambda a, b: (a + b) / 2)
    m.time.now = 0.0
    return m


def test_simulation_day_and_night(calm):
    m = calm
    m.time.hour = 12
    m.simuler()
    assert m.etat["meteo"]["jour"] is True and m.etat["meteo"]["t_ext"] == 16.0
    assert m.etat["meteo"]["source"] == "simulée" and m.etat["meteo"]["rayonnement"] > 0
    assert m.etat["t_nid"] == pytest.approx(16 + 3.05, abs=0.06)
    assert m.etat["batterie"]["source"] == "simulée" and m.etat["batterie"]["solaire_w"] > 0
    m.time.hour = 3
    m.simuler()
    assert m.etat["meteo"]["jour"] is False and m.etat["meteo"]["t_ext"] == 9.0
    assert m.etat["meteo"]["rayonnement"] == 0 and m.etat["batterie"]["solaire_w"] == 0.0


def test_simulation_night_override(calm):
    m = calm
    m.time.hour = 12
    m.MOCK_NUIT = True
    m.simuler()
    assert m.etat["meteo"]["jour"] is False
    m.time.hour = 3
    m.MOCK_NUIT = False
    m.simuler()
    assert m.etat["meteo"]["jour"] is True


def test_simulation_forced_temperatures(calm):
    m = calm
    m.MOCK_FORCE["ext"] = 5.0
    m.MOCK_FORCE["nid"] = 40.0
    m.simuler()
    assert m.etat["meteo"]["t_ext"] == 5.0 and m.etat["t_nid"] == pytest.approx(40.0, abs=0.1)


def test_simulation_fan_cools_the_nest(calm):
    m = calm
    m.MOCK_FORCE["nid"] = 30.0
    m.etat["ventilo"]["pourcent"] = 100
    for _ in range(200):
        m.simuler()
    assert m.etat["t_nid"] == pytest.approx(27.0, abs=0.1)


def test_simulation_bme_failure_and_recovery(calm):
    m = calm
    m.MOCK_PANNES["bme"] = True
    m.simuler()
    assert m.etat["t_nid"] is None and m.etat["hum_nid"] is None and "bme280" in m.etat["erreurs"]
    m.MOCK_PANNES["bme"] = False
    m.simuler()
    assert m.etat["t_nid"] is not None and "bme280" not in m.etat["erreurs"]


def test_simulation_real_weather_is_kept(calm, monkeypatch):
    m = calm
    monkeypatch.setenv("NICHOIR_MOCK_METEO_REEL", "1")
    m.etat["meteo"] = {"t_ext": 3.0, "source": "Open-Meteo"}
    m.simuler()
    assert m.etat["meteo"] == {"t_ext": 3.0, "source": "Open-Meteo"}
    assert m.etat["t_nid"] == pytest.approx(3.0 + 3.05, abs=0.06)
    m.etat["meteo"]["t_ext"] = None   # pas encore reçue : t_ext simulé pour le nid
    m.simuler()
    assert m.etat["meteo"]["t_ext"] is None
    assert m.etat["t_nid"] == pytest.approx(16 + 3.1, abs=0.1)


def test_simulation_cloud_change(calm, monkeypatch):
    m = calm
    monkeypatch.setattr(m.random, "random", lambda: 0.0)
    m.simuler()
    assert m.sim["nuage_cible"] == pytest.approx(0.6)


def test_simulation_battery_charge_taper_and_drain(calm):
    m = calm
    m.time.hour = 12
    m.sim["nuage"] = m.sim["nuage_cible"] = 1.0
    m.sim["wh"] = 0.5 * m.CAPACITE_WH
    m.simuler()
    gain_milieu = m.sim["wh"] - 0.5 * m.CAPACITE_WH
    assert gain_milieu == pytest.approx((60 - m.consommation()["total_w"]) / 3600, rel=1e-6)
    m.sim["wh"] = 0.98 * m.CAPACITE_WH
    m.simuler()
    gain_fin = m.sim["wh"] - 0.98 * m.CAPACITE_WH
    assert 0 < gain_fin < gain_milieu / 2        # le courant diminue près de 100 %
    m.sim["wh"] = m.CAPACITE_WH
    m.simuler()
    assert m.sim["wh"] == m.CAPACITE_WH            # plafonné
    m.MOCK_NUIT = True
    m.sim["wh"] = 0.5 * m.CAPACITE_WH
    m.simuler()
    assert m.sim["wh"] < 0.5 * m.CAPACITE_WH      # la nuit : décharge
    m.sim["wh"] = 0.0
    m.simuler()
    assert m.sim["wh"] == 0.0 and m.etat["batterie"]["pourcent"] == 0.0


def test_simulation_acceleration(calm):
    m = calm
    m.MOCK_NUIT = True
    m.sim["wh"] = 0.5 * m.CAPACITE_WH
    m.simuler()
    lent = 0.5 * m.CAPACITE_WH - m.sim["wh"]
    m.SIM_ACCEL = 60
    m.sim["wh"] = 0.5 * m.CAPACITE_WH
    m.simuler()
    assert 0.5 * m.CAPACITE_WH - m.sim["wh"] == pytest.approx(60 * lent, rel=1e-6)


def test_fake_stream_png(m):
    flux = m.cameras[0]
    png = flux.image(0, w=40, h=30)
    assert png[:8] == bytes((137, 80, 78, 71, 13, 10, 26, 10))
    assert png[12:16] == b"IHDR" and struct.unpack(">II", png[16:24]) == (40, 30)
    idat = png.index(b"IDAT")
    n, = struct.unpack(">I", png[idat - 4:idat])
    assert len(zlib.decompress(png[idat + 4:idat + 4 + n])) == 30 * (1 + 3 * 40)
    assert png.endswith(m._bloc(b"IEND", b""))
    assert flux.image(0, 40, 30) != flux.image(5, 40, 30)   # image animée


def test_fake_stream_loop(m):
    flux = m.cameras[1]

    def stop(s):
        raise StopLoop
    m.time.sleep = stop
    with pytest.raises(StopLoop):
        flux.tourne()
    assert flux.frame.startswith(b"\x89PNG")


# ------------------------------------------------------------------ réglages sur disque
def test_reglages_roundtrip(m):
    a = m.etat["auto"]
    a.update(actif=True, hiver=True, seuil_marche=30.0, vitesse_min=50.0)
    m.sauver_reglages()
    with open(m.FICHIER_REGLAGES, encoding="utf-8") as f:
        saved = json.load(f)
    assert set(saved) == set(m.AUTO_DEFAUT) and saved["seuil_marche"] == 30.0
    a.update(actif=False, hiver=False, seuil_marche=28.0, vitesse_min=30.0)
    m.charger_reglages()
    assert (a["actif"], a["hiver"], a["seuil_marche"], a["vitesse_min"]) == (True, True, 30.0, 50.0)


def test_reglages_missing_file_keeps_defaults(m):
    m.charger_reglages()
    assert {k: m.etat["auto"][k] for k in m.AUTO_DEFAUT} == m.AUTO_DEFAUT


def write(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def test_reglages_clamped_and_old_key(m):
    write(m.FICHIER_REGLAGES, json.dumps({"seuil_marche": 99, "ecart_ext": -3, "vitesse_min": 80, "vitesse_max": 40, "bouche": True, "actif": 1}))
    m.charger_reglages()
    a = m.etat["auto"]
    assert (a["seuil_marche"], a["ecart_ext"], a["vitesse_min"]) == (45.0, 0.0, 80.0)
    assert a["vitesse_max"] == 80.0       # relevé au minimum
    assert a["hiver"] is True and a["actif"] is True


def test_reglages_hiver_beats_bouche(m):
    write(m.FICHIER_REGLAGES, json.dumps({"hiver": False, "bouche": True}))
    m.etat["auto"]["hiver"] = True
    m.charger_reglages()
    assert m.etat["auto"]["hiver"] is False and m.etat["auto"]["actif"] is False


@pytest.mark.parametrize("contenu", ["pas du json", json.dumps({"seuil_marche": "x"}), json.dumps([1, 2])])
def test_reglages_corrupted_file_ignored(m, contenu):
    write(m.FICHIER_REGLAGES, contenu)
    m.charger_reglages()      # ne lève pas
    assert m.etat["auto"]["actif"] is False


def test_reglages_save_failure_is_silent(m, tmp_path):
    m.FICHIER_REGLAGES = str(tmp_path / "absent" / "reglages.json")
    m.sauver_reglages()
    assert not (tmp_path / "absent").exists()


# ------------------------------------------------------------------ historique
def lire(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def test_history_sampling_and_saving(m):
    m.etat.update(t_nid=21.0, hum_nid=60.0)
    m.etat["meteo"]["t_ext"] = 15.0
    m.ventilo(50)
    m.enregistrer_historique()
    assert m.historique == [{"t": m.historique[0]["t"], "nid": 21.0, "ext": 15.0, "hum": 60.0, "ventilo": 50}]
    assert len(m.historique[0]["t"]) == 5 and m.historique[0]["t"][2] == ":"
    assert lire(m.FICHIER_HISTO) == m.historique
    m.time.now += 4
    m.enregistrer_historique()
    assert len(m.historique) == 1                  # moins de HISTO_PERIODE (5 s)
    m.time.now += 2
    m.etat["t_nid"] = 22.0
    m.enregistrer_historique()
    assert len(m.historique) == 2
    assert len(lire(m.FICHIER_HISTO)) == 1         # sauvegarde au plus une fois par minute
    m.time.now += 60
    m.enregistrer_historique()
    assert len(lire(m.FICHIER_HISTO)) == 3


def test_history_keeps_288_points(m):
    for i in range(300):
        m.time.now += 10
        m.etat["t_nid"] = float(i)
        m.enregistrer_historique()
    assert len(m.historique) == m.HISTO_MAX == 288
    assert m.historique[0]["nid"] == 12.0 and m.historique[-1]["nid"] == 299.0


def test_history_real_period_is_five_minutes(load):
    m = load(mock=False)
    m.enregistrer_historique()
    m.time.now += 299
    m.enregistrer_historique()
    assert len(m.historique) == 1
    m.time.now += 2
    m.enregistrer_historique()
    assert len(m.historique) == 2


def test_history_reload(m):
    pts = [{"t": "10:00", "nid": 1}] + ["junk", {"pas_de_t": 1}, 3] + [{"t": f"{i}", "nid": i} for i in range(400)]
    write(m.FICHIER_HISTO, json.dumps(pts))
    m.charger_historique()
    assert len(m.historique) == 288 and m.historique[-1] == {"t": "399", "nid": 399}
    assert all(isinstance(p, dict) and "t" in p for p in m.historique)


def test_history_reload_missing_or_corrupt(m):
    m.historique.append({"t": "00:00"})
    m.charger_historique()
    assert m.historique == [{"t": "00:00"}]
    write(m.FICHIER_HISTO, "{{{")
    m.charger_historique()
    assert m.historique == [{"t": "00:00"}]


def test_history_save_failure_is_silent(m, tmp_path):
    m.FICHIER_HISTO = str(tmp_path / "absent" / "h.json")
    m.historique.append({"t": "x"})
    m.sauver_historique()
    assert not (tmp_path / "absent").exists()


def test_lecture_full_mock_cycle(m, capsys):
    m.lecture()
    assert m.etat["derniere_lecture"] and len(m.historique) == 1 and m.etat["conso"]["total_w"] > 0
    assert "nid" in capsys.readouterr().out and m._lectures[0] == 1
