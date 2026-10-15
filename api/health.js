// Deployment probe: verifies Vercel registers Node functions from /api.
// If GET /api/health returns { ok: true } but /api/* (Express bundle)
// 404s, the generated api/[...path].js file is the problem, not routing.
export default function handler(req, res) {
  res.status(200).json({ ok: true, at: new Date().toISOString() });
}
