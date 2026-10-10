"""Nichoir mésange — programme de test sur le Raspberry Pi 5.

Version volontairement minimale pour vérifier le matériel :
- lit le capteur du nid (BME280, I2C) et la sonde du dissipateur (DS18B20, 1-Wire) ;
- montre les deux caméras en direct (flux MJPEG) ;
- pilote le Peltier (froid / chaud / arrêt + puissance) et les deux cartes de LED infrarouges ;
- sert une page web sur le port 8080.

Chaque partie du matériel est optionnelle : si un capteur ou une caméra manque, la page le dit et le reste marche.
Sécurité : le Peltier est coupé si le dissipateur dépasse HOT_MAX °C.

Brochage (voir docs/schema-electronique.md) :
  Peltier (pont en H VNH5019) : PWM GPIO18, INA GPIO13, INB GPIO19
  LED du nid : GPIO23 (module MOSFET IN1)   LED extérieures : GPIO24 (IN2)
  BME280 : I2C adresse 0x76 (ou 0x77)        DS18B20 : 1-Wire sur GPIO4
"""
import threading
import time

from flask import Flask, Response, jsonify, request, send_from_directory

# REQUIS : les trois réglages ci-dessous. Ne pas augmenter HOT_MAX ni PWM_MAX sans raison : ce sont les sécurités du Peltier et de la batterie.
HOT_MAX = 55.0      # °C sur le dissipateur : au-dessus, le Peltier est coupé
PWM_MAX = 0.6       # puissance maximale du Peltier (batterie de 6 Ah)
PERIODE = 5.0       # secondes entre deux lectures

# ---------------------------------------------------------------- matériel (chaque bloc est optionnel)
etat = {
    "t_nid": None, "hum_nid": None, "t_dissipateur": None,
    "peltier": "arrêt", "puissance": 0.0,
    "led_nid": False, "led_ext": False,
    "erreurs": {},        # nom du matériel → message, quand quelque chose manque
    "derniere_lecture": None,
}

# FACULTATIF : sans les GPIO (ordinateur, Pi non câblé) le programme tourne quand même, la page signale seulement « GPIO indisponible ».
# REQUIS pour piloter le Peltier et les LED : le pont en H sur GPIO18 / 13 / 19 et le module MOSFET sur GPIO23 / 24.
try:
    from gpiozero import DigitalOutputDevice, PWMOutputDevice
    pwm = PWMOutputDevice(18, frequency=20000)
    ina, inb = DigitalOutputDevice(13), DigitalOutputDevice(19)
    led_nid, led_ext = DigitalOutputDevice(23), DigitalOutputDevice(24)
    GPIO_OK = True
except Exception as e:  # pas sur un Pi, ou gpiozero absent
    GPIO_OK = False
    etat["erreurs"]["gpio"] = f"GPIO indisponible : {e}"

# FACULTATIF : capteur BME280 du nid (température, humidité). Sans lui, la page affiche « — » et le reste marche.
# Il n'est PAS nécessaire à la sécurité : la coupure du Peltier ne dépend que de la sonde du dissipateur.
try:
    import bme280
    import smbus2
    bus = smbus2.SMBus(1)
    BME_ADDR = 0x76
    cal = bme280.load_calibration_params(bus, BME_ADDR)
    BME_OK = True
except Exception as e:
    BME_OK = False
    etat["erreurs"]["bme280"] = f"capteur du nid indisponible : {e}"

# FACULTATIF mais FORTEMENT CONSEILLÉ : sonde DS18B20 du dissipateur. C'est elle qui coupe le Peltier au-dessus de HOT_MAX.
# Sans sonde, n'allume le Peltier que sous surveillance (jamais la nuit, jamais sans dissipateur monté).
try:
    from w1thermsensor import W1ThermSensor
    sonde = W1ThermSensor()
    SONDE_OK = True
except Exception as e:
    SONDE_OK = False
    etat["erreurs"]["ds18b20"] = f"sonde du dissipateur indisponible : {e}"

cameras = {}
# FACULTATIF : les caméras (picamera2). Chaque caméra qui manque est signalée sur la page, l'autre continue.
try:
    from picamera2 import Picamera2
    from picamera2.encoders import MJPEGEncoder
    from picamera2.outputs import FileOutput
    import io

    class Flux(io.BufferedIOBase):
        """Garde la dernière image JPEG du flux, pour la servir à chaque client."""
        def __init__(self):
            self.frame = None
            self.cond = threading.Condition()
        def write(self, buf):
            with self.cond:
                self.frame = buf
                self.cond.notify_all()

    for num in (0, 1):
        try:
            cam = Picamera2(num)
            cam.configure(cam.create_video_configuration(main={"size": (640, 480)}))
            flux = Flux()
            cam.start_recording(MJPEGEncoder(), FileOutput(flux))
            cameras[num] = flux
        except Exception as e:
            etat["erreurs"][f"camera{num + 1}"] = f"caméra {num + 1} indisponible : {e}"
except Exception as e:
    etat["erreurs"]["picamera2"] = f"picamera2 indisponible : {e}"


# ---------------------------------------------------------------- commandes
# REQUIS si le Peltier est monté : c'est la seule fonction qui commande le pont en H (sens + puissance plafonnée à PWM_MAX).
def peltier(sens: str, puissance: float):
    """sens : 'froid' (refroidit le nid), 'chaud' (le réchauffe) ou 'arrêt' ; puissance 0..1 (plafonnée à PWM_MAX)."""
    puissance = max(0.0, min(PWM_MAX, puissance))
    if sens not in ("froid", "chaud", "arrêt"):
        sens = "arrêt"
    if sens == "arrêt":
        puissance = 0.0
    etat["peltier"], etat["puissance"] = sens, puissance
    if GPIO_OK:
        ina.value, inb.value = (1, 0) if sens == "froid" else (0, 1) if sens == "chaud" else (0, 0)
        pwm.value = puissance


# FACULTATIF : sans le module MOSFET des LED, ces commandes ne font rien de visible.
def leds(nid=None, ext=None):
    if nid is not None:
        etat["led_nid"] = bool(nid)
        if GPIO_OK:
            led_nid.value = int(nid)
    if ext is not None:
        etat["led_ext"] = bool(ext)
        if GPIO_OK:
            led_ext.value = int(ext)


# ---------------------------------------------------------------- lecture des capteurs, toutes les PERIODE secondes
# REQUIS : c'est la boucle qui lit les capteurs et applique la coupure de sécurité. Elle tourne en tâche de fond.
def boucle():
    while True:
        if BME_OK:
            try:
                d = bme280.sample(bus, BME_ADDR, cal)
                etat["t_nid"], etat["hum_nid"] = round(d.temperature, 1), round(d.humidity, 0)
                etat["erreurs"].pop("bme280", None)
            except Exception as e:
                etat["erreurs"]["bme280"] = f"lecture du capteur du nid : {e}"
        if SONDE_OK:
            try:
                etat["t_dissipateur"] = round(sonde.get_temperature(), 1)
                etat["erreurs"].pop("ds18b20", None)
                if etat["t_dissipateur"] > HOT_MAX and etat["peltier"] != "arrêt":
                    peltier("arrêt", 0)
                    etat["erreurs"]["securite"] = f"Peltier coupé : dissipateur à {etat['t_dissipateur']} °C (> {HOT_MAX})"
            except Exception as e:
                etat["erreurs"]["ds18b20"] = f"lecture de la sonde : {e}"
        etat["derniere_lecture"] = time.strftime("%H:%M:%S")
        time.sleep(PERIODE)


# ---------------------------------------------------------------- page web et API
# REQUIS : la page web et son API. Sans eux on ne voit ni ne commande rien (le service tourne mais reste muet).
app = Flask(__name__, static_folder="web", static_url_path="")


@app.get("/")
def index():
    return send_from_directory("web", "index.html")


@app.get("/api/etat")
def api_etat():
    return jsonify(etat)


@app.post("/api/peltier")
def api_peltier():
    d = request.get_json(force=True) or {}
    peltier(d.get("sens", "arrêt"), float(d.get("puissance", 0.3)))
    etat["erreurs"].pop("securite", None)
    return jsonify(etat)


@app.post("/api/led")
def api_led():
    d = request.get_json(force=True) or {}
    leds(nid=d.get("nid"), ext=d.get("ext"))
    return jsonify(etat)


# FACULTATIF : les deux flux vidéo (/video/1 et /video/2). Retirer les deux routes si le Pi n'a pas de caméra.
def mjpeg(num: int):
    flux = cameras.get(num)
    if flux is None:
        return Response("caméra indisponible", status=503)

    def gen():
        while True:
            with flux.cond:
                flux.cond.wait()
                frame = flux.frame
            yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(frame)).encode() + b"\r\n\r\n" + frame + b"\r\n"
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.get("/video/1")
def video1():
    return mjpeg(0)


@app.get("/video/2")
def video2():
    return mjpeg(1)


if __name__ == "__main__":
    threading.Thread(target=boucle, daemon=True).start()
    app.run(host="0.0.0.0", port=8080, threaded=True)
