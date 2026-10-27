import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js'

export type StlRepairReport={
 inputTriangles:number
 outputTriangles:number
 removedDegenerate:number
 removedDuplicate:number
 flippedTriangles:number
 filledHoles:number
 unfilledBoundaries:number
 nonManifoldEdges:number
 watertight:boolean
 warnings:string[]
}

type Face={v:[number,number,number];flip?:boolean;component?:number}
type Edge={a:number;b:number;face:number;direction:number}

/** Conservative client-side STL cleanup. It removes degenerate/duplicate faces,
 * makes neighboring face winding consistent, orients closed components out,
 * and caps only small, planar, convex boundary loops. */
export function repairStl(buffer:ArrayBuffer):{data:ArrayBuffer;report:StlRepairReport}{
 const geometry=new STLLoader().parse(buffer)
 try{
  const attr=geometry.getAttribute('position')
  if(!attr||attr.count<3||attr.count%3)throw new Error('This STL has no usable triangle data.')
  const coords:number[][]=[]
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity
  for(let i=0;i<attr.count;i++){
   const p=[attr.getX(i),attr.getY(i),attr.getZ(i)]
   if(!p.every(Number.isFinite))throw new Error('The STL contains invalid coordinates. Repair it manually before using it for production.')
   coords.push(p)
   minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);minZ=Math.min(minZ,p[2])
   maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);maxZ=Math.max(maxZ,p[2])
  }
  const scale=Math.max(Math.hypot(maxX-minX,maxY-minY,maxZ-minZ),1e-9)
  const weldTolerance=scale*1e-8
  const vertices:number[][]=[]
  const vertexIds=new Map<string,number>()
  const getVertex=(p:number[])=>{
   const key=p.map(n=>Math.round(n/weldTolerance)).join(',')
   let id=vertexIds.get(key)
   if(id===undefined){id=vertices.length;vertexIds.set(key,id);vertices.push(p)}
   return id
  }
  const faces:Face[]=[]
  const seen=new Set<string>()
  let removedDegenerate=0,removedDuplicate=0
  const areaThreshold=scale**4*1e-24
  for(let i=0;i<coords.length;i+=3){
   const v=[getVertex(coords[i]),getVertex(coords[i+1]),getVertex(coords[i+2])] as [number,number,number]
   if(new Set(v).size<3||triangleAreaSquared(vertices[v[0]],vertices[v[1]],vertices[v[2]])<=areaThreshold){removedDegenerate++;continue}
   const key=[...v].sort((a,b)=>a-b).join(':')
   if(seen.has(key)){removedDuplicate++;continue}
   seen.add(key);faces.push({v})
  }
  if(!faces.length)throw new Error('No valid triangles remain after cleanup.')

  const initialTriangleCount=attr.count/3
  const flippedTriangles=orientFaces(faces)
  const edges=buildEdges(faces)
  const loops=boundaryLoops(edges)
  let filledHoles=0
  for(const loop of loops.loops){
   if(!isSmallPlanarConvex(loop,vertices,scale))continue
   const center=loop.vertices.reduce((sum,id)=>add3(sum,vertices[id]),[0,0,0] as number[]).map(n=>n/loop.vertices.length)
   const centerId=vertices.length;vertices.push(center)
   for(const edge of loop.edges)faces.push({v:[edge.b,edge.a,centerId]})
   filledHoles++
  }

  const flippedAfterCaps=orientFaces(faces)
  const finalEdges=buildEdges(faces)
  orientClosedComponentsOutward(faces,finalEdges,vertices)
  const finalTopology=buildEdges(faces)
  const finalEdgeList=[...finalTopology.values()]
  const openEdgeCount=finalEdgeList.filter(e=>e.length===1).length
  const nonManifoldEdges=finalEdgeList.filter(e=>e.length>2).length
  const unfilledBoundaries=loops.openChains+loops.loops.length-filledHoles
  const watertight=openEdgeCount===0&&nonManifoldEdges===0
  const warnings:string[]=[]
  if(removedDegenerate)warnings.push(`${removedDegenerate} degenerate triangle(s) removed.`)
  if(removedDuplicate)warnings.push(`${removedDuplicate} duplicate triangle(s) removed.`)
  if(filledHoles)warnings.push(`${filledHoles} small planar hole(s) capped.`)
  if(unfilledBoundaries)warnings.push(`${unfilledBoundaries} boundary loop(s) could not be safely capped.`)
  if(nonManifoldEdges)warnings.push(`${nonManifoldEdges} non-manifold edge(s) remain.`)
  if(!watertight)warnings.push('The output is not watertight. Do not use it for production; repair it manually.')
  const data=encodeBinaryStl(faces,vertices)
  return {data,report:{inputTriangles:initialTriangleCount,outputTriangles:faces.length,removedDegenerate,removedDuplicate,flippedTriangles:flippedTriangles+flippedAfterCaps,filledHoles,unfilledBoundaries,nonManifoldEdges,watertight,warnings}}
 }finally{geometry.dispose()}
}

function triangleAreaSquared(a:number[],b:number[],c:number[]){
 const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]]
 const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]
 return cross[0]**2+cross[1]**2+cross[2]**2
}
function add3(a:number[],b:number[]){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function edgeKey(a:number,b:number){return a<b?`${a}|${b}`:`${b}|${a}`}
function buildEdges(faces:Face[]){
 const edges=new Map<string,Edge[]>()
 for(let fi=0;fi<faces.length;fi++){
  const [a,b,c]=faces[fi].v
  for(const [u,v] of [[a,b],[b,c],[c,a]]){
   const key=edgeKey(u,v),items=edges.get(key)||[]
   items.push({a:u,b:v,face:fi,direction:u<v?1:-1});edges.set(key,items)
  }
 }
 return edges
}
function orientFaces(faces:Face[]){
 const edges=buildEdges(faces),neighbors=faces.map(()=>[] as Array<{face:number;same:boolean}>)
 for(const items of edges.values())if(items.length===2){
  const [a,b]=items;const same=a.direction===b.direction
  neighbors[a.face].push({face:b.face,same});neighbors[b.face].push({face:a.face,same})
 }
 let changed=0
 for(let start=0;start<faces.length;start++){
  if(faces[start].flip!==undefined)continue
  faces[start].flip=false;const queue=[start]
  while(queue.length){
   const current=queue.pop()!,currentFlip=!!faces[current].flip
   for(const neighbor of neighbors[current]){
    const required=currentFlip!==neighbor.same
    if(faces[neighbor.face].flip===undefined){faces[neighbor.face].flip=required;queue.push(neighbor.face)}
   }
  }
 }
 for(const face of faces)if(face.flip){[face.v[1],face.v[2]]=[face.v[2],face.v[1]];changed++}
 for(const face of faces)face.flip=undefined
 return changed
}
function boundaryLoops(edges:Map<string,Edge[]>){
 const boundary=[...edges.values()].filter(items=>items.length===1).map(items=>items[0])
 const outgoing=new Map<number,Edge[]>(),incoming=new Map<number,Edge[]>()
 for(const edge of boundary){const a=outgoing.get(edge.a)||[];a.push(edge);outgoing.set(edge.a,a);const b=incoming.get(edge.b)||[];b.push(edge);incoming.set(edge.b,b)}
 const used=new Set<Edge>(),loops:Array<{edges:Edge[];vertices:number[]}>=[]
 let openChains=0
 for(const first of boundary){
  if(used.has(first))continue
  const path=[first],ids=[first.a,first.b];used.add(first)
  let cursor=first.b,closed=false
  while(true){
   if(cursor===first.a){closed=true;break}
   const choices=(outgoing.get(cursor)||[]).filter(edge=>!used.has(edge))
   if(choices.length!==1)break
   const next=choices[0];used.add(next);path.push(next);ids.push(next.b);cursor=next.b
   if(path.length>boundary.length)break
  }
  if(closed&&path.length>=3)loops.push({edges:path,vertices:ids.slice(0,-1)})
  else openChains++
 }
 return {loops,openChains}
}
function isSmallPlanarConvex(loop:{edges:Edge[];vertices:number[]},vertices:number[][],scale:number){
 const ids=loop.vertices
 if(ids.length<3||ids.length>64)return false
 const points=ids.map(id=>vertices[id])
 const center=points.reduce((sum,p)=>add3(sum,p),[0,0,0] as number[]).map(n=>n/points.length)
 const diameter=Math.max(...points.map(p=>Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2])))*2
 if(diameter>scale*.05)return false
 let normal:number[]|null=null
 for(let i=1;i<points.length-1&&!normal;i++){
  const a=points[i].map((n,k)=>n-points[0][k]),b=points[i+1].map((n,k)=>n-points[0][k])
  const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
  const length=Math.hypot(...cross);if(length>scale*scale*1e-12)normal=cross.map(n=>n/length)
 }
 if(!normal||points.some(p=>Math.abs((p[0]-points[0][0])*normal![0]+(p[1]-points[0][1])*normal![1]+(p[2]-points[0][2])*normal![2])>scale*1e-5))return false
 const axis=Math.abs(normal[0])>Math.abs(normal[1])?(Math.abs(normal[0])>Math.abs(normal[2])?0:2):(Math.abs(normal[1])>Math.abs(normal[2])?1:2)
 const projected=points.map(p=>axis===0?[p[1],p[2]]:axis===1?[p[0],p[2]]:[p[0],p[1]])
 let sign=0
 for(let i=0;i<projected.length;i++){
  const a=projected[i],b=projected[(i+1)%projected.length],c=projected[(i+2)%projected.length]
  const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])
  if(Math.abs(cross)<=scale*scale*1e-12)continue
  const next=Math.sign(cross);if(sign&&next!==sign)return false;sign=next
 }
 return sign!==0
}
function orientClosedComponentsOutward(faces:Face[],edges:Map<string,Edge[]>,vertices:number[][]){
 const neighbors=faces.map(()=>new Set<number>()),openFaces=new Set<number>()
 for(const items of edges.values()){
  if(items.length===2){neighbors[items[0].face].add(items[1].face);neighbors[items[1].face].add(items[0].face)}
  else for(const item of items)openFaces.add(item.face)
 }
 const visited=new Set<number>()
 for(let start=0;start<faces.length;start++){
  if(visited.has(start))continue
  const component:number[]=[],stack=[start];visited.add(start)
  while(stack.length){const face=stack.pop()!;component.push(face);for(const next of neighbors[face])if(!visited.has(next)){visited.add(next);stack.push(next)}}
  if(component.some(id=>openFaces.has(id)))continue
  let volume6=0
  for(const id of component){const [a,b,c]=faces[id].v,p=vertices[a],q=vertices[b],r=vertices[c];volume6+=p[0]*(q[1]*r[2]-q[2]*r[1])+p[1]*(q[2]*r[0]-q[0]*r[2])+p[2]*(q[0]*r[1]-q[1]*r[0])}
  if(volume6<0)for(const id of component)[faces[id].v[1],faces[id].v[2]]=[faces[id].v[2],faces[id].v[1]]
 }
}
function encodeBinaryStl(faces:Face[],vertices:number[][]){
 const buffer=new ArrayBuffer(84+faces.length*50),view=new DataView(buffer)
 view.setUint32(80,faces.length,true)
 let offset=84
 for(const face of faces){
  const [a,b,c]=face.v,p=vertices[a],q=vertices[b],r=vertices[c]
  const ux=q[0]-p[0],uy=q[1]-p[1],uz=q[2]-p[2],vx=r[0]-p[0],vy=r[1]-p[1],vz=r[2]-p[2]
  const normal=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx],length=Math.hypot(...normal)||1
  for(const n of normal)view.setFloat32(offset,n/length,true),offset+=4
  for(const vertex of [p,q,r])for(const n of vertex)view.setFloat32(offset,n,true),offset+=4
  view.setUint16(offset,0,true);offset+=2
 }
 return buffer
}
