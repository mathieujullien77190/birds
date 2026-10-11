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
BATTERIE_BASSE = 20      # % : en dessous, le Peltier est coupé (et refusé) pour économiser l'énergie
BATTERIE_CRITIQUE = 10   # % : en dessous, les caméras et les LED infrarouges sont coupées aussi (et refusées)
CAPACITE_WH = 76.8  # batterie LiFePO4 12,8 V × 6 Ah
# Consommation estimée (W) de chaque élément quand il est allumé : valeurs usuelles, à remplacer par des mesures (INA219) dès que possible.
CONSO_W = {"pi": 3.5, "camera": 0.7, "led": 1.2, "peltier_max": 72.0}  # Peltier : 72 W à pleine tension, proportionnel au carré du rapport cyclique (TEC1-12706, ~2 Ω)
# Tension au repos d'une batterie LiFePO4 12,8 V (4 cellules) selon sa charge : (pourcentage, volts). Sous charge la tension chute : l'estimation est grossière.
COURBE_LIFEPO4 = [(0, 10.0), (10, 12.0), (20, 12.8), (30, 12.9), (40, 13.0), (70, 13.1), (90, 13.2), (100, 13.4)]

# FACULTATIF : mode simulé, pour tester la page sans matériel (ordinateur). Jamais actif par défaut.
MOCK = os.environ.get("NICHOIR_MOCK") == "1" or "--mock" in sys.argv
SIM_ACCEL = float(os.environ.get("NICHOIR_MOCK_ACCEL", "1"))  # 1 = temps réel ; 10 ou 60 = le temps passe plus vite sur la batterie simulée (pour voir le niveau bouger)
MOCK_NUIT = None   # None : jour / nuit d'après l'horloge ; True / False : imposé (le simulateur de l'app suit son bouton Jour / Nuit)
MOCK_PANNES = {"bme": False, "sonde": False}  # pannes simulées (essais depuis le simulateur de l'app)
MOCK_SURCHAUFFE = float(os.environ.get("NICHOIR_MOCK_SURCHAUFFE", "0"))  # °C : force le dissipateur à cette température quand le Peltier tourne (essai de la coupure)

# ---------------------------------------------------------------- matériel (chaque bloc est optionnel)
etat = {
    "t_nid": None, "hum_nid": None, "t_dissipateur": None,
    "peltier": "arrêt", "puissance": 0.0,
    "led_nid": False, "led_ext": False,
    "batterie": {"pourcent": None, "tension": None, "source": None},   # niveau de charge (mesuré par l'INA219 si présent, sinon simulé)
    "conso": {"total_w": None, "detail": {}},                          # consommation estimée selon ce qui est allumé
    "cam1": True, "cam2": True,   # caméras allumées (flux en direct) ou éteintes (économie d'énergie)
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

# FACULTATIF : mesure de la batterie par un module INA219 (I2C 0x41, shunt de 10 mΩ). Sans lui, la page affiche « — » pour le niveau mais la consommation estimée reste visible.
try:
    from ina219 import INA219
    ina_bat = INA219(0.01, 10, address=0x41)
    ina_bat.configure()
    BAT_OK = True
except Exception as e:
    BAT_OK = False
    etat["erreurs"]["batterie"] = f"mesure de la batterie indisponible : {e}"

cameras = {}
capteurs_cam = {}   # numéro → objet Picamera2, pour pouvoir arrêter / relancer le flux
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
            capteurs_cam[num] = (cam, flux)
        except Exception as e:
            etat["erreurs"][f"camera{num + 1}"] = f"caméra {num + 1} indisponible : {e}"
except Exception as e:
    etat["erreurs"]["picamera2"] = f"picamera2 indisponible : {e}"


def pourcent_depuis_tension(v):
    """Charge (0–100 %) d'après la tension au repos, en interpolant COURBE_LIFEPO4."""
    for (p0, v0), (p1, v1) in zip(COURBE_LIFEPO4, COURBE_LIFEPO4[1:]):
        if v <= v1:
            return max(0.0, p0 + (p1 - p0) * (v - v0) / (v1 - v0))
    return 100.0


def tension_depuis_pourcent(p):
    for (p0, v0), (p1, v1) in zip(COURBE_LIFEPO4, COURBE_LIFEPO4[1:]):
        if p <= p1:
            return v0 + (v1 - v0) * (p - p0) / (p1 - p0)
    return COURBE_LIFEPO4[-1][1]


def consommation():
    """Consommation estimée (W) de ce qui est allumé : Pi, caméras, LED infrarouges, Peltier."""
    d = {"pi": CONSO_W["pi"]}
    d["cameras"] = CONSO_W["camera"] * (bool(etat["cam1"]) + bool(etat["cam2"]))
    d["led"] = CONSO_W["led"] * (bool(etat["led_nid"]) + bool(etat["led_ext"]))
    d["peltier"] = round(CONSO_W["peltier_max"] * etat["puissance"] ** 2, 1)
    d = {k: round(v, 1) for k, v in d.items()}
    return {"total_w": round(sum(d.values()), 1), "detail": d}


# ---------------------------------------------------------------- mode simulé (remplace le matériel quand MOCK est actif)
if MOCK:
    class Faux:
        """Sortie GPIO factice : accepte .value = … sans rien piloter."""
        value = 0

    pwm, ina, inb, led_nid, led_ext = Faux(), Faux(), Faux(), Faux(), Faux()
    GPIO_OK = BME_OK = SONDE_OK = BAT_OK = True
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

    sim = {"diss": 20.0, "decalage": 0.0, "wh": 0.8 * CAPACITE_WH, "nuage": 0.9, "nuage_cible": 0.9}  # la batterie simulée part à 80 %

    def simuler():
        """Un pas de simulation : le nid suit un cycle de 10 min, le Peltier le refroidit / le chauffe, le dissipateur chauffe avec la puissance."""
        p = etat["puissance"]
        signe = -1 if etat["peltier"] == "froid" else 1 if etat["peltier"] == "chaud" else 0
        sim["decalage"] += (signe * 8 * p / PWM_MAX - sim["decalage"]) * 0.05
        cible = 20 + 40 * p
        if p > 0 and MOCK_SURCHAUFFE:
            cible = max(cible, MOCK_SURCHAUFFE)
        sim["diss"] += (cible - sim["diss"]) * 0.3
        if MOCK_PANNES["bme"]:
            etat["t_nid"] = etat["hum_nid"] = None
            etat["erreurs"]["bme280"] = "lecture du capteur du nid : pas de réponse (panne simulée)"
        else:
            etat["erreurs"].pop("bme280", None)
            etat["t_nid"] = round(15 + 3 * math.sin(time.time() / 600 * 2 * math.pi) + sim["decalage"] + random.uniform(-0.2, 0.2), 1)
            etat["hum_nid"] = round(70 + 10 * math.sin(time.time() / 900 * 2 * math.pi) + random.uniform(-1, 1), 0)
        etat["t_dissipateur"] = round(sim["diss"] + random.uniform(-0.2, 0.2), 1)
        # batterie simulée : décharge de la consommation, recharge par le panneau solaire le jour (≈ 55 W), rien la nuit
        h = time.localtime().tm_hour
        nuit = MOCK_NUIT if MOCK_NUIT is not None else not 6 <= h < 18
        if random.random() < 0.02:
            sim["nuage_cible"] = random.uniform(0.2, 1.0)  # un nuage passe (0,2 = très couvert) ou le ciel se dégage
        sim["nuage"] += (sim["nuage_cible"] - sim["nuage"]) * 0.1
        solaire = 0.0 if nuit else round(60 * sim["nuage"], 1)  # le jour le panneau de 100 W donne jusqu'à ≈ 60 W selon les nuages
        pc = 100 * sim["wh"] / CAPACITE_WH
        conso_w = consommation()["total_w"]
        apport = solaire - conso_w
        if apport > 0 and pc > 90:  # fin de charge : comme un vrai régulateur, le courant diminue en approchant de 100 %
            apport = max(0.05 * apport, apport * (100 - pc) / 10)
        sim["wh"] = min(CAPACITE_WH, max(0.0, sim["wh"] + apport * PERIODE / 3600 * SIM_ACCEL))
        pc = 100 * sim["wh"] / CAPACITE_WH
        etat["batterie"] = {"pourcent": round(pc, 1), "tension": round(tension_depuis_pourcent(pc), 2), "source": "simulée", "solaire_w": round(solaire, 1)}


# ---------------------------------------------------------------- commandes
# REQUIS si le Peltier est monté : c'est la seule fonction qui commande le pont en H (sens + puissance plafonnée à PWM_MAX).
def peltier(sens: str, puissance: float):
    """sens : 'froid' (refroidit le nid), 'chaud' (le réchauffe) ou 'arrêt' ; puissance 0..1 (plafonnée à PWM_MAX)."""
    puissance = max(0.0, min(PWM_MAX, puissance))
    bas = etat["batterie"]["pourcent"]
    if sens != "arrêt" and bas is not None and bas < BATTERIE_BASSE:
        log(f"Peltier refusé : batterie à {bas} % (< {BATTERIE_BASSE} %)")
        sens = "arrêt"
    if sens not in ("froid", "chaud", "arrêt"):
        sens = "arrêt"
    if sens == "arrêt":
        puissance = 0.0
    etat["peltier"], etat["puissance"] = sens, puissance
    log(f"Peltier : {sens}, puissance {round(puissance * 100)} %")
    if GPIO_OK:
        ina.value, inb.value = (1, 0) if sens == "froid" else (0, 1) if sens == "chaud" else (0, 0)
        pwm.value = puissance


# FACULTATIF : allume ou éteint une caméra (num 0 ou 1). Éteinte, elle ne filme plus (le Pi consomme moins) et la page n'affiche plus son flux.
def camera(num: int, on: bool):
    bas = etat["batterie"]["pourcent"]
    if on and bas is not None and bas < BATTERIE_CRITIQUE:
        log(f"Caméra {num + 1} refusée : batterie à {bas} % (< {BATTERIE_CRITIQUE} %)")
        on = False
    etat[f"cam{num + 1}"] = bool(on)
    if num in capteurs_cam:
        cam, flux = capteurs_cam[num]
        try:
            if on:
                cam.start_recording(MJPEGEncoder(), FileOutput(flux))
            else:
                cam.stop_recording()
        except Exception as e:
            etat["erreurs"][f"camera{num + 1}"] = f"commande de la caméra {num + 1} : {e}"
    log(f"Caméra {num + 1} : {'allumée' if on else 'éteinte'}")


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
_lectures = [0]
LOG_TOUS_LES = 10   # une ligne de situation toutes les 10 lectures (50 s sur le Pi, 10 s en mode simulé)


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
            if MOCK and MOCK_PANNES["sonde"]:
                raise OSError("la sonde ne répond pas (panne simulée)")
            if not MOCK:
                etat["t_dissipateur"] = round(sonde.get_temperature(), 1)
            etat["erreurs"].pop("ds18b20", None)
            if etat["t_dissipateur"] > HOT_MAX and etat["peltier"] != "arrêt":
                peltier("arrêt", 0)
                etat["erreurs"]["securite"] = f"Peltier coupé : dissipateur à {etat['t_dissipateur']} °C (> {HOT_MAX})"
                log("SÉCURITÉ : " + etat["erreurs"]["securite"])
        except Exception as e:
            etat["erreurs"]["ds18b20"] = f"lecture de la sonde : {e}"
            if etat["peltier"] != "arrêt":  # sans mesure de température le Peltier ne doit pas continuer : on le coupe
                peltier("arrêt", 0)
                etat["erreurs"]["securite"] = "Peltier coupé : la sonde du dissipateur ne répond plus"
                log("SÉCURITÉ : " + etat["erreurs"]["securite"])
    if BAT_OK and not MOCK:
        try:
            v = ina_bat.voltage()
            etat["batterie"] = {"pourcent": round(pourcent_depuis_tension(v), 0), "tension": round(v, 2), "source": "mesurée"}
            etat["erreurs"].pop("batterie", None)
        except Exception as e:
            etat["erreurs"]["batterie"] = f"lecture de la batterie : {e}"
    pc = etat["batterie"]["pourcent"]  # délestage : on coupe d'abord le Peltier (le plus gourmand), puis les LED
    if pc is not None and pc < BATTERIE_BASSE:
        if etat["peltier"] != "arrêt":
            peltier("arrêt", 0)
        if pc < BATTERIE_CRITIQUE:
            if etat["led_nid"] or etat["led_ext"]:
                leds(False, False)
            for n in (0, 1):
                if etat[f"cam{n + 1}"]:
                    camera(n, False)
        niveau = "Peltier, caméras et LED coupés" if pc < BATTERIE_CRITIQUE else "Peltier coupé"
        if etat["erreurs"].get("delestage") is None:
            log(f"DÉLESTAGE : batterie à {pc} % : {niveau}")
        etat["erreurs"]["delestage"] = f"Batterie à {pc} % : {niveau} pour économiser l'énergie"
    else:
        etat["erreurs"].pop("delestage", None)
    etat["conso"] = consommation()
    etat["derniere_lecture"] = time.strftime("%H:%M:%S")
    _lectures[0] += 1
    if _lectures[0] % LOG_TOUS_LES == 1:  # un point de situation de temps en temps, pas à chaque lecture (le journal restait noyé)
        parts = [f"nid {etat['t_nid']} °C, {etat['hum_nid']} %", f"dissipateur {etat['t_dissipateur']} °C"]
        if etat["peltier"] != "arrêt":
            parts.append(f"Peltier {etat['peltier']} {round(etat['puissance'] * 100)} %")  # le Peltier n'est cité que quand il tourne
        parts.append(f"conso {etat['conso']['total_w']} W")
        if etat["batterie"]["pourcent"] is not None:
            parts.append(f"batterie {etat['batterie']['pourcent']} %")
        log(" · ".join(parts))


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


@app.post("/api/camera")
def api_camera():
    d = request.get_json(force=True) or {}
    num = int(d.get("num", 0))
    if num in (0, 1):
        camera(num, bool(d.get("on", True)))
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
    if not etat[f"cam{num + 1}"]:
        return Response("caméra éteinte", status=503)

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
