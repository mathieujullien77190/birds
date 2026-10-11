"""Chargement du module : matériel présent, absent, en panne ; mode simulé ; lecture réelle des capteurs."""
import pytest

from conftest import StopLoop


def test_all_hardware_ok(load):
    m = load(mock=False, hw=True)
    assert (m.LED_OK, m.VENT_OK, m.TACHO_OK, m.BME_OK, m.BAT_OK) == (True,) * 5
    assert m.etat["erreurs"] == {}
    assert m.ventilo_pwm.frequency == 25000
    assert set(m.cameras) == {0, 1} and set(m.capteurs_cam) == {0, 1}
    assert m.capteurs_cam[0][0].calls == ["configure", "start"]
    assert not m.MOCK and m.HISTO_PERIODE == 300 and m.FICHIER_HISTO.endswith("historique.json")
    assert m.tacho.when_activated is m._impulsion
    m._impulsion(); m._impulsion()
    assert m._vent["n"] == 2
    flux = m.cameras[0]
    assert flux.frame is None
    flux.write(b"jpeg")
    assert flux.frame == b"jpeg"


def test_pwm_falls_back_to_10khz(load):
    m = load(mock=False, hw=True, pwm="fb")
    assert m.VENT_OK and m.ventilo_pwm.frequency == 10000
    assert "10 kHz" in m.etat["erreurs"]["ventilo_pwm"]


def test_pwm_unavailable(load):
    m = load(mock=False, hw=True, pwm="fail")
    assert not m.VENT_OK
    assert "GPIO18" in m.etat["erreurs"]["ventilo_gpio"]


def test_gpio_and_tacho_failures(load):
    m = load(mock=False, hw=True, gpio="fail", tacho="fail", bme="calfail", ina="fail")
    assert not (m.LED_OK or m.TACHO_OK or m.BME_OK or m.BAT_OK)
    assert m.VENT_OK   # le PWM fonctionne même sans l'interrupteur
    for k in ("gpio", "tachymetre", "bme280", "batterie"):
        assert k in m.etat["erreurs"]


def test_nothing_installed(load):
    m = load(mock=False)
    assert set(m.etat["erreurs"]) == {"gpio", "ventilo_gpio", "tachymetre", "bme280", "batterie", "picamera2"}
    assert m.cameras == {} and not m.BME_OK


def test_one_camera_missing(load):
    m = load(mock=False, hw=True, cam_fail=(0,))
    assert "caméra 1 indisponible" in m.etat["erreurs"]["camera1"]
    assert set(m.cameras) == {1} and "camera2" not in m.etat["erreurs"]


@pytest.mark.parametrize("argv,env", [(None, True), (["nichoir.py", "--mock"], False)])
def test_mock_mode_switches(load, argv, env):
    m = load(mock=env, argv=argv)
    assert m.MOCK and m.HISTO_PERIODE == 5 and m.PERIODE == 1.0
    assert m.FICHIER_HISTO.endswith("historique.json")   # chemin re-patché par la fixture
    assert list(m.etat["erreurs"]) == ["mock"]
    assert m.LED_OK and m.VENT_OK and m.TACHO_OK and m.BME_OK and m.BAT_OK
    assert m._vent["tacho_vu"] is True
    assert set(m.cameras) == {0, 1} and m.cameras[0].mime == "image/png"


def test_mock_history_filename_at_import(monkeypatch, tmp_path):
    import importlib.util, sys
    from conftest import PI
    monkeypatch.setenv("NICHOIR_MOCK", "1")
    monkeypatch.setattr(sys, "argv", ["x"])
    monkeypatch.setattr("atexit.register", lambda f: f)
    for n in ("gpiozero", "bme280", "smbus2", "ina219", "picamera2", "picamera2.encoders", "picamera2.outputs"):
        monkeypatch.setitem(sys.modules, n, None)
    spec = importlib.util.spec_from_file_location("nichoir", PI / "nichoir.py")
    mod = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "nichoir", mod)
    spec.loader.exec_module(mod)
    assert mod.FICHIER_HISTO.endswith("historique-simule.json")


def test_log_prints_timestamped_line(m, capsys):
    m.log("bonjour")
    assert capsys.readouterr().out.strip().endswith("] bonjour")


# ------------------------------------------------------------------ lecture réelle (hors simulation)
def test_lecture_bme_ok_and_error(load):
    m = load(mock=False, hw=True)
    m.etat["erreurs"]["bme280"] = "ancienne"
    m.lecture()
    assert (m.etat["t_nid"], m.etat["hum_nid"]) == (21.3, 55.0)
    assert "bme280" not in m.etat["erreurs"]

    def boom(*a):
        raise OSError("bus")
    m.bme280.sample = boom
    m.lecture()
    assert m.etat["erreurs"]["bme280"] == "lecture du capteur du nid : bus"
    assert m.etat["t_nid"] == 21.3   # gardée


def test_lecture_battery_ok_and_error(load):
    m = load(mock=False, hw=True)
    m.lecture()
    assert m.etat["batterie"] == {"pourcent": 70.0, "tension": 13.1, "source": "mesurée"}
    m.ina_bat.voltage = lambda: 1 / 0
    m.lecture()
    assert "lecture de la batterie" in m.etat["erreurs"]["batterie"]
    m.ina_bat.voltage = lambda: 13.1
    m.lecture()
    assert "batterie" not in m.etat["erreurs"]


def test_lecture_without_any_hardware(load, capsys):
    m = load(mock=False)
    m.ventilo(60)
    m.lecture()
    assert m.etat["t_nid"] is None and m.etat["batterie"]["pourcent"] is None
    assert m.etat["ventilo"]["rpm"] is None
    out = capsys.readouterr().out
    assert "ventilateur 60 %" in out and "tr/min" not in out and "batterie" not in out
    assert m.etat["derniere_lecture"] and m._lectures[0] == 1


def test_log_situation_only_every_10_readings(load, capsys):
    m = load(mock=False, hw=True)
    m.lecture()
    capsys.readouterr()
    for _ in range(9):
        m.lecture()
    assert capsys.readouterr().out == ""
    m.lecture()   # 11e : _lectures = 11 -> 11 % 10 == 1
    assert "nid 21.3 °C" in capsys.readouterr().out


def test_log_with_rpm_and_battery(load, capsys):
    m = load(mock=False, hw=True)
    m.ventilo(60)
    m.etat["ventilo"]["rpm"] = 1500
    m.mesurer_ventilo = lambda: None   # garde le rpm choisi
    m.lecture()
    out = capsys.readouterr().out
    assert "ventilateur 60 % (1500 tr/min)" in out and "batterie 70.0 %" in out and "conso" in out


def test_boucle_runs_lecture_then_sleeps(m):
    calls = []
    m.lecture = lambda: calls.append(1)

    def sleep(s):
        m.time.sleeps.append(s)
        if len(m.time.sleeps) == 3:
            raise StopLoop
    m.time.sleep = sleep
    with pytest.raises(StopLoop):
        m.boucle()
    assert len(calls) == 3 and m.time.sleeps == [m.PERIODE] * 3


# ------------------------------------------------------------------ tachymètre
def test_mesurer_ventilo_mock(m):
    v = m.etat["ventilo"]
    m.mesurer_ventilo()
    assert v["rpm"] == 0   # arrêté
    m.ventilo(50)
    m.mesurer_ventilo()
    assert v["rpm"] == round(300 + 27 * 50)
    m.MOCK_PANNES["ventilo"] = True
    m.mesurer_ventilo()
    assert v["rpm"] == 0


def test_mesurer_ventilo_without_tacho(m):
    m.MOCK = False
    m.TACHO_OK = False
    m.etat["ventilo"]["rpm"] = 99
    m.mesurer_ventilo()
    assert m.etat["ventilo"]["rpm"] is None


def test_mesurer_ventilo_real_window(load):
    m = load(mock=False, hw=True)
    v = m.etat["ventilo"]
    m.mesurer_ventilo()                       # t = 1000, aucun écart
    assert v["rpm"] is None and m._vent["tacho_vu"] is False
    m._vent["n"] = 60
    m.time.now = 1004.0
    m.mesurer_ventilo()                       # 60 impulsions en 4 s = 30 tours / 4 s
    assert v["rpm"] == 450 and m._vent["tacho_vu"] is True
    m.time.now = 1002.0
    m._vent["echantillons"][:] = [(1000.0, 0), (1001.0, 0)]
    m.mesurer_ventilo()                       # < 3 s depuis le plus ancien : rpm inchangé
    assert v["rpm"] == 450
    m._vent["echantillons"][:] = [(1000.0, 0), (1010.0, 60)]
    m.time.now = 1020.0
    m._vent["n"] = 180
    m.mesurer_ventilo()                       # l'échantillon de 20 s est jeté, la fenêtre part de t = 1010
    assert m._vent["echantillons"][0] == (1010.0, 60)
    assert v["rpm"] == 360
