const HF_SPACE = "https://vpyr-pixal3d-multiview-glb.hf.space";

function authHeaders(){
  const token=process.env.HF_TOKEN;
  return token ? {Authorization:"Bearer "+token} : {};
}

function findEvent(text){
  const blocks=text.split(/\n\n+/);
  for(const block of blocks){
    const event=(block.match(/^event:\s*(.+)$/m)||[])[1]?.trim();
    const dataLine=(block.match(/^data:\s*(.+)$/m)||[])[1];
    if(!dataLine)continue;
    let data=null;
    try{data=JSON.parse(dataLine)}catch{data=dataLine;}
    if(event==="complete")return {type:"complete",data};
    if(event==="error")return {type:"error",data};
  }
  return null;
}

function pickFileData(data){
  if(!Array.isArray(data))return null;
  for(const item of data){
    if(item&&typeof item==="object"&&(item.url||item.path||item.file)){
      const path=item.path||item.file||null;
      const url=item.url || (path ? HF_SPACE+"/gradio_api/file="+encodeURIComponent(path) : null);
      if(url)return {url,path,name:item.orig_name||"pixal3d-model.glb"};
    }
  }
  return null;
}

export default async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  const taskId=req.query?.taskId;
  if(!taskId)return res.status(400).json({error:"taskId is required."});

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),3500);
  try{
    const r=await fetch(HF_SPACE+"/gradio_api/call/generate_glb/"+encodeURIComponent(taskId),{
      headers:authHeaders(),
      signal:controller.signal
    });
    const text=await r.text();
    if(!r.ok)return res.status(502).json({error:"Could not read free reconstruction task.",detail:text});
    const event=findEvent(text);

    if(event?.type==="complete"){
      const file=pickFileData(event.data);
      if(!file)throw new Error("Pixal3D finished but did not return a GLB file.");
      const diagnostics=Array.isArray(event.data)?event.data[2]:null;
      return res.status(200).json({
        status:"success",
        task:{status:"success",diagnostics},
        modelUrl:file.url
      });
    }
    if(event?.type==="error"){
      return res.status(502).json({error:"Pixal3D reconstruction failed.",detail:event.data});
    }
    return res.status(200).json({status:"processing",task:{status:"processing"}});
  }catch(e){
    if(e?.name==="AbortError")return res.status(200).json({status:"processing",task:{status:"processing"}});
    console.error("Pixal3D status error:",e);
    return res.status(500).json({error:"Status server error.",detail:String(e)});
  }finally{
    clearTimeout(timeout);
  }
}