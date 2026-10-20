"""Chargement du module : matériel présent, absent, en panne ; mode simulé ; lecture réelle des capteurs."""
import pytest

from conftest import StopLoop


def test_all_hardware_ok(load):
    m = load(mock=False, hw=True)
    assert (m.LED_OK, m.FAN_OK, m.TACH_OK, m.BME_OK) == (True,) * 4
    assert m.state["erreurs"] == {}
    assert m.fan_pwm.frequency == 25000
    assert set(m.cameras) == {0, 1} and set(m.camera_devices) == {0, 1}
    assert m.camera_devices[0][0].calls == ["configure", "start"]
    assert not m.MOCK and m.HISTORY_PERIOD == 300 and m.HISTORY_FILE.endswith("historique.json")
    assert m.tach.when_activated is m._pulse
    m._pulse(); m._pulse()
    assert m._fan["n"] == 2
    stream = m.cameras[0]
    assert stream.frame is None
    stream.write(b"jpeg")
    assert stream.frame == b"jpeg"


def test_pwm_falls_back_to_10khz(load):
    m = load(mock=False, hw=True, pwm="fb")
    assert m.FAN_OK and m.fan_pwm.frequency == 10000
    assert "10 kHz" in m.state["erreurs"]["ventilo_pwm"]


def test_pwm_unavailable(load):
    m = load(mock=False, hw=True, pwm="fail")
    assert not m.FAN_OK
    assert "GPIO18" in m.state["erreurs"]["ventilo_gpio"]


def test_gpio_and_tacho_failures(load):
    m = load(mock=False, hw=True, gpio="fail", tacho="fail", bme="calfail")
    assert not (m.LED_OK or m.TACH_OK or m.BME_OK)
    assert m.FAN_OK   # le PWM fonctionne même sans l'interrupteur
    for k in ("gpio", "tachymetre", "bme280"):
        assert k in m.state["erreurs"]


def test_nothing_installed(load):
    m = load(mock=False)
    assert set(m.state["erreurs"]) == {"gpio", "ventilo_gpio", "tachymetre", "bme280", "picamera2"}
    assert m.cameras == {} and not m.BME_OK


def test_one_camera_missing(load):
    m = load(mock=False, hw=True, cam_fail=(0,))
    assert "caméra 1 indisponible" in m.state["erreurs"]["camera1"]
    assert set(m.cameras) == {1} and "camera2" not in m.state["erreurs"]


@pytest.mark.parametrize("argv,env", [(None, True), (["nichoir.py", "--mock"], False)])
def test_mock_mode_switches(load, argv, env):
    m = load(mock=env, argv=argv)
    assert m.MOCK and m.HISTORY_PERIOD == 5 and m.PERIOD == 1.0
    assert m.HISTORY_FILE.endswith("historique.json")   # chemin re-patché par la fixture
    assert list(m.state["erreurs"]) == ["mock"]
    assert m.LED_OK and m.FAN_OK and m.TACH_OK and m.BME_OK
    assert m._fan["tacho_vu"] is True
    assert set(m.cameras) == {0, 1} and m.cameras[0].mime == "image/png"


def test_mock_history_filename_at_import(monkeypatch, tmp_path):
    import importlib.util, sys
    from conftest import PI
    monkeypatch.setenv("NICHOIR_MOCK", "1")
    monkeypatch.setattr(sys, "argv", ["x"])
    monkeypatch.setattr("atexit.register", lambda f: f)
    for n in ("gpiozero", "bme280", "smbus2", "picamera2", "picamera2.encoders", "picamera2.outputs"):
        monkeypatch.setitem(sys.modules, n, None)
    spec = importlib.util.spec_from_file_location("nichoir", PI / "nichoir" / "__init__.py", submodule_search_locations=[str(PI / "nichoir")])
    mod = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "nichoir", mod)
    spec.loader.exec_module(mod)
    assert mod.HISTORY_FILE.endswith("historique-simule.json")


def test_log_prints_timestamped_line(m, capsys):
    m.log("bonjour")
    assert capsys.readouterr().out.strip().endswith("] bonjour")


# ------------------------------------------------------------------ lecture réelle (hors simulation)
def test_lecture_bme_ok_and_error(load):
    m = load(mock=False, hw=True)
    m.state["erreurs"]["bme280"] = "ancienne"
    m.read_sensors()
    assert (m.state["t_nid"], m.state["hum_nid"]) == (21.3, 55.0)
    assert "bme280" not in m.state["erreurs"]

    def boom(*a):
        raise OSError("bus")
    m.bme280.sample = boom
    m.read_sensors()
    assert m.state["erreurs"]["bme280"] == "lecture du capteur du nid : bus"
    assert m.state["t_nid"] == 21.3   # gardée


def test_lecture_without_any_hardware(load, capsys):
    m = load(mock=False)
    m.fan(60)
    m.read_sensors()
    assert m.state["t_nid"] is None
    assert m.state["ventilo"]["rpm"] is None
    out = capsys.readouterr().out
    assert "ventilateur 60 %" in out and "tr/min" not in out
    assert m.state["derniere_lecture"] and m._read_count[0] == 1


def test_log_situation_only_every_10_readings(load, capsys):
    m = load(mock=False, hw=True)
    m.read_sensors()
    capsys.readouterr()
    for _ in range(9):
        m.read_sensors()
    assert capsys.readouterr().out == ""
    m.read_sensors()   # 11e : _lectures = 11 -> 11 % 10 == 1
    assert "nid 21.3 °C" in capsys.readouterr().out


def test_log_with_rpm(load, capsys):
    m = load(mock=False, hw=True)
    m.fan(60)
    m.state["ventilo"]["rpm"] = 1500
    m.measure_fan = lambda: None   # garde le rpm choisi
    m.read_sensors()
    out = capsys.readouterr().out
    assert "ventilateur 60 % (1500 tr/min)" in out and "conso" in out


def test_boucle_runs_lecture_then_sleeps(m):
    calls = []
    m.read_sensors = lambda: calls.append(1)

    def sleep(s):
        m.time.sleeps.append(s)
        if len(m.time.sleeps) == 3:
            raise StopLoop
    m.time.sleep = sleep
    with pytest.raises(StopLoop):
        m.loop()
    assert len(calls) == 3 and m.time.sleeps == [m.PERIOD] * 3


# ------------------------------------------------------------------ tachymètre
def test_mesurer_ventilo_mock(m):
    v = m.state["ventilo"]
    m.measure_fan()
    assert v["rpm"] == 0   # arrêté
    m.fan(50)
    m.measure_fan()
    assert v["rpm"] == round(300 + 27 * 50)
    m.MOCK_FAULTS["ventilo"] = True
    m.measure_fan()
    assert v["rpm"] == 0


def test_mesurer_ventilo_without_tacho(m):
    m.MOCK = False
    m.TACH_OK = False
    m.state["ventilo"]["rpm"] = 99
    m.measure_fan()
    assert m.state["ventilo"]["rpm"] is None


def test_mesurer_ventilo_real_window(load):
    m = load(mock=False, hw=True)
    v = m.state["ventilo"]
    m.measure_fan()                       # t = 1000, aucun écart
    assert v["rpm"] is None and m._fan["tacho_vu"] is False
    m._fan["n"] = 60
    m.time.now = 1004.0
    m.measure_fan()                       # 60 impulsions en 4 s = 30 tours / 4 s
    assert v["rpm"] == 450 and m._fan["tacho_vu"] is True
    m.time.now = 1002.0
    m._fan["echantillons"][:] = [(1000.0, 0), (1001.0, 0)]
    m.measure_fan()                       # < 3 s depuis le plus ancien : rpm inchangé
    assert v["rpm"] == 450
    m._fan["echantillons"][:] = [(1000.0, 0), (1010.0, 60)]
    m.time.now = 1020.0
    m._fan["n"] = 180
    m.measure_fan()                       # l'échantillon de 20 s est jeté, la fenêtre part de t = 1010
    assert m._fan["echantillons"][0] == (1010.0, 60)
    assert v["rpm"] == 360
