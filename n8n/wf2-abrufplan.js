/**
 * Inhalt fuer den n8n-Code-Node "Abrufplan" in Workflow 2 (Kinoprogramm).
 * Node-Modus: Run Once for All Items.
 *
 * Erzeugt 21 Tage x 4 Orte = 84 Abrufe. Die Ortsliste und ihre Reihenfolge
 * stehen in data/kinos.json; aendert sie sich dort, hier nachziehen.
 *
 * Die Zone steht ausdruecklich im Code: "heute" ist der Tag, an dem die Kinos
 * stehen — nicht der Tag am Ort des Servers.
 */

const ORTE = ['Stuttgart', 'Ludwigsburg', 'Esslingen', 'Leonberg'];
const TAGE = 21;

const heute = DateTime.now().setZone('Europe/Berlin').startOf('day');
const out = [];

for (let i = 0; i < TAGE; i++) {
  const tag  = heute.plus({ days: i });
  const slug = tag.toFormat('dd-MM-yyyy');   // kino-zeit: TT-MM-JJJJ
  for (const ort of ORTE) {
    out.push({ json: {
      ort,
      slug,
      datum: tag.toFormat('yyyy-MM-dd'),
      url: `https://www.kino-zeit.de/kinoprogramm/ort/${ort}/tag/${slug}`
    }});
  }
}

return out;
