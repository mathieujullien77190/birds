# ======================================================================================================
# startup.py — CHAPITRE 14 : le DÉMARRAGE et l'ARRÊT du programme.
#
# main() est appelée par `python -m nichoir` (voir __main__.py) : elle coupe le 5 V du ventilateur,
# relit les réglages et l'historique, lance la boucle de lecture, puis le serveur web.
# À l'arrêt du programme (même par une erreur), le 5 V du ventilateur est coupé aussi.
# ======================================================================================================

import atexit   # permet d'exécuter une fonction à la fin du programme
# Quand le programme s'arrête, on coupe le 5 V du ventilateur (silencieux : pas de ligne dans le journal).
atexit.register(lambda: fan(0, "arret", "arrêt du programme", silent=True))   # le 5 V du ventilateur est coupé quand le programme s'arrête


def main():
    """Lance le nichoir : réglages, historique, boucle de lecture en tâche de fond, puis le serveur web sur le port 8080 (bloquant)."""
    fan(0, "arret", "démarrage du programme", silent=True)   # 5 V coupé au démarrage
    load_settings()    # réglages de la ventilation automatique gardés d'une fois sur l'autre
    load_history()  # courbe des températures gardée d'une fois sur l'autre
    log("Nichoir high tech : page sur http://0.0.0.0:8080" + (" (mode simulé)" if MOCK else ""))
    for msg in state["erreurs"].values():
        log("! " + msg)   # on liste dès le départ ce qui manque (capteur absent, caméra absente…)
    threading.Thread(target=loop, daemon=True).start()   # la lecture périodique tourne en tâche de fond
    if MOCK:
        for stream in cameras.values():
            threading.Thread(target=stream.run, daemon=True).start()   # les fausses caméras fabriquent leurs images en tâche de fond
    app.run(host="0.0.0.0", port=8080, threaded=True)   # le serveur web : écoute sur toutes les adresses du Pi, port 8080
