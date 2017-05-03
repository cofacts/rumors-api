import { Store } from 'koa-session2';
import crypto from 'crypto';

export default class CookieStore extends Store {
  constructor({ algorithm = 'aes-256-ctr', password = '' }) {
    super();
    this.algorithm = algorithm;
    this.password = password;
  }

  get(sid) {
    const decipher = crypto.createDecipher(this.algorithm, this.password);
    try {
      let decrypted = decipher.update(sid, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (e) {
      return {};
    }
  }

  set(session) {
    const cipher = crypto.createCipher(this.algorithm, this.password);
    let crypted = cipher.update(JSON.stringify(session), 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
  }
}
