// Backend: /functions/api/save-drive.js
//
// Rewritten to be binary-safe and to support Drive's upload-time conversion
// (used by the new "Edit in Docs/Sheets/Slides" buttons): the frontend always
// sends base64-encoded raw bytes plus the file's actual format
// (sourceMimeType) and, optionally, a different Google-native target format
// (targetMimeType, e.g. "application/vnd.google-apps.document") — when the
// two differ, Drive converts the uploaded bytes to that native type
// automatically. The multipart body is built from raw Uint8Array/Blob pieces
// rather than string concatenation, so it can't corrupt binary content (the
// previous version forced `Content-Type: text/plain` and string-concatenated
// the body, which only worked for plain text).
export async function onRequestPost(context) {
  const { request } = context;

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return new Response('Missing Authorization header', { status: 401 });
  if (!data?.name || typeof data.contentBase64 !== 'string') {
    return new Response('Missing name or contentBase64', { status: 400 });
  }

  const sourceMimeType = data.sourceMimeType || 'application/octet-stream';
  const targetMimeType = data.targetMimeType || sourceMimeType;
  const metadata = { name: data.name, mimeType: targetMimeType };

  const boundary = '-------314159265358979323846';
  const encoder  = new TextEncoder();

  const metaPart = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}` +
    `\r\n--${boundary}\r\nContent-Type: ${sourceMimeType}\r\n\r\n`
  );
  const closePart = encoder.encode(`\r\n--${boundary}--`);

  let fileBytes;
  try {
    const binStr = atob(data.contentBase64);
    fileBytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) fileBytes[i] = binStr.charCodeAt(i);
  } catch {
    return new Response('Invalid base64 content', { status: 400 });
  }

  const body = new Blob([metaPart, fileBytes, closePart]);

  try {
    const driveResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    const driveResult = await driveResponse.json();

    if (!driveResponse.ok) {
      return new Response(JSON.stringify({ success: false, error: driveResult }), {
        status: driveResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, id: driveResult.id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}