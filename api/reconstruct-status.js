export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({error:"GET only"});
  const key = process.env.TRIPO_API_KEY;
  if (!key) return res.status(503).json({error:"TRIPO_API_KEY is not configured on the server yet."});
  const taskId = req.query?.taskId;
  if (!taskId) return res.status(400).json({error:"taskId is required."});

  try {
    const r = await fetch("https://api.tripo3d.ai/v2/openapi/task/"+encodeURIComponent(taskId), {
      headers:{Authorization:"Bearer "+key}
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({error:"Could not read reconstruction task.",detail:j});

    const data=j.data||{};
    const output=data.output||{};
    const modelUrl=output.pbr_model||output.model||output.glb||output.model_url||null;
    return res.status(200).json({
      status:data.status||"unknown",
      modelUrl,
      task:data
    });
  } catch(e) {
    return res.status(500).json({error:"Status server error.",detail:String(e)});
  }
}
