import * as jose from 'npm:jose';

export async function onRequest({ request, env, params }) {
	const url = new URL(request.url);
	const token = url.searchParams.get('token');

	if (!token) {
		return new Response("Unauthorized: Missing token", { status: 401 });
	}

	try {
		const projectId = "proelectriccoder"; 
		
		const JWKS = jose.createRemoteJWKSet(
			new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
		);
		
		await jose.jwtVerify(token, JWKS, {
			issuer: `https://securetoken.google.com/${projectId}`,
			audience: projectId,
		});
	} catch (error) {
		return new Response("Forbidden: Invalid token", { status: 403 });
	}

	if (request.headers.get("Upgrade") !== "websocket") {
		return new Response("Expected WebSocket upgrade", { status: 426 });
	}

	const { roomId } = params;
	const id = env.ROOM_DO.idFromName(roomId);
	const obj = env.ROOM_DO.get(id);

	return obj.fetch(request);
}
