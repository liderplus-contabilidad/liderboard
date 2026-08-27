# Entregables

Documentos destinados al **cliente**, no al desarrollo interno. Cada archivo de esta carpeta se
entrega tal cual: se abre en el navegador sin servidor, sin dependencias y sin conexión.

| Documento                                            | Contenido                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`manual-usuario.html`](./manual-usuario.html)       | Guía por tarea para quien usa el sistema, con capturas de cada pantalla.                      |
| [`manual-tecnico.html`](./manual-tecnico.html)       | Arquitectura, tecnologías, diagramas ER de las cuatro bases IndexedDB y diccionario de datos. |
| [`manual-despliegue.html`](./manual-despliegue.html) | Instalación local, publicación en Vercel y la operativa de datos en el navegador.             |
| [`documento-entrega.html`](./documento-entrega.html) | Cierre del proyecto: qué se entrega, cómo se verificó, qué queda fuera y quién lo construyó.  |

No aplica un manual de API: la aplicación no expone ni consume ninguna — sin backend, sin
peticiones de red y sin variables de entorno. Se evaluó y se descartó, no se omitió.

Tampoco aplica un manual de administrador: no hay autenticación, ni roles, ni permisos, ni servidor
o base de datos que administrar. Todas las personas que abren la aplicación tienen las mismas
capacidades, y lo que un documento así contendría —despliegue, respaldo, alta de clientes— ya vive
en los tres manuales. También se evaluó y se descartó.

Las capturas del manual de usuario se tomaron con **datos de demostración** generados
(`pnpm gen:testdata`), no con información de clientes, así que el documento puede circular.

Las de **Pérdidas y Ganancias** y **Ventas por servicio** están al día. Las de **Ocupaciones** y
**Rol de Pagos** son de una sesión anterior: su contenido no ha cambiado, pero el menú lateral que
sale al fondo todavía no muestra el subitem _Ventas por servicio_. Rehacerlas pide datos de
demostración de esos dos módulos, que `gen:testdata` no produce.

## Cómo abrirlo

Doble clic sobre el archivo, o `xdg-open deliverables/manual-tecnico.html`. Es un HTML autocontenido:
los estilos y los diagramas van dentro del propio archivo, y la única petición externa es la
tipografía IBM Plex desde Google Fonts (sin ella cae a la tipografía del sistema y se lee igual).
Para enviarlo como PDF, imprimir desde el navegador con «Guardar como PDF».

## Al imprimir el documento de entrega

Es el único pensado para IMPRIMIRSE: lleva estilos de impresión propios, un aviso en pantalla —que no
sale impreso— con los campos que quedan por completar, y los anexos abren página.

## Al actualizar

Estos documentos describen el estado del sistema en una fecha, que va declarada en su cabecera.
Al modificarlos hay que actualizar esa fecha; lo interno —notas de trabajo, fórmulas, especificaciones—
vive en `docs/` y en `openspec/`, no aquí.
