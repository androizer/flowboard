const fs = require('fs');
const crypto = require('crypto');
const file = process.env.JWT_SECRET_FILE || '/run/flowboard-secrets/jwt-secret';
if (!fs.existsSync(file)) {
  fs.mkdirSync(require('path').dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, crypto.randomBytes(32).toString('base64url'), {
    mode: 0o600,
  });
}
