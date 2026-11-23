# Plantillas Word IDC

Las plantillas oficiales son `F-02_carta_poder.docx`, `F-03_carta_poder_uiie.docx`,
`F-04_ficha.docx` y `F-06_caratula.docx`. Usan marcas `{{campo}}`; F-06
usa el loop `{{#requisitos}}...{{/requisitos}}`.

Solo se aceptan DOCX (ZIP Office Open XML), sin `vbaProject.bin`, sin macros ni
marcas partidas entre nodos, y de hasta 5 MB. Los campos permitidos son folio,
fecha, cliente, apoderado, RPU, tarifa, tensión, responsables, enlace CFE,
trámite y requisitos. Los campos ausentes se imprimen como `______` y se
devuelven en la lista de faltantes. Cada versión conserva número, hash SHA-256
y puede descargarse desde la sección Plantillas Word del Gestor IDC.
