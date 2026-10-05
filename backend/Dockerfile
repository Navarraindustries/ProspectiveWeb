# PROSPECTIVE Web — API (FastAPI + VTK).
#
#   docker compose up --build        (desde la raíz; ver docker-compose.yml)
#
# UN solo proceso: el progreso y los resultados de la segmentación viven en
# memoria (services/single_process.py). No se arranca con --workers.
FROM python:3.13-slim

# Lo que las ruedas de VTK cargan al importarse, y OSMesa/EGL para dibujar las
# vistas del informe sin pantalla. Si aun así no hay OpenGL, el servidor lo
# detecta y saca el informe sin esas vistas (services/scene_render.py).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libegl1 libosmesa6 libxrender1 libx11-6 libxext6 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-lock.txt .
RUN pip install --no-cache-dir -r requirements-lock.txt

COPY . .

# Todo lo que tiene que sobrevivir al contenedor va en volúmenes. Aquí viven
# datos de pacientes: no se meten en la imagen (ver .dockerignore) y no se
# sirven sin sesión.
RUN useradd --create-home --uid 10001 prospective \
    && mkdir -p data secrets study_files user_files clip_library clip_orders \
    && chown -R prospective:prospective /app
USER prospective
VOLUME ["/app/data", "/app/secrets", "/app/study_files", "/app/user_files", "/app/clip_library", "/app/clip_orders"]

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
