// Load .env when there is one (Node's built-in loader; real environment variables win).
try {
  process.loadEnvFile();
} catch {
  // No .env: use the environment as it is (local dev broker by default).
}
