# Vidéos de simulation caméra (démo)

Placez ici vos fichiers vidéo (`.mp4`, `.mov`, …) filmés sur le port ou ailleurs.

## Conversion en images (recommandé)

Les frames extraites sont copiées dans `../demo_images/` et référencées par `demo_cameras.json`.

```bash
# Depuis ce dossier (ai-service/demo_videos/)
./extract_frames.sh ma_video.mp4 CAM_01 30

# Arguments : <fichier_video> <id_caméra> <fps_extraction>
# Exemple : 1 image toutes les 30 frames (~1 img/s pour une vidéo 30 fps)
```

### Sans le script

```bash
ffmpeg -i ma_video.mp4 -vf "fps=1/2" ../demo_images/cam01_frame_%04d.png
```

Puis mettez à jour `demo_cameras.json` :

```json
"demo_image": "cam01_frame_0001.png"
```

## Notes soutenance

- Les caméras RTSP réelles ne sont pas connectées en démo.
- Les images locales (ou frames vidéo) simulent le flux caméra.
- OCR et YOLO optionnel analysent ces images comme en production.
