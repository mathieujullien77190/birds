# ======================================================================================================
# commands.py — CHAPITRE 6 : les COMMANDES (ce que la page web ou l'automatique demandent au matériel).
#
#   - fan(pourcent, ...) : règle le ventilateur (la SEULE fonction qui touche au PWM et au relais 5 V)
#   - camera(num, on)        : allume ou éteint une caméra
#   - leds(nid, ext)         : allume ou éteint les LED infrarouges
# Chaque commande met aussi à jour `state` (pour que la page affiche la bonne chose) et écrit dans le journal.
# ======================================================================================================

# ---------------------------------------------------------------- commandes
# REQUIS si le ventilateur est monté : c'est la seule fonction qui commande le PWM.
def fan(percent, mode="manuel", reason="", silent=False):
    """Vitesse du ventilateur en % (0 = arrêt). Un Noctua tourne mal en dessous de FAN_MIN : sous ce seuil on l'arrête.
    L'arrêt COUPE le 5 V (relais GPIO27) : un ventilateur PWM à 0 % tournerait encore à ~20 %. Le 5 V n'est jamais coupé quand une vitesse est demandée."""
    try:
        p = int(round(max(0.0, min(100.0, float(percent)))))   # on ramène la demande dans 0..100 et on arrondit
    except (TypeError, ValueError):
        p = 0   # valeur illisible : on arrête par prudence
    if p < FAN_MIN:
        p = 0   # en dessous de 30 % le ventilateur tourne mal : on l'arrête
    v = state["ventilo"]   # état actuel du ventilateur
    if p > 0 and v["pourcent"] == 0:
        _fan["depuis"] = time.time()   # pour détecter un ventilateur qui ne tourne pas
    if p == 0:
        _fan["depuis"] = 0.0
        mode, reason = "arret", reason or "arrêté"
    changed = (p, mode) != (v["pourcent"], v["mode"])   # vrai si la vitesse ou le mode change (pour ne journaliser que les vrais changements)
    v["pourcent"], v["mode"], v["raison"] = p, mode, reason or "commande manuelle"
    if p > 0:   # 5 V d'abord, un instant pour que le ventilateur démarre, puis le PWM
        if not v["alimente"]:
            if LED_OK:
                fan_12v.value = 1   # le relais ferme le 5 V
                if not MOCK:
                    time.sleep(0.5)   # une demi-seconde pour que le ventilateur reçoive son 5 V avant la commande PWM
            v["alimente"] = True
        if FAN_OK:
            fan_pwm.value = p / 100   # PWM entre 0 et 1
    else:       # PWM à 0 (fil de commande bas : il n'alimente pas le ventilateur par son entrée), puis 5 V coupé
        if FAN_OK:
            fan_pwm.value = 0
        if LED_OK:
            fan_12v.value = 0   # le relais ouvre le 5 V : le ventilateur s'arrête vraiment
        v["alimente"] = False
    if changed and not silent:
        log(f"Ventilateur : {p} % ({mode}) — {v['raison']}" if p else f"Ventilateur : arrêt — {v['raison']}")


# FACULTATIF : allume ou éteint une caméra (num 0 ou 1). Éteinte, elle ne filme plus (le Pi consomme moins) et la page n'affiche plus son flux.
def camera(num: int, on: bool):
    state[f"cam{num + 1}"] = bool(on)
    if num in camera_devices:   # seulement s'il y a une vraie caméra (pas en simulation)
        cam, stream = camera_devices[num]
        try:
            if on:
                cam.start_recording(MJPEGEncoder(), FileOutput(stream))   # la caméra reprend le flux
            else:
                cam.stop_recording()   # la caméra s'arrête (économie d'énergie)
        except Exception as e:
            state["erreurs"][f"camera{num + 1}"] = f"commande de la caméra {num + 1} : {e}"
    log(f"Caméra {num + 1} : {'allumée' if on else 'éteinte'}")


# FACULTATIF : sans le module MOSFET des LED, ces commandes ne font rien de visible.
def leds(nest=None, outside=None):
    """Allume (True) ou éteint (False) les LED du nid et / ou de l'extérieur ; None = ne pas toucher à celle-là."""
    if nest is not None:
        state["led_nid"] = bool(nest)
        log(f"LED du nid : {'allumées' if nest else 'éteintes'}")
        if LED_OK:
            led_nest.value = int(nest)   # 1 = le module MOSFET ferme la masse des LED : elles s'allument
    if outside is not None:
        state["led_ext"] = bool(outside)
        log(f"LED extérieures : {'allumées' if outside else 'éteintes'}")
        if LED_OK:
            led_outside.value = int(outside)
