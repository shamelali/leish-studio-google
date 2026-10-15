// Deployment probe #2: can a Vercel function import the real bcrypt
// package (native prebuild) and hash/compare? Determines whether the
// Express bundle must inline bcrypt or may leave it external.
import bcrypt from 'bcrypt';

export default async function handler(req, res) {
  try {
    const hash = await bcrypt.hash('probe-password', 4);
    const ok = await bcrypt.compare('probe-password', hash);
    res.status(200).json({ bcryptWorks: ok });
  } catch (err) {
    res.status(500).json({ bcryptWorks: false, error: String((err && err.message) || err) });
  }
}
