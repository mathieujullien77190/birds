# ======================================================================================================
# battery.py — CHAPITRE 4 : calculs sur la batterie et la consommation (aucun matériel ici).
#
# Trois petites fonctions pures (elles ne touchent à rien, elles calculent) :
#   - percent_from_voltage : tension mesurée (V) → niveau de charge (%)
#   - voltage_from_percent : l'inverse, utilisé par le mode simulé
#   - consumption             : puissance estimée (W) de tout ce qui est allumé
# ======================================================================================================


def percent_from_voltage(v):
    """Charge (0–100 %) d'après la tension au repos, en interpolant LIFEPO4_CURVE."""
    # On parcourt la courbe par segments consécutifs : (p0, v0) → (p1, v1).
    for (p0, v0), (p1, v1) in zip(LIFEPO4_CURVE, LIFEPO4_CURVE[1:]):
        if v <= v1:   # la tension est dans ce segment (ou en dessous)
            return max(0.0, p0 + (p1 - p0) * (v - v0) / (v1 - v0))   # interpolation linéaire, jamais négative
    return 100.0   # au-dessus du dernier point de la courbe : batterie pleine


def voltage_from_percent(p):
    """Tension au repos (V) d'une batterie chargée à p % : l'interpolation inverse de la fonction précédente."""
    for (p0, v0), (p1, v1) in zip(LIFEPO4_CURVE, LIFEPO4_CURVE[1:]):
        if p <= p1:
            return v0 + (v1 - v0) * (p - p0) / (p1 - p0)
    return LIFEPO4_CURVE[-1][1]   # au-delà de 100 % : la dernière tension de la courbe


def consumption():
    """Consommation estimée (W) de ce qui est allumé : Pi, caméras, LED infrarouges, ventilateur."""
    d = {"pi": POWER_W["pi"]}   # le Pi consomme toujours
    d["cameras"] = POWER_W["camera"] * (bool(state["cam1"]) + bool(state["cam2"]))   # 0,7 W par caméra allumée
    d["led"] = POWER_W["led"] * (bool(state["led_nid"]) + bool(state["led_ext"]))     # 0,33 W par carte de LED allumée
    d["ventilo"] = POWER_W["ventilo_max"] * (state["ventilo"]["pourcent"] / 100) ** 3   # loi des ventilateurs : la puissance varie comme le cube de la vitesse
    d = {k: round(v, 2) for k, v in d.items()}   # deux décimales pour chaque élément
    return {"total_w": round(sum(d.values()), 1), "detail": d}   # total au dixième de watt, plus le détail
