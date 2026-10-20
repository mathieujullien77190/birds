# ======================================================================================================
# config.py — CHAPITRE 1 : les bibliothèques, le journal et TOUTES les constantes du programme.
#
# Ce fichier ne fait rien tout seul : il pose les réglages (seuils, limites, durées, mode simulé) que
# les autres chapitres lisent. Pour changer un seuil de ventilation, un réglage ou une
# durée, c'est ici.
#
# Rappel : les chapitres du dossier `nichoir/` partagent UN SEUL espace de noms (voir __init__.py) :
# une variable posée ici est visible partout, sans `import`.
# ======================================================================================================

# --- bibliothèques standard de Python (déjà installées, rien à ajouter) ---
import math          # sin() pour les valeurs simulées qui varient doucement
import os            # variables d'environnement et chemins de fichiers
import random        # petites variations aléatoires du mode simulé
import struct        # fabrique les octets d'une image PNG factice (mode simulé)
import sys           # arguments de la ligne de commande (--mock)
import glob          # cherche les fichiers de la sonde de température (1-Wire)
import json          # lit et écrit reglages.json et historique.json
import threading     # tâches de fond (boucle de lecture, flux des caméras simulées)
import time          # heure, pauses entre deux lectures
import urllib.request  # envoie les notifications sur le téléphone (ntfy.sh)
import zlib          # compresse l'image PNG factice

# --- Flask : le petit serveur web (à installer : voir requirements.txt) ---
from flask import Flask, Response, jsonify, request, send_from_directory


def log(msg):
    """Écrit une ligne datée sur la sortie standard (visible avec `journalctl -u nichoir -f` sur le Pi, ou dans le terminal du simulateur)."""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)  # flush=True : la ligne sort tout de suite, sans attendre


# ---------------------------------------------------------------- ventilation automatique : réglages par défaut
# Ventilation AUTOMATIQUE (désactivée au départ ; tous les réglages sont modifiables depuis la page et gardés dans reglages.json).
# Les seuils portent sur la température INTÉRIEURE du nid (BME280) :
#   démarre  : le nid dépasse `seuil_marche` ET le nid dépasse dehors (sonde extérieure) d'au moins `ecart_ext` ; sans mesure de dehors (sonde absente, muette, hors plage) l'automatique NE DÉMARRE PAS ;
#   vitesse  : de `vitesse_min` à `vitesse_max`, proportionnelle sur `plage` °C au-dessus du seuil ;
#   s'arrête : le nid repasse sous `seuil_marche` − `hysteresis`, OU le nid n'est plus plus chaud que dehors (aspirer l'air de dehors ne refroidirait plus) ;
#   `hiver` : « mode hiver » (cassette du ventilateur retirée, bloc isolant à sa place, bouchon de la prise d'air du dessous posé) : l'automatique ne démarre jamais le ventilateur (la commande manuelle reste possible) ;
#   `alerte_chaleur` : au-dessus, une alerte (et une notification) même si l'automatique est éteint.
# Sécurités prioritaires : voir run_auto() dans auto.py.
AUTO_DEFAULTS = {"actif": False, "hiver": False, "seuil_marche": 28.0, "ecart_ext": 2.0, "hysteresis": 2.0, "vitesse_min": 30.0, "vitesse_max": 100.0, "plage": 5.0, "alerte_chaleur": 35.0}
# Bornes acceptées pour chaque réglage (une valeur reçue de la page est ramenée dans ces bornes) : mêmes clés que AUTO_DEFAULTS (hors `actif` et `hiver`).
AUTO_LIMITS = {"seuil_marche": (15.0, 45.0), "ecart_ext": (0.0, 15.0), "hysteresis": (0.2, 10.0), "vitesse_min": (30.0, 100.0), "vitesse_max": (30.0, 100.0),
                "plage": (1.0, 20.0), "alerte_chaleur": (31.0, 50.0)}
NEST_PLAUSIBLE = (-40.0, 60.0)   # hors de ces bornes une mesure du nid est jugée aberrante (capteur défaillant)
NTFY_TOPIC = os.environ.get("NICHOIR_NTFY_TOPIC", "")   # FACULTATIF : sujet ntfy.sh pour recevoir les alertes sur le téléphone (https://ntfy.sh)

# ---------------------------------------------------------------- fichiers
# _PACKAGE = le dossier nichoir/ ; _ROOT = son parent, c'est-à-dire le dossier pi/ où vivent web/, reglages.json et historique.json.
# `globals().get("__file__", ".")` : dans le simulateur du navigateur (Pyodide) il n'y a pas de fichier, on retombe sur le dossier courant.
_PACKAGE = os.path.dirname(os.path.abspath(globals().get("__file__", ".")))
_ROOT = os.path.dirname(_PACKAGE) if "__file__" in globals() else _PACKAGE
SETTINGS_FILE = os.path.join(_ROOT, "reglages.json")  # réglages de la ventilation automatique, gardés d'un démarrage à l'autre

# ---------------------------------------------------------------- ventilateur
FAN_MIN = 30    # % : vitesse minimale réelle quand le ventilateur tourne (en dessous : arrêt)
FAN_FAULT_S = 10   # s : commandé mais 0 tr/min depuis plus longtemps que ça = panne
PERIOD = 5.0       # secondes entre deux lectures

# ---------------------------------------------------------------- sonde de température extérieure
# FACULTATIF : sonde de température extérieure DS18B20 étanche (1-Wire, GPIO4). Le noyau la lit dans /sys/bus/w1/devices/28-*/w1_slave
# (activer `dtoverlay=w1-gpio` dans /boot/firmware/config.txt). Sans elle la page affiche « — », l'automatique ne démarre pas et le reste marche.
W1_DIR = "/sys/bus/w1/devices"
OUTSIDE_PLAUSIBLE = (-40.0, 60.0)   # hors de ces bornes une mesure de dehors est jugée aberrante (sonde défaillante)
DS18B20_ERROR_VALUE = 85.0       # valeur lue par un DS18B20 qui n'a pas encore converti (mise sous tension) : jamais une température

# ---------------------------------------------------------------- consommation
# Consommation estimée (W) de chaque élément quand il est allumé : valeurs usuelles, à remplacer par des mesures dès que possible.
# Pi 5 : ≈ 3 W au repos, ≈ 5-6 W avec deux flux caméra (on garde 5,5 W : le programme sert les flux en continu) ; ancienne valeur du Pi 4 : 3,5 W.
POWER_W = {"pi": 5.5, "camera": 0.7, "led": 0.33, "ventilo_max": 0.6}  # ventilateur : 0,6 W à 100 %, proportionnel au cube de la vitesse (loi des ventilateurs)

# ---------------------------------------------------------------- historique des températures
# Historique des températures : « on mesure d'abord » — une saison de mesures avant de décider d'autre chose.
HISTORY_MAX = 288                       # points gardés : 24 h à un point toutes les 5 min
# En mode simulé l'historique va dans un autre fichier, pour ne pas mélanger de fausses valeurs avec les vraies.
HISTORY_FILE = os.path.join(_ROOT, "historique-simule.json" if (os.environ.get("NICHOIR_MOCK") == "1" or "--mock" in sys.argv) else "historique.json")

# ---------------------------------------------------------------- mode simulé
# FACULTATIF : mode simulé, pour tester la page sans matériel (ordinateur). Jamais actif par défaut.
MOCK = os.environ.get("NICHOIR_MOCK") == "1" or "--mock" in sys.argv   # vrai si on lance avec NICHOIR_MOCK=1 ou l'option --mock
HISTORY_PERIOD = 5 if MOCK else 300    # secondes entre deux points (5 s en mode simulé pour que le graphique se remplisse)
MOCK_FORCE = {"nid": None, "ext": None}  # températures imposées pour les essais (nid de base, extérieur)
MOCK_NIGHT = None   # None : jour / nuit d'après l'horloge ; True / False : imposé (le simulateur de l'app suit son bouton Jour / Nuit)
MOCK_FAULTS = {"bme": False, "ventilo": False, "sonde": False}  # pannes simulées (essais depuis le simulateur de l'app) ; « ventilo » : le tachymètre ne compte plus rien ; « sonde » : la sonde de dehors est muette
