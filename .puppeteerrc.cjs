const { join } = require('node:path')

/**
 * Dónde guarda puppeteer el Chrome que se descarga.
 *
 * Por defecto va a `~/.cache/puppeteer`, FUERA del proyecto. En Vercel eso
 * significa que se pierde: lo que se cachea entre builds es node_modules (y el
 * `postinstall` de puppeteer ya no se re-ejecuta con la caché caliente), así que
 * el navegador desaparecía y snap.mjs abortaba con "Could not find Chrome" —
 * por eso la captura de DOM nunca llegó a correr en producción, aunque
 * `onlyBuiltDependencies` ya permitiera el script de puppeteer.
 *
 * Metiéndolo en node_modules/.cache viaja con la caché de build y se descarga
 * una vez, no en cada deploy.
 */
module.exports = {
  cacheDirectory: join(__dirname, 'node_modules', '.cache', 'puppeteer'),
}
