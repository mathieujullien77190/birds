# Programme de test du nichoir (Raspberry Pi 5)

Version minimale pour vérifier que le matériel marche : lecture des deux capteurs de température, les deux caméras en direct, le Peltier (froid / chaud / arrêt, puissance) et les deux cartes de LED infrarouges, sur une page web.

| Fichier | Rôle |
| --- | --- |
| `nichoir.py` | Le programme Python : capteurs, caméras, commandes, serveur web (port 8080). |
| `web/` | La page, **compilée** (`index.html`, `app.js`, `app.css`, committés : le Pi n'a pas Node). |
| `site/` | Les sources de la page : projet React + TypeScript **autonome** (voir `site/README.md`). Rebuild : `npm run build` dans `pi/site` ou `npm run build:pi` à la racine. |
| `nichoir.service` | Démarrage automatique au boot (systemd). |
| `requirements.txt` | Les bibliothèques Python. |

## Installation (une seule fois, sur le Pi)

```sh
sudo raspi-config                # Interface Options : activer I2C, 1-Wire et les caméras
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
Sur un ordinateur, sans rien de branché : capteurs, GPIO et caméras sont remplacés par des valeurs fausses mais plausibles (nid autour de 15 °C, dissipateur qui chauffe avec la puissance du Peltier, deux flux vidéo animés). Un bandeau « MODE SIMULÉ » s'affiche en haut de la page.
```sh
pip install flask
NICHOIR_MOCK=1 python nichoir.py          # Windows PowerShell : $env:NICHOIR_MOCK=1; python nichoir.py
# puis http://localhost:8080
```
Pour essayer la coupure de sécurité : `NICHOIR_MOCK_SURCHAUFFE=60` force le dissipateur à 60 °C dès que le Peltier tourne ; il est coupé à 55 °C et la page affiche « Peltier coupé ».

Dans l'app 3D, le bouton « 🐍 Pi » fait la même chose **sans installer Python** (exécuté dans le navigateur) et montre la sortie du programme dans un terminal ; les flux vidéo y sont des vues 3D prises depuis les caméras du modèle.

## Brochage

Voir le document « Schéma électronique » de l'application. En résumé : Peltier PWM GPIO18, INA GPIO13, INB GPIO19 ; LED du nid GPIO23, LED extérieures GPIO24 ; BME280 sur I2C (adresse 0x76) ; DS18B20 sur 1-Wire (GPIO4, résistance de 4,7 kΩ vers le 3,3 V) ; caméras sur CAM0 et CAM1.

## Ce que fait la page

- Toutes les 5 s : température et humidité du nid, température du dissipateur.
- Deux flux vidéo MJPEG (640 × 480).
- Boutons Froid / Chaud / Arrêt et curseur de puissance (plafonné à 60 %).
- Boutons LED du nid et LED extérieures.
- Si un capteur, une caméra ou les GPIO manquent, la page l'écrit à côté du bloc concerné et le reste continue de marcher : on peut donc lancer le programme sur un Pi à moitié câblé, ou même sur un ordinateur pour voir la page.

## Sécurité intégrée

Si la sonde du dissipateur dépasse 55 °C, le Peltier est coupé et un message s'affiche. Il faut re-cliquer Froid ou Chaud pour le relancer.

## Ce que ce programme ne fait pas encore

Pas de régulation automatique (c'est volontaire : on teste), pas d'historique, pas de mot de passe. La version complète est décrite dans le document « Logiciel » de l'application.

## Séparation des dossiers
`pi/` = ce qui tourne sur le Raspberry (Python + site) ; `src/` à la racine = l'app de conception et de simulation. `pi/site` a son propre `package.json` et `node_modules` ; aucun import entre `src/` et `pi/site/` (l'app lit seulement la sortie `pi/web/` pour le simulateur « 🐍 Pi »).

La page affiche aussi la batterie (niveau, tension, énergie restante) et la consommation estimée par élément (cartes `BatteryCard` et `ConsumptionCard` de `site/`).
