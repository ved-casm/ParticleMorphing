"use client";
import {useEffect,useRef} from "react";
import * as THREE from "three";
export default function ShardsFallback({active,reduced}:{active:boolean;reduced:boolean}) {
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!root.current) return;
  const el=root.current;
  let renderer:THREE.WebGLRenderer;
  try {renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:"low-power"});} catch {return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));el.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,40);camera.position.z=9;
  const geometry=new THREE.OctahedronGeometry(.065,0),material=new THREE.MeshBasicMaterial({color:0x7d907a,transparent:true,opacity:.35});
  const mesh=new THREE.InstancedMesh(geometry,material,180),dummy=new THREE.Object3D();
  for(let i=0;i<180;i++){const t=i*.31;dummy.position.set(2+Math.sin(t)*1.4,Math.cos(t*.79)*3,Math.sin(t*1.8));dummy.rotation.set(t,t*2,t);dummy.scale.set(1,2.7,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
  scene.add(mesh);
  const resize=()=>{renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/Math.max(1,el.clientHeight);camera.updateProjectionMatrix();renderer.render(scene,camera);};resize();
  const observer=new ResizeObserver(resize);observer.observe(el);
  let raf=0,last=0;
  const tick=(time:number)=>{if(time-last>33){last=time;mesh.rotation.y=Math.sin(time*.00007)*.12;renderer.render(scene,camera);}raf=requestAnimationFrame(tick);};
  if(active&&!reduced)raf=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(raf);observer.disconnect();geometry.dispose();material.dispose();renderer.dispose();renderer.domElement.remove();};
 },[active,reduced]);
 return <div className="shards-fallback" ref={root}/>;
}
