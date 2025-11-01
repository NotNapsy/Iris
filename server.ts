import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import {
  generateToken,
  jsonResponse,
  corsHeaders,
  TOKEN_TTL_MS,
  ADMIN_API_KEY,
} from "./utils.ts";
import { getScript } from "./loader.ts";

// Embed the HTML directly as a template literal
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Script Service</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 40px;
            border-radius: 15px;
            text-align: center;
            margin-top: 50px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        h1 {
            font-size: 2.5em;
            margin-bottom: 20px;
        }
        .feature {
            background: rgba(255, 255, 255, 0.2);
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Script Service</h1>
        <p>Secure temporary script delivery service</p>
        
        <div class="feature">
            <strong>🔒 Secure Tokens</strong>
            <p>Each script URL expires after 24 hours for enhanced security</p>
        </div>
        
        <div class="feature">
            <strong>🤖 Discord Integration</strong>
            <p>Generate unique script URLs through our Discord bot</p>
        </div>
        
        <div class="feature">
            <strong>⚡ Fast Delivery</strong>
            <p>Built with Deno for maximum performance and reliability</p>
        </div>
        
        <p><em>Authorized users only - Use the Discord bot to access scripts</em></p>
    </div>
</body>
</html>`;

serve(async (req) => {
  const url = new URL(req.url);
  let kv: Deno.Kv | null = null;

  try {
    kv = await Deno.openKv();

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ---------- LANDING PAGE ----------
    if (url.pathname === "/" && req.method === "GET") {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    // Optional health check route
    if (url.pathname === "/health") {
      return new Response("OK", { headers: corsHeaders });
    }

    // ---------- FETCH SCRIPT ----------
    if (url.pathname.startsWith("/scripts/") && req.method === "GET") {
      const token = url.pathname.split("/")[2];
      if (!token) return new Response("Token required", { status: 400 });

      const entry = await kv.get(["token", token]);
      if (!entry.value) return new Response("Token not found", { status: 404 });

      const data = entry.value as any;
      if (data.expires_at < Date.now()) {
        await kv.delete(["token", token]);
        return new Response("Token expired", { status: 410 });
      }

      return new Response(getScript(), {
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // ---------- ADMIN: PUBLISH SCRIPT ----------
    if (url.pathname === "/publishScript" && req.method === "POST") {
      const apiKey = req.headers.get("X-Admin-Api-Key");
      if (apiKey !== ADMIN_API_KEY)
        return jsonResponse({ error: "Unauthorized" }, 401);

      const body = await req.json();
      if (!body?.discord_userid)
        return jsonResponse({ error: "discord_userid required" }, 400);

      const token = generateToken();
      const expiresAt = Date.now() + TOKEN_TTL_MS;

      await kv.set(["token", token], {
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
      { error: "Internal server error", details: err.message },
      500
    );
  } finally {
    kv?.close();
  }
});
