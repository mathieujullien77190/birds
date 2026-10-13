"""Routes Flask, flux vidéo, point d'entrée (`__main__`) et arrêt propre."""
import importlib.util
import json
import runpy
import sys
import threading
import types

import flask
import pytest

from conftest import PI


def post(client, url, body):
    return client.post(url, data=json.dumps(body), content_type="application/json")


def test_routes_listed(m):
    routes = {(r.rule, tuple(sorted(r.methods - {"HEAD", "OPTIONS"}))) for r in m.app.url_map.iter_rules() if r.endpoint != "static"}
    assert routes == {("/", ("GET",)), ("/api/etat", ("GET",)), ("/api/historique", ("GET",)), ("/api/ventilo", ("POST",)),
                      ("/api/auto", ("POST",)), ("/api/camera", ("POST",)), ("/api/led", ("POST",)), ("/video/1", ("GET",)), ("/video/2", ("GET",))}


def test_index_serves_page(client):
    r = client.get("/")
    assert r.status_code == 200 and b"<" in r.data
    r.close()


def test_api_etat(client, m):
    d = client.get("/api/etat").get_json()
    assert d == json.loads(json.dumps(m.state))
    assert d["ventilo"]["mode"] == "arret" and d["auto"]["etat"] == "inactif" and d["erreurs"] == {"mock": m.state["erreurs"]["mock"]}


def test_api_historique(client, m):
    assert client.get("/api/historique").get_json() == []
    m.history.append({"t": "10:00", "nid": 1.0, "ext": None, "hum": None, "ventilo": 0})
    assert client.get("/api/historique").get_json() == [{"t": "10:00", "nid": 1.0, "ext": None, "hum": None, "ventilo": 0}]


def test_api_ventilo_manual(client, m):
    d = post(client, "/api/ventilo", {"pourcent": 60}).get_json()
    assert d["ventilo"]["pourcent"] == 60 and d["ventilo"]["mode"] == "manuel" and d["ventilo"]["raison"] == "commande manuelle"
    d = post(client, "/api/ventilo", {"pourcent": 10}).get_json()      # sous le minimum : arrêt
    assert d["ventilo"]["pourcent"] == 0
    post(client, "/api/ventilo", {"pourcent": 90})
    d = post(client, "/api/ventilo", {"mode": "arret"}).get_json()
    assert d["ventilo"]["pourcent"] == 0 and d["ventilo"]["raison"] == "arrêté à la main" and d["ventilo"]["alimente"] is False


@pytest.mark.parametrize("corps", ["null", "{}"])
def test_api_ventilo_empty_body_means_stop(client, m, corps):
    m.fan(60)
    r = client.post("/api/ventilo", data=corps, content_type="application/json")
    assert r.status_code == 200 and r.get_json()["ventilo"]["pourcent"] == 0


def test_api_ventilo_manual_disables_auto_and_saves(client, m):
    m.state["auto"]["actif"] = True
    d = post(client, "/api/ventilo", {"pourcent": 50}).get_json()
    assert d["auto"]["actif"] is False
    with open(m.SETTINGS_FILE, encoding="utf-8") as f:
        assert json.load(f)["actif"] is False


def test_api_ventilo_invalid_json_is_400(client):
    assert client.post("/api/ventilo", data="pas du json", content_type="application/json").status_code == 400


def test_api_auto_settings_are_clamped(client, m):
    d = post(client, "/api/auto", {"seuil_marche": 99, "ecart_ext": -4, "hysteresis": 0, "vitesse_min": 10, "vitesse_max": 500,
                                   "plage": 0.1, "alerte_chaleur": 20}).get_json()["auto"]
    assert (d["seuil_marche"], d["ecart_ext"], d["hysteresis"], d["vitesse_min"], d["vitesse_max"], d["plage"], d["alerte_chaleur"]) == (45.0, 0.0, 0.2, 30.0, 100.0, 1.0, 31.0)
    d = post(client, "/api/auto", {"seuil_marche": 20, "alerte_chaleur": 50.5}).get_json()["auto"]
    assert d["seuil_marche"] == 20.0 and d["alerte_chaleur"] == 50.0


def test_api_auto_invalid_values_ignored(client, m):
    d = post(client, "/api/auto", {"seuil_marche": "chaud", "plage": None, "ecart_ext": "3.5"}).get_json()["auto"]
    assert d["seuil_marche"] == 28.0 and d["plage"] == 5.0 and d["ecart_ext"] == 3.5


def test_api_auto_vitesse_max_follows_min(client, m):
    d = post(client, "/api/auto", {"vitesse_min": 80, "vitesse_max": 50}).get_json()["auto"]
    assert d["vitesse_min"] == 80.0 and d["vitesse_max"] == 80.0


def test_api_auto_ignores_unknown_keys_and_persists(client, m):
    d = post(client, "/api/auto", {"n_importe": 1, "hiver": 1}).get_json()["auto"]
    assert "n_importe" not in d and d["hiver"] is True
    with open(m.SETTINGS_FILE, encoding="utf-8") as f:
        assert json.load(f)["hiver"] is True
    assert post(client, "/api/auto", {"hiver": False}).get_json()["auto"]["hiver"] is False


def test_api_auto_enable_resets_fan_then_regulates(client, m):
    m.fan(70, "manuel")
    m.state["t_nid"] = 33.0
    m.state["ext"]["t"] = 10.0
    d = post(client, "/api/auto", {"actif": True}).get_json()
    assert d["auto"]["actif"] is True
    assert d["ventilo"]["mode"] == "auto" and d["ventilo"]["pourcent"] == 100 and d["auto"]["etat"] == "ventile"


def test_api_auto_enable_cool_nest_waits(client, m):
    d = post(client, "/api/auto", {"actif": True}).get_json()
    assert d["auto"]["actif"] is True and d["ventilo"]["pourcent"] == 0 and d["auto"]["etat"] == "securite"   # pas de mesure : sécurité


def test_api_auto_disable_stops_auto_fan_only(client, m):
    m.state["t_nid"] = 33.0
    m.state["ext"]["t"] = 10.0
    post(client, "/api/auto", {"actif": True})
    assert m.state["ventilo"]["pourcent"] > 0
    d = post(client, "/api/auto", {"actif": False}).get_json()
    assert d["auto"]["actif"] is False and d["ventilo"]["pourcent"] == 0 and d["auto"]["etat"] == "inactif"
    # le ventilateur manuel n'est pas touché quand on désactive l'automatique
    post(client, "/api/auto", {"actif": True})
    m.state["auto"]["actif"] = True
    m.fan(60, "manuel", silent=True)
    d = post(client, "/api/auto", {"actif": False}).get_json()
    assert d["ventilo"]["pourcent"] == 60


def test_api_auto_same_state_is_noop(client, m, capsys):
    post(client, "/api/auto", {"actif": False})
    assert "Ventilation automatique" not in capsys.readouterr().out
    m.state["auto"]["actif"] = True
    m.state["t_nid"] = 33.0
    m.state["ext"]["t"] = 10.0
    m.run_auto()
    p = m.state["ventilo"]["pourcent"]
    capsys.readouterr()
    post(client, "/api/auto", {"actif": True})
    assert "activée" not in capsys.readouterr().out and m.state["ventilo"]["pourcent"] == p


def test_api_camera(client, m):
    d = post(client, "/api/camera", {"num": 0, "on": False}).get_json()
    assert d["cam1"] is False and d["cam2"] is True
    d = post(client, "/api/camera", {"num": 1, "on": False}).get_json()
    assert d["cam2"] is False
    d = post(client, "/api/camera", {"num": 1}).get_json()   # « on » vaut True par défaut
    assert d["cam2"] is True
    d = post(client, "/api/camera", {"num": 0}).get_json()
    assert d["cam1"] is True
    post(client, "/api/camera", {"num": 0, "on": False})
    d = post(client, "/api/camera", {"num": 7, "on": False}).get_json()   # numéro inconnu : ignoré
    assert d["cam1"] is False and d["cam2"] is True
    d = post(client, "/api/camera", {}).get_json()
    assert d["cam1"] is True


def test_api_camera_refused_on_critical_battery(client, m):
    m.state["batterie"]["pourcent"] = 3
    m.state["cam1"] = False
    assert post(client, "/api/camera", {"num": 0, "on": True}).get_json()["cam1"] is False


def test_api_led(client, m):
    d = post(client, "/api/led", {"nid": True}).get_json()
    assert d["led_nid"] is True and d["led_ext"] is False
    d = post(client, "/api/led", {"ext": True}).get_json()
    assert d["led_nid"] is True and d["led_ext"] is True
    d = post(client, "/api/led", {"nid": False, "ext": False}).get_json()
    assert d["led_nid"] is False and d["led_ext"] is False
    assert m.led_nest.value == 0 and m.led_outside.value == 0


# ------------------------------------------------------------------ flux vidéo
class Cond:
    def __init__(self):
        self.n = 0

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def wait(self):
        self.n += 1


def test_video_routes_unavailable_or_off(client, m):
    m.cameras.pop(0)
    r = client.get("/video/1")
    assert r.status_code == 503 and r.data == "caméra indisponible".encode()
    m.state["cam2"] = False
    r = client.get("/video/2")
    assert r.status_code == 503 and r.data == "caméra éteinte".encode()


def test_video_stream_frames(m):
    stream = types.SimpleNamespace(cond=Cond(), frame=b"IMG")
    m.cameras[0] = stream
    resp = m.mjpeg(0)
    assert resp.mimetype == "multipart/x-mixed-replace" and "boundary=frame" in resp.headers["Content-Type"]
    part = next(iter(resp.response))
    assert part == b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 3\r\n\r\nIMG\r\n" and stream.cond.n == 1
    stream.frame = b"PNGDATA"
    stream.mime = "image/png"
    assert b"Content-Type: image/png\r\nContent-Length: 7\r\n\r\nPNGDATA" in next(iter(m.mjpeg(0).response))


def test_video_route_serves_stream(client, m):
    stream = types.SimpleNamespace(cond=Cond(), frame=b"X")
    m.cameras[1] = stream
    r = client.get("/video/2", buffered=False)
    assert r.status_code == 200 and r.mimetype == "multipart/x-mixed-replace"
    assert b"Content-Length: 1" in next(iter(r.response))
    r.close()
    m.cameras[0] = stream
    r = client.get("/video/1", buffered=False)
    assert r.status_code == 200
    r.close()


# ------------------------------------------------------------------ arrêt et point d'entrée
def test_atexit_cuts_the_fan(load, capsys):
    m = load(mock=False, hw=True)
    m.fan(80)
    capsys.readouterr()
    m.atexit_hooks[-1]()
    assert m.state["ventilo"]["pourcent"] == 0 and m.fan_12v.value == 0 and capsys.readouterr().out == ""


class FakeThread:
    started = []

    def __init__(self, target=None, daemon=None):
        self.target, self.daemon = target, daemon

    def start(self):
        FakeThread.started.append(self.target)


def run_main(monkeypatch, tmp_path, mock):
    FakeThread.started = []
    runs = []
    monkeypatch.setattr(threading, "Thread", FakeThread)
    monkeypatch.setattr(flask.Flask, "run", lambda self, **kw: runs.append(kw))
    monkeypatch.setattr("atexit.register", lambda f, *a, **k: f)
    monkeypatch.setattr(sys, "argv", ["nichoir.py"])
    for n in ("gpiozero", "bme280", "smbus2", "ina219", "picamera2", "picamera2.encoders", "picamera2.outputs"):
        monkeypatch.setitem(sys.modules, n, None)
    if mock:
        monkeypatch.setenv("NICHOIR_MOCK", "1")
    else:
        monkeypatch.delenv("NICHOIR_MOCK", raising=False)
    monkeypatch.chdir(tmp_path)
    spec = importlib.util.spec_from_file_location("nichoir", PI / "nichoir" / "__init__.py", submodule_search_locations=[str(PI / "nichoir")])
    mod = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "nichoir", mod)
    spec.loader.exec_module(mod)   # charge les chapitres (comme `import nichoir`)
    mod.main()                     # ce que fait `python -m nichoir`
    return vars(mod), runs


def test_python_m_nichoir(monkeypatch, tmp_path, capsys):
    """`python -m nichoir` : __main__.py importe le paquet puis appelle main() (même résultat que run_main)."""
    FakeThread.started = []
    runs = []
    monkeypatch.setattr(threading, "Thread", FakeThread)
    monkeypatch.setattr(flask.Flask, "run", lambda self, **kw: runs.append(kw))
    monkeypatch.setattr("atexit.register", lambda f, *a, **k: f)
    monkeypatch.setattr(sys, "argv", ["nichoir"])
    for n in ("gpiozero", "bme280", "smbus2", "ina219", "picamera2", "picamera2.encoders", "picamera2.outputs"):
        monkeypatch.setitem(sys.modules, n, None)
    monkeypatch.setenv("NICHOIR_MOCK", "1")
    monkeypatch.chdir(tmp_path)
    monkeypatch.syspath_prepend(str(PI))
    monkeypatch.delitem(sys.modules, "nichoir", raising=False)
    runpy.run_module("nichoir", run_name="__main__")
    assert runs == [{"host": "0.0.0.0", "port": 8080, "threaded": True}] and "(mode simulé)" in capsys.readouterr().out


def test_main_mock(monkeypatch, tmp_path, capsys):
    g, runs = run_main(monkeypatch, tmp_path, True)
    assert runs == [{"host": "0.0.0.0", "port": 8080, "threaded": True}]
    names = [getattr(t, "__name__", "") for t in FakeThread.started]
    assert names.count("run") == 2 and "loop" in names and len(names) == 3
    out = capsys.readouterr().out
    assert "(mode simulé)" in out and "! MODE SIMULÉ" in out and g["state"]["ventilo"]["pourcent"] == 0


def test_main_real_lists_missing_hardware(monkeypatch, tmp_path, capsys):
    g, runs = run_main(monkeypatch, tmp_path, False)
    assert runs and [getattr(t, "__name__", "") for t in FakeThread.started] == ["loop"]
    out = capsys.readouterr().out
    assert "(mode simulé)" not in out and "! GPIO indisponible" in out and "! capteur du nid indisponible" in out
