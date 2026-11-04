import {copyFileSync, mkdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, resolve} from 'node:path'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=resolve(root,'node_modules/meshfix-wasm/dist')
const destination=resolve(root,'public/meshfix')
mkdirSync(destination,{recursive:true})
for(const file of ['worker.js','meshfix-core.js','meshfix-core.wasm']){
 copyFileSync(resolve(source,file),resolve(destination,file))
}
console.log('Copied mesh repair WebAssembly assets to frontend/public/meshfix.')
