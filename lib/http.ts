import "server-only";

export class RequestInputError extends Error {
  constructor(message: string, readonly status: 400 | 413 = 400) {
    super(message);
    this.name = "RequestInputError";
  }
}

export async function readJson<T>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new RequestInputError("El cuerpo de la petición excede 64 KB.", 413);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new RequestInputError("El cuerpo de la petición excede 64 KB.", 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestInputError("JSON malformado.");
  }
}
