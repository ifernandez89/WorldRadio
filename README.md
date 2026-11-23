# WorldRadio — Sintonizador Mundial

Aplicación web progresiva (PWA) para explorar y escuchar en vivo más de **50.000 emisoras de radio de todo el mundo** desde cualquier celular o PC, sin depender de servidores locales.

## Funcionalidades
- **Directorio mundial en vivo** vía [Radio Browser API](https://www.radio-browser.info/) con failover automático entre servidores.
- **Filtro por país** (accesos rápidos a Argentina, Alemania, Reino Unido, Japón, Jamaica, EE. UU., Francia, España, Brasil y directorio buscable de +220 países).
- **Banda de géneros**: Techno, House, Reggae, Rock 80s, Jazz, Lo-Fi, Noticias, Electrónica, Rock, Drum & Bass, Ambient, Clásica, Metal y búsqueda libre por nombre.
- **Reproductor MP3 / AAC / HLS (`.m3u8`)** con `hls.js`, filtro HTTPS inteligente para navegadores móviles, controles en pantalla de bloqueo (`MediaSession API`) y **temporizador Sleep** (15 / 30 / 60 min).
- **Favoritas guardadas localmente** (`localStorage`) con exportación e importación en JSON + historial de recientes + botón **Al azar**.

## Desarrollo y despliegue
```bash
npm install
npm run dev
npm run build
```

El despliegue a GitHub Pages se ejecuta automáticamente en cada push a `main` mediante `.github/workflows/deploy.yml`.
