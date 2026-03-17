const jwt = require('jsonwebtoken');
const { z } = require('zod');
const {
  APPLE_BUNDLE_ID,
  APPLE_ISSUER_ID,
  APPLE_KEY_ID,
  APPLE_PRIVATE_KEY,
  APPLE_PRIVATE_KEY_BASE64,
} = require('../config/env');

const purchaseVerificationSchema = z.object({
  platform: z.enum(['ios', 'android']),
  productId: z.string().min(1).max(100),
  transactionId: z.string().min(3).max(255),
  receiptData: z.string().min(10).optional(),
});

function getApplePrivateKey() {
  if (APPLE_PRIVATE_KEY) {
    return APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  if (APPLE_PRIVATE_KEY_BASE64) {
    return Buffer.from(APPLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  }
  return '';
}

function hasAppleVerificationConfig() {
  return Boolean(
    APPLE_ISSUER_ID &&
    APPLE_KEY_ID &&
    APPLE_BUNDLE_ID &&
    getApplePrivateKey()
  );
}

function generateAppleServerApiToken() {
  const privateKey = getApplePrivateKey();
  return jwt.sign(
    {
      iss: APPLE_ISSUER_ID,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      aud: 'appstoreconnect-v1',
      bid: APPLE_BUNDLE_ID,
    },
    privateKey,
    {
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: APPLE_KEY_ID,
        typ: 'JWT',
      },
    }
  );
}

function decodeJWSPayload(jws) {
  const parts = jws.split('.');
  if (parts.length < 2) {
    throw new Error('Malformed JWS response from Apple');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

async function fetchAppleTransaction(transactionId, environment) {
  const baseUrl =
    environment === 'sandbox'
      ? 'https://api.storekit-sandbox.itunes.apple.com'
      : 'https://api.storekit.itunes.apple.com';

  const response = await fetch(`${baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${generateAppleServerApiToken()}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      status: response.status,
      body: errorText,
    };
  }

  return {
    ok: true,
    data: await response.json(),
  };
}

async function verifyApplePurchase(data) {
  if (!hasAppleVerificationConfig()) {
    return {
      isValid: false,
      reason: 'APPLE_VERIFICATION_NOT_CONFIGURED',
    };
  }

  const productionResult = await fetchAppleTransaction(data.transactionId, 'production');
  const result =
    productionResult.ok || productionResult.status !== 404
      ? productionResult
      : await fetchAppleTransaction(data.transactionId, 'sandbox');

  if (!result.ok) {
    return {
      isValid: false,
      reason: 'APPLE_TRANSACTION_LOOKUP_FAILED',
      details: result.body,
    };
  }

  const signedTransactionInfo = result.data?.signedTransactionInfo;
  if (!signedTransactionInfo) {
    return {
      isValid: false,
      reason: 'APPLE_SIGNED_TRANSACTION_MISSING',
    };
  }

  const payload = decodeJWSPayload(signedTransactionInfo);
  const productMatches = payload.productId === data.productId;
  const transactionMatches = String(payload.transactionId) === String(data.transactionId);
  const bundleMatches = payload.bundleId === APPLE_BUNDLE_ID;

  if (!productMatches || !transactionMatches || !bundleMatches) {
    return {
      isValid: false,
      reason: 'APPLE_TRANSACTION_MISMATCH',
      payload,
    };
  }

  return {
    isValid: true,
    platform: 'ios',
    productId: payload.productId,
    transactionId: String(payload.transactionId),
    environment: payload.environment || 'production',
    rawPayload: payload,
  };
}

async function verifyPurchaseWithStore(payload) {
  const data = purchaseVerificationSchema.parse(payload);

  if (data.platform === 'ios') {
    return verifyApplePurchase(data);
  }

  return {
    isValid: false,
    reason: 'ANDROID_VERIFICATION_NOT_IMPLEMENTED',
  };
}

module.exports = {
  verifyPurchaseWithStore,
  purchaseVerificationSchema,
};
