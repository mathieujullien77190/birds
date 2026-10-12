# Pi et essais sur l'établi — retiré du mode Montage

Retiré du mode Montage à la demande de l'utilisateur (bloc « Électronique : Pi et essais sur l'établi »). Textes d'origine ci-dessous, à réutiliser au besoin ; les étapes étaient `pi-sd`, `pi-programme`, `banc-capteurs`, `banc-cameras`, `banc-ventilateur`, `banc-page`. Le programme du Pi reste décrit dans `docs/logiciel.md` et `pi/README.md`.

```ts
export const PI_SD = [
  'Sur la carte microSD du Pi (2 Go de mémoire suffisent avec Raspberry Pi OS Lite) :',
  '- Installer Raspberry Pi OS Lite (flux caméra en 720p au plus, zram activé).',
  '- Dans `sudo raspi-config`, « Interface Options » : activer l\'I2C (capteur du nid), les caméras et SSH.',
  '- Activer le 1-Wire de la sonde de dehors : ajouter la ligne `dtoverlay=w1-gpio` dans `/boot/firmware/config.txt` (donnée sur GPIO4, broche 7), puis redémarrer.',
].join('\n');

export const PI_PROGRAM = [
  'Le programme est dans le dossier `pi/` du dépôt (page web déjà compilée dans `pi/web/`).',
  '- `sudo apt install -y python3-picamera2 git`',
  '- Créer `/home/pi/nichoir` et y copier `nichoir.py`, `web/`, `nichoir.service` et `requirements.txt`.',
  '- `python3 -m venv --system-site-packages venv`, puis `venv/bin/pip install -r requirements.txt`.',
  '- Premier essai à la main : `venv/bin/python nichoir.py`, puis la page `http://<ip-du-pi>:8080`.',
  '- Démarrage automatique : `sudo cp nichoir.service /etc/systemd/system/`, puis `sudo systemctl enable --now nichoir` ; `journalctl -u nichoir -f` montre ce que le programme raconte.',
].join('\n');

export const BENCH_INTRO = "Établi : le Pi est alimenté par l'alimentation officielle 27 W USB-C (5 V / 5 A), pas encore par le nichoir. La page `http://<ip-du-pi>:8080` écrit l'erreur à côté du bloc dont le matériel manque, le reste continue de marcher.";

export const BENCH_SENSORS = [
  BENCH_INTRO,
  '- Capteur du nid (BME280, I2C) : température et humidité affichées.',
  '- Sonde de dehors (DS18B20, 1-Wire) : température affichée ; une valeur à 85,0 °C ou hors de −40 à 60 °C est refusée par le programme.',
].join('\n');

export const BENCH_CAMERAS = [
  '- Les deux caméras en direct (flux `/video/1` et `/video/2`), avec leur bouton marche / arrêt.',
  '- Les LED infrarouges, une carte après l\'autre, par le module 2 × MOSFET : LED du nid sur GPIO23 (broche 16), LED extérieures sur GPIO24 (broche 18).',
].join('\n');

export const BENCH_FAN = [
  '- Ventilateur : marche, arrêt et vitesse depuis la page. L\'arrêt coupe le 12 V (interrupteur sur GPIO27, broche 13) ; le PWM est sur GPIO18 (broche 12), le tachymètre sur GPIO17 (broche 11).',
  '- Le tachymètre doit lire des tr/min. Valider le PWM à 25 kHz : si le Pi le refuse, le programme retombe à 10 kHz et le signale sur la page.',
  "- Le ventilateur demande du 12 V : à fournir pour cet essai.",
].join('\n');

export const BENCH_PAGE = [
  '- La page se rafraîchit toute seule toutes les 5 secondes : températures, historique sur 24 h, ventilation automatique, caméras et LED.',
  "- Une fois tout validé, le Pi peut entrer dans le nichoir.",
].join('\n');
```
