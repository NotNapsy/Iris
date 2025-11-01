import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// Configuration
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Api-Key",
};

// HTML content
const indexHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Script Service</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; text-align: center; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <h1>🚀 Script Service</h1>
    <p>Secure script delivery service is running!</p>
</body>
</html>`;

// Script content
const SCRIPT_CONTENT = `print("Hello from Script Service!")

-- Your main script logic here
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

if LocalPlayer then
    print("Script executed for player:", LocalPlayer.Name)
end

return "Script loaded successfully"`;

// In-memory token storage (fallback when KV is not available)
const tokenStore = new Map<string, { user_id: string; expires_at: number; created_at: number }>();

// Utility functions
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function generateToken(length = 20): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let token = "";
  for (let i = 0; i < length; i++) {
    token += chars[randomBytes[i] % chars.length];
  }
  return token;
}

async function getKv() {
  try {
    return await Deno.openKv();
  } catch (error) {
    console.warn("KV not available, using in-memory storage:", error.message);
    return null;
  }
}

async function getToken(token: string) {
  const kv = await getKv();
  if (kv) {
    try {
      const entry = await kv.get(["token", token]);
      await kv.close();
      return entry.value;
    } catch (error) {
      await kv.close();
      return tokenStore.get(token);
    }
  }
  return tokenStore.get(token);
}

async function setToken(token: string, data: any) {
  const kv = await getKv();
  if (kv) {
    try {
      await kv.set(["token", token], data);
      await kv.close();
    } catch (error) {
      await kv.close();
      tokenStore.set(token, data);
    }
  } else {
    tokenStore.set(token, data);
  }
}

async function deleteToken(token: string) {
  const kv = await getKv();
  if (kv) {
    try {
      await kv.delete(["token", token]);
      await kv.close();
    } catch (error) {
      await kv.close();
    }
  }
  tokenStore.delete(token);
}

// Main server handler
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Landing page
    if (url.pathname === "/" && req.method === "GET") {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response("OK", { headers: corsHeaders });
    }

    // Fetch script
    if (url.pathname.startsWith("/scripts/") && req.method === "GET") {
      const token = url.pathname.split("/")[2];
      if (!token) return new Response("Token required", { status: 400 });

      const data = await getToken(token);
      if (!data) return new Response("Token not found", { status: 404 });

      if (data.expires_at < Date.now()) {
        await deleteToken(token);
        return new Response("Token expired", { status: 410 });
      }

      return new Response(SCRIPT_CONTENT, {
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // Publish script
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
      const expiresAt = Date.now() + TOKEN_TTL_MS;

      await setToken(token, {
        user_id: body.discord_userid,
        expires_at: expiresAt,
        created_at: Date.now(),
      });

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
    return jsonResponse(
      { error: "Internal server error" },
      500
    );
  }
}

// Start server
console.log("Server starting...");
serve(handler, { port: 8000 });
