# ======================================================================================================
# alerts.py — CHAPITRE 9 : les ALERTES et la surveillance du ventilateur.
#
#   - notify                : envoie un message sur le téléphone (ntfy.sh) et l'écrit dans le journal
#   - check_alert           : alerte « il fait trop chaud dans le nid »
#   - measure_fan           : vitesse réelle du ventilateur (tours par minute) d'après le tachymètre
#   - check_fan             : détecte un ventilateur commandé mais à l'arrêt (panne)
#   - warnings              : liste ce qui limite le montage (pas de sonde dehors, pas de tachymètre)
# ======================================================================================================


def notify(title, message):
    """Alerte sur le téléphone via ntfy.sh si NICHOIR_NTFY_TOPIC est réglé ; sinon seulement dans le journal."""
    log(f"NOTIFICATION : {title} — {message}")
    if not NTFY_TOPIC or MOCK:
        return   # pas de sujet ntfy réglé, ou mode simulé : rien n'est envoyé sur Internet
    try:
        req = urllib.request.Request(f"https://ntfy.sh/{NTFY_TOPIC}", data=message.encode("utf-8"), headers={"Title": "Nichoir " + title.encode("ascii", "ignore").decode()})   # le titre est réduit à de l'ASCII (accents retirés) pour l'en-tête HTTP
        urllib.request.urlopen(req, timeout=8).close()
    except Exception as e:
        log(f"notification non envoyée : {e}")


def check_alert():
    """Alerte si le nid dépasse `alerte_chaleur` (même sans la ventilation automatique) ; une notification par heure au plus."""
    a, t = state["auto"], state["t_nid"]
    if t is not None and t > a["alerte_chaleur"]:
        state["erreurs"]["alerte_chaleur"] = f"ALERTE : le nid est à {t} °C (> {a['alerte_chaleur']} °C)"   # message affiché en rouge sur la page
        if time.time() - _notified["alerte"] > 3600:   # une notification par heure au plus
            _notified["alerte"] = time.time()
            notify("alerte chaleur", state["erreurs"]["alerte_chaleur"])
    elif t is None or t < a["alerte_chaleur"] - 1:   # l'alerte s'efface quand le nid est redescendu de 1 °C sous le seuil (évite le clignotement)
        state["erreurs"].pop("alerte_chaleur", None)


def measure_fan():
    """Vitesse réelle (tr/min) d'après les impulsions du tachymètre, sur une fenêtre de ~15 s (2 impulsions par tour). Sans tachymètre : rpm = None."""
    v = state["ventilo"]
    if MOCK:   # en simulation : une vitesse inventée, proportionnelle à la commande (ou 0 si le ventilateur est coupé ou en panne simulée)
        v["rpm"] = 0 if (not v["alimente"] or v["pourcent"] == 0 or MOCK_FAULTS["ventilo"]) else round(300 + 27 * v["pourcent"])
        return
    if not TACH_OK:
        v["rpm"] = None   # pas de tachymètre : vitesse inconnue
        return
    now = time.time()
    samples = _fan["echantillons"]   # liste de (instant, nombre d'impulsions déjà comptées)
    samples.append((now, _fan["n"]))
    while len(samples) > 1 and now - samples[0][0] > 15:   # on oublie les échantillons de plus de 15 s
        samples.pop(0)
    t0, n0 = samples[0]
    if now - t0 >= 3:   # il faut au moins 3 s de mesure pour un résultat fiable
        v["rpm"] = round((_fan["n"] - n0) / 2 / (now - t0) * 60)   # impulsions → tours (÷ 2) → par minute (× 60)
    if _fan["n"] > 0:
        _fan["tacho_vu"] = True   # le tachymètre a donné au moins une impulsion : il est bien branché


def check_fan():
    """Panne : commandé à 30 % ou plus depuis plus de FAN_FAULT_S secondes mais 0 tr/min (seulement si le tachymètre a déjà donné des impulsions : il est branché)."""
    v, e = state["ventilo"], state["erreurs"]
    if v["alimente"] and v["pourcent"] >= FAN_MIN and _fan["depuis"] and time.time() - _fan["depuis"] > FAN_FAULT_S and v["rpm"] == 0 and _fan["tacho_vu"]:
        e["ventilo"] = f"Le ventilateur est commandé à {v['pourcent']} % mais ne tourne pas (0 tr/min) : câblage, alimentation 5 V ou hélice bloquée ?"
        if time.time() - _notified["alerte_vent"] > 3600:   # une notification par heure au plus
            _notified["alerte_vent"] = time.time()
            notify("panne ventilateur", e["ventilo"])
    else:
        e.pop("ventilo", None)   # tout va bien : on efface l'erreur


def warnings():
    """Limites de notre montage à signaler à l'utilisateur (le mode reste utilisable) : pas de sonde dehors, pas de tachymètre."""
    w = []
    if state["ext"]["t"] is None:
        w.append("température extérieure inconnue (sonde absente, muette ou hors plage) : l'automatique ne démarre pas")
    if not TACH_OK:
        w.append("tachymètre absent : une panne du ventilateur ne peut pas être détectée")
    return w
