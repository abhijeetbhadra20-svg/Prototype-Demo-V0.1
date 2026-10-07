const HF_SPACE = "https://vpyr-pixal3d-multiview-glb.hf.space";

function authHeaders(){
  const token=process.env.HF_TOKEN;
  return token ? {Authorization:"Bearer "+token} : {};
}
async function parseJsonSafe(r){
  const text=await r.text();
  try{return JSON.parse(text)}catch{return {raw:text}}
}
function u16(n){return Uint8Array.of(n&255,(n>>>8)&255)}
function u32(n){return Uint8Array.of(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255)}
const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0}return t})();
function crc32(a){let c=0xffffffff;for(const b of a)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function concat(arrays){let n=0;for(const a of arrays)n+=a.length;const out=new Uint8Array(n);let p=0;for(const a of arrays){out.set(a,p);p+=a.length}return out}
function zipStored(files){
  const enc=new TextEncoder(), local=[], central=[];let offset=0;
  for(const f of files){
    const name=enc.encode(f.name), data=f.data, crc=crc32(data);
    const lh=concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    local.push(lh);
    const ch=concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    central.push(ch);offset+=lh.length;
  }
  const body=concat(local), cd=concat(central);
  return concat([body,cd,u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cd.length),u32(body.length),u16(0)]);
}
function dataUrlBytes(dataUrl){
  const m=/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl||"");
  if(!m)throw new Error("Invalid extracted frame image.");
  return {ext:m[1].toLowerCase()==="jpg"?"jpeg":m[1].toLowerCase(),bytes:Buffer.from(m[2],"base64")};
}
function rigTransforms(){
  const d=3.1192049980163574;
  return {
    camera_angle_x:0.3490658503988659,
    mesh_scale:1,
    frames:[
      {file_path:"view00_azim000.png",name:"front / azim000",is_canonical_front:true,transform_matrix:[[1,0,0,0],[0,0,-1,-d],[0,1,0,0],[0,0,0,1]]},
      {file_path:"view01_azim090.png",name:"right / azim090",transform_matrix:[[0,0,1,d],[1,0,0,0],[0,1,0,0],[0,0,0,1]]},
      {file_path:"view02_azim180.png",name:"back / azim180",transform_matrix:[[-1,0,0,0],[0,0,1,d],[0,1,0,0],[0,0,0,1]]},
      {file_path:"view03_azim270.png",name:"left / azim270",transform_matrix:[[0,0,-1,-d],[-1,0,0,0],[0,1,0,0],[0,0,0,1]]}
    ]
  };
}
async function uploadZip(zipBytes){
  const form=new FormData();
  form.append("files",new Blob([zipBytes],{type:"application/zip"}),"pixal3d-turntable.zip");
  const r=await fetch(HF_SPACE+"/gradio_api/upload",{method:"POST",headers:authHeaders(),body:form});
  const j=await parseJsonSafe(r);
  if(!r.ok)throw new Error("Hugging Face upload failed ("+r.status+"). "+JSON.stringify(j));
  const path=Array.isArray(j)?j[0]:j?.path;
  if(!path)throw new Error("Hugging Face returned no uploaded ZIP path. "+JSON.stringify(j));
  return {path,orig_name:"pixal3d-turntable.zip",size:zipBytes.length,mime_type:"application/zip",meta:{_type:"gradio.FileData"}};
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  try{
    const {frames}=req.body||{};
    if(!Array.isArray(frames)||frames.length!==4)return res.status(400).json({error:"Exactly 4 extracted video frames are required."});
    const names=["view00_azim000.png","view01_azim090.png","view02_azim180.png","view03_azim270.png"];
    const files=[];
    for(let i=0;i<4;i++){
      const {bytes}=dataUrlBytes(frames[i]);
      files.push({name:names[i],data:new Uint8Array(bytes)});
    }
    files.push({name:"transforms.json",data:new TextEncoder().encode(JSON.stringify(rigTransforms()))});
    const zip=zipStored(files);
    const archive=await uploadZip(zip);
    const call=await fetch(HF_SPACE+"/gradio_api/call/generate_calibrated_glb",{
      method:"POST",
      headers:{"Content-Type":"application/json",...authHeaders()},
      body:JSON.stringify({data:[archive,42,1,1024,true]})
    });
    const cj=await parseJsonSafe(call);
    if(!call.ok||!cj?.event_id){
      return res.status(502).json({error:"Free 3D reconstruction service could not start.",provider:"Hugging Face / Pixal3D",detail:cj,httpStatus:call.status});
    }
    return res.status(200).json({taskId:cj.event_id,provider:"pixal3d"});
  }catch(e){
    console.error("Pixal3D reconstruct error:",e);
    return res.status(500).json({error:"Reconstruction server error.",detail:String(e)});
  }
}