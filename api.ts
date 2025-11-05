// api.ts - Updated to work with key system
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { handleKeyRequest } from "./keys.ts";
import { ADMIN_API_KEY, corsHeaders, generateToken, jsonResponse } from "./config.ts";

// Your existing script content
const SCRIPT_CONTENT = `print("Hello from Iris Hub!")

-- Your main script logic here
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

if LocalPlayer then
    print("Iris Hub loaded for player:", LocalPlayer.Name)
end

return "Iris Hub loaded successfully"`;

// HTML content
const indexHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Iris Hub API</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; text-align: center; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <h1>🚀 Iris Hub API</h1>
    <p>Secure script delivery service is running!</p>
    <p><a href="https://key.napsy.dev" target="_blank">Get your activation key</a></p>
</body>
</html>`;

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Route key requests to key system
    if (url.hostname === 'key.napsy.dev' || url.pathname.startsWith('/key-')) {
      return await handleKeyRequest(req);
    }

    // Your existing routes
    if (url.pathname === "/" && req.method === "GET") {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    if (url.pathname === "/health") {
      return new Response("OK", { headers: corsHeaders });
    }

    if (url.pathname.startsWith("/scripts/") && req.method === "GET") {
      const token = url.pathname.split("/")[2];
      if (!token) return new Response("Token required", { status: 400 });

      const kv = await Deno.openKv();
      const data = await kv.get(["token", token]);
      await kv.close();
      
      if (!data.value) return new Response("Token not found", { status: 404 });
      if (data.value.expires_at < Date.now()) {
        await kv.delete(["token", token]);
        return new Response("Token expired", { status: 410 });
      }

      return new Response(SCRIPT_CONTENT, {
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    if (url.pathname === "/publishScript" && req.method === "POST") {
      const apiKey = req.headers.get("X-Admin-Api-Key");
      if (apiKey !== ADMIN_API_KEY) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      let body;
      try {
        body = await req.json();
      } catch (error) {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }

      if (!body?.discord_userid) {
        return jsonResponse({ error: "discord_userid required" }, 400);
      }

      const token = generateToken();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000);

      const kv = await Deno.openKv();
      await kv.set(["token", token], {
        user_id: body.discord_userid,
        expires_at: expiresAt,
        created_at: Date.now(),
      });
      await kv.close();

      const scriptUrl = `https://api.napsy.dev/scripts/${token}`;
      const loadstringStr = `loadstring(game:HttpGet("${scriptUrl}"))()`;

      return jsonResponse({
        success: true,
        script_url: scriptUrl,
        loadstring: loadstringStr,
        expires_at: new Date(expiresAt).toISOString(),
      });
    }

    return new Response("Not found", { status: 404 });
  } catch (err) {
    console.error("Server error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

console.log("Server starting...");
serve(handler, { port: 8000 });
