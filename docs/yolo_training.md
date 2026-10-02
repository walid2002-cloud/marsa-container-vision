# Entraînement d'un modèle YOLO spécialisé conteneurs (Phase 5)

Ce guide explique comment préparer un dataset, entraîner un modèle YOLOv8 dédié
aux **conteneurs maritimes**, l'exporter et le brancher dans Marsa Container Vision,
sans casser le fonctionnement actuel (OCR seul / YOLO expérimental).

## 1. État actuel et limites

- Le service IA utilise aujourd'hui `yolov8n.pt` (**COCO générique, 80 classes**).
  Il ne détecte **pas** spécifiquement les conteneurs maritimes ; il sert seulement
  à proposer une ROI heuristique (véhicules volumineux) avant l'OCR.
- Le pipeline OCR (EasyOCR + prétraitement OpenCV) reste la source principale de
  lecture des codes ISO 6346.
- Tant qu'aucun modèle custom n'est fourni, `YOLO_MODEL_MODE=custom` retombe
  proprement sur le mode `unavailable` (aucun crash).

## 2. Quelles images collecter

- Conteneurs sous plusieurs **angles** : face (`front`), arrière (`back`),
  côté gauche/droit (`left_side` / `right_side`), en biais (`angled`).
- Conditions variées : jour/nuit, pluie, contre-jour, conteneurs sales, rouille.
- Codes ISO **nets, partiels et partiellement cachés** (obstacle, câble, autre conteneur).
- Empilements, camions porteurs, portiques/grues en arrière-plan.
- Viser au minimum ~1000 images annotées pour un premier modèle exploitable.

## 3. Classes à annoter

Définies dans `ai-service/dataset/dataset.yaml` :

| id | classe | conseils d'annotation |
|----|--------|-----------------------|
| 0 | `container` | boîte englobant le conteneur entier |
| 1 | `container_code_area` | encadrer **précisément** le numéro ISO (ROI OCR) |
| 2 | `seal` | petit scellé sur la porte, même partiel |
| 3 | `door` | panneaux de portes (utile pour l'orientation) |
| 4 | `truck` | camion / châssis |
| 5 | `crane` | grue / portique |

## 4. Comment annoter

1. Utiliser **Roboflow**, **CVAT**, **LabelImg** ou **makesense.ai**.
2. Exporter au format **YOLOv8 / YOLO TXT**.
3. Un fichier `.txt` par image : `class_id x_center y_center width height` (valeurs 0–1).
4. Placer images et labels dans les dossiers correspondants (voir `dataset/README.md`).

## 5. Répartition train / val / test

- `train` ≈ 70 %, `val` ≈ 20 %, `test` ≈ 10 %.
- Éviter qu'une même prise de vue se retrouve dans deux splits (fuite de données).

## 6. Lancer l'entraînement

```bash
pip install ultralytics

# Depuis la racine du projet (ou ai-service/)
yolo detect train \
  data=ai-service/dataset/dataset.yaml \
  model=yolov8n.pt \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  project=runs/marsa \
  name=container_yolov8n
```

- Ajuster `model=` (`yolov8n/s/m`) selon le compromis vitesse/précision.
- Surveiller `mAP50-95`, la matrice de confusion et les courbes PR.

## 7. Exporter et récupérer le modèle

Le meilleur modèle est écrit dans :

```
runs/marsa/container_yolov8n/weights/best.pt
```

Export optionnel (ONNX) pour un déploiement optimisé :

```bash
yolo export model=runs/marsa/container_yolov8n/weights/best.pt format=onnx
```

## 8. Où placer le modèle dans le projet

1. Copier `best.pt` dans le service IA, par ex. :
   `ai-service/models/container_yolov8.pt`
2. Ce chemin devient `/app/models/container_yolov8.pt` dans le conteneur
   (le dossier `ai-service/` est monté sur `/app`).

## 9. Activer le modèle custom (`YOLO_MODEL_PATH`)

Dans `docker-compose.yml` (service `ai-service`) ou `.env` :

```env
YOLO_ENABLED=true
YOLO_MODEL_MODE=custom
YOLO_MODEL_PATH=/app/models/container_yolov8.pt
YOLO_CONFIDENCE_THRESHOLD=0.30
YOLO_CLASSES_CONFIG=/app/dataset/dataset.yaml
```

Redémarrer le service IA. Les réponses d'analyse exposeront alors
`yolo_model_mode=custom`. Si le fichier est absent, le service loggue un
avertissement et renvoie `yolo_model_mode=unavailable` (aucune interruption).

## 10. Limites actuelles à garder en tête

- Sans dataset réel annoté, **aucun modèle custom n'existe** : ce guide est une
  préparation.
- L'`orientation` reste `unknown` tant qu'un post-traitement géométrique
  (à partir des boîtes `door` / `container_code_area`) n'est pas implémenté.
- Le passage en `custom` ne modifie pas le contrat d'API : les champs OCR
  (`raw_ocr_text`, `matched_code`, `match_score`, `ocr_quality`, …) restent identiques.
