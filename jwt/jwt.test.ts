import assert from "node:assert/strict";
import test from "node:test";

import {
  EncryptJWT,
  SignJWT,
  calculateJwkThumbprint,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  jwtDecrypt,
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


test("jose encrypts and decrypts A256GCM JWT (symmetric)", async () => {
  const encryptionSecret = textEncoder.encode("0123456789abcdef0123456789abcdef");

  const encryptedJwt = await new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .encrypt(encryptionSecret);

  const { payload: decrypted } = await jwtDecrypt(encryptedJwt, encryptionSecret);

  assert.equal(decrypted.sub, payload.sub);
  assert.equal(decrypted.role, payload.role);
  assert.equal(typeof decrypted.iat, "number");
  assert.equal(typeof decrypted.exp, "number");
});


test("jose encrypts and decrypts RSA-OAEP-256 JWT (asymmetric) using a JWKS", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RSA-OAEP-256", {
    extractable: true,
  });
  const privateJwk = await exportJWK(privateKey);
  const kid = await calculateJwkThumbprint(privateJwk);

  const encryptedJwt = await new EncryptJWT(payload)
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .encrypt(publicKey);

  const jwks = createLocalJWKSet({
    keys: [
      {
        ...privateJwk,
        kid,
        alg: "RSA-OAEP-256",
        use: "enc",
        key_ops: ["decrypt"],
      },
    ],
  });

  // @ts-expect-error jose types for jwtDecrypt/getKey are narrower than runtime usage here
  const { payload: decrypted } = await jwtDecrypt(encryptedJwt, jwks);

  assert.equal(decrypted.sub, payload.sub);
  assert.equal(decrypted.role, payload.role);
  assert.equal(typeof decrypted.iat, "number");
  assert.equal(typeof decrypted.exp, "number");
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
