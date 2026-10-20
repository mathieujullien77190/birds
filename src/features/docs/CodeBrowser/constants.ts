/** Le code du dossier pi/ (le programme du Raspberry Pi), lu à la compilation : aucun fichier n'est chargé à l'exécution. */
export const SOURCES = import.meta.glob(
  ['/pi/**/*.{py,service,txt,md,ts,tsx,css,html}', '!/pi/web/**', '!/pi/**/node_modules/**'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

export const LANG: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', py: 'python', html: 'xml', css: 'css', json: 'json', md: 'markdown', service: 'ini', yml: 'yaml', txt: 'ini' };
/** Ce que fait chaque fichier ou dossier, en une ligne (affiché dans l'arborescence). */
export const NOTE: Record<string, string> = {
  'src/birdhouse/model.ts': 'façade du modèle (model/ : génération du nichoir, plaques, crans, découpe)',
  'src/birdhouse/three': 'Three.js : scène, fabriques de pièces, interactions',
  'src/features/viewer/Planks/Planks.tsx': "l'écran : vue 3D, menus, volet « Pièces », découpe laser",
  'src/features/docs/DocModal/DocModal.tsx': 'fenêtre des documents (Markdown, schéma, prix)',
  'src/features/schema/SchemaPanel/SchemaPanel.tsx': 'schéma électrique à côté de la 3D',
  'src/features/docs/CodeBrowser/CodeBrowser.tsx': 'cet explorateur de code',
  'src/ui/Sheet2D/Sheet2D.tsx': 'planche de découpe à plat',
  'src/ui/Slider/Slider.tsx': 'curseur', 'src/ui/index.ts': "briques d'interface réutilisables",
  'src/main.tsx': "point d'entrée", 'src/app/App/App.tsx': "coquille de l'application", 'src/style.css': 'styles',
  'pi/nichoir': 'le programme Python du Raspberry Pi : un dossier de chapitres, un fichier par sujet', 'pi/nichoir/__init__.py': "le point d'entrée du paquet : explique l'organisation et exécute les chapitres dans l'ordre", 'pi/nichoir/__main__.py': 'lance le programme : `python -m nichoir`', 'pi/nichoir/config.py': 'chapitre 1 : bibliothèques, journal, toutes les constantes (seuils, limites, durées)', 'pi/nichoir/state.py': "chapitre 2 : le dictionnaire d'état affiché par la page", 'pi/nichoir/hardware.py': 'chapitre 3 : GPIO, ventilateur, tachymètre, capteur du nid, caméras', 'pi/nichoir/power.py': 'chapitre 4 : consommation estimée', 'pi/nichoir/simulation.py': 'chapitre 5 : le mode simulé (faux matériel)', 'pi/nichoir/commands.py': 'chapitre 6 : commandes du ventilateur, des caméras et des LED', 'pi/nichoir/settings.py': 'chapitre 7 : réglages gardés dans reglages.json', 'pi/nichoir/history.py': 'chapitre 8 : historique des températures sur 24 h', 'pi/nichoir/alerts.py': 'chapitre 9 : notifications, mesure et panne du ventilateur', 'pi/nichoir/auto.py': 'chapitre 10 : la ventilation automatique et ses sécurités', 'pi/nichoir/probe.py': 'chapitre 11 : la sonde de température extérieure', 'pi/nichoir/reading.py': 'chapitre 12 : la lecture périodique des capteurs', 'pi/nichoir/web.py': "chapitre 13 : le serveur web, la page et l'API", 'pi/nichoir/startup.py': 'chapitre 14 : démarrage et arrêt du programme',
  'pi/site/index.html': 'page HTML du site (point de départ de la compilation)', 'pi/site/src/main.tsx': "point d'entrée du site React", 'pi/site/src/components/App/App.tsx': 'la page : assemble les cartes', 'pi/site/src/hooks/useDeviceState.ts': 'relecture toutes les 5 s et commandes', 'pi/site/src/api/index.ts': "client typé de l'API Flask", 'pi/site/src/types/device.ts': "type de l'état (miroir de etat en Python)",
  'pi/nichoir.service': 'démarrage automatique (systemd)', 'pi/requirements.txt': 'bibliothèques Python', 'pi/README.md': 'installation sur le Pi',
  'docs/schema-electronique.md': 'le document électronique', 'docs/logiciel.md': 'le document logiciel', 'docs/architecture-3d.md': "l'architecture du code 3D",
  'CLAUDE.md': 'notes de travail détaillées', 'README.md': 'présentation du projet', 'index.html': 'page HTML', 'vite.config.ts': 'réglages Vite',
  '.github/workflows/pages.yml': 'publication GitHub Pages',
};
