# Dataset YOLO — Conteneurs maritimes (Marsa Container Vision, Phase 5)

Ce dossier prépare l'entraînement d'un futur modèle **YOLOv8 spécialisé conteneurs**.
Il ne contient pas encore d'images réelles : c'est une **structure prête à remplir**.

> Important : aucun entraînement n'est lancé automatiquement. Sans dataset réel,
> le service IA continue de fonctionner en **OCR seul** ou **YOLO expérimental (COCO)**.

## Structure

```
dataset/
├── images/
│   ├── train/      # images d'entraînement (~70 %)
│   ├── val/        # images de validation (~20 %)
│   └── test/       # images de test (~10 %)
├── labels/
│   ├── train/      # annotations YOLO (.txt) alignées sur images/train
│   ├── val/
│   └── test/
├── dataset.yaml    # classes + chemins (format Ultralytics)
└── README.md       # ce fichier
```

Chaque image `images/train/abc.jpg` a un fichier d'annotation `labels/train/abc.txt`.

## Classes (voir `dataset.yaml`)

| id | classe                | rôle |
|----|-----------------------|------|
| 0  | `container`           | conteneur maritime complet |
| 1  | `container_code_area` | zone du numéro / code ISO 6346 (ROI pour l'OCR) |
| 2  | `seal`                | scellé de sécurité |
| 3  | `door`                | portes du conteneur |
| 4  | `truck`               | camion / châssis porteur |
| 5  | `crane`               | grue / portique |

## Format d'annotation YOLO

Un fichier `.txt` par image, une ligne par objet :

```
<class_id> <x_center> <y_center> <width> <height>
```

Toutes les valeurs sont **normalisées entre 0 et 1** (relatives à la taille de l'image).
Exemple (`labels/train/quai_nord_01.txt`) :

```
0 0.512 0.480 0.740 0.560
1 0.610 0.365 0.180 0.070
3 0.240 0.500 0.120 0.430
2 0.235 0.470 0.020 0.030
```

## Collecte et annotation

1. **Collecter** des images variées : angles (face, arrière, côtés), luminosité,
   conteneurs propres/sales, codes partiellement cachés, empilements.
2. **Annoter** avec un outil (Roboflow, LabelImg, CVAT, makesense.ai) en exportant
   au format « YOLO ».
3. **Zone du code (`container_code_area`)** : encadrer précisément le numéro ISO —
   c'est cette boîte qui alimentera l'OCR sur une ROI ciblée.
4. **Scellés / portes** : annoter même partiellement visibles ; ils servent à estimer
   l'orientation et l'intégrité.
5. **Répartition** : ~70 % train, ~20 % val, ~10 % test, sans fuite entre les splits.

## Entraînement (résumé)

Voir la documentation complète : [`docs/yolo_training.md`](../../docs/yolo_training.md).

```bash
pip install ultralytics
yolo detect train data=dataset/dataset.yaml model=yolov8n.pt epochs=100 imgsz=640
```

Le modèle entraîné (`runs/detect/train/weights/best.pt`) doit ensuite être copié
dans le service IA et référencé via `YOLO_MODEL_PATH`, avec `YOLO_MODEL_MODE=custom`.

## Limites actuelles

- Aucune image réelle fournie : le modèle custom n'existe pas encore.
- L'orientation reste `unknown` tant qu'aucun post-traitement géométrique n'est branché.
- Le modèle expérimental (yolov8n COCO) ne connaît pas la classe « conteneur maritime ».
