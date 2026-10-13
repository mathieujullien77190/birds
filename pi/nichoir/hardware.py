# ======================================================================================================
# hardware.py — CHAPITRE 3 : le MATÉRIEL réel branché sur le Pi (GPIO, ventilateur, tachymètre,
# capteur du nid, mesure de la batterie, caméras).
#
# Chaque bloc est entouré d'un `try / except` : si un composant manque (ou si on tourne sur un
# ordinateur), le programme ne plante pas, il note le problème dans `state["erreurs"]` et continue.
# La page web affiche alors la liste de ce qui manque.
# ======================================================================================================

# FACULTATIF : sans les GPIO (ordinateur, Pi non câblé) le programme tourne quand même, la page signale seulement « GPIO indisponible ».
# REQUIS pour piloter les LED : le module MOSFET sur GPIO23 / 24 ; pour couper vraiment le ventilateur : le relais 12 V sur GPIO27.
try:
    from gpiozero import DigitalInputDevice, DigitalOutputDevice, PWMOutputDevice  # bibliothèque des broches du Pi
    led_nest, led_outside = DigitalOutputDevice(23), DigitalOutputDevice(24)   # LED infrarouges : GPIO23 (nid) et GPIO24 (extérieur)
    fan_12v = DigitalOutputDevice(27)   # relais du 12 V du ventilateur : bas au démarrage = ventilateur coupé
    LED_OK = True   # les sorties tout-ou-rien existent : on peut commander LED et relais
except Exception as e:  # pas sur un Pi, ou gpiozero absent
    state["erreurs"]["gpio"] = f"GPIO indisponible : {e}"

# REQUIS pour piloter le ventilateur : PWM sur GPIO18. Les ventilateurs 4 fils veulent un PWM de 25 kHz (21 à 28 kHz selon la norme Intel).
# ATTENTION : sur Pi 5 gpiozero passe par lgpio, dont le PWM matériel est limité à 10 kHz selon sa documentation : si 25 kHz est refusé,
# on retombe sur 10 kHz (le ventilateur marche, parfois avec un léger sifflement ou une vitesse moins linéaire) et on le dit sur la page.
# À valider sur le vrai matériel ; piste de repli : le PWM matériel du noyau (dtoverlay=pwm-2chan, bibliothèque rpi-hardware-pwm) qui sait faire 25 kHz.
try:
    try:
        fan_pwm = PWMOutputDevice(18, frequency=25000)   # première tentative : 25 kHz, la fréquence normale des ventilateurs PC
    except Exception as e25:
        fan_pwm = PWMOutputDevice(18, frequency=10000)   # repli : 10 kHz
        state["erreurs"]["ventilo_pwm"] = f"PWM 25 kHz refusé ({e25}) : repli sur 10 kHz"
    fan_pwm.value = 0   # vitesse 0 au démarrage
    FAN_OK = True          # le PWM du ventilateur est prêt
except Exception as e:
    state["erreurs"]["ventilo_gpio"] = f"ventilateur indisponible (GPIO18) : {e}"

# FACULTATIF : tachymètre du ventilateur (fil jaune, GPIO17, pull-up, 2 impulsions par tour). Sans lui `rpm` reste null et la panne du ventilateur n'est pas détectée.
try:
    tach = DigitalInputDevice(17, pull_up=True)   # entrée GPIO17 avec résistance de rappel interne
    tach.when_activated = _pulse              # à chaque impulsion on appelle _impulsion (compteur)
    TACH_OK = True
except Exception as e:
    state["erreurs"]["tachymetre"] = f"tachymètre indisponible : {e}"

# FACULTATIF : capteur BME280 du nid (température, humidité). Sans lui, la page affiche « — », le ventilateur ne démarre pas tout seul (on ne sait pas s'il fait chaud) et le reste marche.
try:
    import bme280   # bibliothèque du capteur
    import smbus2   # bus I2C du Pi
    bus = smbus2.SMBus(1)   # bus I2C numéro 1 (broches 3 et 5)
    BME_ADDR = 0x76         # adresse du capteur sur le bus (0x77 sur certains modèles)
    cal = bme280.load_calibration_params(bus, BME_ADDR)   # coefficients de calibration, lus une fois dans le capteur
    BME_OK = True
except Exception as e:
    BME_OK = False
    state["erreurs"]["bme280"] = f"capteur du nid indisponible : {e}"

# FACULTATIF : la sonde extérieure DS18B20 n'a pas de bibliothèque à installer : le noyau (1-Wire) la présente comme un fichier (voir read_outside_probe dans probe.py).

# FACULTATIF : mesure de la batterie par un module INA219 (I2C 0x41, shunt de 10 mΩ). Sans lui, la page affiche « — » pour le niveau mais la consommation estimée reste visible.
try:
    from ina219 import INA219
    ina_bat = INA219(0.01, 10, address=0x41)   # shunt de 0,01 Ω, courant max 10 A, adresse I2C 0x41
    ina_bat.configure()
    BAT_OK = True
except Exception as e:
    BAT_OK = False
    state["erreurs"]["batterie"] = f"mesure de la batterie indisponible : {e}"

cameras = {}        # numéro de caméra (0 ou 1) → flux d'images à servir à la page
camera_devices = {}   # numéro → objet Picamera2, pour pouvoir arrêter / relancer le flux
# FACULTATIF : les caméras (picamera2). Chaque caméra qui manque est signalée sur la page, l'autre continue.
try:
    from picamera2 import Picamera2
    from picamera2.encoders import MJPEGEncoder   # encode les images en JPEG successifs (flux MJPEG)
    from picamera2.outputs import FileOutput
    import io

    class Stream(io.BufferedIOBase):
        """Garde la dernière image JPEG du flux, pour la servir à chaque client."""
        def __init__(self):
            self.frame = None                    # dernière image reçue de la caméra
            self.cond = threading.Condition()    # sert à réveiller les clients quand une nouvelle image arrive
        def write(self, buf):
            """Appelée par la caméra à chaque nouvelle image."""
            with self.cond:
                self.frame = buf
                self.cond.notify_all()

    for num in (0, 1):   # les deux ports caméra du Pi 5
        try:
            cam = Picamera2(num)
            cam.configure(cam.create_video_configuration(main={"size": (640, 480)}))   # vidéo 640 × 480
            stream = Stream()
            cam.start_recording(MJPEGEncoder(), FileOutput(stream))   # la caméra envoie ses images dans `flux`
            cameras[num] = stream
            camera_devices[num] = (cam, stream)
        except Exception as e:
            state["erreurs"][f"camera{num + 1}"] = f"caméra {num + 1} indisponible : {e}"
except Exception as e:
    state["erreurs"]["picamera2"] = f"picamera2 indisponible : {e}"
