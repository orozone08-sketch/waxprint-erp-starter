import {MeshFixWorker,type ProgressEvent} from 'meshfix-wasm'
import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'

export type StlRepairReport={
 inputTriangles:number
 outputTriangles:number
 removedDegenerate:number
 removedDuplicate:number
 flippedTriangles:number
 filledHoles:number
 unfilledBoundaries:number
 nonManifoldEdges:number
 nonManifoldVertices:number
 watertight:boolean
 warnings:string[]
}

export type StlRepairResult={data:ArrayBuffer;report:StlRepairReport}
export type StlRepairProgress=(event:ProgressEvent)=>void

/** Convert a self-contained binary GLB scene to STL while applying node transforms. */
export async function glbToStl(buffer:ArrayBuffer):Promise<ArrayBuffer>{
 const gltf=await new GLTFLoader().parseAsync(buffer,'')
 gltf.scene.updateMatrixWorld(true)
 const meshes:Array<{positions:Float32Array;indices:Uint32Array}> = []
 let triangleCount=0
 gltf.scene.traverse(object=>{
  const mesh=object as THREE.Mesh
  if(!mesh.isMesh||!mesh.geometry?.getAttribute('position'))return
  const position=mesh.geometry.getAttribute('position')
  const index=mesh.geometry.index
  const start=mesh.geometry.drawRange.start||0
  const end=Math.min(index?.count??position.count,Number.isFinite(mesh.geometry.drawRange.count)?start+mesh.geometry.drawRange.count:(index?.count??position.count))
  const sourceIndices=index?index.array:null
  const indices=new Uint32Array(Math.floor((end-start)/3)*3)
  for(let i=0;i<indices.length;i++)indices[i]=sourceIndices?sourceIndices[start+i]:start+i
  const positions=new Float32Array(position.count*3)
  for(let i=0;i<position.count;i++){
   const point=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).multiplyScalar(1000)
   positions.set([point.x,point.y,point.z],i*3)
  }
  triangleCount+=indices.length/3
  meshes.push({positions,indices})
 })
 if(!triangleCount)throw new Error('The GLB contains no triangle mesh to repair.')
 if(triangleCount>1_500_000)throw new Error('This GLB has more than 1.5 million triangles. Simplify it or repair it in desktop mesh software.')
 const output=new ArrayBuffer(84+triangleCount*50),view=new DataView(output)
 view.setUint32(80,triangleCount,true)
 let offset=84
 for(const mesh of meshes)for(let i=0;i<mesh.indices.length;i+=3){
  const points=[0,1,2].map(k=>{
   const id=mesh.indices[i+k]*3
   return new THREE.Vector3(mesh.positions[id],mesh.positions[id+1],mesh.positions[id+2])
  })
  const a=points[0],b=points[1],c=points[2]
  const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize()
  for(const value of [normal.x,normal.y,normal.z,a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z]){view.setFloat32(offset,value,true);offset+=4}
  view.setUint16(offset,0,true);offset+=2
 }
 return output
}

/**
 * Run the repair pipeline in a Web Worker. MeshFix uses PMP's half-edge mesh
 * algorithms for vertex welding/splitting, hole filling, degenerate cleanup,
 * and normal repair. The original upload is never modified.
 */
export async function repairStl(buffer:ArrayBuffer,onProgress?:StlRepairProgress):Promise<StlRepairResult>{
 const mesh=await MeshFixWorker.init({
  workerUrl:'/meshfix/worker.js',
  coreUrl:'/meshfix/meshfix-core.js',
  wasmUrl:'/meshfix/meshfix-core.wasm',
 })
 try{
  const input=buffer.slice(0)
  const before=(await mesh.analyzeDetailed(input)).analysis
  const repair=await mesh.repair({maxHoleEdges:256},onProgress)
  const {analysis:after}=await mesh.reanalyze()
  const data=await mesh.exportMesh('stl')
  const connectivityRebuilds=await mesh.connectivityRebuilds()
  const facesDroppedByAudit=await mesh.facesDroppedByAudit()
  const warnings:string[]=[]
  if(repair.weld.verticesMerged)warnings.push(`${repair.weld.verticesMerged.toLocaleString()} close vertex pair(s) welded.`)
  if(repair.splitVertices.nonManifoldVerticesFound)warnings.push(`${repair.splitVertices.nonManifoldVerticesFound.toLocaleString()} non-manifold vertex/vertices split.`)
  if(repair.removeDegenerates.degenerateRemoved)warnings.push(`${repair.removeDegenerates.degenerateRemoved.toLocaleString()} degenerate triangle(s) removed.`)
  if(repair.removeDegenerates.duplicateRemoved)warnings.push(`${repair.removeDegenerates.duplicateRemoved.toLocaleString()} duplicate triangle(s) removed.`)
  if(repair.fillHoles.holesFilled)warnings.push(`${repair.fillHoles.holesFilled.toLocaleString()} boundary hole(s) filled.`)
  if(repair.fillHoles.holesSkippedAsFeature)warnings.push(`${repair.fillHoles.holesSkippedAsFeature.toLocaleString()} opening(s) were preserved because they may be intentional design features.`)
  if(repair.fillHoles.holesSkipped)warnings.push(`${repair.fillHoles.holesSkipped.toLocaleString()} hole(s) exceeded the automatic fill size limit.`)
  if(repair.fixNormals.componentsFlipped)warnings.push(`${repair.fixNormals.componentsFlipped.toLocaleString()} inside-out component(s) reoriented.`)
  if(connectivityRebuilds)warnings.push(`The repair engine rebuilt invalid connectivity ${connectivityRebuilds} time(s); ${facesDroppedByAudit.toLocaleString()} triangle(s) were discarded during recovery.`)
  const watertight=after.isWatertight&&after.isManifold
  if(!watertight)warnings.push('Open boundaries or non-manifold geometry remain. Do not use this candidate for production; use Magics or have an operator repair it manually.')
  if(!after.isTriangleMesh)warnings.push('The output did not pass the triangle-mesh check.')
  if(after.skippedFaces)warnings.push(`${after.skippedFaces.toLocaleString()} invalid face(s) were skipped by the repair engine.`)
  return {data,report:{
   inputTriangles:before.faceCount,
   outputTriangles:after.faceCount,
   removedDegenerate:repair.removeDegenerates.degenerateRemoved,
   removedDuplicate:repair.removeDegenerates.duplicateRemoved,
   flippedTriangles:repair.fixNormals.facesFlipped,
   filledHoles:repair.fillHoles.holesFilled,
   unfilledBoundaries:after.boundaryLoops,
   nonManifoldEdges:after.nonManifoldEdgeCount,
   nonManifoldVertices:after.nonManifoldVertexCount,
   watertight,
   warnings,
  }}
 }finally{mesh.dispose()}
}
