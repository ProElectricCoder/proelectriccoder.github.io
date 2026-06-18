// Backend: /functions/api/save-drive.js
export async function onRequestPost(context) {
  const { request } = context;
  
  // 1. Get the data and the user's token from the frontend
  const data = await request.json();
  const authHeader = request.headers.get('Authorization'); // The user's access token

  // 2. Prepare the metadata (file name) for Google Drive
  const metadata = {
    name: data.name,
    mimeType: 'text/plain' // Or whatever language the file is (e.g., text/html, application/json)
  };

  // 3. Google Drive requires a "Multipart" upload for files + metadata
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    data.content +
    close_delim;

  // 4. Send it to Google Drive
  const googleDriveResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': multipartRequestBody.length.toString()
    },
    body: multipartRequestBody
  });

  const driveResult = await googleDriveResponse.json();

  // 5. Send the success back to your frontend!
  return new Response(JSON.stringify({ success: true, id: driveResult.id }), {
    headers: { "Content-Type": "application/json" }
  });
}
