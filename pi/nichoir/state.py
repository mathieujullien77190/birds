# ======================================================================================================
# state.py — CHAPITRE 2 : l'ÉTAT du nichoir, un grand dictionnaire partagé par tout le programme.
#
# `state` est ce que la page web affiche (route /api/etat) : températures, ventilateur, LED, consommation,
# erreurs… Chaque chapitre le lit et le met à jour. Si tu ajoutes une clé ici, pense à l'ajouter aussi
# dans le site (pi/site/src/types/device.ts) : un test vérifie que les deux sont d'accord.
# ======================================================================================================

# ---------------------------------------------------------------- matériel (chaque bloc est optionnel)
state = {
    "t_nid": None, "hum_nid": None,   # température (°C) et humidité (%) du nid ; None tant qu'il n'y a pas de mesure
    "ventilo": {"pourcent": 0, "rpm": None, "mode": "arret", "raison": "arrêté", "alimente": False},   # mode : arret / manuel / auto ; rpm : null sans tachymètre ; alimente : 5 V présent (interrupteur GPIO27)
    "led_nid": False, "led_ext": False,   # LED infrarouges du nid et de l'extérieur : allumées (True) ou non
    "conso": {"total_w": None, "detail": {}},                          # consommation estimée selon ce qui est allumé
    "ext": {"t": None, "source": None, "maj": None},                   # température de dehors (sonde DS18B20) ; t = null sans mesure valable
    "auto": {**AUTO_DEFAULTS, "etat": "inactif", "raison": "mode désactivé", "avertissements": []},   # ventilation automatique : réglages, état (inactif / veille / ventile / securite) et raison
    "cam1": True, "cam2": True,   # caméras allumées (flux en direct) ou éteintes (économie d'énergie)
    "erreurs": {},        # nom du matériel → message, quand quelque chose manque
    "derniere_lecture": None,   # heure (HH:MM:SS) de la dernière lecture des capteurs
}
# Suivi du ventilateur (pas affiché sur la page) : instant de mise en marche, tachymètre déjà vu, impulsions comptées.
_fan = {"depuis": 0.0, "tacho_vu": False, "n": 0, "echantillons": []}
# Drapeaux « ce matériel marche » : remplis plus loin (hardware.py), tous faux au départ.
LED_OK = FAN_OK = TACH_OK = False


def _pulse():
    """Appelée par le tachymètre à CHAQUE impulsion du ventilateur : on ne fait que compter (le calcul des tours/minute est dans measure_fan)."""
    _fan["n"] += 1
