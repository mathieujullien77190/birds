/**
 * Textes des étapes de finition et d'installation. Ils reprennent `docs/schema-electronique.md` (« Finition du bois », « Montage sans soudure »,
 * fiches des composants), `docs/logiciel.md` et `pi/README.md` : rien n'est inventé ici.
 */

/** Procédure d'huilage complète (première étape d'huile) : section « Finition du bois (huile de lin, saturateur, peinture) ». */
export const OIL_FULL = [
  "Huile de lin pure (non cuite, Mieuxa) sur le contreplaqué de peuplier, sur l'extérieur seulement. Option : mélange 50 % huile de lin et 50 % essence de térébenthine pour la première couche des chants, 1 % de siccatif pour accélérer le séchage.",
  '- Brosser et poncer la suie de découpe (papier de verre grain 120, puis grain 180).',
  "- Masquer au ruban de peintre les dents, les fentes et toutes les surfaces à coller : l'huile empêche la colle d'accrocher.",
  '- Passer une première couche fine au pinceau ou au chiffon ; les chants en reçoivent deux, car ils boivent.',
  "- Essuyer l'excès après 15 à 30 minutes.",
  "NE PAS HUILER l'intérieur du nid (parois intérieures, face supérieure du plancher intérieur) NI l'intérieur du trou d'envol (le tunnel d'entrée, face côté nid du bloc comprise) : ces surfaces restent brutes, poncées, sans suie de découpe. Les masquer au ruban si besoin.",
  "Cette procédure n'est donnée qu'ici, à la première étape d'huile : les étapes d'huile suivantes disent seulement quelles pièces huiler.",
  "Sécurité : un chiffon imbibé d'huile de lin peut s'enflammer tout seul en séchant en tas. On l'étale à plat dehors, ou on le noie dans l'eau avant de le jeter.",
].join('\n');

/** Rappel court de la procédure, pour les huilages suivants. */
export const OIL_SHORT = [
  "Même procédure que pour le conduit d'air : poncer, masquer dents, fentes et surfaces à coller, couche fine, chants en deux couches, essuyer l'excès après 15 à 30 minutes.",
  "Sécurité : les chiffons imbibés d'huile de lin s'étalent à plat dehors ou se noient dans l'eau.",
].join('\n');

/** Séchage plus court des étapes suivantes (la durée et le reste sont donnés à la première étape de séchage). */
export const DRY_SHORT = 'Laisser sécher, enlever le ruban, puis coller.';

/** Séchage entre les couches et avant le collage (première étape de séchage). */
export const DRY_TEXT = [
  '- Laisser sécher environ une semaine par couche (durée indicative : elle dépend de la température et de l\'humidité), puis passer la seconde couche.',
  '- Enlever le ruban, puis coller (colle à bois de classe D3 ou D4).',
  "- Aérer 2 à 4 semaines avant le montage (le nichoir est mis en service au printemps) : l'odeur ne doit pas rester dans le nid.",
].join('\n');

/** Saturateur du toit en okoumé : section « Finition du bois (huile de lin, saturateur, peinture) ». */
export const SAT_TEXT = [
  "Saturateur à l'eau Luxens teck mat sur les deux plaques d'okoumé du toit, à la place de l'huile de lin. Essai sur une chute avant de traiter : c'est un gel anti-glisse conçu pour les terrasses.",
  "- Appliquer uniquement sur les pièces du toit, à l'extérieur, jamais sur ce qui touche le nid.",
  '- Masquer au ruban de peintre les surfaces à coller (face de dessus de la plaque crénelée, dents, fentes).',
  '- 2 couches, chants compris.',
  "Étiquette : « dangereux : respecter les précautions d'emploi ».",
].join('\n');

/** Séchage du saturateur. */
export const SAT_DRY = [
  "- Séchage au toucher : 1 h (selon l'étiquette) ; laisser sécher entre les deux couches.",
  '- Enlever le ruban avant de coller.',
].join('\n');

/** Peinture blanche de l'habillage. */
export const PAINT_TEXT = [
  'Peinture extérieure bois / MDF / OSB « Conditions extrêmes » Luxens, blanc satiné (RAL 9016), sans sous-couche sur bois neuf. Peindre les 22 lames avant de les coller.',
  '- 2 faces et les chants, 2 couches.',
  '- Masquer au ruban de peintre les surfaces à coller.',
  "- Nettoyer les outils à l'eau.",
  "Étiquette : « dangereux : respecter les précautions d'emploi ». L'habillage est peint, pas huilé : la peinture ne tient pas sur une surface huilée.",
].join('\n');

/** Séchage de la peinture de l'habillage. */
export const PAINT_DRY = [
  "- Au toucher : 12 h (selon l'étiquette).",
  "- Entre deux couches : 6 h (selon l'étiquette).",
  "- Sec complètement : 12 h (selon l'étiquette), puis enlever le ruban et coller les lames.",
].join('\n');

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

export const TEST_MULTIMETER = [
  'Avant la mise sous tension, au multimètre :',
  '- continuité sur le rail 12 V ;',
  '- jamais de court-circuit entre le + et le − du rail.',
  'Tirer légèrement sur chaque fil après l\'avoir serré : s\'il bouge, le bornier ou le Wago n\'est pas bien fermé.',
].join('\n');

export const TEST_BATTERY = [
  'Le panneau solaire reste débranché. Brancher la batterie, avec son fusible et le régulateur de charge en place.',
  '- La batterie LiFePO4 4S se situe autour de 12,8 V (14,6 V au plus à la charge, coupure basse vers 10 à 10,5 V).',
  '- Le convertisseur alimente le Pi : la page `http://<ip-du-pi>:8080` répond, avec le niveau de la batterie.',
  '- Refaire en vrai les essais de l\'établi : capteurs, caméras, LED, ventilateur (marche, arrêt, tr/min).',
].join('\n');
