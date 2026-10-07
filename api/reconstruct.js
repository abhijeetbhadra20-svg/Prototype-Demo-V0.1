export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({error:"POST only"});
  const key = process.env.TRIPO_API_KEY;
  if (!key) return res.status(503).json({error:"TRIPO_API_KEY is not configured on the server yet."});

  try {
    const {frames} = req.body || {};
    if (!Array.isArray(frames) || frames.length !== 4) {
      return res.status(400).json({error:"Exactly 4 extracted video frames are required."});
    }

    const tokens = [];
    for (let i=0;i<4;i++) {
      const dataUrl = frames[i];
      const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl || "");
      if (!m) return res.status(400).json({error:"Invalid frame image."});
      const ext = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
      const bytes = Buffer.from(m[2], "base64");
      const form = new FormData();
      form.append("file", new Blob([bytes], {type:"image/"+ext}), "view-"+i+"."+ext);
      const up = await fetch("https://api.tripo3d.ai/v2/openapi/upload", {
        method:"POST",
        headers:{Authorization:"Bearer "+key},
        body:form
      });
      const uj = await up.json();
      if (!up.ok || uj?.code !== 0) {
        return res.status(502).json({error:"Tripo image upload failed.",detail:uj});
      }
      const token = uj?.data?.image_token || uj?.data?.file_token;
      if (!token) return res.status(502).json({error:"Tripo did not return an image token.",detail:uj});
      tokens.push(token);
    }

    const task = await fetch("https://api.tripo3d.ai/v2/openapi/task", {
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
      body:JSON.stringify({
        type:"multiview_to_model",
        files:tokens.map(t=>({type:"image",file_token:t})),
        model_version:"P1-20260311",
        texture:true,
        pbr:true,
        texture_quality:"standard",
        face_limit:12000,
        orientation:"align_image"
      })
    });
    const tj = await task.json();
    if (!task.ok || tj?.code !== 0) {
      return res.status(502).json({error:"Tripo reconstruction task failed.",detail:tj});
    }
    return res.status(200).json({taskId:tj.data.task_id});
  } catch (e) {
    return res.status(500).json({error:"Reconstruction server error.",detail:String(e)});
  }
}
