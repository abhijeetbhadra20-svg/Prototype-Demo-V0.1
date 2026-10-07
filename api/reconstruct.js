export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});
 const key=process.env.TRIPO_API_KEY;
 if(!key)return res.status(503).json({error:"TRIPO_API_KEY is not configured on the server yet."});
 try{
  const {frames}=req.body||{};
  if(!Array.isArray(frames)||frames.length!==4)return res.status(400).json({error:"Exactly 4 extracted video frames are required."});
  const tokens=[];
  for(let i=0;i<4;i++){
   const m=/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(frames[i]||"");
   if(!m)return res.status(400).json({error:"Invalid frame image."});
   const ext=m[1].toLowerCase()==="jpg"?"jpeg":m[1].toLowerCase();
   const bytes=Buffer.from(m[2],"base64");
   const form=new FormData();
   form.append("file",new Blob([bytes],{type:"image/"+ext}),"view-"+i+"."+ext);
   const up=await fetch("https://openapi.tripo3d.ai/v3/files",{method:"POST",headers:{Authorization:"Bearer "+key},body:form});
   const uj=await up.json();
   if(!up.ok||uj?.code!==0)return res.status(502).json({error:"Tripo image upload failed.",detail:uj});
   const token=uj?.data?.file_token;
   if(!token)return res.status(502).json({error:"Tripo did not return a file token.",detail:uj});
   tokens.push(token);
  }
  const task=await fetch("https://openapi.tripo3d.ai/v3/generation/multiview-to-model",{
   method:"POST",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
   body:JSON.stringify({
    inputs:[{front:tokens[0]},{left:tokens[1]},{back:tokens[2]},{right:tokens[3]}],
    model:"v3.1-20260211",
    texture:true,pbr:true,texture_quality:"detailed",geometry_quality:"detailed",
    face_limit:500000,orientation:"align_image"
   })
  });
  const tj=await task.json();
  if(!task.ok||tj?.code!==0)return res.status(502).json({error:"Tripo reconstruction task failed.",detail:tj});
  return res.status(200).json({taskId:tj.data.task_id});
 }catch(e){return res.status(500).json({error:"Reconstruction server error.",detail:String(e)});}
}