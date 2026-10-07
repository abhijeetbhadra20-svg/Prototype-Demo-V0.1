const HF_SPACE = "https://vpyr-pixal3d-multiview-glb.hf.space";

function authHeaders(){
  const token=process.env.HF_TOKEN;
  return token ? {Authorization:"Bearer "+token} : {};
}
async function parseJsonSafe(r){
  const text=await r.text();
  try{return JSON.parse(text)}catch{return {raw:text}}
}
function dataUrlBytes(dataUrl){
  const m=/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl||"");
  if(!m)throw new Error("Invalid extracted frame image.");
  const ext=m[1].toLowerCase()==="jpg"?"jpeg":m[1].toLowerCase();
  return {ext,bytes:Buffer.from(m[2],"base64")};
}
async function uploadFrame(dataUrl,index){
  const {ext,bytes}=dataUrlBytes(dataUrl);
  const filename="turntable-"+index+"."+ext;
  const form=new FormData();
  form.append("files",new Blob([bytes],{type:"image/"+ext}),filename);
  const r=await fetch(HF_SPACE+"/gradio_api/upload",{method:"POST",headers:authHeaders(),body:form});
  const j=await parseJsonSafe(r);
  if(!r.ok)throw new Error("Hugging Face upload failed ("+r.status+"): "+JSON.stringify(j));
  const path=Array.isArray(j)?j[0]:j?.path;
  if(!path)throw new Error("Hugging Face upload returned no file path: "+JSON.stringify(j));
  return path;
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  try{
    const {frames}=req.body||{};
    if(!Array.isArray(frames)||frames.length!==4)return res.status(400).json({error:"Exactly 4 extracted video frames are required."});
    const files=await Promise.all(frames.map(uploadFrame));

    // Current Pixal3D Space contract: 4 filepath inputs + seed + FOV + radius
    // + mesh scale + resolution + texture toggle.
    const payload={
      data:[
        files[0],files[1],files[2],files[3],
        42,
        20,
        3.1192,
        1,
        1024,
        false
      ]
    };
    const call=await fetch(HF_SPACE+"/gradio_api/call/generate_glb",{
      method:"POST",
      headers:{"Content-Type":"application/json",...authHeaders()},
      body:JSON.stringify(payload)
    });
    const cj=await parseJsonSafe(call);
    if(!call.ok||!cj?.event_id){
      return res.status(502).json({
        error:"Free Pixal3D reconstruction service could not start.",
        provider:"Hugging Face / Pixal3D",
        detail:cj,
        httpStatus:call.status
      });
    }
    return res.status(200).json({taskId:cj.event_id,provider:"pixal3d"});
  }catch(e){
    console.error("Pixal3D reconstruct error:",e);
    return res.status(500).json({error:"Reconstruction server error.",detail:String(e)});
  }
}