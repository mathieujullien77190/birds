"""Logique : fan(), ventilation automatique, caméras, LED, consommation, alertes, sonde extérieure, simulation, réglages, historique."""
import io
import json
import struct
import zlib

import pytest

from conftest import StopLoop


def set_nid(m, t, outside=10.0):
    m.state["t_nid"] = t
    m.state["ext"]["t"] = outside


def auto_on(m, **kw):
    m.state["auto"].update(actif=True, **kw)


# ------------------------------------------------------------------ consommation
def test_consommation(m):
    assert m.consumption() == {"total_w": 6.9, "detail": {"pi": 5.5, "cameras": 1.4, "led": 0.0, "ventilo": 0.0}}
    m.state.update(cam1=False, led_nid=True, led_ext=True)
    m.state["ventilo"]["pourcent"] = 100
    c = m.consumption()
    assert c["detail"] == {"pi": 5.5, "cameras": 0.7, "led": 0.66, "ventilo": 0.6}
    assert c["total_w"] == 7.5


# ------------------------------------------------------------------ fan()
def test_ventilo_clamps_and_cuts_below_minimum(m):
    for entree, attendu in [(55.4, 55), (150, 100), (-5, 0), (29, 0), (30, 30), ("abc", 0), (None, 0), ("70", 70)]:
        m.fan(entree)
        assert m.state["ventilo"]["pourcent"] == attendu, entree


def test_ventilo_start_stop_state(m):
    v = m.state["ventilo"]
    m.fan(60, "manuel", "test")
    assert (v["pourcent"], v["mode"], v["raison"], v["alimente"]) == (60, "manuel", "test", True)
    assert m.fan_pwm.value == 0.6 and m.fan_12v.value == 1
    depuis = m._fan["depuis"]
    assert depuis == m.time.now
    m.time.now += 50
    m.fan(80)          # déjà en marche : l'instant de départ ne bouge pas
    assert m._fan["depuis"] == depuis and v["raison"] == "commande manuelle"
    m.fan(0, "auto")   # p == 0 force le mode arret
    assert (v["pourcent"], v["mode"], v["raison"], v["alimente"]) == (0, "arret", "arrêté", False)
    assert m.fan_pwm.value == 0 and m.fan_12v.value == 0 and m._fan["depuis"] == 0.0


def test_ventilo_real_gpio_waits_for_12v_once(load):
    m = load(mock=False, hw=True)
    m.fan(60)
    assert m.time.sleeps == [0.5] and m.fan_12v.value == 1
    m.fan(70)
    assert m.time.sleeps == [0.5]
    m.fan(0)
    assert m.fan_12v.value == 0


def test_ventilo_without_gpio_only_tracks_state(m):
    m.LED_OK = m.FAN_OK = False
    m.fan_pwm.value = m.fan_12v.value = "intact"
    m.fan(60)
    assert m.state["ventilo"]["alimente"] and m.fan_pwm.value == "intact" and m.fan_12v.value == "intact"
    m.fan(0)
    assert not m.state["ventilo"]["alimente"] and m.fan_pwm.value == "intact" and m.fan_12v.value == "intact"


def test_ventilo_logs_only_changes(m, capsys):
    m.fan(60, "manuel", "go")
    assert "Ventilateur : 60 % (manuel) — go" in capsys.readouterr().out
    m.fan(60, "manuel", "go")
    assert capsys.readouterr().out == ""
    m.fan(0, silent=True)
    assert capsys.readouterr().out == ""
    m.fan(70, silent=False)
    capsys.readouterr()
    m.fan(0, "arret", "fini")
    assert "Ventilateur : arrêt — fini" in capsys.readouterr().out


# ------------------------------------------------------------------ ventilation automatique
def test_auto_inactive(m):
    set_nid(m, 40.0)
    m.run_auto()
    a = m.state["auto"]
    assert (a["etat"], a["raison"]) == ("inactif", "mode désactivé") and m.state["ventilo"]["pourcent"] == 0


def test_warnings(m):
    m.run_auto()
    assert len(m.state["auto"]["avertissements"]) == 1 and "extérieure" in m.state["auto"]["avertissements"][0]
    assert "sonde absente" in m.state["auto"]["avertissements"][0]
    m.state["ext"]["t"] = 10.0
    assert m.warnings() == []
    m.TACH_OK = False
    assert "tachymètre absent" in m.warnings()[0]


def test_hiver_stops_running_auto_fan(m):
    auto_on(m, hiver=True)
    m.fan(60, "auto")
    set_nid(m, 40.0)
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] == 0
    assert (m.state["auto"]["etat"], m.state["auto"]["raison"]) == ("veille", "mode hiver : ventilateur retiré")
    m.run_auto()   # rien à arrêter : ne plante pas
    assert m.state["ventilo"]["pourcent"] == 0


def test_hiver_keeps_manual_fan(m):
    auto_on(m, hiver=True)
    m.fan(60, "manuel")
    set_nid(m, 40.0)
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] == 60


@pytest.mark.parametrize("t,erreur,mot", [(None, False, "absent"), (30.0, True, "absent"), (-50.0, False, "aberrante"), (61.0, False, "aberrante")])
def test_auto_blocked_by_bad_sensor(m, t, erreur, mot):
    auto_on(m)
    set_nid(m, t, 10.0)
    if erreur:
        m.state["erreurs"]["bme280"] = "panne"
    m.fan(60, "auto")
    m.run_auto()
    a = m.state["auto"]
    assert a["etat"] == "securite" and mot in a["raison"]
    assert m.state["ventilo"]["pourcent"] == 0 and "sécurité" in m.state["ventilo"]["raison"]


def test_auto_blocked_when_not_running(m):
    auto_on(m)
    set_nid(m, None)
    m.run_auto()
    assert m.state["auto"]["etat"] == "securite" and m.state["ventilo"]["pourcent"] == 0


def test_auto_plausible_bounds_inclusive(m):
    auto_on(m, seuil_marche=45.0)
    for t in (-40.0, 60.0):
        set_nid(m, t, 10.0)
        m.run_auto()
        assert m.state["auto"]["etat"] != "securite"


def test_auto_starts_proportionally(m, capsys):
    auto_on(m)   # seuil 28, vitesse 30..100, plage 5
    set_nid(m, 30.0, 10.0)
    m.run_auto()
    v, a = m.state["ventilo"], m.state["auto"]
    assert (v["pourcent"], v["mode"]) == (58, "auto")      # 30 + 70 * 2/5
    assert a["etat"] == "ventile" and a["raison"] == "nid à 30.0 °C, ventilateur à 58 %"
    assert "Ventilateur : 58 % (auto)" in capsys.readouterr().out   # le démarrage est journalisé
    set_nid(m, 40.0, 20.0)
    m.run_auto()
    assert v["pourcent"] == 100                              # plafonné à vitesse_max
    assert capsys.readouterr().out == ""                    # silencieux quand ça tourne déjà
    set_nid(m, 28.1, 20.0)
    m.run_auto()
    assert v["pourcent"] == round(30 + 70 * 0.1 / 5)


def test_auto_small_change_ignored(m):
    auto_on(m)
    set_nid(m, 30.0, 10.0)
    m.run_auto()
    set_nid(m, 30.2, 10.0)   # 61 % vs 58 : écart < 5
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] == 58
    assert m.state["auto"]["raison"].endswith("ventilateur à 58 %")


def test_auto_speed_range_uses_settings(m):
    auto_on(m, vitesse_min=40.0, vitesse_max=60.0, plage=10.0, seuil_marche=20.0)
    set_nid(m, 25.0, 10.0)
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] == 50
    m.state["auto"]["vitesse_max"] = 10.0   # incohérent : max est relevé au min
    m.fan(0)
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] == 40


def test_auto_stops_below_hysteresis(m):
    auto_on(m)
    set_nid(m, 31.0, 10.0)
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] > 0
    set_nid(m, 26.5, 10.0)          # entre seuil - hyst (26) et seuil : continue
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] > 0
    set_nid(m, 26.0, 10.0)          # <= seuil - hyst : s'arrête
    m.run_auto()
    v, a = m.state["ventilo"], m.state["auto"]
    assert v["pourcent"] == 0 and a["etat"] == "veille"
    assert a["raison"] == "nid à 26.0 °C, sous le seuil de 28.0 °C"


def test_auto_stops_when_outside_is_warmer(m):
    auto_on(m)
    set_nid(m, 31.0, 20.0)
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] > 0
    set_nid(m, 30.0, 29.6)          # nid <= dehors + 0,5
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] == 0
    assert "plus plus chaud que dehors" in m.state["ventilo"]["raison"]
    assert m.state["auto"]["etat"] == "veille" and "dehors est plus chaud (29.6 °C)" in m.state["auto"]["raison"]


def test_auto_waits_when_difference_too_small(m):
    auto_on(m)
    set_nid(m, 30.0, 29.0)          # chaud mais seulement 1 °C de plus que dehors (ecart_ext = 2)
    m.run_auto()
    a = m.state["auto"]
    assert m.state["ventilo"]["pourcent"] == 0 and a["etat"] == "veille"
    assert a["raison"] == "nid à 30.0 °C, seulement 1.0 °C de plus que dehors (écart minimal 2.0 °C)"
    set_nid(m, 31.5, 29.0)          # 2,5 °C de plus : démarre
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] > 0


def test_auto_does_not_start_without_outside_probe(m):
    """Température de dehors inconnue : sécurité, l'automatique ne démarre pas, même si le nid est très chaud."""
    auto_on(m)
    set_nid(m, 40.0, None)
    m.run_auto()
    a = m.state["auto"]
    assert m.state["ventilo"]["pourcent"] == 0 and a["etat"] == "securite"
    assert "sonde extérieure absente ou muette" in a["raison"] and "ne démarre pas" in a["raison"]
    assert "extérieure" in a["avertissements"][0]


def test_auto_keeps_running_if_probe_is_lost_then_stops_when_cool(m):
    auto_on(m)
    set_nid(m, 31.0, 20.0)
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] > 0
    set_nid(m, 31.0, None)          # sonde muette : il continue, on ne coupe pas d'un coup
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] > 0 and m.state["auto"]["etat"] == "ventile"
    set_nid(m, 25.0, None)          # nid frais : il s'arrête
    m.run_auto()
    assert m.state["ventilo"]["pourcent"] == 0


def test_heat_alert_independent_of_probe(m, monkeypatch):
    monkeypatch.setattr(m, "notify", lambda t, msg: None)
    set_nid(m, 36.0, None)
    m.check_alert()
    assert "alerte_chaleur" in m.state["erreurs"]


def test_auto_takes_over_a_manual_fan_when_hot(m):
    auto_on(m)
    m.fan(80, "manuel")
    set_nid(m, 33.0, 10.0)
    m.run_auto()
    assert m.state["ventilo"]["mode"] == "auto"


# ------------------------------------------------------------------ caméras et LED
def test_camera_mock_toggle(m, capsys):
    m.camera(0, False)
    assert m.state["cam1"] is False and "Caméra 1 : éteinte" in capsys.readouterr().out
    m.camera(1, True)
    assert m.state["cam2"] is True and "Caméra 2 : allumée" in capsys.readouterr().out


def test_camera_controls_real_recorder(load):
    m = load(mock=False, hw=True)
    cam = m.camera_devices[0][0]
    m.camera(0, False)
    m.camera(0, True)
    assert cam.calls[-2:] == ["stop", "start"] and m.state["cam1"] is True
    cam.boom = True
    m.camera(0, False)
    assert m.state["erreurs"]["camera1"] == "commande de la caméra 1 : stop"
    m.camera(0, True)
    assert m.state["erreurs"]["camera1"] == "commande de la caméra 1 : start"


def test_leds(m, capsys):
    m.leds()
    assert m.state["led_nid"] is False and m.led_nest.value == 0
    m.leds(nest=True)
    assert m.state["led_nid"] is True and m.led_nest.value == 1 and m.state["led_ext"] is False and m.led_outside.value == 0
    m.leds(outside=1)
    assert m.state["led_ext"] is True and m.led_outside.value == 1
    m.leds(nest=False, outside=False)
    assert not m.state["led_nid"] and not m.state["led_ext"] and m.led_nest.value == 0
    assert "LED du nid : éteintes" in capsys.readouterr().out


def test_leds_without_gpio(m):
    m.LED_OK = False
    m.led_nest.value = m.led_outside.value = "intact"
    m.leds(True, True)
    assert m.state["led_nid"] and m.state["led_ext"] and m.led_nest.value == "intact" and m.led_outside.value == "intact"


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
    m.notify("titre", "msg")
    m.NTFY_TOPIC = "sujet"       # topic mais mode simulé
    m.notify("titre", "msg")
    assert calls == [] and "NOTIFICATION : titre — msg" in capsys.readouterr().out


def test_notifier_sends_ntfy(m, monkeypatch):
    calls = fake_urlopen(m, monkeypatch)
    m.MOCK, m.NTFY_TOPIC = False, "sujet"
    m.notify("alerte chaleur é", "il fait chaud")
    (req, timeout), = calls
    assert req.full_url == "https://ntfy.sh/sujet" and req.data == "il fait chaud".encode()
    assert req.get_header("Title") == "Nichoir alerte chaleur " and timeout == 8


def test_notifier_failure_is_logged(m, monkeypatch, capsys):
    fake_urlopen(m, monkeypatch, fail=True)
    m.MOCK, m.NTFY_TOPIC = False, "sujet"
    m.notify("t", "m")
    assert "notification non envoyée : réseau" in capsys.readouterr().out


def test_heat_alert_lifecycle(m, monkeypatch):
    sent = []
    monkeypatch.setattr(m, "notify", lambda t, msg: sent.append((t, msg)))
    m.time.now = 10000.0
    set_nid(m, 36.0)
    m.check_alert()
    assert m.state["erreurs"]["alerte_chaleur"] == "ALERTE : le nid est à 36.0 °C (> 35.0 °C)" and len(sent) == 1
    m.time.now += 100
    m.check_alert()                       # moins d'une heure : pas de nouvelle notification
    assert len(sent) == 1
    m.time.now += 3600
    m.check_alert()
    assert len(sent) == 2
    set_nid(m, 34.5)                          # entre seuil - 1 et seuil : l'alerte reste affichée
    m.check_alert()
    assert "alerte_chaleur" in m.state["erreurs"]
    set_nid(m, 33.9)
    m.check_alert()
    assert "alerte_chaleur" not in m.state["erreurs"]
    set_nid(m, 36.0)
    m.time.now += 5000
    m.check_alert()
    assert len(sent) == 3
    set_nid(m, None)                          # capteur muet : alerte levée
    m.check_alert()
    assert "alerte_chaleur" not in m.state["erreurs"]


def test_alert_exactly_at_threshold_is_not_alert(m):
    set_nid(m, 35.0)
    m.check_alert()
    assert "alerte_chaleur" not in m.state["erreurs"]


def test_fan_failure_detection(m, monkeypatch):
    sent = []
    monkeypatch.setattr(m, "notify", lambda t, msg: sent.append(t))
    m.time.now = 10000.0
    m.fan(60)
    v = m.state["ventilo"]
    v["rpm"] = 0
    m.time.now += 5
    m.check_fan()
    assert "ventilo" not in m.state["erreurs"]            # pas encore 10 s
    m.time.now += 6
    m.check_fan()
    assert "ne tourne pas" in m.state["erreurs"]["ventilo"] and sent == ["panne ventilateur"]
    m.check_fan()
    assert sent == ["panne ventilateur"]                  # une notification par heure
    m.time.now += 3601
    m.check_fan()
    assert len(sent) == 2
    v["rpm"] = 1200
    m.check_fan()
    assert "ventilo" not in m.state["erreurs"]


@pytest.mark.parametrize("cas", ["tacho_jamais_vu", "rpm_none", "arrete"])
def test_fan_failure_not_reported_when(m, cas):
    m.fan(60)
    m.time.now += 60
    m.state["ventilo"]["rpm"] = 0
    if cas == "tacho_jamais_vu":
        m._fan["tacho_vu"] = False
    elif cas == "rpm_none":
        m.state["ventilo"]["rpm"] = None
    else:
        m.fan(0)
    m.check_fan()
    assert "ventilo" not in m.state["erreurs"]


# ------------------------------------------------------------------ sonde extérieure DS18B20
def sonde(m, tmp_path, contenu, nom="28-0123456789ab"):
    """Pose un faux fichier w1_slave dans un faux /sys/bus/w1/devices."""
    m.W1_DIR = str(tmp_path / "w1")
    d = tmp_path / "w1" / nom
    d.mkdir(parents=True, exist_ok=True)
    (d / "w1_slave").write_bytes(contenu if isinstance(contenu, bytes) else contenu.encode("ascii"))


BON = "4b 01 4b 46 7f ff 0c 10 d1 : crc=d1 YES\n4b 01 4b 46 7f ff 0c 10 d1 t=%d\n"


@pytest.mark.parametrize("milli,attendu", [(21437, 21.4), (-5125, -5.1), (0, 0.0), (-40000, -40.0), (60000, 60.0)])
def test_probe_reading_ok(load, tmp_path, milli, attendu):
    m = load(mock=False)
    sonde(m, tmp_path, BON % milli)
    assert m.read_outside_probe() == (attendu, None)
    m.state["erreurs"]["sonde_ext"] = "ancienne"
    m.update_outside_probe()
    assert m.state["ext"] == {"t": attendu, "source": "DS18B20", "maj": m.state["ext"]["maj"]} and m.state["ext"]["maj"]
    assert "sonde_ext" not in m.state["erreurs"]


def test_probe_absent(load, tmp_path, capsys):
    m = load(mock=False)
    m.W1_DIR = str(tmp_path / "rien")
    t, error = m.read_outside_probe()
    assert t is None and "sonde extérieure absente" in error
    m.update_outside_probe()
    assert m.state["ext"]["t"] is None and m.state["erreurs"]["sonde_ext"] == error
    assert "! sonde extérieure absente" in capsys.readouterr().out
    m.update_outside_probe()                                   # même erreur : une seule ligne de journal
    assert capsys.readouterr().out == ""


def test_probe_silent_after_working(load, tmp_path):
    m = load(mock=False)
    sonde(m, tmp_path, BON % 12000)
    m.update_outside_probe()
    assert m.state["ext"]["t"] == 12.0
    (tmp_path / "w1" / "28-0123456789ab" / "w1_slave").unlink()
    (tmp_path / "w1" / "28-0123456789ab" / "w1_slave").mkdir()   # lecture impossible (c'est un dossier)
    m.update_outside_probe()
    assert m.state["ext"]["t"] is None and m.state["ext"]["source"] is None and "lecture de la sonde extérieure" in m.state["erreurs"]["sonde_ext"]


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
    t, error = m.read_outside_probe()
    assert t is None and mot in error
    m.update_outside_probe()
    assert m.state["ext"]["t"] is None and mot in m.state["erreurs"]["sonde_ext"]


def test_probe_not_read_in_mock(m, tmp_path):
    sonde(m, tmp_path, BON % 5000)
    m.update_outside_probe()
    assert m.state["ext"]["t"] is None


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
    m.simulate()
    assert m.state["ext"]["t"] == 16.0
    assert m.state["ext"]["source"] == "simulée" and "sonde_ext" not in m.state["erreurs"]
    assert m.state["t_nid"] == pytest.approx(16 + 3.05, abs=0.06)
    m.time.hour = 3
    m.simulate()
    assert m.state["ext"]["t"] == 9.0


def test_simulation_night_override(calm):
    m = calm
    m.time.hour = 12
    m.MOCK_NIGHT = True
    m.simulate()
    assert m.state["ext"]["t"] == 9.0
    m.time.hour = 3
    m.MOCK_NIGHT = False
    m.simulate()
    assert m.state["ext"]["t"] == 16.0


def test_simulation_forced_temperatures(calm):
    m = calm
    m.MOCK_FORCE["ext"] = 5.0
    m.MOCK_FORCE["nid"] = 40.0
    m.simulate()
    assert m.state["ext"]["t"] == 5.0 and m.state["t_nid"] == pytest.approx(40.0, abs=0.1)


def test_simulation_fan_cools_the_nest(calm):
    m = calm
    m.MOCK_FORCE["nid"] = 30.0
    m.state["ventilo"]["pourcent"] = 100
    for _ in range(200):
        m.simulate()
    assert m.state["t_nid"] == pytest.approx(27.0, abs=0.1)


def test_simulation_bme_failure_and_recovery(calm):
    m = calm
    m.MOCK_FAULTS["bme"] = True
    m.simulate()
    assert m.state["t_nid"] is None and m.state["hum_nid"] is None and "bme280" in m.state["erreurs"]
    m.MOCK_FAULTS["bme"] = False
    m.simulate()
    assert m.state["t_nid"] is not None and "bme280" not in m.state["erreurs"]


def test_simulation_probe_failure_and_recovery(calm):
    m = calm
    m.MOCK_FAULTS["sonde"] = True
    m.simulate()
    assert m.state["ext"] == {"t": None, "source": None, "maj": None} and "sonde_ext" in m.state["erreurs"]
    assert m.state["t_nid"] == pytest.approx(16 + 3.1, abs=0.1)   # le nid simulé suit toujours la température de dehors simulée
    m.MOCK_FAULTS["sonde"] = False
    m.simulate()
    assert m.state["ext"]["t"] == 16.0 and "sonde_ext" not in m.state["erreurs"]


def test_fake_stream_png(m):
    stream = m.cameras[0]
    png = stream.image(0, w=40, h=30)
    assert png[:8] == bytes((137, 80, 78, 71, 13, 10, 26, 10))
    assert png[12:16] == b"IHDR" and struct.unpack(">II", png[16:24]) == (40, 30)
    idat = png.index(b"IDAT")
    n, = struct.unpack(">I", png[idat - 4:idat])
    assert len(zlib.decompress(png[idat + 4:idat + 4 + n])) == 30 * (1 + 3 * 40)
    assert png.endswith(m._png_chunk(b"IEND", b""))
    assert stream.image(0, 40, 30) != stream.image(5, 40, 30)   # image animée


def test_fake_stream_loop(m):
    stream = m.cameras[1]

    def stop(s):
        raise StopLoop
    m.time.sleep = stop
    with pytest.raises(StopLoop):
        stream.run()
    assert stream.frame.startswith(b"\x89PNG")


# ------------------------------------------------------------------ réglages sur disque
def test_reglages_roundtrip(m):
    a = m.state["auto"]
    a.update(actif=True, hiver=True, seuil_marche=30.0, vitesse_min=50.0)
    m.save_settings()
    with open(m.SETTINGS_FILE, encoding="utf-8") as f:
        saved = json.load(f)
    assert set(saved) == set(m.AUTO_DEFAULTS) and saved["seuil_marche"] == 30.0
    a.update(actif=False, hiver=False, seuil_marche=28.0, vitesse_min=30.0)
    m.load_settings()
    assert (a["actif"], a["hiver"], a["seuil_marche"], a["vitesse_min"]) == (True, True, 30.0, 50.0)


def test_reglages_missing_file_keeps_defaults(m):
    m.load_settings()
    assert {k: m.state["auto"][k] for k in m.AUTO_DEFAULTS} == m.AUTO_DEFAULTS


def write(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def test_reglages_clamped_and_old_key(m):
    write(m.SETTINGS_FILE, json.dumps({"seuil_marche": 99, "ecart_ext": -3, "vitesse_min": 80, "vitesse_max": 40, "bouche": True, "actif": 1}))
    m.load_settings()
    a = m.state["auto"]
    assert (a["seuil_marche"], a["ecart_ext"], a["vitesse_min"]) == (45.0, 0.0, 80.0)
    assert a["vitesse_max"] == 80.0       # relevé au minimum
    assert a["hiver"] is True and a["actif"] is True


def test_reglages_hiver_beats_bouche(m):
    write(m.SETTINGS_FILE, json.dumps({"hiver": False, "bouche": True}))
    m.state["auto"]["hiver"] = True
    m.load_settings()
    assert m.state["auto"]["hiver"] is False and m.state["auto"]["actif"] is False


@pytest.mark.parametrize("contenu", ["pas du json", json.dumps({"seuil_marche": "x"}), json.dumps([1, 2])])
def test_reglages_corrupted_file_ignored(m, contenu):
    write(m.SETTINGS_FILE, contenu)
    m.load_settings()      # ne lève pas
    assert m.state["auto"]["actif"] is False


def test_reglages_save_failure_is_silent(m, tmp_path):
    m.SETTINGS_FILE = str(tmp_path / "absent" / "reglages.json")
    m.save_settings()
    assert not (tmp_path / "absent").exists()


# ------------------------------------------------------------------ historique
def lire(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def test_history_sampling_and_saving(m):
    m.state.update(t_nid=21.0, hum_nid=60.0)
    m.state["ext"]["t"] = 15.0
    m.fan(50)
    m.record_history()
    assert m.history == [{"t": m.history[0]["t"], "nid": 21.0, "ext": 15.0, "hum": 60.0, "ventilo": 50}]
    assert len(m.history[0]["t"]) == 5 and m.history[0]["t"][2] == ":"
    assert lire(m.HISTORY_FILE) == m.history
    m.time.now += 4
    m.record_history()
    assert len(m.history) == 1                  # moins de HISTORY_PERIOD (5 s)
    m.time.now += 2
    m.state["t_nid"] = 22.0
    m.record_history()
    assert len(m.history) == 2
    assert len(lire(m.HISTORY_FILE)) == 1         # sauvegarde au plus une fois par minute
    m.time.now += 60
    m.record_history()
    assert len(lire(m.HISTORY_FILE)) == 3


def test_history_keeps_288_points(m):
    for i in range(300):
        m.time.now += 10
        m.state["t_nid"] = float(i)
        m.record_history()
    assert len(m.history) == m.HISTORY_MAX == 288
    assert m.history[0]["nid"] == 12.0 and m.history[-1]["nid"] == 299.0


def test_history_real_period_is_five_minutes(load):
    m = load(mock=False)
    m.record_history()
    m.time.now += 299
    m.record_history()
    assert len(m.history) == 1
    m.time.now += 2
    m.record_history()
    assert len(m.history) == 2


def test_history_reload(m):
    pts = [{"t": "10:00", "nid": 1}] + ["junk", {"pas_de_t": 1}, 3] + [{"t": f"{i}", "nid": i} for i in range(400)]
    write(m.HISTORY_FILE, json.dumps(pts))
    m.load_history()
    assert len(m.history) == 288 and m.history[-1] == {"t": "399", "nid": 399}
    assert all(isinstance(p, dict) and "t" in p for p in m.history)


def test_history_reload_missing_or_corrupt(m):
    m.history.append({"t": "00:00"})
    m.load_history()
    assert m.history == [{"t": "00:00"}]
    write(m.HISTORY_FILE, "{{{")
    m.load_history()
    assert m.history == [{"t": "00:00"}]


def test_history_save_failure_is_silent(m, tmp_path):
    m.HISTORY_FILE = str(tmp_path / "absent" / "h.json")
    m.history.append({"t": "x"})
    m.save_history()
    assert not (tmp_path / "absent").exists()


def test_lecture_full_mock_cycle(m, capsys):
    m.read_sensors()
    assert m.state["derniere_lecture"] and len(m.history) == 1 and m.state["conso"]["total_w"] > 0
    assert "nid" in capsys.readouterr().out and m._read_count[0] == 1
