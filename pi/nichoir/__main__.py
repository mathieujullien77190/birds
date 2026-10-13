"""Point d'entrée : `python -m nichoir` (lancé depuis le dossier qui contient `nichoir/`)."""
from . import main  # `main` est défini dans le chapitre startup.py ; importer le paquet exécute tous les chapitres

main()  # coupe le 12 V, relit les réglages, lance la boucle de lecture puis le serveur web
