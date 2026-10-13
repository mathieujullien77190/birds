# ======================================================================================================
# history.py — CHAPITRE 8 : l'HISTORIQUE des températures sur 24 heures.
#
# Un point (heure, température du nid, de dehors, humidité, vitesse du ventilateur) toutes les
# 5 minutes, 288 points au plus. Sauvé dans historique.json au plus une fois par minute, relu au
# démarrage : un redémarrage ne perd pas la courbe. La page web l'affiche sous forme de graphique.
# ======================================================================================================

# ---------------------------------------------------------------- historique des températures
history = []   # points {t: "HH:MM", nid, ext, hum, ventilo}, du plus ancien au plus récent
_history_state = {"dernier": 0.0, "sauve": 0.0}   # instants du dernier point ajouté et de la dernière sauvegarde sur disque


def load_history():
    """Relit historique.json (un redémarrage ne perd pas la courbe) ; aucun fichier ou disque absent : on repart de zéro."""
    try:
        with open(HISTORY_FILE, encoding="utf-8") as f:
            pts = json.load(f)
        history[:] = [p for p in pts if isinstance(p, dict) and "t" in p][-HISTORY_MAX:]   # on garde les points valides, les 288 derniers
    except Exception:
        pass


def save_history():
    """Écrit historique.json."""
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f)
    except Exception:
        pass  # échec silencieux : pas de disque (simulateur du navigateur), carte pleine…


def record_history():
    """Ajoute un point toutes les HISTORY_PERIOD secondes (288 au plus = 24 h) ; sauvegarde sur disque au plus une fois par minute."""
    now = time.time()
    if now - _history_state["dernier"] < HISTORY_PERIOD:
        return   # pas encore l'heure d'un nouveau point
    _history_state["dernier"] = now
    history.append({"t": time.strftime("%H:%M"), "nid": state["t_nid"], "ext": state["ext"]["t"], "hum": state["hum_nid"], "ventilo": state["ventilo"]["pourcent"]})
    del history[:-HISTORY_MAX]   # on ne garde que les 288 derniers points
    if now - _history_state["sauve"] >= 60:   # écrire sur la carte microSD au plus une fois par minute (pour ne pas l'user)
        _history_state["sauve"] = now
        save_history()
