# ======================================================================================================
# web.py — CHAPITRE 13 : le SERVEUR WEB (Flask) : la page et son API.
#
# Routes :
#   GET  /             la page (pi/web/index.html, compilée depuis pi/site)
#   GET  /api/etat     tout l'état du nichoir (JSON)
#   GET  /api/historique   les points de température des dernières 24 h
#   POST /api/ventilo  commande manuelle du ventilateur
#   POST /api/auto     réglages de la ventilation automatique
#   POST /api/camera   allumer / éteindre une caméra
#   POST /api/led      allumer / éteindre les LED infrarouges
#   GET  /video/1 et /video/2   les flux des deux caméras
# Si tu ajoutes une route, pense à la déclarer aussi dans pi/site/src/api/index.ts (un test vérifie l'accord).
# ======================================================================================================

# ---------------------------------------------------------------- page web et API
# REQUIS : la page web et son API. Sans eux on ne voit ni ne commande rien (le service tourne mais reste muet).
# La page compilée est dans pi/web (à côté du dossier nichoir/) : on donne son chemin complet à Flask.
_WEB = os.path.join(_ROOT, "web")
app = Flask(__name__, static_folder=_WEB, static_url_path="")   # l'application Flask : les fichiers de la page sont servis à la racine


@app.get("/")
def index():
    """La page d'accueil."""
    return send_from_directory(_WEB, "index.html")


@app.get("/api/etat")
def api_state():
    """Tout l'état en JSON : la page le relit toutes les 5 secondes."""
    return jsonify(state)


@app.get("/api/historique")
def api_history():
    """Les points de température des dernières 24 h : [{t, nid, ext, hum, ventilo}, …]."""
    return jsonify(history)


def _disable_auto(why):
    """Une commande à la main reprend la main sur l'automatique."""
    if state["auto"]["actif"]:
        state["auto"]["actif"] = False
        save_settings()
        log(f"Ventilation automatique désactivée : {why}")


@app.post("/api/ventilo")
def api_fan():
    """Commande manuelle : {pourcent: 30..100} pour tourner, {mode: 'arret'} ou {pourcent: 0} pour arrêter."""
    d = request.get_json(force=True) or {}   # le corps de la requête, lu comme du JSON
    _disable_auto("commande manuelle")    # une commande à la main coupe l'automatique
    if d.get("mode") == "arret":
        fan(0, "arret", "arrêté à la main")
    else:
        fan(d.get("pourcent", 0), "manuel", "commande manuelle")
    return jsonify(state)


@app.post("/api/auto")
def api_auto():
    """Active ou règle la ventilation automatique : {actif, hiver, seuil_marche, ecart_ext, hysteresis, vitesse_min, vitesse_max, plage, alerte_chaleur} (tout est facultatif)."""
    d = request.get_json(force=True) or {}
    a = state["auto"]
    for k, (lo, hi) in AUTO_LIMITS.items():
        if k in d:
            try:
                a[k] = max(lo, min(hi, float(d[k])))   # chaque réglage reçu est ramené dans ses bornes
            except (TypeError, ValueError):
                pass   # valeur illisible : on garde l'ancienne
    a["vitesse_max"] = max(a["vitesse_max"], a["vitesse_min"])
    if "hiver" in d:
        a["hiver"] = bool(d["hiver"])
    if "actif" in d:
        wanted = bool(d["actif"])
        if wanted and not a["actif"]:
            fan(0, "arret", "arrêté (l'automatique prend la main)", silent=True)   # l'automatique repart d'un ventilateur arrêté
            log("Ventilation automatique : activée")
        elif not wanted and a["actif"]:
            if state["ventilo"]["mode"] == "auto":
                fan(0, "arret", "ventilation automatique désactivée")
            log("Ventilation automatique : désactivée")
        a["actif"] = wanted
    save_settings()   # les réglages sont gardés sur disque
    run_auto()       # l'automatique réagit tout de suite
    return jsonify(state)


@app.post("/api/camera")
def api_camera():
    """Allume ou éteint une caméra : {num: 0 ou 1, on: true / false}."""
    d = request.get_json(force=True) or {}
    num = int(d.get("num", 0))
    if num in (0, 1):
        camera(num, bool(d.get("on", True)))
    return jsonify(state)


@app.post("/api/led")
def api_led():
    """Allume ou éteint les LED infrarouges : {nid: true / false, ext: true / false} (chaque clé est facultative)."""
    d = request.get_json(force=True) or {}
    leds(nest=d.get("nid"), outside=d.get("ext"))
    return jsonify(state)


# FACULTATIF : les deux flux vidéo (/video/1 et /video/2). Retirer les deux routes si le Pi n'a pas de caméra.
def mjpeg(num: int):
    """Sert le flux de la caméra `num` : une suite d'images (multipart/x-mixed-replace) que le navigateur affiche comme une vidéo."""
    stream = cameras.get(num)
    if stream is None:
        return Response("caméra indisponible", status=503)
    if not state[f"cam{num + 1}"]:
        return Response("caméra éteinte", status=503)

    def gen():
        """Générateur : attend une nouvelle image, puis l'envoie au client, sans fin."""
        while True:
            with stream.cond:
                stream.cond.wait()   # on dort jusqu'à l'arrivée d'une nouvelle image
                frame = stream.frame
            mime = getattr(stream, "mime", "image/jpeg").encode()  # le mode simulé sert des PNG
            yield b"--frame\r\nContent-Type: " + mime + b"\r\nContent-Length: " + str(len(frame)).encode() + b"\r\n\r\n" + frame + b"\r\n"
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.get("/video/1")
def video1():
    """Flux de la caméra 1 (dans le nid)."""
    return mjpeg(0)


@app.get("/video/2")
def video2():
    """Flux de la caméra 2 (dehors)."""
    return mjpeg(1)
