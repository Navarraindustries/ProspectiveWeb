from pathlib import Path
PW = Path(__file__).resolve().parents[3]
BACKEND = PW / "backend"
WORK = BACKEND / "data" / "landing_case3"   # ignorado por git: volumen y mallas de paciente
MEDIA = PW / "frontend" / "public" / "media" / "landing"
CASE3 = PW / "Archivos DICOM" / "DICOM" / "Case 3" / "Case 3" / "Unknown Study" / "XA"


def asegurar_work():
    """Crea la carpeta de trabajo (volumen y mallas de paciente, fuera de git).

    No se hace al importar: importar las rutas no debe crear carpetas. La llaman
    los scripts que escriben en ella."""
    WORK.mkdir(parents=True, exist_ok=True)
    return WORK
