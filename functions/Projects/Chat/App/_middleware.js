// functions/Projects/Chat/App/_middleware.js

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const roomId = url.searchParams.get("invite");
  
  // If there is no invite token in the URL, continue loading the page normally
  if (!roomId) {
    return next();
  }

  // Fallback room name in case the network request fails or the room doesn't exist
  let chatName = "a Private Session"; 

  try {
    const FIREBASE_PROJECT_ID = "proelectriccoder"; 
    
    // Official Google Firestore REST API endpoint for fetching a document
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/chatRooms/${roomId}`;
    
    const dbResponse = await fetch(firestoreUrl);
    
    if (dbResponse.ok) {
      const docData = await dbResponse.json();
      
      // Drilling into your requested path: chatRooms/{id}/meta/name
      // Google Firestore wraps nested maps inside mapValue, and strings inside stringValue
      if (docData?.fields?.meta?.mapValue?.fields?.name?.stringValue) {
        chatName = docData.fields.meta.mapValue.fields.name.stringValue;
      }
    }
  } catch (error) {
    console.error("Firestore REST fetch failed:", error);
  }

  // Fetch the static index.html from your Cloudflare Pages repository
  const response = await next();

  // Prepare the rich presentation layers
  const imageUrl = `${url.origin}/Favicon.svg`; 
  const ogTitle = `💬 Join ${chatName} on ChatRooms`;
  const ogDescription = `You have been invited to a secure, peer-to-peer conversation.\n\n🔑 Room ID: ${roomId}\nTap this link to enter the room instantly.`;

  // Inject meta tags seamlessly at the edge before serving the page to social bots
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        // Standard Open Graph Data (WhatsApp, Discord, Telegram, iMessage)
        element.append(`<meta property="og:title" content="${ogTitle}" />`, { html: true });
        element.append(`<meta property="og:description" content="${ogDescription}" />`, { html: true });
        element.append(`<meta property="og:type" content="website" />`, { html: true });
        element.append(`<meta property="og:url" content="${url.href}" />`, { html: true });
        element.append(`<meta property="og:image" content="${imageUrl}" />`, { html: true });
        element.append(`<meta property="og:site_name" content="DeepBlue ChatRooms" />`, { html: true });

        // Twitter/X Cards (Ensures formatting matches Slack and Twitter perfectly)
        element.append(`<meta name="twitter:card" content="summary" />`, { html: true });
        element.append(`<meta name="twitter:title" content="${ogTitle}" />`, { html: true });
        element.append(`<meta name="twitter:description" content="${ogDescription}" />`, { html: true });
        element.append(`<meta name="twitter:image" content="${imageUrl}" />`, { html: true });

        // Sidebar Embed Color (Adds a sharp blue bar accent to the Discord embed snippet card)
        element.append(`<meta name="theme-color" content="#007BFF" />`, { html: true });
      },
    })
    .transform(response);
}
