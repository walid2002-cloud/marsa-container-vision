#!/usr/bin/env python3
"""Reconstruction du rapport PFE en préservant images, tableaux et mise en forme."""

from __future__ import annotations

import re
import shutil
import zipfile
from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}
PIC_NS = "{http://schemas.openxmlformats.org/drawingml/2006/picture}pic"
INLINE_NS = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}inline"

SKIP_PATTERNS = [
    r"^Remplace « macOS »",
    r"^Les quatre captures représentent",
    r"^Avant de placer cette capture",
    r"^Guide de mise en forme",
    r"^Règles typographiques essentielles",
    r"^1$",
    r"^11Réalisé par :Encadrant",
]

TEXT_REPLACEMENTS = [
    ("Erreur\u00a0! Signet non défini.", ""),
    ("2025 / 2026", "2026 / 2027"),
    ("2025/2026", "2026/2027"),
    ("1.1  Présentation de l'organisme d'accueil", "1.1  Présentation de Marsa Maroc"),
    ("2.1.1  [Besoin fonctionnel 1]", "2.1.1  Gestion des Bots IA WhatsApp"),
    ("2.1.2  [Besoin fonctionnel 2]", "2.1.2  Analyse visuelle des conteneurs"),
    ("4.2.1  [Interface 1 — ex : Page d'accueil / Authentification]", "4.2.1  Présentation de l'application Marsa Maroc AI"),
    ("4.2.2  [Interface 2]", "4.2.2  Interface d'analyse des performances"),
    ("Annexe A — [Titre]", "Annexe A — Interfaces complémentaires de Marsa Maroc AI"),
    ("Annexe B — [Titre]", "Annexe B — Interfaces complémentaires de Marsa Container Vision"),
    ("Guide de mise en forme (Référence rapide)", ""),
    ("Règles typographiques essentielles", ""),
    ("◗", ""),
    ("2.1.3Recherche", "2.1.3 Recherche"),
    ("Sous-besoin 3. 3", "Sous-besoin 3.3"),
    ("cas dutilisation", "cas d'utilisation"),
    ("backendque la modélisation statique", "ainsi que la modélisation statique"),
    ("1 er Tableaux", "1er Tableau"),
    ("2eme tableaux", "2ème Tableau"),
    ("[Nom du scénario]", "Recherche d'un conteneur par identifiant"),
    ("[Classe]", "Processus de recherche de conteneur"),
    ("4.2.2 Présentation de l’application Marsa Container Vision", "4.3 Présentation de l’application Marsa Container Vision"),
    ("0.1xx", "0.110"),
    ("système.La section", "système. La section"),
    (
        "Projet de Fin d'Année5ème Année — Année universitaire 2026 / 2027Projet de Fin d'Année",
        "Projet de Fin d'Année\n5ème Année — Année universitaire 2026 / 2027",
    ),
    (
        "5ème Année — Année universitaire 2026 / 20275ème Année — Année universitaire 2026 / 2027",
        "5ème Année — Année universitaire 2026 / 2027",
    ),
    (
        "Réalisé par :Encadrant Professionnel :Encadrant Pédagogique :Mr FadiliMr NouamaneWalid Boudarra",
        "Réalisé par : Walid Boudarra\nEncadrant Professionnel : Mr Nouamane\nEncadrant Pédagogique : Mr Fadili",
    ),
    (
        "11Réalisé par :Encadrant Professionnel :Encadrant Pédagogique :Mr FadiliMr NouamaneWalid Boudarra",
        "Réalisé par : Walid Boudarra\nEncadrant Professionnel : Mr Nouamane\nEncadrant Pédagogique : Mr Fadili",
    ),
    (
        "11Réalisé par : Walid Boudarra\nEncadrant Professionnel : Mr Nouamane\nEncadrant Pédagogique : Mr FadiliRéalisé par : Walid Boudarra\nEncadrant Professionnel : Mr Nouamane\nEncadrant Pédagogique : Mr Fadili",
        "Réalisé par : Walid Boudarra\nEncadrant Professionnel : Mr Nouamane\nEncadrant Pédagogique : Mr Fadili",
    ),
    ("Figure A-1 : Interface de configuration de WhatsApp Cloud APICette", "Figure A-1 : Interface de configuration de WhatsApp Cloud API\nCette"),
    ("Figure A-2 : Interface d'export des datasetsCette", "Figure A-2 : Interface d'export des datasets\nCette"),
    ("Figure A-2 : Interface d\u2019export des datasetsCette", "Figure A-2 : Interface d\u2019export des datasets\nCette"),
    ("Figure A-3 : Interface Replay des conversationsCette", "Figure A-3 : Interface Replay des conversations\nCette"),
    ("Figure B-1 : Interface complète des caméras simuléesCette", "Figure B-1 : Interface complète des caméras simulées\nCette"),
    ("Figure B-2 : Interface de gestion des utilisateursCette", "Figure B-2 : Interface de gestion des utilisateurs\nCette"),
    ("Figure B-3 : Interface des rôles et des permissionsCette", "Figure B-3 : Interface des rôles et des permissions\nCette"),
]
for i in range(1, 13):
    TEXT_REPLACEMENTS.append((f"4.2.15.{i}", f"4.3.{i}"))


def para_text(elem: ET.Element) -> str:
    parts: list[str] = []
    for t in elem.iter(f"{{{W_NS}}}t"):
        if t.text:
            parts.append(t.text)
        if t.tail:
            parts.append(t.tail)
    return "".join(parts).strip()


def has_image(elem: ET.Element) -> bool:
    return bool(list(elem.iter(INLINE_NS)) or list(elem.iter(PIC_NS)))


def set_para_text(elem: ET.Element, new_text: str) -> None:
    texts = list(elem.iter(f"{{{W_NS}}}t"))
    if not texts:
        return
    texts[0].text = new_text
    for t in texts[1:]:
        t.text = ""
        t.tail = ""


def apply_text_fixes(text: str) -> str:
    for old, new in TEXT_REPLACEMENTS:
        text = text.replace(old, new)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def should_skip(text: str) -> bool:
    if not text:
        return False
    return any(re.search(pat, text) for pat in SKIP_PATTERNS)


def is_mega_duplicate(text: str) -> bool:
    return (
        text.count("Le premier diagramme représente la première partie") >= 2
        or text.count("Le deuxième diagramme présente la suite") >= 2
    )


def fix_paragraph(elem: ET.Element) -> str:
    raw = para_text(elem)
    fixed = apply_text_fixes(raw)
    if fixed != raw:
        set_para_text(elem, fixed)
    return fixed


def number_figures(root: ET.Element) -> None:
    num = 4
    classes_seen = 0
    for p in root.iter(f"{{{W_NS}}}p"):
        text = para_text(p)
        if not text.startswith("Figure X"):
            continue
        if text.startswith("Figure X : Diagramme de classes"):
            classes_seen += 1
            label = ["Diagramme de classes", "Diagramme de composants", "Diagramme de déploiement"][
                min(classes_seen - 1, 2)
            ]
            set_para_text(p, f"Figure {num} : {label}")
        else:
            caption = re.sub(r"^Figure X\s*:\s*", "", text)
            set_para_text(p, f"Figure {num} : {caption}")
        num += 1


def dedupe_cover(body: ET.Element) -> None:
    p_tag = f"{{{W_NS}}}p"
    seen: set[str] = set()
    for child in list(body)[:30]:
        if child.tag != p_tag or has_image(child):
            continue
        text = para_text(child)
        if not text:
            continue
        if text in seen and (
            text.startswith("Projet de Fin d'Année")
            or text.startswith("5ème Année")
            or text.startswith("Réalisé par : Walid")
        ):
            body.remove(child)
        else:
            seen.add(text)


def remove_unwanted_paragraphs(body: ET.Element) -> None:
    prev = ""
    cover_seen: set[str] = set()
    p_tag = f"{{{W_NS}}}p"

    for child in list(body):
        if child.tag != p_tag:
            prev = ""
            continue

        if has_image(child):
            fix_paragraph(child)
            prev = para_text(child)
            continue

        text = fix_paragraph(child)

        if is_mega_duplicate(text) or should_skip(text):
            body.remove(child)
            continue

        if text == prev and len(text) > 40:
            body.remove(child)
            continue

        if text.startswith("Projet de Fin d'Année") or text.startswith("Réalisé par : Walid"):
            if text in cover_seen:
                body.remove(child)
                continue
            cover_seen.add(text)

        prev = text


def ensure_planning_block(body: ET.Element) -> None:
    blocks = {
        "Tableau 1 : Planning prévisionnel": [
            "Le premier diagramme représente la première partie du planning prévisionnel, couvrant la période du 1er avril au 31 mai. Cette période est consacrée aux premières étapes du projet.",
            "Durant les deux premières semaines, nous avons prévu l’étude préalable, qui consiste à comprendre le contexte du projet, analyser l’existant, identifier les besoins et définir les objectifs de la solution.",
            "Ensuite, la phase de conception s’étend du 15 avril au 15 mai. Elle permet de préparer l’architecture générale du système, les diagrammes UML, le modèle de données et les choix technologiques.",
            "Enfin, la réalisation commence à partir du 16 mai. Cette première partie de réalisation concerne le démarrage du développement des modules principaux.",
        ],
        "2ème Tableau\u00a0:": [
            "Le deuxième diagramme présente la suite du planning prévisionnel, couvrant la période du 1er juin au 31 juillet. Cette partie est dédiée à la réalisation avancée et à la validation du projet.",
            "La phase de réalisation continue du 1er juin au 15 juillet et couvre le développement complet des fonctionnalités principales.",
            "À partir du 16 juillet, la phase de tests et validation permet de vérifier l’intégration entre WhatsApp, le backend, la base de données et le service IA.",
            "Ces deux diagrammes représentent l’organisation du travail sur toute la période du stage.",
        ],
    }

    children = list(body)
    for anchor, lines in blocks.items():
        for idx, child in enumerate(children):
            if child.tag != f"{{{W_NS}}}p" or para_text(child) != anchor:
                continue
            nxt = para_text(children[idx + 1]) if idx + 1 < len(children) else ""
            if nxt.startswith(lines[0][:35]):
                break
            insert_at = list(body).index(child) + 1
            for line in reversed(lines):
                p = deepcopy(child)
                set_para_text(p, line)
                body.insert(insert_at, p)
            break


def rebuild_toc_sdt(root: ET.Element) -> None:
    entries = [
        "Dédicaces",
        "Remerciements",
        "Introduction générale",
        "Chapitre I — Présentation du cadre du projet",
        "1.1 Présentation de Marsa Maroc",
        "1.2 Étude de l'existant",
        "1.3 Choix du modèle de développement",
        "1.4 Planning prévisionnel",
        "Chapitre II — Spécification des besoins",
        "2.1 Besoins fonctionnels",
        "2.1.1 Gestion des Bots IA WhatsApp",
        "2.1.2 Analyse visuelle des conteneurs",
        "2.1.3 Recherche et historique",
        "2.2 Besoins non fonctionnels",
        "2.3 Modélisation des cas d'utilisation",
        "Chapitre III — Conception du système",
        "3.1 Modélisation dynamique",
        "3.2 Modélisation statique",
        "3.3 Architecture de l'application",
        "Chapitre IV — Réalisation du système",
        "4.1 Environnement de développement",
        "4.2 Présentation des interfaces — Marsa Maroc AI",
        "4.3 Présentation des interfaces — Marsa Container Vision",
        "Conclusion générale",
        "Bibliographie et Nétographie",
        "Annexes",
    ]

    w_sdt_content = f"{{{W_NS}}}sdtContent"
    w_p = f"{{{W_NS}}}p"
    w_r = f"{{{W_NS}}}r"
    w_t = f"{{{W_NS}}}t"

    for sdt in root.iter(f"{{{W_NS}}}sdt"):
        content = sdt.find(w_sdt_content)
        if content is None:
            continue
        paras = content.findall(w_p)
        if not any(para_text(p).startswith("Dédicaces") for p in paras):
            continue
        template = paras[0]
        for child in list(content):
            content.remove(child)
        for entry in entries:
            new_p = deepcopy(template)
            t_nodes = list(new_p.iter(w_t))
            if t_nodes:
                t_nodes[0].text = entry
                for extra in t_nodes[1:]:
                    extra.text = ""
                    extra.tail = ""
            else:
                r = ET.SubElement(new_p, w_r)
                t = ET.SubElement(r, w_t)
                t.text = entry
            content.append(new_p)
        return


def count_images(root: ET.Element) -> int:
    return sum(1 for p in root.iter(f"{{{W_NS}}}p") if has_image(p))


def main() -> None:
    src = Path("/Users/walidboudarra/Downloads/sfe fin 2026.docx")
    dst = Path("/Users/walidboudarra/Downloads/walid fin 2027.docx")
    copy = Path("/Users/walidboudarra/Desktop/conteneur-marsa/walid fin 2027.docx")

    shutil.copy2(src, dst)

    with zipfile.ZipFile(dst, "r") as zin:
        root = ET.fromstring(zin.read("word/document.xml"))

    before_images = count_images(root)
    body = root.find("w:body", NS)
    if body is not None:
        for p in body.iter(f"{{{W_NS}}}p"):
            if has_image(p):
                fix_paragraph(p)
            else:
                fix_paragraph(p)
        remove_unwanted_paragraphs(body)
        dedupe_cover(body)
        ensure_planning_block(body)
    number_figures(root)
    rebuild_toc_sdt(root)

    after_images = count_images(root)
    new_xml = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    tmp = dst.with_suffix(".tmp.docx")
    with zipfile.ZipFile(dst, "r") as zin:
        with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename == "word/document.xml":
                    data = new_xml
                zout.writestr(item, data)
    tmp.replace(dst)
    shutil.copy2(dst, copy)

    print(f"Rapport reconstruit : {dst}")
    print(f"Copie projet        : {copy}")
    print(f"Images conservées   : {before_images} -> {after_images}")


if __name__ == "__main__":
    main()
