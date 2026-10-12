"""Logique : ventilo(), ventilation automatique, caméras, LED, batterie, alertes, sonde extérieure, simulation, réglages, historique."""
import io
import json
import struct
import zlib

import pytest

from conftest import StopLoop


def set_nid(m, t, ext=10.0):
    m.etat["t_nid"] = t
    m.etat["ext"]["t"] = ext


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
    assert m.consommation() == {"total_w": 6.9, "detail": {"pi": 5.5, "cameras": 1.4, "led": 0.0, "ventilo": 0.0}}
    m.etat.update(cam1=False, led_nid=True, led_ext=True)
    m.etat["ventilo"]["pourcent"] = 100
    c = m.consommation()
    assert c["detail"] == {"pi": 5.5, "cameras": 0.7, "led": 2.4, "ventilo": 0.6}
    assert c["total_w"] == 9.2


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
    assert "sonde absente" in m.etat["auto"]["avertissements"][0]
    m.etat["ext"]["t"] = 10.0
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
        set_nid(m, t, 10.0)
        m.regler_auto()
        assert m.etat["auto"]["etat"] != "securite"


def test_auto_starts_proportionally(m, capsys):
    auto_on(m)   # seuil 28, vitesse 30..100, plage 5
    set_nid(m, 30.0, 10.0)
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
    set_nid(m, 30.0, 10.0)
    m.regler_auto()
    set_nid(m, 30.2, 10.0)   # 61 % vs 58 : écart < 5
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 58
    assert m.etat["auto"]["raison"].endswith("ventilateur à 58 %")


def test_auto_speed_range_uses_settings(m):
    auto_on(m, vitesse_min=40.0, vitesse_max=60.0, plage=10.0, seuil_marche=20.0)
    set_nid(m, 25.0, 10.0)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 50
    m.etat["auto"]["vitesse_max"] = 10.0   # incohérent : max est relevé au min
    m.ventilo(0)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 40


def test_auto_stops_below_hysteresis(m):
    auto_on(m)
    set_nid(m, 31.0, 10.0)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] > 0
    set_nid(m, 26.5, 10.0)          # entre seuil - hyst (26) et seuil : continue
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] > 0
    set_nid(m, 26.0, 10.0)          # <= seuil - hyst : s'arrête
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


def test_auto_does_not_start_without_outside_probe(m):
    """Température de dehors inconnue : sécurité, l'automatique ne démarre pas, même si le nid est très chaud."""
    auto_on(m)
    set_nid(m, 40.0, None)
    m.regler_auto()
    a = m.etat["auto"]
    assert m.etat["ventilo"]["pourcent"] == 0 and a["etat"] == "securite"
    assert "sonde extérieure absente ou muette" in a["raison"] and "ne démarre pas" in a["raison"]
    assert "extérieure" in a["avertissements"][0]


def test_auto_keeps_running_if_probe_is_lost_then_stops_when_cool(m):
    auto_on(m)
    set_nid(m, 31.0, 20.0)
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] > 0
    set_nid(m, 31.0, None)          # sonde muette : il continue, on ne coupe pas d'un coup
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] > 0 and m.etat["auto"]["etat"] == "ventile"
    set_nid(m, 25.0, None)          # nid frais : il s'arrête
    m.regler_auto()
    assert m.etat["ventilo"]["pourcent"] == 0


def test_heat_alert_independent_of_probe(m, monkeypatch):
    monkeypatch.setattr(m, "notifier", lambda t, msg: None)
    set_nid(m, 36.0, None)
    m.verifier_alerte()
    assert "alerte_chaleur" in m.etat["erreurs"]


def test_auto_takes_over_a_manual_fan_when_hot(m):
    auto_on(m)
    m.ventilo(80, "manuel")
    set_nid(m, 33.0, 10.0)
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


# ------------------------------------------------------------------ sonde extérieure DS18B20
def sonde(m, tmp_path, contenu, nom="28-0123456789ab"):
    """Pose un faux fichier w1_slave dans un faux /sys/bus/w1/devices."""
    m.W1_DOSSIER = str(tmp_path / "w1")
    d = tmp_path / "w1" / nom
    d.mkdir(parents=True, exist_ok=True)
    (d / "w1_slave").write_bytes(contenu if isinstance(contenu, bytes) else contenu.encode("ascii"))


BON = "4b 01 4b 46 7f ff 0c 10 d1 : crc=d1 YES\n4b 01 4b 46 7f ff 0c 10 d1 t=%d\n"


@pytest.mark.parametrize("milli,attendu", [(21437, 21.4), (-5125, -5.1), (0, 0.0), (-40000, -40.0), (60000, 60.0)])
def test_probe_reading_ok(load, tmp_path, milli, attendu):
    m = load(mock=False)
    sonde(m, tmp_path, BON % milli)
    assert m.lire_sonde_ext() == (attendu, None)
    m.etat["erreurs"]["sonde_ext"] = "ancienne"
    m.maj_sonde_ext()
    assert m.etat["ext"] == {"t": attendu, "source": "DS18B20", "maj": m.etat["ext"]["maj"]} and m.etat["ext"]["maj"]
    assert "sonde_ext" not in m.etat["erreurs"]


def test_probe_absent(load, tmp_path, capsys):
    m = load(mock=False)
    m.W1_DOSSIER = str(tmp_path / "rien")
    t, err = m.lire_sonde_ext()
    assert t is None and "sonde extérieure absente" in err
    m.maj_sonde_ext()
    assert m.etat["ext"]["t"] is None and m.etat["erreurs"]["sonde_ext"] == err
    assert "! sonde extérieure absente" in capsys.readouterr().out
    m.maj_sonde_ext()                                   # même erreur : une seule ligne de journal
    assert capsys.readouterr().out == ""


def test_probe_silent_after_working(load, tmp_path):
    m = load(mock=False)
    sonde(m, tmp_path, BON % 12000)
    m.maj_sonde_ext()
    assert m.etat["ext"]["t"] == 12.0
    (tmp_path / "w1" / "28-0123456789ab" / "w1_slave").unlink()
    (tmp_path / "w1" / "28-0123456789ab" / "w1_slave").mkdir()   # lecture impossible (c'est un dossier)
    m.maj_sonde_ext()
    assert m.etat["ext"]["t"] is None and m.etat["ext"]["source"] is None and "lecture de la sonde extérieure" in m.etat["erreurs"]["sonde_ext"]


@pytest.mark.parametrize("contenu,mot", [
    ("4b 01 : crc=d1 NO\n4b 01 t=21437\n", "CRC mauvais"),
    ("4b 01 : crc=d1 YES\n", "CRC mauvais"),
    ("", "CRC mauvais"),
    ("4b 01 : crc=d1 YES\n4b 01 sans valeur\n", "illisible"),
    ("4b 01 : crc=d1 YES\n4b 01 t=abc\n", "illisible"),
    (BON % 85000, "85,0 °C"),
    (BON % 61000, "aberrante"),
    (BON % -41000, "aberrante"),
    (BON % 127937, "aberrante"),
    (b"\xff\xfe", "lecture de la sonde"),
])
def test_probe_refused_values(load, tmp_path, contenu, mot):
    m = load(mock=False)
    sonde(m, tmp_path, contenu)
    t, err = m.lire_sonde_ext()
    assert t is None and mot in err
    m.maj_sonde_ext()
    assert m.etat["ext"]["t"] is None and mot in m.etat["erreurs"]["sonde_ext"]


def test_probe_not_read_in_mock(m, tmp_path):
    sonde(m, tmp_path, BON % 5000)
    m.maj_sonde_ext()
    assert m.etat["ext"]["t"] is None


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
    assert m.etat["ext"]["t"] == 16.0
    assert m.etat["ext"]["source"] == "simulée" and "sonde_ext" not in m.etat["erreurs"]
    assert m.etat["batterie"]["solaire_w"] > 0
    assert m.etat["t_nid"] == pytest.approx(16 + 3.05, abs=0.06)
    assert m.etat["batterie"]["source"] == "simulée" and m.etat["batterie"]["solaire_w"] > 0
    m.time.hour = 3
    m.simuler()
    assert m.etat["ext"]["t"] == 9.0
    assert m.etat["batterie"]["solaire_w"] == 0.0


def test_simulation_night_override(calm):
    m = calm
    m.time.hour = 12
    m.MOCK_NUIT = True
    m.simuler()
    assert m.etat["ext"]["t"] == 9.0 and m.etat["batterie"]["solaire_w"] == 0.0
    m.time.hour = 3
    m.MOCK_NUIT = False
    m.simuler()
    assert m.etat["ext"]["t"] == 16.0 and m.etat["batterie"]["solaire_w"] > 0


def test_simulation_forced_temperatures(calm):
    m = calm
    m.MOCK_FORCE["ext"] = 5.0
    m.MOCK_FORCE["nid"] = 40.0
    m.simuler()
    assert m.etat["ext"]["t"] == 5.0 and m.etat["t_nid"] == pytest.approx(40.0, abs=0.1)


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


def test_simulation_probe_failure_and_recovery(calm):
    m = calm
    m.MOCK_PANNES["sonde"] = True
    m.simuler()
    assert m.etat["ext"] == {"t": None, "source": None, "maj": None} and "sonde_ext" in m.etat["erreurs"]
    assert m.etat["t_nid"] == pytest.approx(16 + 3.1, abs=0.1)   # le nid simulé suit toujours la température de dehors simulée
    m.MOCK_PANNES["sonde"] = False
    m.simuler()
    assert m.etat["ext"]["t"] == 16.0 and "sonde_ext" not in m.etat["erreurs"]


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
    m.etat["ext"]["t"] = 15.0
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
