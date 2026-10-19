// Save the TimescaleDB (Tiger Cloud) server's root CA to certs/tiger-ca.pem, without logging in.
// The free Tiger Cloud service presents a certificate from Timescale's own CA (ca.timescale.com),
// which is not in Node's public CA store. The ingestion service trusts this one CA only, so the
// connection is still verified (signature and host name), not just encrypted.
// Run again if connections start failing with certificate errors (the CA is renewed before it expires).
//
//   node scripts/fetch-db-ca.mjs        reads DATABASE_URL from .env

import { writeFileSync } from "node:fs";
import net from "node:net";
import tls from "node:tls";

try {
  process.loadEnvFile();
} catch {}
const url = new URL(process.env.DATABASE_URL ?? "");
const out = new URL("../certs/tiger-ca.pem", import.meta.url);

const sock = net.connect(Number(url.port), url.hostname, () => {
  const sslRequest = Buffer.alloc(8);
  sslRequest.writeInt32BE(8, 0);
  sslRequest.writeInt32BE(80877103, 4);
  sock.write(sslRequest);
});
sock.once("data", (answer) => {
  if (answer.toString() !== "S") throw new Error("The server does not offer TLS");
  const s = tls.connect({ socket: sock, servername: url.hostname, rejectUnauthorized: false }, () => {
    let cert = s.getPeerCertificate(true);
    while (cert.issuerCertificate && cert.issuerCertificate.fingerprint256 !== cert.fingerprint256) cert = cert.issuerCertificate;
    if (cert.subject.CN !== cert.issuer.CN) throw new Error(`The server did not send its root CA (top of chain: ${cert.subject.CN})`);
    const pem = `-----BEGIN CERTIFICATE-----\n${cert.raw.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
    writeFileSync(out, pem);
    console.log(`Saved ${cert.subject.CN} (${cert.subject.O}) to certs/tiger-ca.pem`);
    console.log(`  valid until ${cert.valid_to}`);
    console.log(`  SHA-256 ${cert.fingerprint256}`);
    s.end();
  });
});
