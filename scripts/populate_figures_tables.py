#!/usr/bin/env python3
"""Reconstruction complète + listes des figures et tableaux — walid fin 2027.docx"""

from __future__ import annotations

import re
import shutil
import sys
import zipfile
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import rebuild_pfe_docx as rebuild
from xml.etree import ElementTree as ET

W_NS = rebuild.W_NS
NS = rebuild.NS

FIGURE_HEAD_RE = re.compile(r"^Figure\s+(?:X|\d+|A-\d+|B-\d+)\s*:\s*", re.I)
TABLE_HEAD_RE = re.compile(r"^Tableau\s+\d+\s*:\s*", re.I)


def extract_figure_title(text: str) -> str:
    title = FIGURE_HEAD_RE.sub("", text).strip()
    return title.split("\n")[0].strip()


def extract_table_title(text: str) -> str:
    title = TABLE_HEAD_RE.sub("", text).strip()
    return title.split("\n")[0].strip()


def is_annexe_figure(text: str) -> bool:
    return bool(re.match(r"^Figure\s+[AB]-\d+\s*:", text, re.I))


def is_figure_caption(text: str) -> bool:
    return bool(FIGURE_HEAD_RE.match(text))


def is_table_caption(text: str) -> bool:
    return bool(TABLE_HEAD_RE.match(text))


def make_list_paragraph(template: ET.Element, line: str) -> ET.Element:
    new_p = deepcopy(template)
    rebuild.set_para_text(new_p, line)
    return new_p


def replace_list_section(body: ET.Element, heading: str, next_heading: str, lines: list[str]) -> None:
    children = list(body)
    start_idx = end_idx = None
    anchor = None

    for i, child in enumerate(children):
        if child.tag != f"{{{W_NS}}}p":
            continue
        t = rebuild.para_text(child)
        if t == heading and start_idx is None:
            start_idx = i
            anchor = child
        elif t == next_heading and start_idx is not None:
            end_idx = i
            break

    if anchor is None or end_idx is None:
        return

    for child in children[start_idx + 1 : end_idx]:
        if child.tag == f"{{{W_NS}}}p":
            body.remove(child)

    insert_at = list(body).index(anchor) + 1
    for line in reversed(lines):
        body.insert(insert_at, make_list_paragraph(anchor, line))


def process_body(body: ET.Element) -> tuple[list[str], list[str], list[str]]:
    zone = "body"
    main_num = 0
    class_figures = 0
    figures_main: list[str] = []
    figures_annex: list[str] = []
    tables: list[str] = []

    for child in body:
        if child.tag != f"{{{W_NS}}}p":
            continue
        text = rebuild.para_text(child)
        if not text:
            continue

        if text == "Liste des figures":
            zone = "fig_list"
            continue
        if text == "Liste des tableaux":
            zone = "tab_list"
            continue
        if text == "Liste des abréviations":
            zone = "body"
            continue
        if zone in ("fig_list", "tab_list"):
            continue

        if is_figure_caption(text):
            title = extract_figure_title(text)
            rest = text.split("\n", 1)[1] if "\n" in text else ""

            if title == "Diagramme de classes" and not is_annexe_figure(text):
                class_figures += 1
                labels = ["Diagramme de classes", "Diagramme de composants", "Diagramme de déploiement"]
                title = labels[min(class_figures - 1, 2)]

            if is_annexe_figure(text):
                prefix = re.match(r"^(Figure\s+[AB]-\d+)", text, re.I).group(1)
                # Nettoyer les légendes d'annexe fusionnées avec le paragraphe descriptif
                if "Cette interface" in title:
                    title = title.split("Cette interface")[0].strip()
                new_line = f"{prefix} : {title}"
                figures_annex.append(new_line)
            else:
                main_num += 1
                new_line = f"Figure {main_num} : {title}"
                figures_main.append(new_line)

            rebuild.set_para_text(child, new_line + (f"\n{rest}" if rest else ""))
            continue

        if is_table_caption(text):
            title = extract_table_title(text)
            new_line = f"Tableau {len(tables) + 1} : {title}"
            tables.append(new_line)
            rebuild.set_para_text(child, new_line)

    return figures_main, figures_annex, tables


def build_document(src: Path, dst: Path) -> None:
    shutil.copy2(src, dst)

    with zipfile.ZipFile(dst, "r") as zin:
        root = ET.fromstring(zin.read("word/document.xml"))

    body = root.find("w:body", NS)
    if body is None:
        raise SystemExit("Document invalide")

    for p in body.iter(f"{{{W_NS}}}p"):
        rebuild.fix_paragraph(p)

    rebuild.remove_unwanted_paragraphs(body)
    rebuild.dedupe_cover(body)
    rebuild.ensure_planning_block(body)
    rebuild.rebuild_toc_sdt(root)

    figures_main, figures_annex, tables = process_body(body)

    figure_lines = list(figures_main)
    if figures_annex:
        figure_lines.extend(["", "Annexes", *figures_annex])

    replace_list_section(body, "Liste des figures", "Liste des tableaux", figure_lines)
    replace_list_section(body, "Liste des tableaux", "Liste des abréviations", tables)

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


def validate(dst: Path) -> None:
    with zipfile.ZipFile(dst) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(f"{{{W_NS}}}body")

    in_fig = in_tab = False
    fig_list: list[str] = []
    tab_list: list[str] = []

    for child in body:
        if child.tag != f"{{{W_NS}}}p":
            continue
        t = rebuild.para_text(child)
        if t == "Liste des figures":
            in_fig, in_tab = True, False
            continue
        if t == "Liste des tableaux":
            in_fig, in_tab = False, True
            continue
        if t == "Liste des abréviations":
            in_fig, in_tab = False, False
            continue
        if in_fig and t:
            fig_list.append(t)
        if in_tab and t:
            tab_list.append(t)

    imgs = sum(1 for p in root.iter(f"{{{W_NS}}}p") if rebuild.has_image(p))
    print(f"Images conservées     : {imgs}")
    print(f"Liste des figures     : {len([x for x in fig_list if x.startswith('Figure')])} entrées")
    print(f"Liste des tableaux    : {len([x for x in tab_list if x.startswith('Tableau')])} entrées")
    print("\n--- Liste des figures (extrait) ---")
    for line in fig_list[:6]:
        print(line)
    print("...")
    for line in fig_list[-4:]:
        print(line)
    print("\n--- Liste des tableaux ---")
    for line in tab_list:
        print(line)


def main() -> None:
    src = Path("/Users/walidboudarra/Downloads/sfe fin 2026.docx")
    dst = Path("/Users/walidboudarra/Desktop/conteneur-marsa/walid fin 2027.docx")
    downloads = Path("/Users/walidboudarra/Downloads/walid fin 2027.docx")

    if not src.exists():
        src = Path("/Users/walidboudarra/Desktop/conteneur-marsa/sfe fin 2026 corrige.docx")

    build_document(src, dst)

    try:
        shutil.copy2(dst, downloads)
        print(f"\nFichier principal   : {downloads}")
    except OSError:
        print(f"\nFichier principal   : {dst}")
        print("(copie Downloads non autorisée — ouvre le fichier depuis le projet)")

    validate(dst)


if __name__ == "__main__":
    main()
