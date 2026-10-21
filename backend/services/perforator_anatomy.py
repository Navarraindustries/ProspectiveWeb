# -*- coding: utf-8 -*-
"""Qué perforantes cabe esperar según dónde esté el aneurisma.

Por qué esto es una tabla y no una medida
-----------------------------------------
Una arteria perforante mide 0,1–0,5 mm de diámetro. Medido sobre los estudios de
este proyecto, el vóxel típico de la angio-TC es 0,96 × 0,96 × 0,80 mm y el mejor
0,50 × 0,50 × 0,67. Una perforante de 0,3 mm ocupa el 8 % de un vóxel del primero
y el 28 % del segundo; con lumen a ~350 HU sobre un parénquima de ~40, el vóxel
se lee a 64 y 128 HU respectivamente. No hay umbral que separe eso del ruido sin
meter medio cerebro en la malla.

Es decir: **no es un límite del software**. El dato no está en el vóxel, y ningún
algoritmo lo reconstruye. `branch_origins.py` encuentra los orígenes de rama que
sí se ven —con su calibre y su suelo declarado— y ahí se acaba lo que la imagen
permite afirmar de ESTE paciente.

Lo que un cirujano usa entonces son dos cosas, y ninguna es la imagen: el
microscopio en el acto, y saber dónde nacen. Esta tabla es lo segundo.

Qué es y qué no es
------------------
- **No es una medida de este paciente.** No mira su malla ni su angiografía.
- **No es una lista de lo que hay**, sino de lo que la anatomía hace esperar en
  esa localización, y de lo que cuesta lesionarlo.
- Las variantes anatómicas son frecuentes; una perforante puede nacer donde la
  tabla no la pone, y faltar donde sí.

Sirve para una cosa concreta: que un informe de una punta de basilar no salga con
una lista de ramas vacía y sin más, cuando lo que ahí hay que buscar son
talamoperforantes que la imagen no resuelve.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from dataclasses import replace

from services.treatment import (LOCATION_ACA_ACOA, LOCATION_AICA,
                                LOCATION_BASILAR_LEGACY, LOCATION_BASILAR_TIP,
                                LOCATION_BASILAR_TRUNK, LOCATION_ICA_DIST,
                                LOCATION_ICA_PROX, LOCATION_MCA, LOCATION_PCOM,
                                LOCATION_PICA)


@dataclass(frozen=True)
class PerforatorTerritory:
    """Lo que cabe esperar en una localización, y con qué respaldo se dice."""

    arteries: str            # qué nace ahí
    supplies: str            # qué irriga
    consequence: str         # cómo se manifiesta lesionarlo
    surgical_note: str       # qué vigilar al cerrar
    sources: list[str] = field(default_factory=list)
    #: Lo que hay que leer antes de la tarjeta. Solo lo lleva la localización
    #: basilar antigua: no dice si es punta o tronco, y la tarjeta cambia.
    notice: str = ""


_SRC_MCA = "Estudios de clipaje perforator-sparing en M1 (PMC12610303)"
_SRC_ACOA = ("Infarto de la recurrente de Heubner tras clipaje de ACoA "
             "(Egypt J Neurosurg 2023; PMC6196132)")
_SRC_PCOM = ("Revisión de aneurismas de ACoP en la era moderna "
             "(Surgical Neurology International)")
_SRC_BASILAR = ("Clipaje de la punta de basilar: talamoperforantes posteriores "
                "(Acta Neurochir 2025; PMC12500782)")
# F1-181: el tronco y la AICA tenían la tarjeta de la punta. Citas dadas por el
# encargo; no se añaden otras.
_SRC_BASILAR_TRUNK = ("Marinković SV, Gibo H. The surgical anatomy of the "
                      "perforating branches of the basilar artery. "
                      "Neurosurgery 1993;33(1):80-87")
_SRC_AICA = ("Rhoton AL Jr. The cerebellar arteries. "
             "Neurosurgery 2000;47(3 Suppl):S29-68")
_SRC_PICA = ("Aneurismas de PICA rotos: segmentos p1–p2 y perforantes bulbares "
             "(PMC12346941)")


#: La tabla. Escrita por localización porque es lo único que se sabe sin ver al
#: paciente, y explícitamente no derivada de su imagen.
TERRITORIES: dict[str, PerforatorTerritory] = {
    LOCATION_MCA: PerforatorTerritory(
        arteries="Lenticuloestriadas laterales, desde M1",
        supplies="Ganglios basales y cápsula interna",
        consequence="Hemiparesia contralateral",
        surgical_note=(
            "El error característico descrito en M1 dorsal es atrapar una "
            "perforante al tratar un segmento fusiforme como si fuera un cuello "
            "sacular. Separar y conservar las lenticuloestriadas antes de cerrar."
        ),
        sources=[_SRC_MCA],
    ),
    LOCATION_ACA_ACOA: PerforatorTerritory(
        arteries=(
            "Recurrente de Heubner y perforantes de A1; arteria hipotalámica en "
            "la unión A1–A2, que no está en todos los casos"
        ),
        supplies="Ganglios basales, brazo anterior de la cápsula interna, hipotálamo",
        consequence="Hemiparesia de predominio braquiofacial; alteraciones hipotalámicas",
        surgical_note=(
            "La oclusión puede ser indirecta: manipulación, compresión o "
            "estiramiento, y el clipaje temporal de A1 basta para infartar la "
            "recurrente. Comprobar la integridad de las perforantes AL TERMINAR "
            "de clipar, no solo antes."
        ),
        sources=[_SRC_ACOA],
    ),
    LOCATION_ICA_DIST: PerforatorTerritory(
        arteries="Coroidea anterior, y las perforantes del segmento comunicante",
        supplies="Brazo posterior de la cápsula interna, tracto óptico, tálamo ventral",
        consequence="Síndrome de la coroidea anterior: hemiplejía, hemianopsia, hemihipoestesia",
        surgical_note=(
            "Conservar la coroidea anterior sin manipular el fondo del saco."
        ),
        sources=[_SRC_PCOM],
    ),
    LOCATION_PCOM: PerforatorTerritory(
        arteries=(
            "Hasta catorce perforantes nacen de la ACoP y del corto segmento de "
            "ACI entre ella y la coroidea anterior"
        ),
        supplies="Nervio oculomotor, pedúnculos cerebrales, tálamo ventral, núcleo caudado",
        consequence="Paresia del III par; infarto talámico o peduncular",
        surgical_note=(
            "Conservar la ACoP, sus perforantes y la coroidea anterior sin "
            "manipulación significativa del fondo."
        ),
        sources=[_SRC_PCOM],
    ),
    LOCATION_BASILAR_TIP: PerforatorTerritory(
        arteries=(
            "Talamoperforantes posteriores. Nacen de los segmentos P1 a entre "
            "0,4 y 4,7 mm del ápex, y pueden nacer DIRECTAMENTE del ápex"
        ),
        supplies="Tálamo y mesencéfalo",
        consequence="Infarto talámico, coma, muerte",
        surgical_note=(
            "Es la localización donde una perforante no vista cuesta más caro, y "
            "donde la imagen menos ayuda. Que puedan nacer del propio ápex es lo "
            "que convierte el margen de la mordaza en el detalle decisivo."
        ),
        sources=[_SRC_BASILAR],
    ),
    LOCATION_BASILAR_TRUNK: PerforatorTerritory(
        arteries=(
            "Perforantes pontinas paramedianas y circunferenciales cortas, desde "
            "la cara posterior y lateral del tronco"
        ),
        supplies="Protuberancia (base y tegmento)",
        consequence=(
            "Infarto pontino: paresia bilateral, afectación de pares craneales, "
            "locked-in en los extensos"
        ),
        surgical_note=(
            "Nacen de la pared posterior, la que no se ve desde el abordaje. Una "
            "pala del clip paralela al tronco puede cerrarlas sin que se note: "
            "comprobar que la pala posterior no las ocluye antes de soltar."
        ),
        sources=[_SRC_BASILAR_TRUNK],
    ),
    LOCATION_AICA: PerforatorTerritory(
        arteries=(
            "Perforantes pontinas laterales y arteria laberíntica (rama de la "
            "AICA en la mayoría)"
        ),
        supplies="Protuberancia lateral, pedúnculo cerebeloso medio, oído interno",
        consequence="Hipoacusia, parálisis facial periférica, ataxia ipsilateral",
        surgical_note=(
            "La arteria laberíntica es terminal: ocluirla cuesta el oído de ese "
            "lado. Conservar la AICA y sus ramas proximales."
        ),
        sources=[_SRC_AICA],
    ),
    LOCATION_PICA: PerforatorTerritory(
        arteries="Perforantes bulbares de los segmentos proximales p1 y p2 de la PICA",
        supplies="Bulbo raquídeo",
        consequence="Síndrome bulbar lateral; complicación isquémica grave",
        surgical_note=(
            "Sacrificar las perforantes de la porción proximal se describe como "
            "causa de isquemia grave: el origen de la PICA es lo que hay que "
            "respetar."
        ),
        sources=[_SRC_PICA],
    ),
    LOCATION_ICA_PROX: PerforatorTerritory(
        arteries=(
            "Sin perforantes cerebrales terminales: el segmento cavernoso da el "
            "tronco meningohipofisario y el inferolateral, que no irrigan parénquima"
        ),
        supplies="Duramadre, hipófisis, pares craneales del seno cavernoso",
        consequence="No el infarto parenquimatoso típico de una perforante",
        surgical_note=(
            "Es la localización donde este aviso NO aplica, y decirlo también "
            "vale: un silencio aquí significa algo distinto que en la basilar."
        ),
        sources=[],
    ),
}


#: Aviso de la localización basilar antigua (F1-174/181).
LEGACY_NOTICE = "Localización sin precisar: elige punta o tronco para la tarjeta exacta"


def expected_perforators(location: str) -> PerforatorTerritory | None:
    """Lo que cabe esperar en esa localización, o None si no se sabe cuál es.

    Sin localización no hay tabla: inventar un territorio «por defecto» sería
    exactamente el tipo de relleno que esta aplicación lleva rato quitando.
    """
    loc = (location or "").strip()
    if loc == LOCATION_BASILAR_LEGACY:
        # Una sesión guardada antes de separar la lista. Se enseña la de la
        # punta, que es la que salía, pero diciendo que no es seguro: Case 3 es
        # de tronco y nadie lo ha vuelto a elegir, así que no se adivina.
        return replace(TERRITORIES[LOCATION_BASILAR_TIP], notice=LEGACY_NOTICE)
    return TERRITORIES.get(loc)


def territory_to_dict(t: PerforatorTerritory) -> dict:
    return {
        "arteries": t.arteries,
        "supplies": t.supplies,
        "consequence": t.consequence,
        "surgical_note": t.surgical_note,
        "sources": list(t.sources),
        "notice": t.notice,
    }
