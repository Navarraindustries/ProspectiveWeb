# PROSPECTIVE Web — development commands
# Usage: make dev:backend | make dev:frontend | make dev:all

BACKEND_DIR = backend
FRONTEND_DIR = frontend
VENV        = $(BACKEND_DIR)\.venv\Scripts

.PHONY: dev\:backend dev\:frontend install\:backend install\:frontend

dev\:backend:
	cd $(BACKEND_DIR) && $(VENV)\uvicorn main:app --reload --host 127.0.0.1 --port 8000

dev\:frontend:
	cd $(FRONTEND_DIR) && npm run dev

install\:backend:
	cd $(BACKEND_DIR) && python -m venv .venv && $(VENV)\pip install -r requirements.txt

install\:frontend:
	cd $(FRONTEND_DIR) && npm install

# El esquema del que salen los tipos del frontend. Sin servidor: /openapi.json
# exige sesión desde octubre de 2026.
openapi\:export:
	cd $(BACKEND_DIR) && $(VENV)\python scripts\export_openapi.py ..\frontend\openapi.json
	cd $(FRONTEND_DIR) && npm run gen:api
	@echo frontend/openapi.json y src/api/schema.gen.ts actualizados
