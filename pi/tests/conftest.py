"""Outils communs : charge pi/nichoir.py à neuf (mode simulé ou « vrai » avec matériel factice), horloge contrôlée."""
import importlib.util
import itertools
import sys
import time as _real_time
import types
from pathlib import Path

import pytest

PI = Path(__file__).resolve().parent.parent
_n = itertools.count()


class FakeTime:
    """Remplace le module `time` vu par nichoir : horloge réglable, sleep enregistré (jamais d'attente réelle)."""
    def __init__(self):
        self.now = 1000.0
        self.hour = 12
        self.sleeps = []

    def time(self):
        return self.now

    def sleep(self, s):
        self.sleeps.append(s)

    def strftime(self, fmt, *a):
        return _real_time.strftime(fmt, *a)

    def localtime(self, *a):
        return types.SimpleNamespace(tm_hour=self.hour)


class StopLoop(Exception):
    pass


def _gpiozero(o):
    m = types.ModuleType("gpiozero")

    class DigitalOutputDevice:
        def __init__(self, pin):
            if o.get("gpio") == "fail":
                raise RuntimeError("pas de GPIO")
            self.pin, self.value = pin, 0

    class PWMOutputDevice:
        def __init__(self, pin, frequency=100):
            mode = o.get("pwm", "ok")
            if mode == "fail" or (mode == "fb" and frequency == 25000):
                raise RuntimeError("PWM refuse")
            self.pin, self.frequency, self.value = pin, frequency, 0

    class DigitalInputDevice:
        def __init__(self, pin, pull_up=None):
            if o.get("tacho") == "fail":
                raise RuntimeError("pas de tacho")
            self.when_activated = None

    m.DigitalOutputDevice, m.PWMOutputDevice, m.DigitalInputDevice = DigitalOutputDevice, PWMOutputDevice, DigitalInputDevice
    return m


def _bme(o):
    m = types.ModuleType("bme280")

    def load_calibration_params(bus, addr):
        if o.get("bme") == "calfail":
            raise RuntimeError("calibration")
        return "cal"

    m.load_calibration_params = load_calibration_params
    m.sample = lambda bus, addr, cal: types.SimpleNamespace(temperature=21.34, humidity=55.4)
    s = types.ModuleType("smbus2")
    s.SMBus = lambda n: f"bus{n}"
    return m, s


def _ina(o):
    m = types.ModuleType("ina219")

    class INA219:
        def __init__(self, shunt, maxa, address=0):
            self.address = address

        def configure(self):
            if o.get("ina") == "fail":
                raise RuntimeError("ina absent")

        def voltage(self):
            return 13.1

    m.INA219 = INA219
    return m


def _picam(o):
    m = types.ModuleType("picamera2")
    enc = types.ModuleType("picamera2.encoders")
    out = types.ModuleType("picamera2.outputs")

    class Picamera2:
        def __init__(self, num):
            if num in o.get("cam_fail", ()):
                raise RuntimeError(f"cam {num} absente")
            self.num, self.calls, self.boom = num, [], False

        def create_video_configuration(self, main=None):
            return {"main": main}

        def configure(self, c):
            self.calls.append("configure")

        def start_recording(self, e, f):
            if self.boom:
                raise RuntimeError("start")
            self.calls.append("start")

        def stop_recording(self):
            if self.boom:
                raise RuntimeError("stop")
            self.calls.append("stop")

    m.Picamera2 = Picamera2
    enc.MJPEGEncoder = lambda: "enc"
    out.FileOutput = lambda f: ("out", f)
    return {"picamera2": m, "picamera2.encoders": enc, "picamera2.outputs": out}


@pytest.fixture
def load(monkeypatch, tmp_path):
    """load(mock=True, hw=False, argv=None, **options) -> module nichoir neuf, fichiers dans tmp_path, horloge factice.
    hw=True installe un matériel factice qui marche (options : gpio, pwm, tacho, bme, ina, cam_fail pour le casser)."""
    captured = []
    monkeypatch.setattr("atexit.register", lambda f, *a, **k: captured.append(f) or f)

    def _load(mock=True, hw=False, argv=None, **o):
        if mock:
            monkeypatch.setenv("NICHOIR_MOCK", "1")
        else:
            monkeypatch.delenv("NICHOIR_MOCK", raising=False)
        monkeypatch.setattr(sys, "argv", argv or ["nichoir.py"])
        names = ["gpiozero", "bme280", "smbus2", "ina219", "picamera2", "picamera2.encoders", "picamera2.outputs"]
        for n in names:
            monkeypatch.setitem(sys.modules, n, None)   # None = ImportError
        if hw:
            monkeypatch.setitem(sys.modules, "gpiozero", _gpiozero(o))
            b, s = _bme(o)
            monkeypatch.setitem(sys.modules, "bme280", b)
            monkeypatch.setitem(sys.modules, "smbus2", s)
            monkeypatch.setitem(sys.modules, "ina219", _ina(o))
            for k, v in _picam(o).items():
                monkeypatch.setitem(sys.modules, k, v)
        name = "nichoir"   # même nom que --cov=nichoir, sinon coverage ignore le fichier
        spec = importlib.util.spec_from_file_location(name, PI / "nichoir.py")
        mod = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, mod)
        spec.loader.exec_module(mod)
        mod.FICHIER_REGLAGES = str(tmp_path / "reglages.json")
        mod.FICHIER_HISTO = str(tmp_path / "historique.json")
        mod.time = FakeTime()
        mod.atexit_hooks = captured
        return mod

    return _load


@pytest.fixture
def m(load):
    """Module en mode simulé, sans matériel."""
    return load()


@pytest.fixture
def client(m):
    return m.app.test_client()
