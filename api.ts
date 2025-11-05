// api.ts - Professional Lunith branding
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Api-Key",
};

// Your script content - Lunith branding
const SCRIPT_CONTENT = `print("Lunith Loader Initialized")

-- Main script logic
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

if LocalPlayer then
    print("Lunith loaded for:", LocalPlayer.Name)
end

return "Lunith loaded successfully"`;

// HTML for key.napsy.dev - Clean professional design
const keySiteHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lunith - Key Activation</title>
    <style>
        body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            max-width: 600px; 
            margin: 50px auto; 
            padding: 20px; 
            background: #0f0f0f; 
            color: #e0e0e0; 
            line-height: 1.6;
        }
        .container { 
            background: #1a1a1a; 
            padding: 30px; 
            border-radius: 8px; 
            border: 1px solid #333; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h1 { 
            color: #7289da; 
            margin-bottom: 10px;
            font-weight: 600;
        }
        button { 
            padding: 14px; 
            margin: 15px 0; 
            border: none; 
            border-radius: 6px; 
            width: 100%; 
            box-sizing: border-box; 
            background: #7289da; 
            color: white; 
            cursor: pointer; 
            font-weight: 600;
            font-size: 16px;
            transition: background 0.2s;
        }
        button:hover { 
            background: #5b73c4; 
        }
        button:disabled { 
            background: #444; 
            cursor: not-allowed; 
        }
        .key-display { 
            background: #0f0f0f; 
            padding: 15px; 
            border-radius: 6px; 
            margin: 15px 0; 
            font-family: 'Courier New', monospace; 
            word-break: break-all;
            border: 1px solid #333;
            font-size: 14px;
        }
        .success { 
            color: #43b581; 
            padding: 10px;
            background: rgba(67, 181, 129, 0.1);
            border-radius: 4px;
            margin: 10px 0;
        }
        .error { 
            color: #f04747; 
            padding: 10px;
            background: rgba(240, 71, 71, 0.1);
            border-radius: 4px;
            margin: 10px 0;
        }
        .hidden { display: none; }
        .info-text {
            color: #888;
            font-size: 14px;
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Lunith Key System</h1>
        <p>Complete the verification process to generate your activation key.</p>
        
        <div id="workinkSection">
            <button onclick="startWorkInk()" id="workinkBtn">Begin Verification</button>
            <p class="info-text">This will generate a unique key tied to your connection.</p>
        </div>
        
        <div id="keySection" class="hidden">
            <div class="success">Verification complete! Your key has been generated:</div>
            <div class="key-display" id="generatedKey">Generating...</div>
            <button onclick="copyKey()">Copy Key to Clipboard</button>
            <p class="info-text">Use this key in our Discord server with the !activate command to receive your loader.</p>
        </div>
    </div>

    <script>
        async function startWorkInk() {
            const btn = document.getElementById('workinkBtn');
            btn.disabled = true;
            btn.textContent = 'Processing...';
            
            try {
                const response = await fetch('/workink', { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    document.getElementById('workinkSection').classList.add('hidden');
                    document.getElementById('keySection').classList.remove('hidden');
                    document.getElementById('generatedKey').textContent = result.key;
                } else {
                    alert('Error: ' + result.error);
                    btn.disabled = false;
                    btn.textContent = 'Begin Verification';
                }
            } catch (error) {
                alert('Network error: ' + error.message);
                btn.disabled = false;
                btn.textContent = 'Begin Verification';
            }
        }
        
        function copyKey() {
            const key = document.getElementById('generatedKey').textContent;
            navigator.clipboard.writeText(key).then(() => {
                alert('Key copied to clipboard successfully.');
            });
        }
    </script>
</body>
</html>`;

// HTML for api.napsy.dev - Clean professional design
const apiSiteHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lunith API</title>
    <style>
        body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px; 
            text-align: center; 
            background: #0f0f0f; 
            color: #e0e0e0; 
        }
        .container { 
            background: #1a1a1a; 
            padding: 40px; 
            border-radius: 8px; 
            border: 1px solid #333; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h1 { 
            color: #7289da; 
            margin-bottom: 10px;
            font-weight: 600;
        }
        .status { 
            color: #43b581; 
            font-weight: 600;
            margin: 20px 0;
        }
        a {
            color: #7289da;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Lunith API</h1>
        <p class="status">Status: Online</p>
        <p>Secure script delivery service</p>
        <p><a href="https://key.napsy.dev">Get your activation key</a></p>
    </div>
</body>
</html>`;

// Utility functions remain the same
function jsonResponse(data: any, status = 200) {
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

// Main handler remains the same as previous version
export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const hostname = url.hostname;
  const clientIP = getClientIP(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // KEY.NAPSY.DEV - Key System
    if (hostname === 'key.napsy.dev') {
      if (url.pathname === '/' && req.method === 'GET') {
        return new Response(keySiteHtml, { 
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } 
        });
      }

      if (url.pathname === '/workink' && req.method === 'POST') {
        const key = generateFormattedKey();
        
        const kv = await Deno.openKv();
        const keyData = {
          key,
          created_at: Date.now(),
          activated: false,
          workink_completed: true,
          workink_data: {
            ip: clientIP,
            user_agent: req.headers.get('user-agent') || 'unknown',
            completed_at: Date.now()
          }
        };
        
        await kv.set(["keys", key], keyData);
        await kv.close();
        
        return jsonResponse({
          success: true,
          key: key,
          message: "Verification completed successfully"
        });
      }

      if (url.pathname === '/health' && req.method === 'GET') {
        return jsonResponse({ 
          status: 'online', 
          service: 'key-system',
          domain: 'key.napsy.dev'
        });
      }

      return new Response("Not found", { status: 404 });
    }

    // API.NAPSY.DEV - Script API
    if (hostname === 'api.napsy.dev') {
      if (url.pathname === '/' && req.method === 'GET') {
        return new Response(apiSiteHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      if (url.pathname === '/health' && req.method === 'GET') {
        return jsonResponse({ 
          status: 'online', 
          service: 'script-api',
          domain: 'api.napsy.dev',
          timestamp: new Date().toISOString()
        });
      }

      if (url.pathname.startsWith('/scripts/') && req.method === 'GET') {
        const token = url.pathname.split('/')[2];
        if (!token) return new Response("Token required", { status: 400 });

        const kv = await Deno.openKv();
        const data = await kv.get(["token", token]);
        await kv.close();
        
        if (!data.value) return new Response("Token not found", { status: 404 });
        
        if (data.value.expires_at < Date.now()) {
          const kv = await Deno.openKv();
          await kv.delete(["token", token]);
          await kv.close();
          return new Response("Token expired", { status: 410 });
        }

        return new Response(SCRIPT_CONTENT, {
          headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
        });
      }

      // Key activation (Discord bot only)
      if (url.pathname === '/activate' && req.method === 'POST') {
        const body = await req.json();
        const { key, discord_id, discord_username } = body;
        
        if (!key || !discord_id) {
          return jsonResponse({ error: 'Key and discord_id required' }, 400 );
        }

        const kv = await Deno.openKv();
        const entry = await kv.get(['keys', key]);
        
        if (!entry.value) {
          await kv.close();
          return jsonResponse({ error: 'Invalid key' }, 404);
        }

        const keyData = entry.value;
        
        if (!keyData.workink_completed) {
          await kv.close();
          return jsonResponse({ error: 'Key not verified' }, 401);
        }

        if (keyData.activated) {
          await kv.close();
          return jsonResponse({ 
            error: 'Key already activated',
            activation_data: keyData.activation_data
          }, 409);
        }

        // Generate script token
        const scriptToken = generateToken();
        const expiresAt = Date.now() + TOKEN_TTL_MS;
        
        // Store script token with user info
        await kv.set(['token', scriptToken], {
          user_id: discord_id,
          username: discord_username || 'Unknown',
          expires_at: expiresAt,
          created_at: Date.now(),
          key: key,
          activation_ip: keyData.workink_data.ip
        });

        // Activate the key with user info
        keyData.activated = true;
        keyData.script_token = scriptToken;
        keyData.activation_data = {
          ip: keyData.workink_data.ip,
          discord_id: discord_id,
          discord_username: discord_username || 'Unknown',
          activated_at: Date.now()
        };
        
        await kv.set(['keys', key], keyData);
        await kv.close();

        return jsonResponse({
          success: true,
          key: key,
          script_token: scriptToken,
          script_url: `https://api.napsy.dev/scripts/${scriptToken}`,
          activation_data: keyData.activation_data,
          message: 'Key activated successfully'
        });
      }

      // Check key status
      if (url.pathname === '/check-key' && req.method === 'GET') {
        const apiKey = req.headers.get('X-Admin-Api-Key');
        if (apiKey !== ADMIN_API_KEY) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        const key = url.searchParams.get('key');
        if (!key) {
          return jsonResponse({ error: 'Key parameter required' }, 400);
        }

        const kv = await Deno.openKv();
        const entry = await kv.get(['keys', key]);
        await kv.close();

        if (!entry.value) {
          return jsonResponse({ error: 'Key not found' }, 404);
        }

        return jsonResponse({ key: entry.value });
      }

      return new Response("Not found", { status: 404 });
    }

    return new Response("Lunith Service", { headers: corsHeaders });

  } catch (err) {
    console.error("Server error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

// For local development
if (import.meta.main) {
  console.log("Server starting locally...");
  Deno.serve(handler, { port: 8000 });
}
