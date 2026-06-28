export function onRequestGet() {
  return Response.json({
    ok: true,
    message: "jChat+ Cloudflare Functions are alive",
  });
}