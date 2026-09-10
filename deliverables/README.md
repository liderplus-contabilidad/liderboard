# Entregables

Documentos destinados al **cliente**, no al desarrollo interno. Cada archivo de esta carpeta se
entrega tal cual: se abre en el navegador sin servidor, sin dependencias y sin conexión.

| Documento                                            | Contenido                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`manual-usuario.html`](./manual-usuario.html)       | Guía por tarea para quien usa el sistema, con capturas de cada pantalla.                     |
| [`manual-tecnico.html`](./manual-tecnico.html)       | Arquitectura, tecnologías, diagramas ER de las cinco bases IndexedDB y diccionario de datos. |
| [`manual-despliegue.html`](./manual-despliegue.html) | Instalación local, publicación en Vercel y la operativa de datos en el navegador.            |
| [`documento-entrega.html`](./documento-entrega.html) | Cierre del proyecto: qué se entrega, cómo se verificó, qué queda fuera y quién lo construyó. |

No aplica un manual de API: la aplicación no expone ni consume ninguna — sin backend, sin
peticiones de red y sin variables de entorno. Se evaluó y se descartó, no se omitió.

Tampoco aplica un manual de administrador: no hay autenticación, ni roles, ni permisos, ni servidor
o base de datos que administrar. Todas las personas que abren la aplicación tienen las mismas
capacidades, y lo que un documento así contendría —despliegue, respaldo, alta de clientes— ya vive
en los tres manuales. También se evaluó y se descartó.

Las capturas del manual de usuario se tomaron con los **datos de demostración** que genera
`pnpm gen:testdata`, cargados sobre un origen limpio —la app servida en otro puerto— y nunca sobre
la base de trabajo del navegador.

Las de **Pérdidas y Ganancias**, **Ventas por servicio** y **Reportería de ingresos** se rehicieron
el 8 sep 2026 y están al día. Las de **Ocupaciones** y **Rol de Pagos** son de una sesión anterior:
su contenido no ha cambiado, pero el menú lateral que sale al fondo todavía no muestra los subitems
de Pérdidas y Ganancias. Rehacerlas pide datos de demostración de esos dos módulos, que
`gen:testdata` no produce.

**El set de demostración no es anónimo entero, y eso decide con qué rubro se captura.** Las cifras
de 2026 del rubro clínica son **reales**, transcritas del estado de resultados de un cliente — lo
declara el docstring de `scripts/test-data/clinica-2026.mts`. Por eso las capturas se toman con el
rubro **hotelería**, cuyas cifras salen de un PRNG sembrado, y las de Ventas por servicio con los
años **2024 y 2025** de la clínica, que también son sintéticos. Los planes de cuentas y las razones
sociales son inventados o plantillas del sistema contable, no datos de nadie. Al rehacer una captura
hay que mantener ese criterio.

## Cómo abrirlo

Doble clic sobre el archivo, o `xdg-open deliverables/manual-tecnico.html`. Es un HTML autocontenido:
los estilos y los diagramas van dentro del propio archivo, y la única petición externa es la
tipografía IBM Plex desde Google Fonts (sin ella cae a la tipografía del sistema y se lee igual).
Para enviarlo como PDF, imprimir desde el navegador con «Guardar como PDF».

Los cuatro están escritos en UTF-8, pero solo `manual-usuario.html` lo **declara**, con un
`<meta charset="utf-8" />` en su primera línea. Los otros tres dependen de que el navegador lo
adivine, y donde no lo adivina —servido por HTTP sin cabecera de charset, por ejemplo— las tildes
salen rotas: «CÃ³mo» en vez de «Cómo». Es una línea al principio del archivo, y conviene añadírsela
a los tres cuando se toquen.

## Al imprimir el documento de entrega

Es el único pensado para IMPRIMIRSE: lleva estilos de impresión propios, un aviso en pantalla —que no
sale impreso— con los campos que quedan por completar, y los anexos abren página.

## Al actualizar

Estos documentos describen el estado del sistema en una fecha, que va declarada en su cabecera.
Al modificarlos hay que actualizar esa fecha; lo interno —notas de trabajo, fórmulas, especificaciones—
vive en `docs/` y en `openspec/`, no aquí.
