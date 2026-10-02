FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir opencv-python-headless>=4.8.0
RUN pip install --no-cache-dir -r requirements.txt

RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False)" \
    && python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY . .

# Copie hors des volumes montés (demo_images, etc.) : évite un bind mount vide
# qui masque /app/demo_containers.json et casse l'index démo.
RUN mkdir -p /app/bundled /app/evidence /app/test_images /app/test_outputs /app/demo_images /app/results \
    && if [ -f /app/demo_containers.json ]; then cp -f /app/demo_containers.json /app/bundled/demo_containers.json; fi

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
