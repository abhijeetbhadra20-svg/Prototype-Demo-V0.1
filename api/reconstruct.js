const HF_SPACE = "https://vpyr-pixal3d-multiview-glb.hf.space";

function authHeaders(){
  const token=process.env.HF_TOKEN;
  return token ? {Authorization:"Bearer "+token} : {};
}

async function parseJsonSafe(r){
  const text=await r.text();
  try{return JSON.parse(text)}catch{return {raw:text}}
}

async function uploadFrame(dataUrl,index){
  const m=/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl||"");
  if(!m)throw new Error("Invalid extracted frame image.");
  const ext=m[1].toLowerCase()==="jpg"?"jpeg":m[1].toLowerCase();
  const bytes=Buffer.from(m[2],"base64");
  const form=new FormData();
  form.append("files",new Blob([bytes],{type:"image/"+ext}),"turntable-"+index+"."+ext);

  const r=await fetch(HF_SPACE+"/gradio_api/upload",{
    method:"POST",
    headers:authHeaders(),
    body:form
  });
  const j=await parseJsonSafe(r);
  if(!r.ok)throw new Error("Hugging Face upload failed ("+r.status+"). "+(j?.error||j?.message||""));
  const path=Array.isArray(j)?j[0]:j?.path;
  if(!path)throw new Error("Hugging Face upload returned no file path.");
  return {path,orig_name:"turntable-"+index+"."+ext,mime_type:"image/"+ext,meta:{_type:"gradio.FileData"}};
}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  try{
    const {frames}=req.body||{};
    if(!Array.isArray(frames)||frames.length!==4)return res.status(400).json({error:"Exactly 4 extracted video frames are required."});

    // The uploaded turntable is ordered front -> 90° -> 180° -> 270°.
    const [front,azim090,back,azim270]=await Promise.all(frames.map((f,i)=>uploadFrame(f,i)));

    const body={
      data:[
        front,azim090,back,azim270,
        42,                 // seed
        20,                 // horizontal FOV
        3.1192049980163574, // camera radius used by the Space's reference rig
        1,                  // mesh scale
        1024,               // cascade resolution
        true                // textured GLB
      ]
    };

    const call=await fetch(HF_SPACE+"/gradio_api/call/generate_glb",{
      method:"POST",
      headers:{"Content-Type":"application/json",...authHeaders()},
      body:JSON.stringify(body)
    });
    const cj=await parseJsonSafe(call);
    if(!call.ok||!cj?.event_id){
      return res.status(502).json({
        error:"Free 3D reconstruction service could not start.",
        provider:"Hugging Face / Pixal3D",
        detail:cj
      });
    }

    return res.status(200).json({taskId:cj.event_id,provider:"pixal3d"});
  }catch(e){
    console.error("Pixal3D reconstruct error:",e);
    return res.status(500).json({error:"Reconstruction server error.",detail:String(e)});
  }
}