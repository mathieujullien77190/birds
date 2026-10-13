# ======================================================================================================
# auto.py — CHAPITRE 10 : la VENTILATION AUTOMATIQUE (le « cerveau » du ventilateur).
#
# run_auto() est appelée à chaque lecture (toutes les 5 s). Elle décide si le ventilateur doit
# démarrer, à quelle vitesse, et quand s'arrêter. Les SÉCURITÉS passent avant tout :
#   - capteur du nid absent ou aberrant  → on ne démarre pas (on ne sait pas s'il fait chaud) ;
#   - sonde de dehors absente ou muette  → on ne démarre pas (on ne sait pas si l'air de dehors est plus frais) ;
#   - mode hiver (ventilateur retiré)    → on ne démarre jamais.
# Désactivée, elle ne touche pas au ventilateur (la commande manuelle reste libre).
# ======================================================================================================


def run_auto():
    """Ventilation automatique : appelée à chaque lecture. Désactivée, elle ne touche pas au ventilateur (commande manuelle)."""
    a, v = state["auto"], state["ventilo"]
    a["avertissements"] = warnings()   # on remet à jour la liste des avertissements affichés sur la page
    if not a["actif"]:
        a["etat"], a["raison"] = "inactif", "mode désactivé"
        return
    t, t_out, e = state["t_nid"], state["ext"]["t"], state["erreurs"]   # température du nid, de dehors, erreurs en cours
    running = v["mode"] == "auto" and v["pourcent"] > 0   # vrai si c'est l'automatique qui fait tourner le ventilateur en ce moment
    if a["hiver"]:   # mode hiver : le ventilateur est retiré, rien à démarrer
        if running:
            fan(0, "arret", "mode hiver : ventilateur retiré")
        a["etat"], a["raison"] = "veille", "mode hiver : ventilateur retiré"
        return
    blocker = None   # raison éventuelle pour laquelle on ne peut pas décider
    if "bme280" in e or t is None:
        blocker = "capteur du nid absent ou muet : on ne sait pas s'il fait chaud"
    elif not NEST_PLAUSIBLE[0] <= t <= NEST_PLAUSIBLE[1]:
        blocker = f"capteur du nid : valeur aberrante ({t} °C)"
    if blocker:   # sécurité : capteur du nid en défaut
        if running:
            fan(0, "arret", "sécurité : " + blocker)   # il tournait : on l'arrête
        a["etat"], a["raison"] = "securite", blocker
        return
    if t_out is None and not running:   # on ne sait pas si l'air de dehors est plus frais : par sécurité l'automatique ne démarre pas
        a["etat"], a["raison"] = "securite", "sonde extérieure absente ou muette : on ne sait pas si l'air de dehors est plus frais, l'automatique ne démarre pas"
        return
    threshold, hyst = a["seuil_marche"], a["hysteresis"]   # seuil de démarrage (°C) et hystérésis (écart avant l'arrêt)
    outside_warmer = t_out is not None and t <= t_out + 0.5   # le nid n'est plus plus chaud que dehors (à 0,5 °C près)
    if running:   # il tourne : doit-il s'arrêter ?
        if t <= threshold - hyst:
            fan(0, "arret", f"nid redescendu à {t} °C, sous {round(threshold - hyst, 1)} °C")
        elif outside_warmer:
            fan(0, "arret", f"le nid ({t} °C) n'est plus plus chaud que dehors ({t_out} °C)")
    if not (v["mode"] == "auto" and v["pourcent"] > 0):   # à l'arrêt : doit-il démarrer ?
        if not (t > threshold and t > t_out + a["ecart_ext"]):   # les deux conditions de démarrage ne sont pas réunies : on explique pourquoi
            if t <= threshold:
                a["raison"] = f"nid à {t} °C, sous le seuil de {threshold} °C"
            elif outside_warmer:
                a["raison"] = f"nid à {t} °C mais dehors est plus chaud ({t_out} °C) : l'air aspiré ne rafraîchirait pas"
            else:
                a["raison"] = f"nid à {t} °C, seulement {round(t - t_out, 1)} °C de plus que dehors (écart minimal {a['ecart_ext']} °C)"
            a["etat"] = "veille"
            return
    # il tourne (ou démarre) : vitesse proportionnelle à l'excès de chaleur
    vmax = max(a["vitesse_max"], a["vitesse_min"])
    p = round(a["vitesse_min"] + (vmax - a["vitesse_min"]) * max(0.0, min(1.0, (t - threshold) / a["plage"])))   # de vitesse_min (au seuil) à vitesse_max (seuil + plage)
    if v["pourcent"] == 0 or abs(v["pourcent"] - p) >= 5:   # on ne retouche pas la vitesse pour un petit écart (le journal reste calme)
        fan(p, "auto", f"nid au-dessus du seuil de {threshold} °C", silent=v["pourcent"] > 0)
    a["etat"], a["raison"] = "ventile", f"nid à {t} °C, ventilateur à {v['pourcent']} %"
