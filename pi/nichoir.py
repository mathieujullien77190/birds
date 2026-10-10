"""Nichoir mésange — programme de test sur le Raspberry Pi 5.

Version volontairement minimale pour vérifier le matériel :
- lit le capteur du nid (BME280, I2C) et la sonde du dissipateur (DS18B20, 1-Wire) ;
- montre les deux caméras en direct (flux MJPEG) ;
- pilote le Peltier (froid / chaud / arrêt + puissance) et les deux cartes de LED infrarouges ;
- sert une page web sur le port 8080.

Chaque partie du matériel est optionnelle : si un capteur ou une caméra manque, la page le dit et le reste marche.
Mode simulé : `NICHOIR_MOCK=1 python nichoir.py` (ou `--mock`) remplace capteurs, GPIO et caméras par des valeurs fausses mais plausibles,
pour essayer la page sur un ordinateur sans rien de branché (voir README).
Sécurité : le Peltier est coupé si le dissipateur dépasse HOT_MAX °C.

Brochage (voir docs/schema-electronique.md) :
  Peltier (pont en H VNH5019) : PWM GPIO18, INA GPIO13, INB GPIO19
  LED du nid : GPIO23 (module MOSFET IN1)   LED extérieures : GPIO24 (IN2)
  BME280 : I2C adresse 0x76 (ou 0x77)        DS18B20 : 1-Wire sur GPIO4
"""
import math
import os
import random
import struct
import sys
import threading
import time
import zlib

from flask import Flask, Response, jsonify, request, send_from_directory

# REQUIS : les trois réglages ci-dessous. Ne pas augmenter HOT_MAX ni PWM_MAX sans raison : ce sont les sécurités du Peltier et de la batterie.
def log(msg):
    """Écrit une ligne datée sur la sortie standard (visible avec `journalctl -u nichoir -f` sur le Pi, ou dans le terminal du simulateur)."""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


HOT_MAX = 55.0      # °C sur le dissipateur : au-dessus, le Peltier est coupé
PWM_MAX = 0.6       # puissance maximale du Peltier (batterie de 6 Ah)
PERIODE = 5.0       # secondes entre deux lectures

# FACULTATIF : mode simulé, pour tester la page sans matériel (ordinateur). Jamais actif par défaut.
MOCK = os.environ.get("NICHOIR_MOCK") == "1" or "--mock" in sys.argv
MOCK_SURCHAUFFE = float(os.environ.get("NICHOIR_MOCK_SURCHAUFFE", "0"))  # °C : force le dissipateur à cette température quand le Peltier tourne (essai de la coupure)

# ---------------------------------------------------------------- matériel (chaque bloc est optionnel)
etat = {
    "t_nid": None, "hum_nid": None, "t_dissipateur": None,
    "peltier": "arrêt", "puissance": 0.0,
    "led_nid": False, "led_ext": False,
    "erreurs": {},        # nom du matériel → message, quand quelque chose manque
    "derniere_lecture": None,
}

# FACULTATIF : sans les GPIO (ordinateur, Pi non câblé) le programme tourne quand même, la page signale seulement « GPIO indisponible ».
# REQUIS pour piloter le Peltier et les LED : le pont en H sur GPIO18 / 13 / 19 et le module MOSFET sur GPIO23 / 24.
try:
    from gpiozero import DigitalOutputDevice, PWMOutputDevice
    pwm = PWMOutputDevice(18, frequency=20000)
    ina, inb = DigitalOutputDevice(13), DigitalOutputDevice(19)
    led_nid, led_ext = DigitalOutputDevice(23), DigitalOutputDevice(24)
    GPIO_OK = True
except Exception as e:  # pas sur un Pi, ou gpiozero absent
    GPIO_OK = False
    etat["erreurs"]["gpio"] = f"GPIO indisponible : {e}"

# FACULTATIF : capteur BME280 du nid (température, humidité). Sans lui, la page affiche « — » et le reste marche.
# Il n'est PAS nécessaire à la sécurité : la coupure du Peltier ne dépend que de la sonde du dissipateur.
try:
    import bme280
    import smbus2
    bus = smbus2.SMBus(1)
    BME_ADDR = 0x76
    cal = bme280.load_calibration_params(bus, BME_ADDR)
    BME_OK = True
except Exception as e:
    BME_OK = False
    etat["erreurs"]["bme280"] = f"capteur du nid indisponible : {e}"

# FACULTATIF mais FORTEMENT CONSEILLÉ : sonde DS18B20 du dissipateur. C'est elle qui coupe le Peltier au-dessus de HOT_MAX.
# Sans sonde, n'allume le Peltier que sous surveillance (jamais la nuit, jamais sans dissipateur monté).
try:
    from w1thermsensor import W1ThermSensor
    sonde = W1ThermSensor()
    SONDE_OK = True
except Exception as e:
    SONDE_OK = False
    etat["erreurs"]["ds18b20"] = f"sonde du dissipateur indisponible : {e}"

cameras = {}
# FACULTATIF : les caméras (picamera2). Chaque caméra qui manque est signalée sur la page, l'autre continue.
try:
    from picamera2 import Picamera2
    from picamera2.encoders import MJPEGEncoder
    from picamera2.outputs import FileOutput
    import io

    class Flux(io.BufferedIOBase):
        """Garde la dernière image JPEG du flux, pour la servir à chaque client."""
        def __init__(self):
            self.frame = None
            self.cond = threading.Condition()
        def write(self, buf):
            with self.cond:
                self.frame = buf
                self.cond.notify_all()

    for num in (0, 1):
        try:
            cam = Picamera2(num)
            cam.configure(cam.create_video_configuration(main={"size": (640, 480)}))
            flux = Flux()
            cam.start_recording(MJPEGEncoder(), FileOutput(flux))
            cameras[num] = flux
        except Exception as e:
            etat["erreurs"][f"camera{num + 1}"] = f"caméra {num + 1} indisponible : {e}"
except Exception as e:
    etat["erreurs"]["picamera2"] = f"picamera2 indisponible : {e}"


# ---------------------------------------------------------------- mode simulé (remplace le matériel quand MOCK est actif)
if MOCK:
    class Faux:
        """Sortie GPIO factice : accepte .value = … sans rien piloter."""
        value = 0

    pwm, ina, inb, led_nid, led_ext = Faux(), Faux(), Faux(), Faux(), Faux()
    GPIO_OK = BME_OK = SONDE_OK = True
    etat["erreurs"].clear()
    etat["erreurs"]["mock"] = "MODE SIMULÉ : valeurs fausses, rien n'est branché"
    PERIODE = 1.0
    log("MODE SIMULÉ : capteurs, GPIO et caméras remplacés par des valeurs fausses")

    def _bloc(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))

    class FluxFaux:
        """Flux vidéo factice : une petite image PNG animée par caméra (barre qui se déplace, carré qui clignote)."""
        mime = "image/png"

        def __init__(self, teinte):
            self.frame, self.cond, self.teinte = None, threading.Condition(), teinte

        def image(self, n, w=320, h=240):
            x0 = (n * 8) % w
            lignes = bytearray()
            for y in range(h):
                lignes.append(0)  # filtre PNG « aucun »
                g = 40 + (y * 120) // h
                fond = bytes(g * c // 255 for c in self.teinte)
                for x in range(w):
                    if x0 <= x < x0 + 12:
                        lignes += bytes((255, 255, 255))  # barre blanche
                    elif 8 <= x < 28 and 8 <= y < 28 and (n // 5) % 2 == 0:
                        lignes += bytes((255, 40, 40))  # carré rouge qui clignote
                    else:
                        lignes += fond
            signature = bytes((137, 80, 78, 71, 13, 10, 26, 10))
            return (signature + _bloc(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                    + _bloc(b"IDAT", zlib.compress(bytes(lignes), 3)) + _bloc(b"IEND", b""))

        def tourne(self):
            n = 0
            while True:
                with self.cond:
                    self.frame = self.image(n)
                    self.cond.notify_all()
                n += 1
                time.sleep(0.2)

    cameras.clear()
    for num, teinte in ((0, (80, 255, 120)), (1, (90, 150, 255))):
        cameras[num] = FluxFaux(teinte)

    sim = {"diss": 20.0, "decalage": 0.0}

    def simuler():
        """Un pas de simulation : le nid suit un cycle de 10 min, le Peltier le refroidit / le chauffe, le dissipateur chauffe avec la puissance."""
        p = etat["puissance"]
        signe = -1 if etat["peltier"] == "froid" else 1 if etat["peltier"] == "chaud" else 0
        sim["decalage"] += (signe * 8 * p / PWM_MAX - sim["decalage"]) * 0.05
        cible = 20 + 40 * p
        if p > 0 and MOCK_SURCHAUFFE:
            cible = max(cible, MOCK_SURCHAUFFE)
        sim["diss"] += (cible - sim["diss"]) * 0.3
        etat["t_nid"] = round(15 + 3 * math.sin(time.time() / 600 * 2 * math.pi) + sim["decalage"] + random.uniform(-0.2, 0.2), 1)
        etat["hum_nid"] = round(70 + 10 * math.sin(time.time() / 900 * 2 * math.pi) + random.uniform(-1, 1), 0)
        etat["t_dissipateur"] = round(sim["diss"] + random.uniform(-0.2, 0.2), 1)


# ---------------------------------------------------------------- commandes
# REQUIS si le Peltier est monté : c'est la seule fonction qui commande le pont en H (sens + puissance plafonnée à PWM_MAX).
def peltier(sens: str, puissance: float):
    """sens : 'froid' (refroidit le nid), 'chaud' (le réchauffe) ou 'arrêt' ; puissance 0..1 (plafonnée à PWM_MAX)."""
    puissance = max(0.0, min(PWM_MAX, puissance))
    if sens not in ("froid", "chaud", "arrêt"):
        sens = "arrêt"
    if sens == "arrêt":
        puissance = 0.0
    etat["peltier"], etat["puissance"] = sens, puissance
    log(f"Peltier : {sens}, puissance {round(puissance * 100)} %")
    if GPIO_OK:
        ina.value, inb.value = (1, 0) if sens == "froid" else (0, 1) if sens == "chaud" else (0, 0)
        pwm.value = puissance


# FACULTATIF : sans le module MOSFET des LED, ces commandes ne font rien de visible.
def leds(nid=None, ext=None):
    if nid is not None:
        etat["led_nid"] = bool(nid)
        log(f"LED du nid : {'allumées' if nid else 'éteintes'}")
        if GPIO_OK:
            led_nid.value = int(nid)
    if ext is not None:
        etat["led_ext"] = bool(ext)
        log(f"LED extérieures : {'allumées' if ext else 'éteintes'}")
        if GPIO_OK:
            led_ext.value = int(ext)


# ---------------------------------------------------------------- lecture des capteurs, toutes les PERIODE secondes
# REQUIS : c'est la boucle qui lit les capteurs et applique la coupure de sécurité. Elle tourne en tâche de fond.
def lecture():
    """Une lecture des capteurs + la coupure de sécurité (appelée toutes les PERIODE secondes par boucle())."""
    if MOCK:
        simuler()
    elif BME_OK:
        try:
            d = bme280.sample(bus, BME_ADDR, cal)
            etat["t_nid"], etat["hum_nid"] = round(d.temperature, 1), round(d.humidity, 0)
            etat["erreurs"].pop("bme280", None)
        except Exception as e:
            etat["erreurs"]["bme280"] = f"lecture du capteur du nid : {e}"
    if SONDE_OK:
        try:
            if not MOCK:
                etat["t_dissipateur"] = round(sonde.get_temperature(), 1)
            etat["erreurs"].pop("ds18b20", None)
            if etat["t_dissipateur"] > HOT_MAX and etat["peltier"] != "arrêt":
                peltier("arrêt", 0)
                etat["erreurs"]["securite"] = f"Peltier coupé : dissipateur à {etat['t_dissipateur']} °C (> {HOT_MAX})"
                log("SÉCURITÉ : " + etat["erreurs"]["securite"])
        except Exception as e:
            etat["erreurs"]["ds18b20"] = f"lecture de la sonde : {e}"
    etat["derniere_lecture"] = time.strftime("%H:%M:%S")
    log(f"nid {etat['t_nid']} °C, {etat['hum_nid']} % · dissipateur {etat['t_dissipateur']} °C · Peltier {etat['peltier']} {round(etat['puissance'] * 100)} %")


def boucle():
    while True:
        lecture()
        time.sleep(PERIODE)


# ---------------------------------------------------------------- page web et API
# REQUIS : la page web et son API. Sans eux on ne voit ni ne commande rien (le service tourne mais reste muet).
app = Flask(__name__, static_folder="web", static_url_path="")


@app.get("/")
def index():
    return send_from_directory("web", "index.html")


@app.get("/api/etat")
def api_etat():
    return jsonify(etat)


@app.post("/api/peltier")
def api_peltier():
    d = request.get_json(force=True) or {}
    peltier(d.get("sens", "arrêt"), float(d.get("puissance", 0.3)))
    etat["erreurs"].pop("securite", None)
    return jsonify(etat)


@app.post("/api/led")
def api_led():
    d = request.get_json(force=True) or {}
    leds(nid=d.get("nid"), ext=d.get("ext"))
    return jsonify(etat)


# FACULTATIF : les deux flux vidéo (/video/1 et /video/2). Retirer les deux routes si le Pi n'a pas de caméra.
def mjpeg(num: int):
    flux = cameras.get(num)
    if flux is None:
        return Response("caméra indisponible", status=503)

    def gen():
        while True:
            with flux.cond:
                flux.cond.wait()
                frame = flux.frame
            mime = getattr(flux, "mime", "image/jpeg").encode()  # le mode simulé sert des PNG
            yield b"--frame\r\nContent-Type: " + mime + b"\r\nContent-Length: " + str(len(frame)).encode() + b"\r\n\r\n" + frame + b"\r\n"
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.get("/video/1")
def video1():
    return mjpeg(0)


@app.get("/video/2")
def video2():
    return mjpeg(1)


if __name__ == "__main__":
    log("Nichoir mésange : page sur http://0.0.0.0:8080" + (" (mode simulé)" if MOCK else ""))
    for msg in etat["erreurs"].values():
        log("! " + msg)
    threading.Thread(target=boucle, daemon=True).start()
    if MOCK:
        for flux in cameras.values():
            threading.Thread(target=flux.tourne, daemon=True).start()
    app.run(host="0.0.0.0", port=8080, threaded=True)
