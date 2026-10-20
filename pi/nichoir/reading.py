# ======================================================================================================
# reading.py — CHAPITRE 12 : la LECTURE périodique (le « cœur » qui bat toutes les 5 secondes).
#
# read_sensors() fait un tour complet : lire le capteur du nid, mesurer le ventilateur,
# lire la sonde de dehors,
# vérifier les alertes, laisser l'automatique décider, calculer la consommation, noter l'historique.
# loop() répète read_sensors() sans fin, dans une tâche de fond lancée au démarrage.
# ======================================================================================================

LOG_EVERY = 10   # une ligne de situation toutes les 10 lectures (50 s sur le Pi, 10 s en mode simulé)


def read_sensors():
    """Une lecture des capteurs + la ventilation et les sécurités (appelée toutes les PERIOD secondes par loop())."""
    if MOCK:
        simulate()   # en simulation : on invente les mesures
    elif BME_OK:
        try:
            d = bme280.sample(bus, BME_ADDR, cal)   # une mesure du capteur du nid
            state["t_nid"], state["hum_nid"] = round(d.temperature, 1), round(d.humidity, 0)
            state["erreurs"].pop("bme280", None)
        except Exception as e:
            state["erreurs"]["bme280"] = f"lecture du capteur du nid : {e}"
    measure_fan()   # tours par minute du ventilateur
    update_outside_probe()          # température de dehors
    check_alert()        # alerte chaleur
    check_fan()       # panne du ventilateur
    run_auto()            # décision de la ventilation automatique
    state["conso"] = consumption()   # consommation estimée
    record_history()         # un point de plus sur la courbe, s'il est temps
    state["derniere_lecture"] = time.strftime("%H:%M:%S")
    _read_count[0] += 1
    if _read_count[0] % LOG_EVERY == 1:  # un point de situation de temps en temps, pas à chaque lecture (le journal restait noyé)
        parts = [f"nid {state['t_nid']} °C, {state['hum_nid']} %", f"dehors {state['ext']['t']} °C"]
        if state["ventilo"]["pourcent"]:  # le ventilateur n'est cité que quand il tourne
            rpm = state["ventilo"]["rpm"]
            parts.append(f"ventilateur {state['ventilo']['pourcent']} %" + (f" ({rpm} tr/min)" if rpm is not None else ""))
        parts.append(f"conso {state['conso']['total_w']} W")
        log(" · ".join(parts))


def loop():
    """Répète read_sensors() sans fin, avec une pause de PERIOD secondes entre deux tours (lancée dans une tâche de fond par main())."""
    while True:
        read_sensors()
        time.sleep(PERIOD)
