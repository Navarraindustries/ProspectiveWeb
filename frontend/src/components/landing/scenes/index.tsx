/* Punto de entrada único de las escenas 3D de la landing.

   Todo Three.js —la librería y las siete escenas— cuelga de este módulo, que
   `Landing.tsx` carga en diferido. Así queda en UN chunk aparte: el titular y el
   botón pintan con el bundle principal, /app no paga por three, y no hay siete
   puntos de carga distintos repartidos por la página.

   Cada escena se exporta ya envuelta en [[LandingScene]], que la monta al entrar
   en pantalla y la desmonta al salir. */

import { LandingScene } from "../LandingScene";
import { vascularTreeScene } from "./vascularTree";
import { voxelCloudScene } from "./voxelCloud";
import { morphometryScene } from "./morphometry";
import { clipKinematicsScene } from "./clipKinematics";
import { endovascularScene } from "./endovascular";
import { skullCloudScene } from "./skullCloud";
import { mixedRealityScene } from "./mixedReality";
import { dataVaultScene } from "./dataVault";
import { perforatorsScene } from "./perforators";
import { stlPrintingScene } from "./stlPrinting";

type Props = { className?: string; style?: React.CSSProperties };

/* OJO con la altura de cámara: `sceneHost` no llama a `lookAt`, así que la cámara
   mira siempre recto por el eje -Z. Subirla NO inclina la vista hacia el sujeto,
   lo desplaza hacia abajo en el encuadre. La morfometría venía de Stitch con
   y=1.5 y el aneurisma acababa pegado al borde inferior del panel; va a y=0.

   El pie de figura ocupa una banda de unos 34 px abajo, así que centrar el sujeto
   en el panel COMPLETO lo deja bajo respecto al área que queda libre. Una cámara
   ligeramente negativa lo sube esa media banda: medido sobre el render real, la
   mediana vertical de los píxeles brillantes pasa de 166 a ~151 en un panel de
   340, que es el centro óptico una vez descontado el pie.

   Encuadres. Stitch compuso cada escena para un lienzo cuadrado de 512×512; los
   paneles de sección son apaisados (unos 1320×340), y con la cámara original el
   sujeto quedaba diminuto y perdido en el centro. Las cámaras se acercan para
   que llene el alto del panel: recorta algo por los lados, que es justo donde
   estas escenas no tienen nada. El hero mantiene el suyo, ya ajustado. */

export const VascularTree = (p: Props) => (
  <LandingScene factory={vascularTreeScene} fov={50} cameraPosition={[0, 0, 13]} {...p} />
);

export const VoxelCloud = (p: Props) => (
  <LandingScene factory={voxelCloudScene} fov={45} cameraPosition={[0, 0, 6.3]} {...p} />
);

export const Morphometry = (p: Props) => (
  <LandingScene factory={morphometryScene} fov={45} cameraPosition={[0, -0.3, 6.6]} {...p} />
);

export const ClipKinematics = (p: Props) => (
  <LandingScene factory={clipKinematicsScene} fov={45} cameraPosition={[0, 0, 6.2]} {...p} />
);

export const Endovascular = (p: Props) => (
  <LandingScene factory={endovascularScene} fov={45} cameraPosition={[0, 0, 6.0]} {...p} />
);

export const SkullCloud = (p: Props) => (
  <LandingScene factory={skullCloudScene} fov={45} cameraPosition={[0, 0, 5.6]} {...p} />
);

export const MixedReality = (p: Props) => (
  <LandingScene factory={mixedRealityScene} fov={45} cameraPosition={[0, 0, 6.0]} {...p} />
);

export const DataVault = (p: Props) => (
  <LandingScene factory={dataVaultScene} fov={45} cameraPosition={[0, -0.3, 8.0]} {...p} />
);

export const Perforators = (p: Props) => (
  <LandingScene factory={perforatorsScene} fov={45} cameraPosition={[0, 0.8, 6.0]} {...p} />
);

export const StlPrinting = (p: Props) => (
  <LandingScene factory={stlPrintingScene} fov={45} cameraPosition={[0, 0.2, 6.4]} {...p} />
);
