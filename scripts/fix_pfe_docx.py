#!/usr/bin/env python3
"""Corrige le rapport PFE Word : placeholders, TOC, typos, doublons, numérotation."""

from __future__ import annotations

import re
import shutil
import zipfile
from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


def para_text(p: ET.Element) -> str:
    parts: list[str] = []
    for t in p.iter(f"{{{W_NS}}}t"):
        if t.text:
            parts.append(t.text)
        if t.tail:
            parts.append(t.tail)
    return "".join(parts)


def set_para_text(p: ET.Element, new_text: str) -> None:
    texts = list(p.iter(f"{{{W_NS}}}t"))
    if not texts:
        return
    texts[0].text = new_text
    for t in texts[1:]:
        t.text = ""
        t.tail = ""


def replace_in_paragraphs(root: ET.Element, replacements: list[tuple[str, str]]) -> int:
    count = 0
    for p in root.iter(f"{{{W_NS}}}p"):
        original = para_text(p)
        updated = original
        for old, new in replacements:
            if old in updated:
                updated = updated.replace(old, new)
        if updated != original:
            set_para_text(p, updated)
            count += 1
    return count


def remove_paragraphs_matching(root: ET.Element, patterns: list[str]) -> int:
    body = root.find("w:body", NS)
    if body is None:
        return 0
    removed = 0
    for child in list(body):
        if child.tag != f"{{{W_NS}}}p":
            continue
        text = para_text(child).strip()
        if any(re.search(pat, text) for pat in patterns):
            body.remove(child)
            removed += 1
    return removed


def remove_consecutive_duplicate_paragraphs(root: ET.Element) -> int:
    body = root.find("w:body", NS)
    if body is None:
        return 0
    removed = 0
    prev_text = None
    for child in list(body):
        if child.tag != f"{{{W_NS}}}p":
            prev_text = None
            continue
        text = para_text(child).strip()
        if not text:
            prev_text = None
            continue
        if text == prev_text and len(text) > 40:
            body.remove(child)
            removed += 1
            continue
        prev_text = text
    return removed


def cleanup_planning_section(root: ET.Element) -> int:
    body = root.find("w:body", NS)
    if body is None:
        return 0
    removed = 0
    for child in list(body):
        if child.tag != f"{{{W_NS}}}p":
            continue
        text = para_text(child).strip()
        if (
            text.count("Le premier diagramme représente la première partie") >= 2
            or text.count("Le deuxième diagramme présente la suite") >= 2
        ):
            body.remove(child)
            removed += 1
    return removed


def restore_planning_text_if_missing(root: ET.Element) -> None:
    body = root.find("w:body", NS)
    if body is None:
        return

    def insert_block(anchor: str, block: list[str]) -> None:
        children = list(body)
        for idx, child in enumerate(children):
            if child.tag != f"{{{W_NS}}}p":
                continue
            if para_text(child).strip() != anchor:
                continue
            next_text = ""
            for nxt in children[idx + 1 : idx + 4]:
                if nxt.tag == f"{{{W_NS}}}p":
                    next_text = para_text(nxt).strip()
                    break
            if next_text.startswith(block[0][:30]):
                return
            insert_at = idx + 1
            for text in reversed(block):
                new_p = deepcopy(child)
                set_para_text(new_p, text)
                body.insert(insert_at, new_p)
            return

    insert_block(
        "Tableau 1 : Planning prévisionnel",
        [
            "Le premier diagramme représente la première partie du planning prévisionnel, couvrant la période du 1er avril au 31 mai. Cette période est consacrée aux premières étapes du projet.",
            "Durant les deux premières semaines, nous avons prévu l’étude préalable, qui consiste à comprendre le contexte du projet, analyser l’existant, identifier les besoins et définir les objectifs de la solution.",
            "Ensuite, la phase de conception s’étend du 15 avril au 15 mai. Elle permet de préparer l’architecture générale du système, les diagrammes UML, le modèle de données et les choix technologiques.",
            "Enfin, la réalisation commence à partir du 16 mai. Cette première partie de réalisation concerne le démarrage du développement des modules principaux, notamment l’interface, le backend et la préparation des services liés aux Bots IA WhatsApp et à Marsa Container Vision.",
        ],
    )

    for anchor in ("2ème Tableau\u00a0:", "2ème Tableau:"):
        insert_block(
            anchor,
            [
                "Le deuxième diagramme présente la suite du planning prévisionnel, couvrant la période du 1er juin au 31 juillet. Cette partie est principalement dédiée à la réalisation avancée et à la validation du projet.",
                "La phase de réalisation continue du 1er juin au 15 juillet. Elle concerne le développement complet des fonctionnalités principales : gestion des bots IA, connexion WhatsApp, recherche de conteneurs par ID, analyse des images, OCR, affichage de la zone, de la caméra et de l’image preuve.",
                "À partir du 16 juillet, la phase de tests et validation commence. Elle consiste à vérifier le bon fonctionnement de chaque module, tester l’intégration entre WhatsApp, le backend, la base de données et le service IA, corriger les erreurs et valider les résultats obtenus.",
                "Ainsi, ces deux diagrammes permettent de représenter clairement l’organisation du travail sur toute la période du stage, depuis l’analyse initiale jusqu’aux tests finaux.",
            ],
        )


def insert_after_paragraph(root: ET.Element, anchor: str, entries: list[str]) -> None:
    body = root.find("w:body", NS)
    if body is None:
        return
    for child in body:
        if child.tag != f"{{{W_NS}}}p":
            continue
        if para_text(child).strip() == anchor:
            idx = list(body).index(child)
            for entry in reversed(entries):
                new_p = deepcopy(child)
                set_para_text(new_p, entry)
                body.insert(idx + 1, new_p)
            return


def number_figures(root: ET.Element) -> int:
    """Numérote les figures placeholder « Figure X » dans l'ordre d'apparition."""
    num = 4  # Figures 1 et 3 existent déjà dans le document
    classes_seen = 0
    count = 0

    for p in root.iter(f"{{{W_NS}}}p"):
        text = para_text(p).strip()
        if not text.startswith("Figure X"):
            continue

        count += 1
        if text.startswith("Figure X : Diagramme de classes"):
            classes_seen += 1
            if classes_seen == 1:
                new_text = f"Figure {num} : Diagramme de classes"
            elif classes_seen == 2:
                new_text = f"Figure {num} : Diagramme de composants"
            else:
                new_text = f"Figure {num} : Diagramme de déploiement"
        else:
            caption = re.sub(r"^Figure X\s*:\s*", "", text)
            new_text = f"Figure {num} : {caption}"

        set_para_text(p, new_text)
        num += 1

    return count


def fix_annex_captions(root: ET.Element) -> int:
    fixes = [
        (
            "Figure A-1 : Interface de configuration de WhatsApp Cloud APICette interface",
            "Figure A-1 : Interface de configuration de WhatsApp Cloud API\nCette interface",
        ),
        (
            "Figure A-2 : Interface d'export des datasetsCette interface",
            "Figure A-2 : Interface d'export des datasets\nCette interface",
        ),
        (
            "Figure A-3 : Interface Replay des conversationsCette interface",
            "Figure A-3 : Interface Replay des conversations\nC cette interface".replace("C cette", "Cette"),
        ),
        (
            "Figure B-1 : Interface complète des caméras simuléesCette interface",
            "Figure B-1 : Interface complète des caméras simulées\nCette interface",
        ),
        (
            "Figure B-2 : Interface de gestion des utilisateursCette interface",
            "Figure B-2 : Interface de gestion des utilisateurs\nCette interface",
        ),
        (
            "Figure B-3 : Interface des rôles et des permissionsCette interface",
            "Figure B-3 : Interface des rôles et des permissions\nCette interface",
        ),
    ]
    return replace_in_paragraphs(root, fixes)


def fix_cover_duplicates(root: ET.Element) -> int:
    body = root.find("w:body", NS)
    if body is None:
        return 0

    seen: set[str] = set()
    removed = 0
    cover_markers = (
        "Projet de Fin d'Année",
        "Réalisé par : Walid Boudarra",
    )

    paragraph_count = 0
    for child in list(body):
        if child.tag != f"{{{W_NS}}}p":
            continue
        paragraph_count += 1
        if paragraph_count > 25:
            break
        text = para_text(child).strip()
        if not any(text.startswith(marker) for marker in cover_markers):
            continue
        if text in seen:
            body.remove(child)
            removed += 1
        else:
            seen.add(text)
    return removed


def insert_toc_entries_in_sdt(root: ET.Element) -> None:
    w_p = f"{{{W_NS}}}p"
    w_r = f"{{{W_NS}}}r"
    w_t = f"{{{W_NS}}}t"
    w_sdt_content = f"{{{W_NS}}}sdtContent"

    for sdt in root.iter(f"{{{W_NS}}}sdt"):
        content = sdt.find(w_sdt_content)
        if content is None:
            continue

        paras = content.findall(w_p)
        toc_texts = [
            "".join(t.text or "" for t in p.iter(w_t)).strip()
            for p in paras
        ]
        if not any(t.startswith("Dédicaces") for t in toc_texts):
            continue

        def clone_entry(text: str) -> ET.Element:
            template = paras[0]
            new_p = deepcopy(template)
            t_nodes = list(new_p.iter(w_t))
            if not t_nodes:
                r = ET.SubElement(new_p, w_r)
                t = ET.SubElement(r, w_t)
            else:
                t = t_nodes[0]
            t.text = text
            for extra in t_nodes[1:]:
                extra.text = ""
                extra.tail = ""
            return new_p

        insertions: dict[str, list[str]] = {
            "2.1.2  Analyse visuelle des conteneurs21": ["2.1.3  Recherche et historique22"],
            "4.2.2  Interface d'analyse des performances47": [
                "4.2.3  Interface de gestion des alertes Container Vision48",
                "4.2.4  Interface de gestion des alertes générales49",
                "4.2.5  Interface de configuration de WhatsApp Cloud API50",
                "4.2.6  Interface de démonstration des scénarios fonctionnels51",
                "4.2.7  Interface d'export des datasets52",
                "4.2.8  Interface de création et de gestion des bots53",
                "4.3  Présentation de l'application Marsa Container Vision54",
                "4.3.1  Interface du tableau de bord analytique55",
                "4.3.2  Interface de recherche d'un conteneur56",
                "4.3.3  Interface de supervision des caméras57",
                "4.3.4  Interface de la carte du terminal58",
                "4.3.5  Interface de gestion des alertes intelligentes59",
                "4.3.6  Interface de gestion des notifications multicanal60",
                "4.3.7  Interface d'analyse d'une image61",
                "4.3.8  Interface du journal d'audit62",
                "4.3.9  Interface de gestion des utilisateurs63",
                "4.3.10  Interface de gestion des rôles et des permissions64",
                "4.3.11  Interface de sécurité et d'authentification multifacteur65",
                "4.3.12  Interface de démonstration pour la soutenance66",
            ],
        }

        for anchor, entries in insertions.items():
            for idx, p in enumerate(list(content)):
                if p.tag != w_p:
                    continue
                text = "".join(t.text or "" for t in p.iter(w_t)).strip()
                if text != anchor:
                    continue
                insert_at = list(content).index(p) + 1
                for entry in reversed(entries):
                    content.insert(insert_at, clone_entry(entry))
                break
        return


def main() -> None:
    src = Path("/Users/walidboudarra/Downloads/sfe fin 2026.docx")
    dst = Path("/Users/walidboudarra/Downloads/sfe fin 2026 corrige.docx")
    workspace_copy = Path("/Users/walidboudarra/Desktop/conteneur-marsa/sfe fin 2026 corrige.docx")

    shutil.copy2(src, dst)

    with zipfile.ZipFile(dst, "r") as zin:
        xml_bytes = zin.read("word/document.xml")

    root = ET.fromstring(xml_bytes)

    text_replacements = [
        ("Erreur\u00a0! Signet non défini.", ""),
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
        ("4.2.15.1", "4.3.1"),
        ("4.2.15.2", "4.3.2"),
        ("4.2.15.3", "4.3.3"),
        ("4.2.15.4", "4.3.4"),
        ("4.2.15.5", "4.3.5"),
        ("4.2.15.6", "4.3.6"),
        ("4.2.15.7", "4.3.7"),
        ("4.2.15.8", "4.3.8"),
        ("4.2.15.9", "4.3.9"),
        ("4.2.15.10", "4.3.10"),
        ("4.2.15.11", "4.3.11"),
        ("4.2.15.12", "4.3.12"),
        ("0.1xx", "0.110"),
        ("système.La section", "système. La section"),
        ("Projet de Fin d'Année5ème Année", "Projet de Fin d'Année\n5ème Année"),
        (
            "Réalisé par :Encadrant Professionnel :Encadrant Pédagogique :Mr FadiliMr NouamaneWalid Boudarra",
            "Réalisé par : Walid Boudarra\nEncadrant Professionnel : Mr Nouamane\nEncadrant Pédagogique : Mr Fadili",
        ),
        (
            "11Réalisé par : Walid Boudarra\nEncadrant Professionnel : Mr Nouamane\nEncadrant Pédagogique : Mr FadiliRéalisé par : Walid Boudarra\nEncadrant Professionnel : Mr Nouamane\nEncadrant Pédagogique : Mr Fadili",
            "Réalisé par : Walid Boudarra\nEncadrant Professionnel : Mr Nouamane\nEncadrant Pédagogique : Mr Fadili",
        ),
        ("11Réalisé par :Encadrant Professionnel :Encadrant Pédagogique :Mr FadiliMr NouamaneWalid Boudarra", ""),
    ]

    replace_in_paragraphs(root, text_replacements)
    remove_paragraphs_matching(
        root,
        [
            r"^Remplace « macOS » par « Windows »",
            r"^Les quatre captures représentent différentes parties",
            r"^Avant de placer cette capture dans le rapport",
            r"^$",
        ],
    )
    cleanup_planning_section(root)
    remove_consecutive_duplicate_paragraphs(root)
    restore_planning_text_if_missing(root)
    fix_cover_duplicates(root)
    number_figures(root)
    fix_annex_captions(root)
    insert_toc_entries_in_sdt(root)

    new_xml = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    with zipfile.ZipFile(dst, "r") as zin:
        with zipfile.ZipFile(dst.with_suffix(".tmp.docx"), "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename == "word/document.xml":
                    data = new_xml
                zout.writestr(item, data)

    dst.with_suffix(".tmp.docx").replace(dst)
    shutil.copy2(dst, workspace_copy)

    # Validation rapide
    with zipfile.ZipFile(dst) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    remaining = []
    for pat in [
        "Erreur\u00a0! Signet non défini.",
        "[Besoin fonctionnel",
        "[Interface",
        "[Titre]",
        "[Nom du scénario]",
        "[Classe]",
        "Figure X",
        "◗",
        "backendque",
    ]:
        if pat in xml:
            remaining.append(pat)

    print(f"Fichier corrigé : {dst}")
    print(f"Copie workspace : {workspace_copy}")
    if remaining:
        print("Éléments restants à vérifier :", ", ".join(remaining))
    else:
        print("Aucun placeholder critique restant.")


if __name__ == "__main__":
    main()
