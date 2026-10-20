"""Cohérence entre le programme pi/nichoir/ et le site (pi/site) : champs de /api/etat et routes /api/*."""
import re

import pytest

from conftest import PI

TYPES = PI / "site" / "src" / "types" / "device.ts"
API = PI / "site" / "src" / "api" / "index.ts"
SOURCE = PI / "nichoir"   # le dossier : tous les chapitres .py


def ts_fields(texte):
    return set(re.findall(r"(?:^|[{;,])\s*(?:readonly\s+)?(\w+)\??\s*:", texte, re.M))


def cles(d, prefixe=""):
    for k, v in d.items():
        yield prefixe + k
        if isinstance(v, dict):
            yield from cles(v, prefixe + k + ".")


def interface(texte, nom):
    corps = re.search(r"interface\s+" + nom + r"[^{]*\{(.*?)\n\}", texte, re.S)
    assert corps, nom
    return ts_fields(corps.group(1))


def test_etat_keys_exist_in_device_ts(client, m):
    ts = ts_fields(TYPES.read_text(encoding="utf-8"))
    m.read_sensors()
    manquants = sorted({k.split(".")[-1] for k in cles(client.get("/api/etat").get_json())
                        if not k.startswith("erreurs.")} - ts)
    assert manquants == [], f"champs de /api/etat absents de DeviceState : {manquants}"


def test_each_nested_interface_matches_runtime_keys(client, m):
    texte = TYPES.read_text(encoding="utf-8")
    m.read_sensors()
    d = client.get("/api/etat").get_json()
    for nom, obj in [("DeviceState", d), ("Fan", d["ventilo"]), ("Outside", d["ext"]), ("AutoState", d["auto"]),
                     ("Consumption", d["conso"])]:
        extra = set(obj) - interface(texte, nom)
        if nom == "AutoState":   # AutoState étend AutoSettings : ses champs sont dans l'autre interface
            extra -= interface(texte, "AutoSettings")
        assert extra == set(), f"{nom} : champs envoyés par le Pi mais absents du type : {sorted(extra)}"
    assert set(d["conso"]["detail"]) <= ts_fields(texte)


def test_typescript_fields_are_all_sent_by_the_pi(client, m):
    """Sens inverse : un champ requis du type (sans `?`) doit exister dans la réponse."""
    texte = TYPES.read_text(encoding="utf-8")
    m.read_sensors()
    d = client.get("/api/etat").get_json()
    requis = re.findall(r"^\s*(\w+):", re.search(r"interface DeviceState \{(.*?)\n\}", texte, re.S).group(1), re.M)
    assert set(requis) <= set(d), sorted(set(requis) - set(d))
    for nom, obj in [("Fan", d["ventilo"]), ("Outside", d["ext"])]:
        assert set(re.findall(r"^\s*(\w+):", re.search(r"interface " + nom + r" \{(.*?)\n\}", texte, re.S).group(1), re.M)) <= set(obj), nom


def test_error_keys_of_the_code_are_declared_in_device_ts():
    texte = TYPES.read_text(encoding="utf-8")
    declarees = interface(texte, "DeviceErrors")
    code = ("\n").join(f.read_text(encoding="utf-8") for f in sorted(SOURCE.glob("*.py")))
    utilisees = set(re.findall(r'erreurs"\]\["(\w+)"\]', code))
    utilisees |= set(re.findall(r'erreurs"\]\.(?:get|pop)\("(\w+)"', code))
    utilisees |= set(re.findall(r'\be\["(\w+)"\]', code))          # `e = state["erreurs"]` dans check_fan / run_auto
    utilisees |= set(re.findall(r'\be\.pop\("(\w+)"', code))
    utilisees |= {f"camera{n}" for n in (1, 2)} if 'f"camera{' in code else set()
    utilisees -= {"gpio_"}
    assert {"mock", "gpio", "bme280", "ventilo", "sonde_ext", "alerte_chaleur", "tachymetre", "picamera2", "camera1"} <= utilisees
    assert sorted(utilisees - declarees) == [], f"clés d'erreur du Pi absentes de DeviceErrors : {sorted(utilisees - declarees)}"


def test_enum_values_are_declared_in_device_ts():
    texte = TYPES.read_text(encoding="utf-8")
    code = ("\n").join(f.read_text(encoding="utf-8") for f in sorted(SOURCE.glob("*.py")))
    for m_ in ("arret", "manuel", "auto"):
        assert f"'{m_}'" in texte
    for e in ("inactif", "veille", "ventile", "securite"):
        assert f"'{e}'" in texte and f'"{e}"' in code


def test_api_routes_used_by_the_site(m):
    api = API.read_text(encoding="utf-8")
    routes = sorted({r.rule for r in m.app.url_map.iter_rules() if r.rule.startswith("/api/")})
    assert routes, "aucune route /api"
    absentes = [r for r in routes if f"'{r}'" not in api]
    assert absentes == [], f"routes Flask jamais appelées par pi/site/src/api/index.ts : {absentes}"


def test_site_only_calls_existing_routes(m):
    api = API.read_text(encoding="utf-8")
    appelees = set(re.findall(r"'(/api/\w+)'", api))
    routes = {r.rule for r in m.app.url_map.iter_rules()}
    assert appelees and appelees <= routes, sorted(appelees - routes)


def test_site_http_methods_match_flask(m):
    api = API.read_text(encoding="utf-8")
    flask_methods = {r.rule: r.methods for r in m.app.url_map.iter_rules() if r.rule.startswith("/api/")}
    for url in set(re.findall(r"post\('(/api/\w+)'", api)):
        assert "POST" in flask_methods[url], url
    for url in ("/api/etat", "/api/historique"):
        assert "GET" in flask_methods[url]
        assert f"fetch('{url}')" in api


@pytest.mark.parametrize("fichier", [TYPES, API])
def test_site_files_exist(fichier):
    assert fichier.is_file()


def test_chapitres_de_nichoir_sont_tous_listes_dans_init_et_existent():
    """La liste CHAPTERS de nichoir/__init__.py (l'ordre d'exécution) doit nommer exactement les fichiers du dossier : un chapitre oublié ne serait jamais chargé."""
    init = (PI / "nichoir" / "__init__.py").read_text(encoding="utf-8")
    liste = re.search(r"CHAPTERS\s*=\s*\[(.*?)\]", init, re.S).group(1)
    nommes = re.findall(r'"(\w+)"', liste)
    files = sorted(p.stem for p in (PI / "nichoir").glob("*.py") if p.stem not in ("__init__", "__main__"))
    assert sorted(nommes) == files and len(set(nommes)) == len(nommes)
    for nom in nommes:   # chaque chapitre commence par son cadre d'explication
        assert (PI / "nichoir" / f"{nom}.py").read_text(encoding="utf-8").startswith("# ====")


def test_nginx_relays_every_route_used_by_the_site():
    """Le relais du Pi serveur (pi/serveur/nichoir-nginx.conf) couvre toutes les adresses que le site appelle."""
    conf = (PI / "serveur" / "nichoir-nginx.conf").read_text(encoding="utf-8")
    prefixes = re.findall(r"location\s+(/\w+/)\s*\{", conf)   # les préfixes relayés : /api/, /video/
    assert set(prefixes) == {"/api/", "/video/"}
    sources = "".join(f.read_text(encoding="utf-8") for f in (PI / "site" / "src").rglob("*.ts*") if ".test." not in f.name)   # tout le code du site
    for path in set(re.findall(r"['\"`](/(?:api|video)/[\w/]*)", sources)):
        assert any(path.startswith(p) for p in prefixes), path
    assert "proxy_buffering off" in conf   # le flux vidéo n'est pas mis en tampon
    assert conf.count("proxy_pass http://NICHOIR_IP:8080;") == len(prefixes)   # une seule adresse à remplacer
