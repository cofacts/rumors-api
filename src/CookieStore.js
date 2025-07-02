import { Store } from 'koa-session2';
import crypto from 'crypto';

export default class CookieStore extends Store {
  constructor({ algorithm = 'aes-256-ctr', password = '' }) {
    super();
    this.algorithm = algorithm;
    this.password = password;

    // In Node.js 22, we need to use more secure createCipheriv/createDecipheriv methods
    // For this, we need to create a key
    // Convert password to a fixed-length key (32 bytes for aes-256-*)
    this.key = crypto.scryptSync(this.password, 'salt', 32);
  }

  // Extract IV and encrypted data from the session ID
  _extractIvAndData(sid) {
    // First 16 bytes (32 hex characters) is the IV
    const iv = Buffer.from(sid.slice(0, 32), 'hex');
    const data = sid.slice(32);
    return { iv, data };
  }

  get(sid) {
    try {
      if (!sid || sid.length <= 32) {
        return {};
      }

      const { iv, data } = this._extractIvAndData(sid);
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

      let decrypted = decipher.update(data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (e) {
      console.error('Session decryption error:', e.message);
      return {};
    }
  }

  set(session) {
    // Generate a random initialization vector (IV)
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let crypted = cipher.update(JSON.stringify(session), 'utf8', 'hex');
    crypted += cipher.final('hex');

    // Return both IV and encrypted data together
    return iv.toString('hex') + crypted;
  }
}
