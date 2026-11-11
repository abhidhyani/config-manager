/** Decodes base64 (as GitHub returns file content, with embedded newlines) into a UTF-8 string. */
export function decodeBase64Utf8(base64) {
  const binary = atob(String(base64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
