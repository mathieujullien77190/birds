"""Nichoir high tech — programme de test sur le Raspberry Pi 5.

Version volontairement minimale pour vérifier le matériel :
- lit le capteur du nid (BME280, I2C), la batterie (INA219, facultatif) et la sonde de température extérieure (DS18B20 étanche, 1-Wire) ;
- montre les deux caméras en direct (flux MJPEG) ;
- pilote le ventilateur de 60 mm (PWM gpiozero / lgpio : 25 kHz visé, repli à 10 kHz ; tachymètre) et les deux cartes de LED infrarouges ;
- ventilation automatique : le ventilateur n'aspire l'air chaud du nid que quand il fait trop chaud (désactivée au départ) ;
- garde l'historique des températures sur 24 h (pour décider, après une saison de mesures, s'il faut autre chose) ;
- sert une page web sur le port 8080.

Chaque partie du matériel est optionnelle : si un capteur ou une caméra manque, la page le dit et le reste marche.
Mode simulé : `NICHOIR_MOCK=1 python -m nichoir` (ou `--mock`) remplace capteurs, GPIO et caméras par des valeurs fausses mais plausibles,
pour essayer la page sur un ordinateur sans rien de branché (voir README).

Lancer : `python -m nichoir` depuis le dossier pi/ (ou /home/pi/nichoir sur le Pi).

Brochage (voir docs/schema-electronique.md) :
  Ventilateur (Noctua NF-A6x25 PWM, 12 V) : relais 3 V du 12 V côté + commandé par GPIO27 (broche 13), PWM GPIO18 (broche 12), tachymètre GPIO17 (broche 11, pull-up), masse commune broche 14
  Relais du ventilateur : bobine alimentée en 3,3 V (broche 17, partagée avec la sonde) et masse (broche 25)
  LED du nid : GPIO23 (module MOSFET du nid, PWM)   LED extérieures : GPIO24 (module MOSFET extérieur, PWM)
  BME280 : I2C adresse 0x76 (ou 0x77)        INA219 (batterie) : I2C adresse 0x41
  Sonde extérieure DS18B20 : 3,3 V broche 17, masse broche 20, donnée GPIO4 (broche 7, 1-Wire, résistance de rappel 4,7 kΩ sur le module) ;
    activer le 1-Wire : `dtoverlay=w1-gpio` dans /boot/firmware/config.txt (puis redémarrer) ; lecture : /sys/bus/w1/devices/28-*/w1_slave

COMMENT CE DOSSIER EST ORGANISÉ
-------------------------------
Le programme est coupé en « chapitres » : un fichier .py par sujet (config, matériel, simulation, commandes, ventilation
automatique, sonde, serveur web…). Chaque fichier est commenté ligne par ligne et commence par un cadre qui dit ce qu'il contient.

Particularité : les chapitres ne sont PAS des modules Python séparés qu'on importe les uns dans les autres. Ils sont exécutés
l'un après l'autre DANS LE MÊME ESPACE DE NOMS, comme s'ils étaient collés bout à bout dans un seul fichier. Conséquences :
  - une variable ou une fonction définie dans un chapitre est visible dans tous les chapitres qui viennent APRÈS, sans `import` ;
  - l'ORDRE de la liste CHAPTERS ci-dessous compte (un chapitre ne peut utiliser que ce qui est défini avant lui, ou dans une
    fonction appelée plus tard) ;
  - les réglages qui changent pendant l'exécution (MOCK, LED_OK…) restent partagés partout : c'est ce qui permet aux tests et au
    simulateur du navigateur de les modifier à un seul endroit.
"""
import os as _os

# L'ordre est important : chaque chapitre s'appuie sur ceux qui le précèdent.
CHAPTERS = [
    "config",       # 1  bibliothèques, journal, toutes les constantes
    "state",         # 2  le dictionnaire `state` affiché par la page
    "hardware",     # 3  GPIO, ventilateur, tachymètre, capteur du nid, batterie, caméras
    "battery",     # 4  calculs : niveau de la batterie, consommation
    "simulation",       # 5  le mode simulé (faux matériel)
    "commands",    # 6  fan(), camera(), leds()
    "settings",     # 7  réglages gardés dans reglages.json
    "history",   # 8  historique des températures
    "alerts",      # 9  notifications, mesure et panne du ventilateur
    "auto",         # 10 ventilation automatique
    "probe",        # 11 sonde de température extérieure
    "reading",      # 12 la lecture périodique et sa boucle
    "web",          # 13 serveur Flask : page, API, flux vidéo
    "startup",    # 14 démarrage (main) et arrêt
]

_HERE = _os.path.dirname(_os.path.abspath(__file__))  # le dossier où se trouvent les chapitres
for _name in CHAPTERS:
    _path = _os.path.join(_HERE, _name + ".py")
    with open(_path, encoding="utf-8") as _f:
        # On compile avec le VRAI nom du fichier (les messages d'erreur et la couverture de tests le citent), puis on exécute
        # dans l'espace de noms du paquet (globals()) : tout ce que le chapitre définit devient visible partout.
        exec(compile(_f.read(), _path, "exec"), globals())
