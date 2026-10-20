# ======================================================================================================
# simulation.py — CHAPITRE 5 : le MODE SIMULÉ (`NICHOIR_MOCK=1` ou option `--mock`).
#
# Quand il est actif, ce chapitre REMPLACE le matériel : fausses sorties GPIO, fausses caméras
# (petites images animées), faux capteurs qui varient comme dans la vraie vie (jour/nuit, nuages,
# chaleur du nid).
# Sert à essayer toute la page web sur un ordinateur, et à lancer les essais automatiques du
# simulateur de l'application. Si MOCK est faux, tout ce chapitre est ignoré.
# ======================================================================================================

# ---------------------------------------------------------------- mode simulé (remplace le matériel quand MOCK est actif)
if MOCK:
    class Fake:
        """Sortie GPIO factice : accepte .value = … sans rien piloter."""
        value = 0

    fan_pwm, fan_12v, led_nest, led_outside = Fake(), Fake(), Fake(), Fake()   # quatre fausses sorties à la place des vraies
    LED_OK = FAN_OK = TACH_OK = BME_OK = True   # tout « marche » en simulation
    _fan["tacho_vu"] = True   # le tachymètre simulé « est branché » : une panne simulée est donc détectée
    state["erreurs"].clear()    # on oublie les erreurs de matériel absent (on est sur un ordinateur)
    state["erreurs"]["mock"] = "MODE SIMULÉ : valeurs fausses, rien n'est branché"   # bandeau affiché sur la page
    PERIOD = 1.0   # en simulation on relit toutes les secondes (au lieu de 5) pour que la page vive plus vite
    log("MODE SIMULÉ : capteurs, GPIO et caméras remplacés par des valeurs fausses")

    def _png_chunk(t, d):
        """Un « bloc » du format PNG : longueur, type, données, somme de contrôle (CRC)."""
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))

    class FakeStream:
        """Flux vidéo factice : une petite image PNG animée par caméra (barre qui se déplace, carré qui clignote)."""
        mime = "image/png"   # le vrai flux sert du JPEG ; celui-ci sert du PNG (mjpeg() lit ce champ)

        def __init__(self, tint):
            self.frame, self.cond, self.tint = None, threading.Condition(), tint   # dernière image, verrou d'attente, couleur (R, V, B)

        def image(self, n, w=320, h=240):
            """Fabrique l'image numéro n (largeur w, hauteur h) : dégradé de fond, barre blanche mobile, carré rouge clignotant."""
            x0 = (n * 8) % w   # position de la barre blanche : elle avance de 8 pixels à chaque image
            lines = bytearray()
            for y in range(h):
                lines.append(0)  # filtre PNG « aucun »
                g = 40 + (y * 120) // h   # luminosité du fond : plus clair vers le bas
                background = bytes(g * c // 255 for c in self.tint)   # couleur du fond pour cette ligne
                for x in range(w):
                    if x0 <= x < x0 + 12:
                        lines += bytes((255, 255, 255))  # barre blanche
                    elif 8 <= x < 28 and 8 <= y < 28 and (n // 5) % 2 == 0:
                        lines += bytes((255, 40, 40))  # carré rouge qui clignote
                    else:
                        lines += background
            signature = bytes((137, 80, 78, 71, 13, 10, 26, 10))   # les 8 octets qui ouvrent tout fichier PNG
            return (signature + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))   # en-tête : taille, 8 bits, couleur RVB
                    + _png_chunk(b"IDAT", zlib.compress(bytes(lines), 3)) + _png_chunk(b"IEND", b""))   # pixels compressés, puis fin du fichier

        def run(self):
            """Boucle sans fin (lancée dans une tâche de fond) : une nouvelle image toutes les 0,2 s, et on réveille les clients."""
            n = 0
            while True:
                with self.cond:
                    self.frame = self.image(n)
                    self.cond.notify_all()
                n += 1
                time.sleep(0.2)

    cameras.clear()   # on oublie les vraies caméras
    for num, tint in ((0, (80, 255, 120)), (1, (90, 150, 255))):   # caméra 1 teinte verte, caméra 2 teinte bleue
        cameras[num] = FakeStream(tint)

    # exces : de combien le nid dépasse dehors (soleil + couvée) ; effet : refroidissement apporté par le ventilateur (≤ 0) ; les deux avec de l'inertie
    sim = {"exces": 3.0, "effet": 0.0}

    def simulate():
        """Un pas de simulation : le nid suit dehors + un excès (≈ 4 °C le jour, 2 °C la nuit) réduit par le ventilateur (jusqu'à −3 °C à 100 %), avec de l'inertie."""
        h = time.localtime().tm_hour   # heure actuelle
        night = MOCK_NIGHT if MOCK_NIGHT is not None else not 6 <= h < 18   # nuit imposée par le simulateur, sinon d'après l'horloge (jour de 6 h à 18 h)
        t_out = (16 if not night else 9) + 3 * math.sin(time.time() / 900) + random.uniform(-0.1, 0.1)   # dehors : 16 °C le jour, 9 °C la nuit, qui ondule lentement
        if MOCK_FORCE["ext"] is not None:
            t_out = MOCK_FORCE["ext"]   # essai automatique : température de dehors imposée
        sim["exces"] += ((2.0 if night else 4.0) - sim["exces"]) * 0.05   # l'excès de chaleur du nid tend doucement vers 4 °C (jour) ou 2 °C (nuit)
        sim["effet"] += (-3.0 * state["ventilo"]["pourcent"] / 100 - sim["effet"]) * 0.05   # le ventilateur refroidit jusqu'à −3 °C à 100 %, avec de l'inertie
        if MOCK_FAULTS["bme"]:   # panne simulée du capteur du nid
            state["t_nid"] = state["hum_nid"] = None
            state["erreurs"]["bme280"] = "lecture du capteur du nid : pas de réponse (panne simulée)"
        else:
            state["erreurs"].pop("bme280", None)   # le capteur « répond » de nouveau : on efface l'erreur
            base = MOCK_FORCE["nid"] if MOCK_FORCE["nid"] is not None else t_out + sim["exces"]   # température du nid : imposée, ou dehors + excès
            state["t_nid"] = round(base + sim["effet"] + random.uniform(-0.2, 0.2), 1)   # moins l'effet du ventilateur, plus un petit bruit de mesure
            state["hum_nid"] = round(70 + 10 * math.sin(time.time() / 900 * 2 * math.pi) + random.uniform(-1, 1), 0)   # humidité autour de 70 %
        if MOCK_FAULTS["sonde"]:   # sonde de dehors simulée : plausible jour / nuit, ou muette en cas de panne simulée
            state["ext"] = {"t": None, "source": None, "maj": None}
            state["erreurs"]["sonde_ext"] = "sonde extérieure : pas de réponse (panne simulée)"
        else:
            state["ext"] = {"t": round(t_out, 1), "source": "simulée", "maj": time.strftime("%H:%M:%S")}
            state["erreurs"].pop("sonde_ext", None)
