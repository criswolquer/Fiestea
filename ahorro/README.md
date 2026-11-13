# Ahorro (nombre provisional)

Web para el móvil de finanzas personales: apuntas gastos con foto, ves el mes en una pantalla,
pones límites, repartes el mes, ahorras en huchas y al final del mes lo repasas como historias.
Todo se guarda en el propio dispositivo (IndexedDB). No hay servidor ni cuentas.

## Abrirla en tu ordenador

Necesitas [Node.js](https://nodejs.org) 20 o más reciente.

```bash
cd ahorro
npm install
npm run dev
```

Abre la dirección que sale en la terminal (normalmente http://localhost:5173).
Para verla en el móvil, conecta el móvil a la misma wifi y abre la dirección «Network» que muestra la terminal.

- `#/design` enseña el sistema de diseño.
- En la bienvenida, «Probar con datos de ejemplo» carga tres meses inventados. Se borran en Ajustes → Borrar todos mis datos.
- El asistente necesita tu propia clave de la API de Claude (Ajustes). Sin ella, todo lo demás funciona.

Versión final (como en el móvil, con modo sin conexión):

```bash
npm run build
npm run preview
```
