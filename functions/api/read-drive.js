export async function onRequestPost(context) {
  const { request } = context;
  
  try {
    // 1. Get the fileId and the access token sent from your frontend
    const { fileId } = await request.json();
    const accessToken = request.headers.get("Authorization");

    if (!fileId || !accessToken) {
      return new Response("Missing fileId or Token", { status: 400 });
    }

    // 2. Fetch the file content from Google Drive
    // The "?alt=media" part is REQUIRED to download the actual file contents
    const driveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, 
      {
        method: "GET",
        headers: {
          "Authorization": accessToken // Pass the token straight to Google
        }
      }
    );

    if (!driveResponse.ok) {
      const errorText = await driveResponse.text();
      return new Response(`Drive API Error: ${errorText}`, { status: driveResponse.status });
    }

    // 3. Read the code/text content and send it back to your IDE
    const fileContent = await driveResponse.text();

    return new Response(JSON.stringify({ success: true, content: fileContent }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
