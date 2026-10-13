"""Nichoir high tech — programme de test sur le Raspberry Pi 5.

Version volontairement minimale pour vérifier le matériel :
- lit le capteur du nid (BME280, I2C), la batterie (INA219, facultatif) et la sonde de température extérieure (DS18B20 étanche, 1-Wire) ;
- montre les deux caméras en direct (flux MJPEG) ;
- pilote le ventilateur de 60 mm (PWM gpiozero / lgpio : 25 kHz visé, repli à 10 kHz ; tachymètre) et les deux cartes de LED infrarouges ;
- ventilation automatique : le ventilateur n'aspire l'air chaud du nid que quand il fait trop chaud (désactivée au départ) ;
- garde l'historique des températures sur 24 h (pour décider, après une saison de mesures, s'il faut autre chose) ;
- sert une page web sur le port 8080.

Chaque partie du matériel est optionnelle : si un capteur ou une caméra manque, la page le dit et le reste marche.
Mode simulé : `NICHOIR_MOCK=1 python nichoir.py` (ou `--mock`) remplace capteurs, GPIO et caméras par des valeurs fausses mais plausibles,
pour essayer la page sur un ordinateur sans rien de branché (voir README).

Brochage (voir docs/schema-electronique.md) :
  Ventilateur (Noctua NF-A6x25 PWM, 12 V) : interrupteur 12 V côté + GPIO27 (broche 13), PWM GPIO18 (broche 12), tachymètre GPIO17 (broche 11, pull-up), masse commune broche 14
  LED du nid : GPIO23 (module MOSFET du nid, PWM)   LED extérieures : GPIO24 (module MOSFET extérieur, PWM)
  BME280 : I2C adresse 0x76 (ou 0x77)        INA219 (batterie) : I2C adresse 0x41
  Sonde extérieure DS18B20 : 3,3 V broche 17, masse broche 20, donnée GPIO4 (broche 7, 1-Wire, résistance de rappel 4,7 kΩ sur le module) ;
    activer le 1-Wire : `dtoverlay=w1-gpio` dans /boot/firmware/config.txt (puis redémarrer) ; lecture : /sys/bus/w1/devices/28-*/w1_slave
"""
import math
import os
import random
import struct
import sys
import glob
import json
import threading
import time
import urllib.request
import zlib

from flask import Flask, Response, jsonify, request, send_from_directory


def log(msg):
    """Écrit une ligne datée sur la sortie standard (visible avec `journalctl -u nichoir -f` sur le Pi, ou dans le terminal du simulateur)."""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# Ventilation AUTOMATIQUE (désactivée au départ ; tous les réglages sont modifiables depuis la page et gardés dans reglages.json).
# Les seuils portent sur la température INTÉRIEURE du nid (BME280) :
#   démarre  : le nid dépasse `seuil_marche` ET le nid dépasse dehors (sonde extérieure) d'au moins `ecart_ext` ; sans mesure de dehors (sonde absente, muette, hors plage) l'automatique NE DÉMARRE PAS ;
#   vitesse  : de `vitesse_min` à `vitesse_max`, proportionnelle sur `plage` °C au-dessus du seuil ;
#   s'arrête : le nid repasse sous `seuil_marche` − `hysteresis`, OU le nid n'est plus plus chaud que dehors (aspirer l'air de dehors ne refroidirait plus) ;
#   `hiver` : « mode hiver » (cassette du ventilateur retirée, bloc isolant à sa place, bouchon de la prise d'air du dessous posé) : l'automatique ne démarre jamais le ventilateur (la commande manuelle reste possible) ;
#   `alerte_chaleur` : au-dessus, une alerte (et une notification) même si l'automatique est éteint.
# Sécurités prioritaires : voir regler_auto().
AUTO_DEFAUT = {"actif": False, "hiver": False, "seuil_marche": 28.0, "ecart_ext": 2.0, "hysteresis": 2.0, "vitesse_min": 30.0, "vitesse_max": 100.0, "plage": 5.0, "alerte_chaleur": 35.0}
AUTO_LIMITES = {"seuil_marche": (15.0, 45.0), "ecart_ext": (0.0, 15.0), "hysteresis": (0.2, 10.0), "vitesse_min": (30.0, 100.0), "vitesse_max": (30.0, 100.0),
                "plage": (1.0, 20.0), "alerte_chaleur": (31.0, 50.0)}
NID_PLAUSIBLE = (-40.0, 60.0)   # hors de ces bornes une mesure du nid est jugée aberrante (capteur défaillant)
NTFY_TOPIC = os.environ.get("NICHOIR_NTFY_TOPIC", "")   # FACULTATIF : sujet ntfy.sh pour recevoir les alertes sur le téléphone (https://ntfy.sh)
_DOSSIER = os.path.dirname(os.path.abspath(globals().get("__file__", ".")))
FICHIER_REGLAGES = os.path.join(_DOSSIER, "reglages.json")

VENTILO_MIN = 30    # % : vitesse minimale réelle quand le ventilateur tourne (en dessous : arrêt)
VENTILO_PANNE_S = 10   # s : commandé mais 0 tr/min depuis plus longtemps que ça = panne
PERIODE = 5.0       # secondes entre deux lectures
# FACULTATIF : sonde de température extérieure DS18B20 étanche (1-Wire, GPIO4). Le noyau la lit dans /sys/bus/w1/devices/28-*/w1_slave
# (activer `dtoverlay=w1-gpio` dans /boot/firmware/config.txt). Sans elle la page affiche « — », l'automatique ne démarre pas et le reste marche.
W1_DOSSIER = "/sys/bus/w1/devices"
EXT_PLAUSIBLE = (-40.0, 60.0)   # hors de ces bornes une mesure de dehors est jugée aberrante (sonde défaillante)
EXT_ERREUR_DS18B20 = 85.0       # valeur lue par un DS18B20 qui n'a pas encore converti (mise sous tension) : jamais une température
BATTERIE_BASSE = 20      # % : en dessous, message d'économie d'énergie (plus rien de gourmand à couper : le ventilateur reste actif, c'est la sécurité du nid)
BATTERIE_CRITIQUE = 10   # % : en dessous, les caméras et les LED infrarouges sont coupées (et refusées)
CAPACITE_WH = 76.8  # batterie LiFePO4 12,8 V × 6 Ah
# Consommation estimée (W) de chaque élément quand il est allumé : valeurs usuelles, à remplacer par des mesures (INA219) dès que possible.
# Pi 5 : ≈ 3 W au repos, ≈ 5-6 W avec deux flux caméra (on garde 5,5 W : le programme sert les flux en continu) ; ancienne valeur du Pi 4 : 3,5 W.
CONSO_W = {"pi": 5.5, "camera": 0.7, "led": 0.33, "ventilo_max": 0.6}  # ventilateur : 0,6 W à 100 %, proportionnel au cube de la vitesse (loi des ventilateurs)
# Tension au repos d'une batterie LiFePO4 12,8 V (4 cellules) selon sa charge : (pourcentage, volts). Sous charge la tension chute : l'estimation est grossière.
COURBE_LIFEPO4 = [(0, 10.0), (10, 12.0), (20, 12.8), (30, 12.9), (40, 13.0), (70, 13.1), (90, 13.2), (100, 13.4)]

# Historique des températures : « on mesure d'abord » — une saison de mesures avant de décider d'autre chose.
HISTO_MAX = 288                       # points gardés : 24 h à un point toutes les 5 min
FICHIER_HISTO = os.path.join(_DOSSIER, "historique-simule.json" if (os.environ.get("NICHOIR_MOCK") == "1" or "--mock" in sys.argv) else "historique.json")

# FACULTATIF : mode simulé, pour tester la page sans matériel (ordinateur). Jamais actif par défaut.
MOCK = os.environ.get("NICHOIR_MOCK") == "1" or "--mock" in sys.argv
HISTO_PERIODE = 5 if MOCK else 300    # secondes entre deux points (5 s en mode simulé pour que le graphique se remplisse)
SIM_ACCEL = float(os.environ.get("NICHOIR_MOCK_ACCEL", "1"))  # 1 = temps réel ; 10 ou 60 = le temps passe plus vite sur la batterie simulée (pour voir le niveau bouger)
MOCK_FORCE = {"nid": None, "ext": None}  # températures imposées pour les essais (nid de base, extérieur)
MOCK_NUIT = None   # None : jour / nuit d'après l'horloge ; True / False : imposé (le simulateur de l'app suit son bouton Jour / Nuit)
MOCK_PANNES = {"bme": False, "ventilo": False, "sonde": False}  # pannes simulées (essais depuis le simulateur de l'app) ; « ventilo » : le tachymètre ne compte plus rien ; « sonde » : la sonde de dehors est muette

# ---------------------------------------------------------------- matériel (chaque bloc est optionnel)
etat = {
    "t_nid": None, "hum_nid": None,
    "ventilo": {"pourcent": 0, "rpm": None, "mode": "arret", "raison": "arrêté", "alimente": False},   # mode : arret / manuel / auto ; rpm : null sans tachymètre ; alimente : 12 V présent (interrupteur GPIO27)
    "led_nid": False, "led_ext": False,
    "batterie": {"pourcent": None, "tension": None, "source": None},   # niveau de charge (mesuré par l'INA219 si présent, sinon simulé)
    "conso": {"total_w": None, "detail": {}},                          # consommation estimée selon ce qui est allumé
    "ext": {"t": None, "source": None, "maj": None},                   # température de dehors (sonde DS18B20) ; t = null sans mesure valable
    "auto": {**AUTO_DEFAUT, "etat": "inactif", "raison": "mode désactivé", "avertissements": []},   # ventilation automatique : réglages, état (inactif / veille / ventile / securite) et raison
    "cam1": True, "cam2": True,   # caméras allumées (flux en direct) ou éteintes (économie d'énergie)
    "erreurs": {},        # nom du matériel → message, quand quelque chose manque
    "derniere_lecture": None,
}
_vent = {"depuis": 0.0, "tacho_vu": False, "n": 0, "echantillons": []}   # suivi du ventilateur : instant de mise en marche, tachymètre déjà vu, impulsions comptées
LED_OK = VENT_OK = TACHO_OK = False


def _impulsion():
    _vent["n"] += 1


# FACULTATIF : sans les GPIO (ordinateur, Pi non câblé) le programme tourne quand même, la page signale seulement « GPIO indisponible ».
# REQUIS pour piloter les LED : le module MOSFET sur GPIO23 / 24 ; pour couper vraiment le ventilateur : l'interrupteur 12 V sur GPIO27.
try:
    from gpiozero import DigitalInputDevice, DigitalOutputDevice, PWMOutputDevice
    led_nid, led_ext = DigitalOutputDevice(23), DigitalOutputDevice(24)
    ventilo_12v = DigitalOutputDevice(27)   # interrupteur (MOSFET) du 12 V du ventilateur : bas au démarrage = ventilateur coupé
    LED_OK = True
except Exception as e:  # pas sur un Pi, ou gpiozero absent
    etat["erreurs"]["gpio"] = f"GPIO indisponible : {e}"

# REQUIS pour piloter le ventilateur : PWM sur GPIO18. Les ventilateurs 4 fils veulent un PWM de 25 kHz (21 à 28 kHz selon la norme Intel).
# ATTENTION : sur Pi 5 gpiozero passe par lgpio, dont le PWM matériel est limité à 10 kHz selon sa documentation : si 25 kHz est refusé,
# on retombe sur 10 kHz (le ventilateur marche, parfois avec un léger sifflement ou une vitesse moins linéaire) et on le dit sur la page.
# À valider sur le vrai matériel ; piste de repli : le PWM matériel du noyau (dtoverlay=pwm-2chan, bibliothèque rpi-hardware-pwm) qui sait faire 25 kHz.
try:
    try:
        ventilo_pwm = PWMOutputDevice(18, frequency=25000)
    except Exception as e25:
        ventilo_pwm = PWMOutputDevice(18, frequency=10000)
        etat["erreurs"]["ventilo_pwm"] = f"PWM 25 kHz refusé ({e25}) : repli sur 10 kHz"
    ventilo_pwm.value = 0
    VENT_OK = True
except Exception as e:
    etat["erreurs"]["ventilo_gpio"] = f"ventilateur indisponible (GPIO18) : {e}"

# FACULTATIF : tachymètre du ventilateur (fil jaune, GPIO17, pull-up, 2 impulsions par tour). Sans lui `rpm` reste null et la panne du ventilateur n'est pas détectée.
try:
    tacho = DigitalInputDevice(17, pull_up=True)
    tacho.when_activated = _impulsion
    TACHO_OK = True
except Exception as e:
    etat["erreurs"]["tachymetre"] = f"tachymètre indisponible : {e}"

# FACULTATIF : capteur BME280 du nid (température, humidité). Sans lui, la page affiche « — », le ventilateur ne démarre pas tout seul (on ne sait pas s'il fait chaud) et le reste marche.
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

# FACULTATIF : la sonde extérieure DS18B20 n'a pas de bibliothèque à installer : le noyau (1-Wire) la présente comme un fichier (voir lire_sonde_ext).

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
    """Consommation estimée (W) de ce qui est allumé : Pi, caméras, LED infrarouges, ventilateur."""
    d = {"pi": CONSO_W["pi"]}
    d["cameras"] = CONSO_W["camera"] * (bool(etat["cam1"]) + bool(etat["cam2"]))
    d["led"] = CONSO_W["led"] * (bool(etat["led_nid"]) + bool(etat["led_ext"]))
    d["ventilo"] = CONSO_W["ventilo_max"] * (etat["ventilo"]["pourcent"] / 100) ** 3
    d = {k: round(v, 2) for k, v in d.items()}
    return {"total_w": round(sum(d.values()), 1), "detail": d}


# ---------------------------------------------------------------- mode simulé (remplace le matériel quand MOCK est actif)
if MOCK:
    class Faux:
        """Sortie GPIO factice : accepte .value = … sans rien piloter."""
        value = 0

    ventilo_pwm, ventilo_12v, led_nid, led_ext = Faux(), Faux(), Faux(), Faux()
    LED_OK = VENT_OK = TACHO_OK = BME_OK = BAT_OK = True
    _vent["tacho_vu"] = True   # le tachymètre simulé « est branché » : une panne simulée est donc détectée
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

    # exces : de combien le nid dépasse dehors (soleil + couvée) ; effet : refroidissement apporté par le ventilateur (≤ 0) ; les deux avec de l'inertie
    sim = {"exces": 3.0, "effet": 0.0, "wh": 0.8 * CAPACITE_WH, "nuage": 0.9, "nuage_cible": 0.9}  # la batterie simulée part à 80 %

    def simuler():
        """Un pas de simulation : le nid suit dehors + un excès (≈ 4 °C le jour, 2 °C la nuit) réduit par le ventilateur (jusqu'à −3 °C à 100 %), avec de l'inertie."""
        h = time.localtime().tm_hour
        nuit = MOCK_NUIT if MOCK_NUIT is not None else not 6 <= h < 18
        t_ext = (16 if not nuit else 9) + 3 * math.sin(time.time() / 900) + random.uniform(-0.1, 0.1)
        if MOCK_FORCE["ext"] is not None:
            t_ext = MOCK_FORCE["ext"]
        sim["exces"] += ((2.0 if nuit else 4.0) - sim["exces"]) * 0.05
        sim["effet"] += (-3.0 * etat["ventilo"]["pourcent"] / 100 - sim["effet"]) * 0.05
        if MOCK_PANNES["bme"]:
            etat["t_nid"] = etat["hum_nid"] = None
            etat["erreurs"]["bme280"] = "lecture du capteur du nid : pas de réponse (panne simulée)"
        else:
            etat["erreurs"].pop("bme280", None)
            base = MOCK_FORCE["nid"] if MOCK_FORCE["nid"] is not None else t_ext + sim["exces"]
            etat["t_nid"] = round(base + sim["effet"] + random.uniform(-0.2, 0.2), 1)
            etat["hum_nid"] = round(70 + 10 * math.sin(time.time() / 900 * 2 * math.pi) + random.uniform(-1, 1), 0)
        # batterie simulée : décharge de la consommation, recharge par le panneau solaire le jour (≈ 55 W), rien la nuit
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
        if MOCK_PANNES["sonde"]:   # sonde de dehors simulée : plausible jour / nuit, ou muette en cas de panne simulée
            etat["ext"] = {"t": None, "source": None, "maj": None}
            etat["erreurs"]["sonde_ext"] = "sonde extérieure : pas de réponse (panne simulée)"
        else:
            etat["ext"] = {"t": round(t_ext, 1), "source": "simulée", "maj": time.strftime("%H:%M:%S")}
            etat["erreurs"].pop("sonde_ext", None)
        etat["batterie"] = {"pourcent": round(pc, 1), "tension": round(tension_depuis_pourcent(pc), 2), "source": "simulée", "solaire_w": round(solaire, 1)}


# ---------------------------------------------------------------- commandes
# REQUIS si le ventilateur est monté : c'est la seule fonction qui commande le PWM.
def ventilo(pourcent, mode="manuel", raison="", silencieux=False):
    """Vitesse du ventilateur en % (0 = arrêt). Un Noctua tourne mal en dessous de VENTILO_MIN : sous ce seuil on l'arrête.
    L'arrêt COUPE le 12 V (interrupteur GPIO27) : un ventilateur PWM à 0 % tournerait encore à ~20 %. Le 12 V n'est jamais coupé quand une vitesse est demandée."""
    try:
        p = int(round(max(0.0, min(100.0, float(pourcent)))))
    except (TypeError, ValueError):
        p = 0
    if p < VENTILO_MIN:
        p = 0
    v = etat["ventilo"]
    if p > 0 and v["pourcent"] == 0:
        _vent["depuis"] = time.time()   # pour détecter un ventilateur qui ne tourne pas
    if p == 0:
        _vent["depuis"] = 0.0
        mode, raison = "arret", raison or "arrêté"
    changement = (p, mode) != (v["pourcent"], v["mode"])
    v["pourcent"], v["mode"], v["raison"] = p, mode, raison or "commande manuelle"
    if p > 0:   # 12 V d'abord, un instant pour que le ventilateur démarre, puis le PWM
        if not v["alimente"]:
            if LED_OK:
                ventilo_12v.value = 1
                if not MOCK:
                    time.sleep(0.5)
            v["alimente"] = True
        if VENT_OK:
            ventilo_pwm.value = p / 100
    else:       # PWM à 0 (fil de commande bas : il n'alimente pas le ventilateur par son entrée), puis 12 V coupé
        if VENT_OK:
            ventilo_pwm.value = 0
        if LED_OK:
            ventilo_12v.value = 0
        v["alimente"] = False
    if changement and not silencieux:
        log(f"Ventilateur : {p} % ({mode}) — {v['raison']}" if p else f"Ventilateur : arrêt — {v['raison']}")


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
        if LED_OK:
            led_nid.value = int(nid)
    if ext is not None:
        etat["led_ext"] = bool(ext)
        log(f"LED extérieures : {'allumées' if ext else 'éteintes'}")
        if LED_OK:
            led_ext.value = int(ext)


# ---------------------------------------------------------------- lecture des capteurs, toutes les PERIODE secondes
# REQUIS : c'est la boucle qui lit les capteurs et applique la ventilation et les sécurités. Elle tourne en tâche de fond.
_lectures = [0]
_auto = {"alerte": 0.0, "alerte_vent": 0.0}   # instants de la dernière notification (une par heure au plus)


def charger_reglages():
    """Relit les réglages de la ventilation automatique gardés par un démarrage précédent (aucun fichier : valeurs par défaut)."""
    try:
        with open(FICHIER_REGLAGES, encoding="utf-8") as f:
            d = json.load(f)
        for k, (lo, hi) in AUTO_LIMITES.items():
            if k in d:
                etat["auto"][k] = max(lo, min(hi, float(d[k])))
        etat["auto"]["vitesse_max"] = max(etat["auto"]["vitesse_max"], etat["auto"]["vitesse_min"])
        etat["auto"]["actif"] = bool(d.get("actif", False))
        etat["auto"]["hiver"] = bool(d.get("hiver", d.get("bouche", False)))   # « bouche » : ancien nom du réglage
    except Exception:
        pass  # pas de fichier, ou environnement sans disque (simulateur du navigateur)


def sauver_reglages():
    try:
        with open(FICHIER_REGLAGES, "w", encoding="utf-8") as f:
            json.dump({k: etat["auto"][k] for k in AUTO_DEFAUT}, f)
    except Exception:
        pass


# ---------------------------------------------------------------- historique des températures
historique = []   # points {t: "HH:MM", nid, ext, hum, ventilo}, du plus ancien au plus récent
_histo = {"dernier": 0.0, "sauve": 0.0}


def charger_historique():
    """Relit historique.json (un redémarrage ne perd pas la courbe) ; aucun fichier ou disque absent : on repart de zéro."""
    try:
        with open(FICHIER_HISTO, encoding="utf-8") as f:
            pts = json.load(f)
        historique[:] = [p for p in pts if isinstance(p, dict) and "t" in p][-HISTO_MAX:]
    except Exception:
        pass


def sauver_historique():
    try:
        with open(FICHIER_HISTO, "w", encoding="utf-8") as f:
            json.dump(historique, f)
    except Exception:
        pass  # échec silencieux : pas de disque (simulateur du navigateur), carte pleine…


def enregistrer_historique():
    """Ajoute un point toutes les HISTO_PERIODE secondes (288 au plus = 24 h) ; sauvegarde sur disque au plus une fois par minute."""
    now = time.time()
    if now - _histo["dernier"] < HISTO_PERIODE:
        return
    _histo["dernier"] = now
    historique.append({"t": time.strftime("%H:%M"), "nid": etat["t_nid"], "ext": etat["ext"]["t"], "hum": etat["hum_nid"], "ventilo": etat["ventilo"]["pourcent"]})
    del historique[:-HISTO_MAX]
    if now - _histo["sauve"] >= 60:
        _histo["sauve"] = now
        sauver_historique()


def notifier(titre, message):
    """Alerte sur le téléphone via ntfy.sh si NICHOIR_NTFY_TOPIC est réglé ; sinon seulement dans le journal."""
    log(f"NOTIFICATION : {titre} — {message}")
    if not NTFY_TOPIC or MOCK:
        return
    try:
        req = urllib.request.Request(f"https://ntfy.sh/{NTFY_TOPIC}", data=message.encode("utf-8"), headers={"Title": "Nichoir " + titre.encode("ascii", "ignore").decode()})
        urllib.request.urlopen(req, timeout=8).close()
    except Exception as e:
        log(f"notification non envoyée : {e}")


def verifier_alerte():
    """Alerte si le nid dépasse `alerte_chaleur` (même sans la ventilation automatique) ; une notification par heure au plus."""
    a, t = etat["auto"], etat["t_nid"]
    if t is not None and t > a["alerte_chaleur"]:
        etat["erreurs"]["alerte_chaleur"] = f"ALERTE : le nid est à {t} °C (> {a['alerte_chaleur']} °C)"
        if time.time() - _auto["alerte"] > 3600:
            _auto["alerte"] = time.time()
            notifier("alerte chaleur", etat["erreurs"]["alerte_chaleur"])
    elif t is None or t < a["alerte_chaleur"] - 1:
        etat["erreurs"].pop("alerte_chaleur", None)


def mesurer_ventilo():
    """Vitesse réelle (tr/min) d'après les impulsions du tachymètre, sur une fenêtre de ~15 s (2 impulsions par tour). Sans tachymètre : rpm = None."""
    v = etat["ventilo"]
    if MOCK:
        v["rpm"] = 0 if (not v["alimente"] or v["pourcent"] == 0 or MOCK_PANNES["ventilo"]) else round(300 + 27 * v["pourcent"])
        return
    if not TACHO_OK:
        v["rpm"] = None
        return
    now = time.time()
    ech = _vent["echantillons"]
    ech.append((now, _vent["n"]))
    while len(ech) > 1 and now - ech[0][0] > 15:
        ech.pop(0)
    t0, n0 = ech[0]
    if now - t0 >= 3:
        v["rpm"] = round((_vent["n"] - n0) / 2 / (now - t0) * 60)
    if _vent["n"] > 0:
        _vent["tacho_vu"] = True


def verifier_ventilo():
    """Panne : commandé à 30 % ou plus depuis plus de VENTILO_PANNE_S secondes mais 0 tr/min (seulement si le tachymètre a déjà donné des impulsions : il est branché)."""
    v, e = etat["ventilo"], etat["erreurs"]
    if v["alimente"] and v["pourcent"] >= VENTILO_MIN and _vent["depuis"] and time.time() - _vent["depuis"] > VENTILO_PANNE_S and v["rpm"] == 0 and _vent["tacho_vu"]:
        e["ventilo"] = f"Le ventilateur est commandé à {v['pourcent']} % mais ne tourne pas (0 tr/min) : câblage, alimentation 12 V ou hélice bloquée ?"
        if time.time() - _auto["alerte_vent"] > 3600:
            _auto["alerte_vent"] = time.time()
            notifier("panne ventilateur", e["ventilo"])
    else:
        e.pop("ventilo", None)


def avertissements():
    """Limites de notre montage à signaler à l'utilisateur (le mode reste utilisable) : pas de sonde dehors, pas de tachymètre."""
    w = []
    if etat["ext"]["t"] is None:
        w.append("température extérieure inconnue (sonde absente, muette ou hors plage) : l'automatique ne démarre pas")
    if not TACHO_OK:
        w.append("tachymètre absent : une panne du ventilateur ne peut pas être détectée")
    return w


def regler_auto():
    """Ventilation automatique : appelée à chaque lecture. Désactivée, elle ne touche pas au ventilateur (commande manuelle)."""
    a, v = etat["auto"], etat["ventilo"]
    a["avertissements"] = avertissements()
    if not a["actif"]:
        a["etat"], a["raison"] = "inactif", "mode désactivé"
        return
    t, t_ext, e = etat["t_nid"], etat["ext"]["t"], etat["erreurs"]
    marche = v["mode"] == "auto" and v["pourcent"] > 0
    if a["hiver"]:   # mode hiver : le ventilateur est retiré, rien à démarrer
        if marche:
            ventilo(0, "arret", "mode hiver : ventilateur retiré")
        a["etat"], a["raison"] = "veille", "mode hiver : ventilateur retiré"
        return
    blocage = None
    if "bme280" in e or t is None:
        blocage = "capteur du nid absent ou muet : on ne sait pas s'il fait chaud"
    elif not NID_PLAUSIBLE[0] <= t <= NID_PLAUSIBLE[1]:
        blocage = f"capteur du nid : valeur aberrante ({t} °C)"
    if blocage:
        if marche:
            ventilo(0, "arret", "sécurité : " + blocage)
        a["etat"], a["raison"] = "securite", blocage
        return
    if t_ext is None and not marche:   # on ne sait pas si l'air de dehors est plus frais : par sécurité l'automatique ne démarre pas
        a["etat"], a["raison"] = "securite", "sonde extérieure absente ou muette : on ne sait pas si l'air de dehors est plus frais, l'automatique ne démarre pas"
        return
    seuil, hyst = a["seuil_marche"], a["hysteresis"]
    plus_chaud_dehors = t_ext is not None and t <= t_ext + 0.5
    if marche:
        if t <= seuil - hyst:
            ventilo(0, "arret", f"nid redescendu à {t} °C, sous {round(seuil - hyst, 1)} °C")
        elif plus_chaud_dehors:
            ventilo(0, "arret", f"le nid ({t} °C) n'est plus plus chaud que dehors ({t_ext} °C)")
    if not (v["mode"] == "auto" and v["pourcent"] > 0):   # à l'arrêt : doit-il démarrer ?
        if not (t > seuil and t > t_ext + a["ecart_ext"]):
            if t <= seuil:
                a["raison"] = f"nid à {t} °C, sous le seuil de {seuil} °C"
            elif plus_chaud_dehors:
                a["raison"] = f"nid à {t} °C mais dehors est plus chaud ({t_ext} °C) : l'air aspiré ne rafraîchirait pas"
            else:
                a["raison"] = f"nid à {t} °C, seulement {round(t - t_ext, 1)} °C de plus que dehors (écart minimal {a['ecart_ext']} °C)"
            a["etat"] = "veille"
            return
    # il tourne (ou démarre) : vitesse proportionnelle à l'excès de chaleur
    vmax = max(a["vitesse_max"], a["vitesse_min"])
    p = round(a["vitesse_min"] + (vmax - a["vitesse_min"]) * max(0.0, min(1.0, (t - seuil) / a["plage"])))
    if v["pourcent"] == 0 or abs(v["pourcent"] - p) >= 5:   # on ne retouche pas la vitesse pour un petit écart (le journal reste calme)
        ventilo(p, "auto", f"nid au-dessus du seuil de {seuil} °C", silencieux=v["pourcent"] > 0)
    a["etat"], a["raison"] = "ventile", f"nid à {t} °C, ventilateur à {v['pourcent']} %"


def lire_sonde_ext():
    """Lit la sonde DS18B20 par le noyau : retourne (température en °C, None) ou (None, message d'erreur).
    Le fichier w1_slave a deux lignes : « … crc=xx YES » (CRC bon) puis « … t=21437 » (millièmes de °C)."""
    fichiers = sorted(glob.glob(os.path.join(W1_DOSSIER, "28-*", "w1_slave")))
    if not fichiers:
        return None, "sonde extérieure absente : aucun 28-* dans /sys/bus/w1/devices (1-Wire activé ? câblage ?)"
    try:
        with open(fichiers[0], encoding="ascii") as f:
            lignes = f.read().strip().splitlines()
    except (OSError, UnicodeDecodeError) as e:
        return None, f"lecture de la sonde extérieure : {e}"
    if len(lignes) < 2 or not lignes[0].rstrip().endswith("YES"):
        return None, "sonde extérieure : CRC mauvais (câble trop long, résistance 4,7 kΩ absente ?)"
    try:
        t = int(lignes[1].rsplit("t=", 1)[1]) / 1000
    except (IndexError, ValueError):
        return None, "sonde extérieure : réponse illisible"
    if t == EXT_ERREUR_DS18B20:
        return None, "sonde extérieure : 85,0 °C = valeur d'erreur du DS18B20 (pas encore de conversion), refusée"
    if not EXT_PLAUSIBLE[0] <= t <= EXT_PLAUSIBLE[1]:
        return None, f"sonde extérieure : valeur aberrante ({round(t, 1)} °C)"
    return round(t, 1), None


def maj_sonde_ext():
    """Une lecture de la sonde de dehors (en mode simulé, simuler() s'en charge). Une mesure refusée laisse `ext.t` à null et l'erreur s'affiche."""
    if MOCK:
        return
    t, err = lire_sonde_ext()
    if err:
        etat["ext"] = {"t": None, "source": None, "maj": etat["ext"]["maj"]}
        if etat["erreurs"].get("sonde_ext") != err:
            log("! " + err)
        etat["erreurs"]["sonde_ext"] = err
    else:
        etat["ext"] = {"t": t, "source": "DS18B20", "maj": time.strftime("%H:%M:%S")}
        etat["erreurs"].pop("sonde_ext", None)


LOG_TOUS_LES = 10   # une ligne de situation toutes les 10 lectures (50 s sur le Pi, 10 s en mode simulé)


def lecture():
    """Une lecture des capteurs + la ventilation et les sécurités (appelée toutes les PERIODE secondes par boucle())."""
    if MOCK:
        simuler()
    elif BME_OK:
        try:
            d = bme280.sample(bus, BME_ADDR, cal)
            etat["t_nid"], etat["hum_nid"] = round(d.temperature, 1), round(d.humidity, 0)
            etat["erreurs"].pop("bme280", None)
        except Exception as e:
            etat["erreurs"]["bme280"] = f"lecture du capteur du nid : {e}"
    mesurer_ventilo()
    if BAT_OK and not MOCK:
        try:
            v = ina_bat.voltage()
            etat["batterie"] = {"pourcent": round(pourcent_depuis_tension(v), 0), "tension": round(v, 2), "source": "mesurée"}
            etat["erreurs"].pop("batterie", None)
        except Exception as e:
            etat["erreurs"]["batterie"] = f"lecture de la batterie : {e}"
    pc = etat["batterie"]["pourcent"]  # délestage : sous 10 % on coupe les caméras et les LED ; le ventilateur n'est JAMAIS coupé (sécurité du nid)
    if pc is not None and pc < BATTERIE_BASSE:
        if pc < BATTERIE_CRITIQUE:
            if etat["led_nid"] or etat["led_ext"]:
                leds(False, False)
            for n in (0, 1):
                if etat[f"cam{n + 1}"]:
                    camera(n, False)
        niveau = "caméras et LED coupées (le ventilateur reste actif)" if pc < BATTERIE_CRITIQUE else "économie d'énergie (sous 10 % : caméras et LED coupées)"
        if etat["erreurs"].get("delestage") is None:
            log(f"DÉLESTAGE : batterie à {pc} % : {niveau}")
        etat["erreurs"]["delestage"] = f"Batterie à {pc} % : {niveau}"
    else:
        etat["erreurs"].pop("delestage", None)
    maj_sonde_ext()
    verifier_alerte()
    verifier_ventilo()
    regler_auto()
    etat["conso"] = consommation()
    enregistrer_historique()
    etat["derniere_lecture"] = time.strftime("%H:%M:%S")
    _lectures[0] += 1
    if _lectures[0] % LOG_TOUS_LES == 1:  # un point de situation de temps en temps, pas à chaque lecture (le journal restait noyé)
        parts = [f"nid {etat['t_nid']} °C, {etat['hum_nid']} %", f"dehors {etat['ext']['t']} °C"]
        if etat["ventilo"]["pourcent"]:  # le ventilateur n'est cité que quand il tourne
            rpm = etat["ventilo"]["rpm"]
            parts.append(f"ventilateur {etat['ventilo']['pourcent']} %" + (f" ({rpm} tr/min)" if rpm is not None else ""))
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


@app.get("/api/historique")
def api_historique():
    """Les points de température des dernières 24 h : [{t, nid, ext, hum, ventilo}, …]."""
    return jsonify(historique)


def _desactiver_auto(pourquoi):
    """Une commande à la main reprend la main sur l'automatique."""
    if etat["auto"]["actif"]:
        etat["auto"]["actif"] = False
        sauver_reglages()
        log(f"Ventilation automatique désactivée : {pourquoi}")


@app.post("/api/ventilo")
def api_ventilo():
    """Commande manuelle : {pourcent: 30..100} pour tourner, {mode: 'arret'} ou {pourcent: 0} pour arrêter."""
    d = request.get_json(force=True) or {}
    _desactiver_auto("commande manuelle")
    if d.get("mode") == "arret":
        ventilo(0, "arret", "arrêté à la main")
    else:
        ventilo(d.get("pourcent", 0), "manuel", "commande manuelle")
    return jsonify(etat)


@app.post("/api/auto")
def api_auto():
    """Active ou règle la ventilation automatique : {actif, hiver, seuil_marche, ecart_ext, hysteresis, vitesse_min, vitesse_max, plage, alerte_chaleur} (tout est facultatif)."""
    d = request.get_json(force=True) or {}
    a = etat["auto"]
    for k, (lo, hi) in AUTO_LIMITES.items():
        if k in d:
            try:
                a[k] = max(lo, min(hi, float(d[k])))
            except (TypeError, ValueError):
                pass
    a["vitesse_max"] = max(a["vitesse_max"], a["vitesse_min"])
    if "hiver" in d:
        a["hiver"] = bool(d["hiver"])
    if "actif" in d:
        voulu = bool(d["actif"])
        if voulu and not a["actif"]:
            ventilo(0, "arret", "arrêté (l'automatique prend la main)", silencieux=True)   # l'automatique repart d'un ventilateur arrêté
            log("Ventilation automatique : activée")
        elif not voulu and a["actif"]:
            if etat["ventilo"]["mode"] == "auto":
                ventilo(0, "arret", "ventilation automatique désactivée")
            log("Ventilation automatique : désactivée")
        a["actif"] = voulu
    sauver_reglages()
    regler_auto()
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


import atexit
atexit.register(lambda: ventilo(0, "arret", "arrêt du programme", silencieux=True))   # le 12 V du ventilateur est coupé quand le programme s'arrête


if __name__ == "__main__":
    ventilo(0, "arret", "démarrage du programme", silencieux=True)   # 12 V coupé au démarrage
    charger_reglages()
    charger_historique()
    log("Nichoir high tech : page sur http://0.0.0.0:8080" + (" (mode simulé)" if MOCK else ""))
    for msg in etat["erreurs"].values():
        log("! " + msg)
    threading.Thread(target=boucle, daemon=True).start()
    if MOCK:
        for flux in cameras.values():
            threading.Thread(target=flux.tourne, daemon=True).start()
    app.run(host="0.0.0.0", port=8080, threaded=True)
