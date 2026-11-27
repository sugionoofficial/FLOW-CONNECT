// Membuat src/renderer/icons.js dari paket lucide-react milik proyek web (jalankan dari root repo setelah npm ci).
import fs from 'node:fs'
import path from 'node:path'
const names = ['house','list-ordered','import','users','send','images','bot','download','settings','plus','trash-2','refresh-cw','folder-open','external-link','log-in','plug','unplug','image-plus','x','play','square','triangle-alert','check','circle-check','circle-x','loader-circle','clock','info','monitor','list-plus','rotate-ccw','eye','file-image','video','pencil','chevron-right','sparkles','shield-check','zap','circle-help','arrow-right','power','app-window','wand-sparkles','key-round','log-out','circle-arrow-down','cloud-off','badge-check','monitor-smartphone','copy','clapperboard','image','type','film','layers','ratio','folder-plus','scan-search','sliders-horizontal','eye-off','minimize-2','cpu','hash','timer','chevron-down','square-play','gem','maximize-2','keyboard','message-square-text','audio-lines','layout-grid','eraser','music','scaling','layout-panel-top','frame','audio-waveform','pen-tool','user-round-search','tv','grid-3x3','orbit','crop','grid-2x2','file-output','text-cursor-input','package','user-round','megaphone','shapes','smartphone','chart-pie','layout-template','mountain-snow','palette','image-up','id-card','shopping-bag','popcorn','book-open','camera','arrow-right-left','list-video','lightbulb','scan-eye','spell-check','upload','star','save','file-json','search','paintbrush','pipette','arrow-up','arrow-down','library','bookmark-plus','drama','sparkle']
const out = {}
for (const n of names) {
  let file = path.resolve(`node_modules/lucide-react/dist/esm/icons/${n}.mjs`)
  // alias: export { default } from './nama-lain.mjs'
  for (let m; (m = /export \{ default \} from '\.\/([a-z0-9-]+\.mjs)'/.exec(fs.readFileSync(file, 'utf8'))); ) file = path.join(path.dirname(file), m[1])
  const mod = await import(file)
  out[n] = mod.__iconData.node.map(([tag, attrs]) => '<' + tag + Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => ` ${k}="${v}"`).join('') + '/>').join('')
}
let js = '// Ikon garis (Lucide, lisensi ISC) — dibuat oleh desktop/scripts/icons.mjs\nexport const ICONS = {\n' +
  Object.entries(out).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n};\n'
js += "export function icon(name, cls = '') {\n  return '<svg class=\"ic ' + cls + '\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">' + (ICONS[name] || '') + '</svg>';\n}\n"
fs.writeFileSync('desktop/src/renderer/icons.js', js)
console.log('ikon:', Object.keys(out).length)
