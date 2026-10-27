const fs = require('fs');
const path = require('path');
const puppeteer = require('/home/quangduc/.npm/_npx/07806fb36c73e358/node_modules/puppeteer');

const cachePath = path.join(process.env.HOME, '.cache', 'draw.io-export');
const cacheDict = {
  'https://www.draw.io/export3.html': 'export3.html',
  'https://app.diagrams.net/export3.html': 'export3.html',
  'https://www.draw.io/js/app.min.js': 'app.min.js',
  'https://app.diagrams.net/js/app.min.js': 'app.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.5/MathJax.js?config=TeX-MML-AM_HTMLorMML': 'MathJax.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.5/config/TeX-MML-AM_HTMLorMML.js?V=2.7.5': 'TeX-MML-AM_HTMLorMML.js',
  'https://cdn.mathjax.org/mathjax/contrib/a11y/accessibility-menu.js?V=2.7.5': 'accessibility-menu.js',
};

const PAGES_CONFIG = [
  { order: 1,  id: 'v1',                   type: 'architecture', basename: '01-c4-level-1',                   title: '01 C4 Level 1 - Reviewed' },
  { order: 2,  id: 'v18',                  type: 'architecture', basename: '02-c4-level-2',                   title: '02 C4 Level 2 - Fixed' },
  { order: 3,  id: 'v35',                  type: 'architecture', basename: '03-c4-level-3',                   title: '03 C4 Level 3 - Reviewed' },
  { order: 4,  id: '2',                    type: 'activities',   basename: '04-activity-wf01',                 title: '04 Activity WF-01 - School Administration & Robot Resource Allocation' },
  { order: 5,  id: '33',                   type: 'activities',   basename: '05-activity-wf02',                 title: '05 Activity WF-02 - Learning & Assignment Management' },
  { order: 6,  id: '62',                   type: 'activities',   basename: '06-activity-wf03',                 title: '06 Activity WF-03 - Robot Experiment Execution' },
  { order: 7,  id: '94',                   type: 'activities',   basename: '07-activity-wf04',                 title: '07 Activity WF-04 - AI/Data Integration & Teacher Review' },
  { order: 8,  id: '121',                  type: 'states',       basename: '08-state-experiment-session',      title: '08 State Machine - Experiment Session' },
  { order: 9,  id: '148',                  type: 'states',       basename: '09-state-robot-execution',         title: '09 State Machine - Robot Execution' },
  { order: 10, id: '176',                  type: 'states',       basename: '10-state-learning-submission',      title: '10 State Machine - Learning Submission' },
  { order: 11, id: '200',                  type: 'states',       basename: '11-state-classroom-assignment',    title: '11 State Machine - Classroom Assignment' },
  { order: 12, id: 'erd0',                 type: 'database',     basename: '12-conceptual-erd',                title: '12 Conceptual ERD' },
  { order: 13, id: 'erd1',                 type: 'database',     basename: '13-logical-school-access',         title: '13 Logical ERD — SCHOOL & ACCESS' },
  { order: 14, id: 'erd2',                 type: 'database',     basename: '14-logical-curriculum-assessment', title: '14 Logical ERD — CURRICULUM & ASSESSMENT' },
  { order: 15, id: 'erd3',                 type: 'database',     basename: '15-logical-robots-experiments',    title: '15 Logical ERD — ROBOTS & EXPERIMENTS' },
  { order: 16, id: 'erd4',                 type: 'database',     basename: '16a-logical-programs-assessment',  title: '16a Logical ERD — Programs & Assessment' },
  { order: 17, id: 'fCDUQ5n-0Wk9n6PrYOj1', type: 'database',     basename: '16b-logical-ai-datasets',          title: '16b Logical ERD — AI & Datasets' },
  { order: 18, id: 'erd5',                 type: 'database',     basename: '17-physical-identity-school',      title: '17 Physical ERD — IDENTITY & SCHOOL' },
  { order: 19, id: 'erd6',                 type: 'database',     basename: '18-physical-curriculum',           title: '18 Physical ERD — CURRICULUM' },
  { order: 20, id: 'erd7',                 type: 'database',     basename: '19-physical-programs-assessment',  title: '19 Physical ERD — PROGRAMS & ASSESSMENT' },
  { order: 21, id: 'erd8',                 type: 'database',     basename: '20-physical-robot-resources',      title: '20 Physical ERD — ROBOT RESOURCES' },
  { order: 22, id: 'erd9',                 type: 'database',     basename: '21-physical-experiment',          title: '21 Physical ERD — EXPERIMENT' },
  { order: 23, id: 'erd10',                type: 'database',     basename: '22-physical-ai-model-lifecycle',   title: '22 Physical ERD — AI & MODEL LIFECYCLE' }
];

async function exportAll() {
  const xmlContent = fs.readFileSync('docs/review-2/04-diagrams/diagramall.drawio.xml', 'utf8');

  // Split into diagram tags
  const diagramRegex = /<diagram[\s\S]*?<\/diagram>/g;
  const diagrams = [];
  let m;
  while ((m = diagramRegex.exec(xmlContent)) !== null) {
    diagrams.push(m[0]);
  }

  console.log(`Parsed ${diagrams.length} diagram tags from diagramall.drawio.xml.`);
  if (diagrams.length !== 23) {
    throw new Error(`Expected 23 diagrams, found ${diagrams.length}`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const t = cacheDict[req.url()];
      if (t && fs.existsSync(path.join(cachePath, t))) {
        req.respond({ status: 200, body: fs.readFileSync(path.join(cachePath, t)) });
      } else {
        req.continue();
      }
    });

    for (let i = 0; i < diagrams.length; i++) {
      const cfg = PAGES_CONFIG[i];
      const diagramTag = diagrams[i];
      const diagramXml = `<mxfile host="app.diagrams.net">${diagramTag}</mxfile>`;

      const outDir = path.join('docs/review-2/04-diagrams', cfg.type);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const pngPath = path.join(outDir, `${cfg.basename}.png`);
      const svgPath = path.join(outDir, `${cfg.basename}.svg`);

      console.log(`Rendering [${i + 1}/23] ${cfg.title} -> ${cfg.basename}...`);

      await page.goto('https://www.draw.io/export3.html', { waitUntil: 'networkidle0' });

      // Render for SVG
      await page.evaluate((obj) => render(obj), {
        xml: diagramXml,
        format: 'xml',
        w: 0,
        h: 0,
        border: 10,
        bg: 'none',
        scale: 1
      });
      await page.waitForSelector('#LoadingComplete');

      const svgContent = await page.evaluate(() => {
        const s = document.querySelector('svg');
        return s ? s.outerHTML : null;
      });

      if (svgContent) {
        fs.writeFileSync(svgPath, svgContent, 'utf8');
      }

      // Render for high-res PNG
      await page.goto('https://www.draw.io/export3.html', { waitUntil: 'networkidle0' });
      await page.evaluate((obj) => render(obj), {
        xml: diagramXml,
        format: 'png',
        w: 0,
        h: 0,
        border: 10,
        bg: '#ffffff',
        scale: 2
      });
      await page.waitForSelector('#LoadingComplete');

      const boundsJson = await page.$eval('#LoadingComplete', (div) => div.getAttribute('bounds'));
      const bounds = JSON.parse(boundsJson);
      const w = Math.ceil(bounds.width * 2) + 20;
      const h = Math.ceil(bounds.height * 2) + 20;

      await page.setViewport({ width: Math.max(w, 800), height: Math.max(h, 600) });
      await page.screenshot({
        type: 'png',
        fullPage: true,
        path: pngPath
      });

      console.log(`  ✓ Exported: ${pngPath} (${fs.statSync(pngPath).size} bytes) and ${svgPath} (${fs.existsSync(svgPath) ? fs.statSync(svgPath).size : 0} bytes)`);
    }

    console.log('\nAll 23 Draw.io pages directly exported successfully!');
  } finally {
    await browser.close();
  }
}

exportAll().catch((err) => {
  console.error('Fatal export error:', err);
  process.exit(1);
});
