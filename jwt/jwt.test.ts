import assert from "node:assert/strict";
import test from "node:test";

import {
  SignJWT,
  calculateJwkThumbprint,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  jwtVerify,
} from "jose";

const textEncoder = new TextEncoder();
const symmetricSecret = textEncoder.encode("super-secret-signing-key");
const payload = { sub: "user-123", role: "admin" };

test("jose signs and verifies HS256 (symmetric) JWT", async () => {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(symmetricSecret);

  const { payload: decoded } = await jwtVerify(token, symmetricSecret);

  assert.equal(decoded.sub, payload.sub);
  assert.equal(decoded.role, payload.role);
  assert.equal(typeof decoded.iat, "number");
  assert.equal(typeof decoded.exp, "number");
});

test("jose signs and verifies RS256 (asymmetric) JWT", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const { payload: decoded } = await jwtVerify(token, publicKey);

  assert.equal(decoded.sub, payload.sub);
  assert.equal(decoded.role, payload.role);
  assert.equal(typeof decoded.iat, "number");
  assert.equal(typeof decoded.exp, "number");
});

test("jose verifies RS256 JWT using a JWKS", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(publicJwk);

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const jwks = createLocalJWKSet({
    keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }],
  });

  const { payload: decoded } = await jwtVerify(token, jwks, {
    algorithms: ["RS256"],
  });

  assert.equal(decoded.sub, payload.sub);
  assert.equal(decoded.role, payload.role);
});

test("jose rejects JWT with invalid symmetric key", async () => {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(symmetricSecret);

  await assert.rejects(() =>
    jwtVerify(token, textEncoder.encode("wrong-secret-signing-key")),
  );
});
