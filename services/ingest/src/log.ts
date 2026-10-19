// One line per event: JSON on Cloud Run (picked up by Cloud Logging with its severity), plain text locally.

const json = Boolean(process.env.K_SERVICE);

function write(severity: "INFO" | "WARNING" | "ERROR", message: string, fields?: Record<string, unknown>) {
  if (json) {
    console.log(JSON.stringify({ severity, message, ...fields }));
    return;
  }
  const mark = severity === "INFO" ? "·" : severity === "WARNING" ? "!" : "✗";
  const extra = fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : "";
  (severity === "ERROR" ? console.error : console.log)(`${mark} ${message}${extra}`);
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>) => write("INFO", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("WARNING", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("ERROR", message, fields),
};
