// Backend: /functions/api/read-drive.js
export async function onRequestPost(context) {
  const { request } = context;
  
  // 1. Grab the fileId from the frontend request and the Token from the headers
  const data = await request.json();
  const fileId = data.fileId;
  const authHeader = request.headers.get('Authorization'); 

  // 2. Fetch the file content from Google Drive
  // Note the "?alt=media" at the end. This tells Google to return the actual file text, 
  // not just the file metadata (like creation date).
  const googleDriveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    method: 'GET',
    headers: {
      'Authorization': authHeader
    }
  });

  if (!googleDriveResponse.ok) {
    return new Response("Failed to fetch file from Drive", { status: 500 });
  }

  // 3. Read the text from the file
  const fileContent = await googleDriveResponse.text();

  // 4. Send the code back to the frontend to be displayed in DeepBlue IDE
  return new Response(JSON.stringify({ success: true, content: fileContent }), {
    headers: { "Content-Type": "application/json" }
  });
}
