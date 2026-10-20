# ======================================================================================================
# power.py — CHAPITRE 4 : calcul de la consommation (aucun matériel ici).
#
# Une seule petite fonction pure (elle ne touche à rien, elle calcule) :
#   - consumption : puissance estimée (W) de tout ce qui est allumé, utile pour le budget du PoE+
# ======================================================================================================


def consumption():
    """Consommation estimée (W) de ce qui est allumé : Pi, caméras, LED infrarouges, ventilateur."""
    d = {"pi": POWER_W["pi"]}   # le Pi consomme toujours
    d["cameras"] = POWER_W["camera"] * (bool(state["cam1"]) + bool(state["cam2"]))   # 0,7 W par caméra allumée
    d["led"] = POWER_W["led"] * (bool(state["led_nid"]) + bool(state["led_ext"]))     # 0,33 W par carte de LED allumée
    d["ventilo"] = POWER_W["ventilo_max"] * (state["ventilo"]["pourcent"] / 100) ** 3   # loi des ventilateurs : la puissance varie comme le cube de la vitesse
    d = {k: round(v, 2) for k, v in d.items()}   # deux décimales pour chaque élément
    return {"total_w": round(sum(d.values()), 1), "detail": d}   # total au dixième de watt, plus le détail
