import {MeshFixWorker,type ProgressEvent} from 'meshfix-wasm'

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
