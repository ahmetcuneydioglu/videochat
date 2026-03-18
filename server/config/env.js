const required = (name) => {
  const value = process.env[name];
  if (!value) {
    const hint =
      process.env.RENDER || process.env.RENDER_SERVICE_ID
        ? ` Set ${name} in your Render service environment settings.`
        : '';
    throw new Error(`Missing required environment variable: ${name}.${hint}`);
  }
  return value;
};

const optionalList = (value, fallback = []) => {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5001),
  MONGODB_URI: required('MONGODB_URI'),
  JWT_SECRET: required('JWT_SECRET'),
  APPLE_ISSUER_ID: process.env.APPLE_ISSUER_ID || '',
  APPLE_KEY_ID: process.env.APPLE_KEY_ID || '',
  APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID || '',
  APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY || '',
  APPLE_PRIVATE_KEY_BASE64: process.env.APPLE_PRIVATE_KEY_BASE64 || '',
  GOOGLE_CLIENT_IDS: optionalList(
    process.env.GOOGLE_CLIENT_IDS,
    process.env.GOOGLE_CLIENT_ID ? [process.env.GOOGLE_CLIENT_ID] : []
  ),
  ALLOWED_ORIGINS: optionalList(process.env.ALLOWED_ORIGINS, [
    'https://www.omegpt.com',
    'https://omegpt.com',
    'http://localhost:3000',
  ]),
};
