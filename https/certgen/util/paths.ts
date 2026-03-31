import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Certificate authority
export function getDefaultBuildCaPath(cwd = process.cwd()) {
  return resolve(cwd, "build-ca");
}

export function getCaPrivateKeyPath(buildCaPath: string) {
  return join(buildCaPath, "ca-private-key.key");
}

export function getRootCaCertPath(buildCaPath: string) {
  return join(buildCaPath, "ca-root.crt");
}

// Issued certificates.
export function getDefaultBuildIssuedCertPath(cwd = process.cwd()) {
  return resolve(cwd, "build-issued-cert");
}

export function getIssuedCertPrivateKeyPath(buildIssuedCertPath: string) {
  return join(buildIssuedCertPath, "private-key.key");
}

export function getIssuedCertCsrPath(buildIssuedCertPath: string) {
  return join(buildIssuedCertPath, "cert.csr");
}

export function getIssuedCertPath(buildIssuedCertPath: string) {
  return join(buildIssuedCertPath, "cert.crt");
}

export function getIssuedCertExtensionsPath(buildIssuedCertPath: string) {
  return join(buildIssuedCertPath, "cert-v3.ext");
}

// Trust store related.
export function getLoginKeychainPath(homeDirectory = homedir()) {
  return join(homeDirectory, "Library", "Keychains", "login.keychain-db");
}
