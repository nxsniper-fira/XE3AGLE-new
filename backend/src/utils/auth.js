const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const SALT_ROUNDS = 12;

function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const jti = uuidv4();
  const token = jwt.sign({ ...payload, jti }, secret, { expiresIn });
  return { token, jti };
}

function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return jwt.verify(token, secret);
}

function getTokenFromHeader(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  getTokenFromHeader,
};
