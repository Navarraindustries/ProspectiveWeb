# Migraciones de la base de datos

El esquema se versiona con Alembic desde la revisión `0001_baseline`. Al
arrancar, `init_db()`:

1. crea las tablas que falten (`create_all`);
2. pasa las migraciones antiguas escritas a mano (`_migrate_*`), que llevan
   una base anterior hasta la línea base. **No se añaden más ahí**;
3. en una base recién creada, la marca con la última revisión (ya nace con el
   esquema actual); en una que ya existía, aplica las revisiones pendientes.

## Añadir un cambio

Una **tabla nueva** no necesita revisión: la crea `create_all`.

Para **cambiar una tabla que ya existe** (columna nueva, índice, datos):

```
cd backend
.venv/Scripts/python -m services.database revision "añade tal columna"
```

Eso escribe un fichero en `versions/` comparando los modelos con tu base.
Revísalo siempre antes de subirlo: en SQLite los cambios van dentro de
`op.batch_alter_table`, que copia la tabla.

Como una base nueva nace ya con la columna, la revisión solo corre en las que
existían antes; no hace falta que compruebe si la columna está.
