# ======================================================================================================
# settings.py — CHAPITRE 7 : garder les RÉGLAGES de la ventilation automatique d'un démarrage à l'autre.
#
# Les réglages (seuil, vitesse, mode hiver…) sont écrits dans reglages.json à chaque changement et
# relus au démarrage : on ne les perd pas quand le Pi redémarre. Sans disque (simulateur du
# navigateur) rien n'est écrit et ce n'est pas grave.
# ======================================================================================================

# ---------------------------------------------------------------- lecture des capteurs, toutes les PERIOD secondes
# REQUIS : c'est la boucle qui lit les capteurs et applique la ventilation et les sécurités. Elle tourne en tâche de fond (voir reading.py).
_read_count = [0]   # nombre de lectures faites (une liste d'un élément pour pouvoir le modifier depuis une fonction)
_notified = {"alerte": 0.0, "alerte_vent": 0.0}   # instants de la dernière notification (une par heure au plus)


def load_settings():
    """Relit les réglages de la ventilation automatique gardés par un démarrage précédent (aucun fichier : valeurs par défaut)."""
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            d = json.load(f)   # le contenu du fichier, sous forme de dictionnaire
        for k, (lo, hi) in AUTO_LIMITS.items():
            if k in d:
                state["auto"][k] = max(lo, min(hi, float(d[k])))   # chaque valeur est ramenée dans ses bornes
        state["auto"]["vitesse_max"] = max(state["auto"]["vitesse_max"], state["auto"]["vitesse_min"])   # le maximum ne peut pas être sous le minimum
        state["auto"]["actif"] = bool(d.get("actif", False))
        state["auto"]["hiver"] = bool(d.get("hiver", d.get("bouche", False)))   # « bouche » : ancien nom du réglage
    except Exception:
        pass  # pas de fichier, ou environnement sans disque (simulateur du navigateur)


def save_settings():
    """Écrit les réglages dans reglages.json (échec silencieux : un réglage non gardé n'empêche pas le nichoir de marcher)."""
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump({k: state["auto"][k] for k in AUTO_DEFAULTS}, f)   # seulement les clés des réglages, pas l'état ni la raison
    except Exception:
        pass
