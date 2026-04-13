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


test("jose verifies tokens from two JWKS keys and rejects unknown kid", async () => {
  const keyPairOne = await generateKeyPair("RS256");
  const keyPairTwo = await generateKeyPair("RS256");
  const keyPairOutsideSet = await generateKeyPair("RS256");

  const publicJwkOne = await exportJWK(keyPairOne.publicKey);
  const publicJwkTwo = await exportJWK(keyPairTwo.publicKey);

  const kidOne = await calculateJwkThumbprint(publicJwkOne);
  const kidTwo = await calculateJwkThumbprint(publicJwkTwo);

  const tokenOne = await new SignJWT({ ...payload, tid: "token-one" })
    .setProtectedHeader({ alg: "RS256", kid: kidOne })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(keyPairOne.privateKey);

  const tokenTwo = await new SignJWT({ ...payload, tid: "token-two" })
    .setProtectedHeader({ alg: "RS256", kid: kidTwo })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(keyPairTwo.privateKey);

  const publicJwkOutsideSet = await exportJWK(keyPairOutsideSet.publicKey);
  const kidOutsideSet = await calculateJwkThumbprint(publicJwkOutsideSet);

  const tokenOutsideSet = await new SignJWT({ ...payload, tid: "token-outside" })
    .setProtectedHeader({ alg: "RS256", kid: kidOutsideSet })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(keyPairOutsideSet.privateKey);

  const jwks = createLocalJWKSet({
    keys: [
      { ...publicJwkOne, kid: kidOne, alg: "RS256", use: "sig" },
      { ...publicJwkTwo, kid: kidTwo, alg: "RS256", use: "sig" },
    ],
  });

  const { payload: decodedOne } = await jwtVerify(tokenOne, jwks, {
    algorithms: ["RS256"],
  });
  const { payload: decodedTwo } = await jwtVerify(tokenTwo, jwks, {
    algorithms: ["RS256"],
  });

  assert.equal(decodedOne.tid, "token-one");
  assert.equal(decodedTwo.tid, "token-two");

  await assert.rejects(
    () => jwtVerify(tokenOutsideSet, jwks, { algorithms: ["RS256"] }),
    /no applicable key found/i,
  );
});

test("jose rejects JWT with invalid symmetric key", async () => {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(symmetricSecret);

  await assert.rejects(
    () => jwtVerify(token, textEncoder.encode("wrong-secret-signing-key")),
    /signature verification failed/i,
  );
});
