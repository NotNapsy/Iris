import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { generateToken, jsonResponse, corsHeaders, TOKEN_TTL_MS, ADMIN_API_KEY } from "./utils.ts";
import { getScript } from "./loader.ts";

const SCRIPT_PARTS: string[] = []; // optional if you want to split scripts further

serve(async (req) => {
  const url = new URL(req.url);
  const kv = await Deno.openKv();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (url.pathname === "/" && req.method === "GET") {
  const githubUrl = "https://raw.githubusercontent.com/YOURUSERNAME/YOURREPO/main/index.html";

  try {
    const res = await fetch(githubUrl);
    if (!res.ok) {
      return new Response("Failed to load page from GitHub", { status: 500 });
    }
    const html = await res.text();
    return new Response(html, { headers: { "Content-Type": "text/html", ...corsHeaders } });
  } catch (err) {
    console.error("Error fetching GitHub page:", err);
    return new Response("Error fetching page", { status: 500 });
  }
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

      return new Response(getScript(), { headers: { "Content-Type": "text/plain", ...corsHeaders } });
    }

    // ---------- ADMIN: PUBLISH SCRIPT ----------
    if (url.pathname === "/publishScript" && req.method === "POST") {
      const apiKey = req.headers.get("X-Admin-Api-Key");
      if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: "Unauthorized" }, 401);

      const body = await req.json();
      if (!body?.discord_userid) return jsonResponse({ error: "discord_userid required" }, 400);

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
    console.error("Error:", err);
    return jsonResponse({ error: "Internal server error", details: err.message }, 500);
  } finally {
    kv.close();
  }
});
