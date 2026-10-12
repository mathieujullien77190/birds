# Programme de test du nichoir (Raspberry Pi 5)

Version minimale pour vérifier que le matériel marche : lecture du capteur du nid (BME280), la sonde de température de dehors (DS18B20 étanche), les deux caméras en direct, le ventilateur de 60 mm (manuel ou automatique), les deux cartes de LED infrarouges et l'historique des températures sur 24 h, sur une page web. (Le Peltier a été retiré le 2026-10-11 : trop faible.)

| Fichier | Rôle |
| --- | --- |
| `nichoir.py` | Le programme Python : capteurs, caméras, commandes, serveur web (port 8080). |
| `web/` | La page, **compilée** (`index.html`, `app.js`, `app.css`, committés : le Pi n'a pas Node). |
| `site/` | Les sources de la page : projet React + TypeScript **autonome** (voir `site/README.md`). Rebuild : `npm run build` dans `pi/site` ou `npm run build:pi` à la racine. |
| `nichoir.service` | Démarrage automatique au boot (systemd). |
| `requirements.txt` | Les bibliothèques Python. |

## Installation (une seule fois, sur le Pi)

```sh
sudo raspi-config                # Interface Options : activer I2C et les caméras ; 1-Wire : ligne dtoverlay=w1-gpio dans /boot/firmware/config.txt
sudo apt install -y python3-picamera2 git
mkdir -p /home/pi/nichoir && cd /home/pi/nichoir
# copier ici nichoir.py, web/, nichoir.service, requirements.txt (scp, clé USB ou git)
python3 -m venv --system-site-packages venv
venv/bin/pip install -r requirements.txt
venv/bin/python nichoir.py       # premier essai à la main : http://<ip-du-pi>:8080
```

Pour que ça démarre tout seul :

```sh
sudo cp nichoir.service /etc/systemd/system/
sudo systemctl enable --now nichoir
journalctl -u nichoir -f         # voir ce qu'il raconte
```

## Essayer sans matériel (mode simulé)
Sur un ordinateur, sans rien de branché : capteurs, GPIO et caméras sont remplacés par des valeurs fausses mais plausibles (le nid suit dehors + 2 à 4 °C, refroidi par le ventilateur, deux flux vidéo animés, tachymètre simulé). Un bandeau « MODE SIMULÉ » s'affiche en haut de la page.
```sh
pip install flask
NICHOIR_MOCK=1 python nichoir.py          # Windows PowerShell : $env:NICHOIR_MOCK=1; python nichoir.py
# puis http://localhost:8080
```
Pour voir la ventilation : dans la page, « Ventilation automatique », ou dans l'app 3D le menu « 🧪 Tests ». L'historique se remplit toutes les 5 s (300 s sur le Pi) et s'écrit dans `historique-simule.json`.

Dans l'app 3D, le bouton « 🐍 Pi » fait la même chose **sans installer Python** (exécuté dans le navigateur) et montre la sortie du programme dans un terminal ; les flux vidéo y sont des vues 3D prises depuis les caméras du modèle.

## Brochage

Voir le document « Dossier du nichoir » de l'application. En résumé : ventilateur Noctua NF-A6x25 PWM : **GPIO27 (broche 13) = interrupteur 12 V (MOSFET côté +)**, **GPIO18 (broche 12) = PWM** (gpiozero / lgpio : 25 kHz visé, repli à 10 kHz), **GPIO17 (broche 11) = tachymètre** (pull-up), masse commune broche 14, 12 V du rail ; LED du nid GPIO23, LED extérieures GPIO24 ; BME280 sur I2C (adresse 0x76) ; sonde de dehors DS18B20 : 3,3 V broche 17, masse broche 20, donnée GPIO4 (broche 7, 1-Wire : `dtoverlay=w1-gpio` dans `/boot/firmware/config.txt`) ; INA219 (batterie) I2C 0x41 ; caméras sur CAM0 et CAM1.

**À valider sur le Pi 5** : gpiozero / lgpio limite peut-être le PWM à 10 kHz ; le programme essaie 25 kHz et retombe sur 10 kHz en le signalant. « Arrêt » coupe vraiment le 12 V (GPIO27 bas, PWM à 0), car un Noctua tourne encore à ~20 % à 0 % de PWM ; à la mise en marche : 12 V, 0,5 s, puis PWM.

## Ce que fait la page

- Toutes les 5 s : température et humidité du nid (et écart avec dehors), température de dehors (sonde DS18B20), batterie, consommation estimée.
- Carte Ventilateur : vitesse, tr/min, boutons Arrêt / Marche, curseur de 30 à 100 %, **ventilation automatique** (réglages modifiables et case « Mode hiver » (cassette retirée, bloc isolant, bouchon du dessous), gardés dans `reglages.json`).
- Graphique des températures sur 24 h (un point toutes les 5 min dans `historique.json`).
- Deux flux vidéo MJPEG (640 × 480) et boutons caméras / LED infrarouges.
- Si un capteur, une caméra ou les GPIO manquent, la page l'écrit à côté du bloc concerné et le reste continue de marcher.

## Sécurités intégrées

Alerte au-dessus de 35 °C dans le nid (notification ntfy si `NICHOIR_NTFY_TOPIC` est réglé) ; capteur du nid muet = le ventilateur automatique ne démarre pas ; ventilateur commandé mais 0 tr/min pendant plus de 10 s = erreur ; sous 10 % de batterie les caméras et LED sont coupées, **jamais le ventilateur**.

## Ce que ce programme ne fait pas encore

Pas de mot de passe, pas d'horaire automatique des LED. « On mesure d'abord » : une saison d'historique avant de décider d'autre chose. Voir le document « Logiciel » de l'application.

## Séparation des dossiers
`pi/` = ce qui tourne sur le Raspberry (Python + site) ; `src/` à la racine = l'app de conception et de simulation. `pi/site` a son propre `package.json` et `node_modules` ; aucun import entre `src/` et `pi/site/` (l'app lit seulement la sortie `pi/web/` pour le simulateur « 🐍 Pi »).

La page affiche aussi la batterie (niveau, tension, énergie restante) et la consommation estimée par élément (cartes `BatteryCard` et `ConsumptionCard` de `site/`).
