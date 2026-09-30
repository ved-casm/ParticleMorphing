"use client";
import dynamic from "next/dynamic";
import {useState} from "react";
const AeroShards = dynamic(() => import("../react-bits/AeroShards"), {ssr:false});
const Fallback = dynamic(() => import("./shards-fallback"), {ssr:false});
export default function ShardField({active,reduced}:{active:boolean;reduced:boolean}) {
  const [failed,setFailed] = useState(false);
  return failed ? <Fallback active={active} reduced={reduced}/> : <AeroShards backgroundColor="#0a0d0b" shardColor="#68786b" accentColor="#a7b89b" placement="right" material="satin" detail="bold" density={.5} speed={.12} spin={.08} turbulence={.12} interaction="repel" interactionStrength={.06} interactionRadius={.65} rippleIntensity={0} holdToGather={false} bloom={.12} glow={.2} grain={0} chromaticAberration={0} paused={!active || reduced} onError={()=>setFailed(true)}/>;
}
