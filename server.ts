import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// Configuration
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const KEY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours for unactivated keys
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

// GitHub repository configuration
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";
const REPO_OWNER = "NotNapsy"; // Replace with your GitHub username
const REPO_NAME = "Iris"; // Replace with your repository name
const REPO_BRANCH = "main"; // Replace with your branch name

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Api-Key",
};

// Load HTML files from GitHub
async function loadHtmlFromGitHub(filename: string): Promise<string> {
  try {
    const url = `${GITHUB_RAW_BASE}/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${filename}`;
    console.log(`Fetching HTML from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error(`Failed to load ${filename} from GitHub:`, error);
    
    // Fallback HTML content
    if (filename === 'key.html') {
      return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lunith - Key System</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Inter', sans-serif; 
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
            color: #e8e8e8; min-height: 100vh;
            display: flex; align-items: center; justify-content: center;
        }
        .container { 
            background: rgba(25, 25, 25, 0.95); padding: 40px;
            border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1);
            text-align: center; max-width: 500px; width: 90%;
        }
        h1 { color: #7289da; margin-bottom: 20px; }
        p { color: #aaa; margin-bottom: 20px; }
        .error { color: #f04747; background: rgba(240, 71, 71, 0.1); 
                padding: 15px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Lunith Key System</h1>
        <div class="error">
            Failed to load full interface. Please check the GitHub repository configuration.
        </div>
        <p>Key management system for Lunith services.</p>
    </div>
</body>
</html>`;
    } else {
      return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lunith API</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
            color: #e8e8e8; min-height: 100vh;
            display: flex; align-items: center; justify-content: center;
        }
        .container { 
            background: rgba(25, 25, 25, 0.95); padding: 40px;
            border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1);
            text-align: center; max-width: 500px; width: 90%;
        }
        h1 { color: #7289da; margin-bottom: 16px; }
        .status { color: #43b581; font-weight: 600; margin: 20px 0; }
        .error { color: #f04747; background: rgba(240, 71, 71, 0.1); 
                padding: 15px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Lunith API</h1>
        <div class="status">API Status: Online</div>
        <div class="error">
            Failed to load full interface. Please check the GitHub repository configuration.
        </div>
        <p>Secure script delivery and key management system.</p>
    </div>
</body>
</html>`;
    }
  }
}

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

// Helper functions for key management
function generateFormattedKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 16; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${key.slice(0, 4)}-${key.slice(4, 8)}-${key.slice(8, 12)}-${key.slice(12)}`;
}

function getClientIP(req: Request): string {
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  return cfConnectingIP || xForwardedFor?.split(',')[0] || 'unknown';
}

interface UserSession {
  ip: string;
  user_agent: string;
  last_active: number;
  current_key?: string;
  keys_generated: string[];
  linked_discord_ids: string[];
  privacy_agreed: boolean;
  age_verified: boolean;
}

async function getUserSession(kv: any, ip: string, userAgent: string): Promise<UserSession> {
  const sessionId = `session:${ip}:${btoa(userAgent).slice(0, 16)}`;
  const entry = await kv.get(["sessions", sessionId]);
  
  if (entry.value) {
    const session = entry.value as UserSession;
    session.last_active = Date.now();
    await kv.set(["sessions", sessionId], session);
    return session;
  }
  
  const newSession: UserSession = {
    ip,
    user_agent: userAgent,
    last_active: Date.now(),
    keys_generated: [],
    linked_discord_ids: [],
    privacy_agreed: false,
    age_verified: false
  };
  
  await kv.set(["sessions", sessionId], newSession);
  return newSession;
}

async function updateUserSession(kv: any, ip: string, userAgent: string, newKey?: string, privacyAgreed?: boolean, ageVerified?: boolean): Promise<UserSession> {
  const session = await getUserSession(kv, ip, userAgent);
  
  if (newKey) {
    session.current_key = newKey;
    session.keys_generated = [newKey];
  }
  
  if (privacyAgreed !== undefined) session.privacy_agreed = privacyAgreed;
  if (ageVerified !== undefined) session.age_verified = ageVerified;
  
  const sessionId = `session:${ip}:${btoa(userAgent).slice(0, 16)}`;
  await kv.set(["sessions", sessionId], session);
  
  return session;
}

// Main server handler
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const hostname = url.hostname || req.headers.get('host')?.split(':')[0] || '';
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Subdomain routing for HTML pages
    if (url.pathname === "/" && req.method === "GET") {
      let htmlContent: string;
      
      // Check subdomain and load appropriate HTML from GitHub
      if (hostname.startsWith('key.')) {
        console.log("Loading key.html from GitHub for key subdomain");
        htmlContent = await loadHtmlFromGitHub('key.html');
      } else if (hostname.startsWith('api.')) {
        console.log("Loading api.html from GitHub for api subdomain");
        htmlContent = await loadHtmlFromGitHub('api.html');
      } else {
        // Default to API page if no specific subdomain
        console.log("Loading api.html from GitHub for default domain");
        htmlContent = await loadHtmlFromGitHub('api.html');
      }
      
      return new Response(htmlContent, {
        headers: { 
          "Content-Type": "text/html; charset=utf-8", 
          ...corsHeaders 
        },
      });
    }

    // Health check
    if (url.pathname === "/health") {
      return jsonResponse({ 
        status: "online", 
        service: "lunith-key-system",
        timestamp: new Date().toISOString(),
        github_repo: `${REPO_OWNER}/${REPO_NAME}`,
        domain: hostname
      });
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

      const scriptUrl = `https://${hostname}/scripts/${token}`;
      const loadstringStr = `loadstring(game:HttpGet("${scriptUrl}"))()`;

      return jsonResponse({
        success: true,
        script_url: scriptUrl,
        loadstring: loadstringStr,
        expires_at: new Date(expiresAt).toISOString(),
      });
    }

    // WorkInk verification - Generate Key
    if (url.pathname === "/workink" && req.method === "POST") {
      const kv = await getKv();
      const clientIP = getClientIP(req);
      const userAgent = req.headers.get('user-agent') || 'unknown';
      
      let body;
      try {
        body = await req.json();
      } catch (error) {
        return jsonResponse({ error: "Invalid JSON in request body" }, 400);
      }

      const { privacy_agreed, age_verified } = body;
      
      if (!privacy_agreed || !age_verified) {
        return jsonResponse({ 
          error: "You must agree to the privacy policy and age verification to generate a key." 
        }, 403);
      }
      
      // Update session with privacy agreement
      await updateUserSession(kv, clientIP, userAgent, undefined, true, true);
      
      // Check if user already has a valid key
      const session = await getUserSession(kv, clientIP, userAgent);
      if (session.current_key && kv) {
        const keyEntry = await kv.get(["keys", session.current_key]);
        if (keyEntry.value && (keyEntry.value as any).expires_at > Date.now()) {
          if (kv) await kv.close();
          return jsonResponse({ 
            error: "You already have an active key. Please wait until it expires to generate a new one.",
            current_key: session.current_key,
            expires_at: (keyEntry.value as any).expires_at
          }, 409);
        }
      }
      
      const key = generateFormattedKey();
      const expiresAt = Date.now() + KEY_EXPIRY_MS;
      
      const keyData = {
        key,
        created_at: Date.now(),
        expires_at: expiresAt,
        activated: false,
        workink_completed: true,
        workink_data: {
          ip: clientIP,
          user_agent: userAgent,
          completed_at: Date.now(),
          session_id: `session:${clientIP}:${btoa(userAgent).slice(0, 16)}`,
          privacy_agreed: true,
          age_verified: true
        }
      };
      
      if (kv) {
        await kv.set(["keys", key], keyData);
        await updateUserSession(kv, clientIP, userAgent, key);
        await kv.close();
      }
      
      return jsonResponse({
        success: true,
        key: key,
        expires_at: new Date(expiresAt).toISOString(),
        message: "Verification completed successfully"
      });
    }

    // User Panel - Get session info
    if (url.pathname === "/user-panel" && req.method === "GET") {
      const kv = await getKv();
      const clientIP = getClientIP(req);
      const userAgent = req.headers.get('user-agent') || 'unknown';
      
      const session = await getUserSession(kv, clientIP, userAgent);
      const currentKey = session.current_key;
      
      let keyInfo = null;
      if (currentKey && kv) {
        const keyEntry = await kv.get(["keys", currentKey]);
        if (keyEntry.value) keyInfo = keyEntry.value;
      }
      
      if (kv) await kv.close();
      
      return jsonResponse({
        success: true,
        session: { 
          ip: session.ip, 
          keys_generated: session.keys_generated.length, 
          last_active: session.last_active,
          current_key: session.current_key, 
          privacy_agreed: session.privacy_agreed, 
          age_verified: session.age_verified 
        },
        current_key: keyInfo ? { 
          key: (keyInfo as any).key, 
          activated: (keyInfo as any).activated, 
          created_at: (keyInfo as any).created_at,
          expires_at: (keyInfo as any).expires_at, 
          renewed_at: (keyInfo as any).renewed_at, 
          renewal_count: (keyInfo as any).renewal_count || 0 
        } : null,
        can_renew: keyInfo ? (keyInfo as any).expires_at < Date.now() : false
      });
    }

    // Renew Key
    if (url.pathname === "/renew" && req.method === "POST") {
      const kv = await getKv();
      const clientIP = getClientIP(req);
      const userAgent = req.headers.get('user-agent') || 'unknown';
      
      const session = await getUserSession(kv, clientIP, userAgent);
      
      if (!session.current_key) {
        if (kv) await kv.close();
        return jsonResponse({ error: "No existing key found. Please generate a new key first." }, 400);
      }
      
      const currentKey = session.current_key;
      const keyEntry = kv ? await kv.get(["keys", currentKey]) : null;
      const keyData = keyEntry?.value;
      
      if (!keyData) {
        if (kv) await kv.close();
        return jsonResponse({ error: "Key data not found. Please generate a new key." }, 404);
      }
      
      // Reset expiration dates
      const newExpiresAt = Date.now() + KEY_EXPIRY_MS;
      (keyData as any).expires_at = newExpiresAt;
      (keyData as any).renewed_at = Date.now();
      (keyData as any).renewal_count = ((keyData as any).renewal_count || 0) + 1;
      
      if (kv) {
        await kv.set(["keys", currentKey], keyData);
        await kv.close();
      }
      
      return jsonResponse({
        success: true, 
        key: currentKey, 
        expires_at: new Date(newExpiresAt).toISOString(),
        is_renewal: true, 
        renewal_count: (keyData as any).renewal_count, 
        message: "Key renewed successfully - expiration reset to 24 hours"
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
console.log("Lunith Key System Server starting...");
console.log("GitHub Repository:", `${REPO_OWNER}/${REPO_NAME}`);
console.log("Server running on port 8000");

serve(handler, { port: 8000 });
