import {useEffect, useRef, useState} from 'react'
import {Download, X} from 'lucide-react'
import * as THREE from 'three'
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js'
import {downloadFile, fetchBlob} from '../api'

export type StlPreviewFile={id:number;name:string;download_url:string}

export default function StlViewerModal({file,onClose}:{file:StlPreviewFile|null;onClose:()=>void}){
 const mountRef=useRef<HTMLDivElement>(null)
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 useEffect(()=>{
  if(!file||!mountRef.current)return
  const mount=mountRef.current
  mount.innerHTML=''
  let animation=0
  let disposed=false
  let mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>|null=null
  let dragging=false
  let lastX=0
  let lastY=0

  const scene=new THREE.Scene()
  scene.background=new THREE.Color(0xf8fafc)
  const camera=new THREE.PerspectiveCamera(45,1,.1,10000)
  const renderer=new THREE.WebGLRenderer({antialias:true})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2))
  mount.appendChild(renderer.domElement)

  scene.add(new THREE.HemisphereLight(0xffffff,0x9aa8b4,1.6))
  const keyLight=new THREE.DirectionalLight(0xffffff,2)
  keyLight.position.set(4,5,6)
  scene.add(keyLight)
  const fillLight=new THREE.DirectionalLight(0xffffff,.9)
  fillLight.position.set(-3,2,-4)
  scene.add(fillLight)
  const grid=new THREE.GridHelper(120,24,0xd6dde5,0xe6ebf0)
  scene.add(grid)

  const resize=()=>{
   const rect=mount.getBoundingClientRect()
   const width=Math.max(rect.width,320)
   const height=Math.max(rect.height,280)
   camera.aspect=width/height
   camera.updateProjectionMatrix()
   renderer.setSize(width,height,false)
  }
  const observer=new ResizeObserver(resize)
  observer.observe(mount)
  resize()

  const onPointerDown=(event:PointerEvent)=>{dragging=true;lastX=event.clientX;lastY=event.clientY;renderer.domElement.setPointerCapture(event.pointerId)}
  const onPointerMove=(event:PointerEvent)=>{
   if(!dragging||!mesh)return
   const dx=event.clientX-lastX
   const dy=event.clientY-lastY
   mesh.rotation.y+=dx*.01
   mesh.rotation.x+=dy*.01
   lastX=event.clientX
   lastY=event.clientY
  }
  const onPointerUp=(event:PointerEvent)=>{dragging=false;try{renderer.domElement.releasePointerCapture(event.pointerId)}catch{}}
  renderer.domElement.addEventListener('pointerdown',onPointerDown)
  renderer.domElement.addEventListener('pointermove',onPointerMove)
  renderer.domElement.addEventListener('pointerup',onPointerUp)
  renderer.domElement.addEventListener('pointerleave',onPointerUp)

  const animate=()=>{
   if(disposed)return
   if(mesh&&!dragging)mesh.rotation.z+=.004
   renderer.render(scene,camera)
   animation=window.requestAnimationFrame(animate)
  }
  animate()

  setLoading(true)
  setError('')
  fetchBlob(file.download_url)
   .then(blob=>blob.arrayBuffer())
   .then(buffer=>{
    if(disposed)return
    const geometry=new STLLoader().parse(buffer)
    geometry.computeVertexNormals()
    geometry.center()
    geometry.computeBoundingSphere()
    const radius=Math.max(geometry.boundingSphere?.radius||1,1)
    const material=new THREE.MeshStandardMaterial({color:0xe94d4f,metalness:.12,roughness:.48})
    mesh=new THREE.Mesh(geometry,material)
    mesh.rotation.x=-Math.PI/2
    scene.add(mesh)
    grid.scale.setScalar(radius/45)
    camera.near=radius/100
    camera.far=radius*80
    camera.position.set(radius*2.4,radius*1.7,radius*2.4)
    camera.lookAt(0,0,0)
    camera.updateProjectionMatrix()
   })
   .catch(x=>{if(!disposed)setError(String(x))})
   .finally(()=>{if(!disposed)setLoading(false)})

  return ()=>{
   disposed=true
   observer.disconnect()
   window.cancelAnimationFrame(animation)
   renderer.domElement.removeEventListener('pointerdown',onPointerDown)
   renderer.domElement.removeEventListener('pointermove',onPointerMove)
   renderer.domElement.removeEventListener('pointerup',onPointerUp)
   renderer.domElement.removeEventListener('pointerleave',onPointerUp)
   mesh?.geometry.dispose()
   mesh?.material.dispose()
   renderer.dispose()
   mount.innerHTML=''
  }
 },[file])

 if(!file)return null
 return <div className="stlOverlay" role="dialog" aria-modal="true" aria-label={`View ${file.name}`}>
  <div className="stlModal">
   <div className="stlModalHead">
    <div><h2>{file.name}</h2><p>Drag the model to rotate it.</p></div>
    <div className="stlActions">
     <button className="secondaryBtn" type="button" onClick={()=>downloadFile(file.download_url,file.name)}><Download size={16}/>Download</button>
     <button className="iconBtn" type="button" onClick={onClose} aria-label="Close STL viewer"><X size={18}/></button>
    </div>
   </div>
   <div className="stlCanvasWrap" ref={mountRef}>
    {loading&&<div className="stlStatus">Loading STL...</div>}
    {error&&<div className="stlStatus error">{error}</div>}
   </div>
  </div>
 </div>
}
