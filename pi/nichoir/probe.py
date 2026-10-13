# ======================================================================================================
# probe.py — CHAPITRE 11 : la SONDE de température EXTÉRIEURE (DS18B20 étanche, bus 1-Wire).
#
# Le noyau du Pi présente la sonde comme un fichier texte (/sys/bus/w1/devices/28-…/w1_slave) :
# on le lit, on vérifie qu'il est valide (somme de contrôle, valeur plausible) et on range la
# température dans state["ext"]. Une mesure refusée laisse la température vide et affiche l'erreur :
# on ne ment jamais avec une fausse température de dehors.
# ======================================================================================================


def read_outside_probe():
    """Lit la sonde DS18B20 par le noyau : retourne (température en °C, None) ou (None, message d'erreur).
    Le fichier w1_slave a deux lignes : « … crc=xx YES » (CRC bon) puis « … t=21437 » (millièmes de °C)."""
    files = sorted(glob.glob(os.path.join(W1_DIR, "28-*", "w1_slave")))   # les sondes DS18B20 ont un identifiant qui commence par 28-
    if not files:
        return None, "sonde extérieure absente : aucun 28-* dans /sys/bus/w1/devices (1-Wire activé ? câblage ?)"
    try:
        with open(files[0], encoding="ascii") as f:
            lines = f.read().strip().splitlines()   # les deux lignes du fichier
    except (OSError, UnicodeDecodeError) as e:
        return None, f"lecture de la sonde extérieure : {e}"
    if len(lines) < 2 or not lines[0].rstrip().endswith("YES"):   # « YES » à la fin de la 1re ligne : la somme de contrôle est bonne
        return None, "sonde extérieure : CRC mauvais (câble trop long, résistance 4,7 kΩ absente ?)"
    try:
        t = int(lines[1].rsplit("t=", 1)[1]) / 1000   # la température, en millièmes de °C → °C
    except (IndexError, ValueError):
        return None, "sonde extérieure : réponse illisible"
    if t == DS18B20_ERROR_VALUE:   # 85,0 °C : le capteur n'a pas encore fait sa première mesure
        return None, "sonde extérieure : 85,0 °C = valeur d'erreur du DS18B20 (pas encore de conversion), refusée"
    if not OUTSIDE_PLAUSIBLE[0] <= t <= OUTSIDE_PLAUSIBLE[1]:
        return None, f"sonde extérieure : valeur aberrante ({round(t, 1)} °C)"
    return round(t, 1), None


def update_outside_probe():
    """Une lecture de la sonde de dehors (en mode simulé, simulate() s'en charge). Une mesure refusée laisse `ext.t` à null et l'erreur s'affiche."""
    if MOCK:
        return   # la simulation fournit elle-même la température de dehors
    t, error = read_outside_probe()
    if error:
        state["ext"] = {"t": None, "source": None, "maj": state["ext"]["maj"]}   # plus de mesure valable
        if state["erreurs"].get("sonde_ext") != error:
            log("! " + error)   # on n'écrit l'erreur dans le journal qu'une fois, pas à chaque lecture
        state["erreurs"]["sonde_ext"] = error
    else:
        state["ext"] = {"t": t, "source": "DS18B20", "maj": time.strftime("%H:%M:%S")}
        state["erreurs"].pop("sonde_ext", None)
