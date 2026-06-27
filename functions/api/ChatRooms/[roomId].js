import * as jose from 'https://esm.sh/jose@5';

export async function onRequest({ request, env, params }) {
	const url = new URL(request.url);
	const token = url.searchParams.get('token');

	if (!token) {
		return new Response("Unauthorized: Missing token", { status: 401 });
	}

	try {
		// Replace this with your actual Firebase Project ID
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

	async fetch(request) {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.state.acceptWebSocket(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws, message) {
		const targetSockets = this.state.getWebSockets();
		for (const socket of targetSockets) {
			if (socket !== ws) {
				try { socket.send(message); } catch {}
			}
		}
	}

	async webSocketClose(ws, code, reason, wasClean) {}
	async webSocketError(ws, error) {}
}
