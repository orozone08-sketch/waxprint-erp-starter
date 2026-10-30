import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js'

/** Magics shop formula: mesh volume in cm³ × 0.9 = weight in grams. */
export const STL_WEIGHT_FACTOR_G_PER_CM3=0.9
export async function calculateStlWeight(blob:Blob,fileName='STL file'){
 const geometry=new STLLoader().parse(await blob.arrayBuffer())
 try{
  const positions=geometry.getAttribute('position')
  if(!positions||positions.count<3||positions.count%3)throw new Error(`${fileName}: STL has no usable triangle mesh.`)
  let sixVolume=0
  const edgeBalance=new Map<string,{count:number;direction:number}>()
  const vertexKey=(x:number,y:number,z:number)=>`${x===0?0:x},${y===0?0:y},${z===0?0:z}`
  const addEdge=(a:string,b:string)=>{const forward=a<b;const key=forward?`${a}|${b}`:`${b}|${a}`;const edge=edgeBalance.get(key)||{count:0,direction:0};edge.count++;edge.direction+=forward?1:-1;edgeBalance.set(key,edge)}
  for(let i=0;i<positions.count;i+=3){
   const ax=positions.getX(i),ay=positions.getY(i),az=positions.getZ(i)
   const bx=positions.getX(i+1),by=positions.getY(i+1),bz=positions.getZ(i+1)
   const cx=positions.getX(i+2),cy=positions.getY(i+2),cz=positions.getZ(i+2)
   if(![ax,ay,az,bx,by,bz,cx,cy,cz].every(Number.isFinite))throw new Error(`${fileName}: STL contains invalid coordinates.`)
   sixVolume+=ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx)
   const a=vertexKey(ax,ay,az),b=vertexKey(bx,by,bz),c=vertexKey(cx,cy,cz)
   addEdge(a,b);addEdge(b,c);addEdge(c,a)
  }
  for(const edge of edgeBalance.values())if(edge.count!==2||edge.direction!==0)throw new Error(`${fileName}: mesh is open or has inconsistent triangle directions. Repair it in Easy3D or Magics before calculating weight.`)
  const volumeMm3=Math.abs(sixVolume/6)
  const volumeCm3=volumeMm3/1000
  const weightG=Number((volumeCm3*STL_WEIGHT_FACTOR_G_PER_CM3).toFixed(3))
  if(!Number.isFinite(weightG)||weightG<=0)throw new Error(`${fileName}: no positive volume. Check that the STL is closed and repaired.`)
  return {weightG,volumeMm3:Number(volumeMm3.toFixed(3)),volumeCm3:Number(volumeCm3.toFixed(6))}
 }finally{geometry.dispose()}
}
