# PROSPECTIVE Web

Planificación asistida por computador de cirugía de aneurismas cerebrales, en el navegador. Es el port web de la app de escritorio PROSPECTIVE: backend FastAPI (VTK, SimpleITK, pydicom) y frontend React/TypeScript con visores 3D y MPR en tiempo real.

- Todo el detalle (instalación, `start-all.bat`, `Makefile`, variables, modelo de datos, roles, auditoría, API y tests) está en `README.md`, que es extenso y está al día. Docs adicionales en `docs/`.
- Los archivos de usuarios (`user_files`) y los `.env` no van en git: respaldarlos antes de reinstalar si hay datos que importen.
- Reglas del espacio: español; no hacer commit ni push sin que Santiago lo pida; no tocar Linear sin preguntarle. Otras personas del equipo trabajan aquí activamente (tareas UNI-xx de Linear): hacer `git pull` antes de empezar.
