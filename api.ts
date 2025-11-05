// api.ts - Polished Lunith branding
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

// HTML for key.napsy.dev - Polished professional design
const keySiteHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lunith - Key Activation</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body { 
            font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; 
            max-width: 600px; 
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
            color: #e8e8e8;
            line-height: 1.6;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .container { 
            background: rgba(25, 25, 25, 0.95);
            padding: 40px 35px;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            width: 100%;
        }
        
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .logo h1 { 
            color: #7289da;
            font-size: 2.2rem;
            font-weight: 700;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        }
        
        .logo p {
            color: #888;
            font-size: 1.1rem;
        }
        
        .section {
            margin: 30px 0;
        }
        
        button { 
            padding: 16px 24px;
            margin: 20px 0 10px;
            border: none;
            border-radius: 12px;
            width: 100%;
            background: linear-gradient(135deg, #7289da 0%, #5b73c4 100%);
            color: white;
            cursor: pointer;
            font-weight: 600;
            font-size: 16px;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        }
        
        button:hover { 
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(114, 137, 218, 0.3);
        }
        
        button:active {
            transform: translateY(0);
        }
        
        button:disabled { 
            background: #444;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        .key-display { 
            background: rgba(15, 15, 15, 0.8);
            padding: 20px;
            border-radius: 12px;
            margin: 20px 0;
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            word-break: break-all;
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 15px;
            text-align: center;
            font-weight: 600;
            letter-spacing: 1px;
            color: #7289da;
        }
        
        .success { 
            color: #43b581;
            padding: 16px;
            background: rgba(67, 181, 129, 0.1);
            border-radius: 10px;
            margin: 20px 0;
            border-left: 4px solid #43b581;
            font-weight: 500;
        }
        
        .error { 
            color: #f04747;
            padding: 16px;
            background: rgba(240, 71, 71, 0.1);
            border-radius: 10px;
            margin: 20px 0;
            border-left: 4px solid #f04747;
            font-weight: 500;
        }
        
        .hidden { 
            display: none;
        }
        
        .info-text {
            color: #aaa;
            font-size: 14px;
            line-height: 1.5;
            margin: 12px 0;
        }
        
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
            margin: 25px 0;
        }
        
        .step {
            display: flex;
            align-items: center;
            margin: 15px 0;
            padding: 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
        }
        
        .step-number {
            background: #7289da;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            margin-right: 12px;
            flex-shrink: 0;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .loading {
            animation: pulse 1.5s ease-in-out infinite;
        }
    </style>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>Lunith</h1>
            <p>Key Activation System</p>
        </div>
        
        <div class="section">
            <p>Generate your unique activation key to access Lunith services.</p>
        </div>
        
        <div id="workinkSection">
            <div class="step">
                <div class="step-number">1</div>
                <div>
                    <strong>Start Verification</strong>
                    <div class="info-text">This creates a key tied to your connection for security.</div>
                </div>
            </div>
            
            <button onclick="startWorkInk()" id="workinkBtn">
                Begin Verification Process
            </button>
        </div>
        
        <div id="keySection" class="hidden">
            <div class="success">
                <strong>Verification Complete</strong>
                <div>Your activation key has been generated successfully.</div>
            </div>
            
            <div class="step">
                <div class="step-number">2</div>
                <div>
                    <strong>Your Activation Key</strong>
                    <div class="info-text">Copy this key for the next step.</div>
                </div>
            </div>
            
            <div class="key-display" id="generatedKey">Generating your key...</div>
            
            <button onclick="copyKey()" id="copyBtn">
                Copy Key to Clipboard
            </button>
            
            <div class="step">
                <div class="step-number">3</div>
                <div>
                    <strong>Activate in Discord</strong>
                    <div class="info-text">Use the !activate command in our Discord server with this key to receive your loader.</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        async function startWorkInk() {
            const btn = document.getElementById('workinkBtn');
            const originalText = btn.textContent;
            
            btn.disabled = true;
            btn.textContent = 'Processing Verification...';
            btn.classList.add('loading');
            
            try {
                const response = await fetch('/workink', { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    document.getElementById('workinkSection').classList.add('hidden');
                    document.getElementById('keySection').classList.remove('hidden');
                    document.getElementById('generatedKey').textContent = result.key;
                    
                    // Auto-copy to clipboard
                    navigator.clipboard.writeText(result.key).then(() => {
                        document.getElementById('copyBtn').textContent = '✓ Copied Successfully';
                        setTimeout(() => {
                            document.getElementById('copyBtn').textContent = 'Copy Key to Clipboard';
                        }, 2000);
                    });
                } else {
                    alert('Verification failed: ' + result.error);
                    resetButton(btn, originalText);
                }
            } catch (error) {
                alert('Network error: ' + error.message);
                resetButton(btn, originalText);
            }
        }
        
        function resetButton(btn, text) {
            btn.disabled = false;
            btn.textContent = text;
            btn.classList.remove('loading');
        }
        
        function copyKey() {
            const key = document.getElementById('generatedKey').textContent;
            const btn = document.getElementById('copyBtn');
            
            navigator.clipboard.writeText(key).then(() => {
                btn.textContent = '✓ Copied Successfully';
                btn.style.background = 'linear-gradient(135deg, #43b581 0%, #369a6d 100%)';
                
                setTimeout(() => {
                    btn.textContent = 'Copy Key to Clipboard';
                    btn.style.background = 'linear-gradient(135deg, #7289da 0%, #5b73c4 100%)';
                }, 2000);
            });
        }
    </script>
</body>
</html>`;

// HTML for api.napsy.dev - Polished design
const apiSiteHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lunith API</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body { 
            font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
            color: #e8e8e8;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .container { 
            background: rgba(25, 25, 25, 0.95);
            padding: 50px 40px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(10px);
            text-align: center;
            width: 100%;
        }
        
        h1 { 
            color: #7289da;
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 16px;
            letter-spacing: -1px;
        }
        
        .status { 
            color: #43b581;
            font-weight: 600;
            font-size: 1.2rem;
            margin: 25px 0;
            padding: 12px 24px;
            background: rgba(67, 181, 129, 0.1);
            border-radius: 10px;
            display: inline-block;
        }
        
        .description {
            color: #aaa;
            font-size: 1.1rem;
            line-height: 1.6;
            margin: 25px 0;
            max-width: 500px;
            margin-left: auto;
            margin-right: auto;
        }
        
        a {
            color: #7289da;
            text-decoration: none;
            font-weight: 600;
            transition: color 0.2s ease;
            border-bottom: 2px solid transparent;
            padding-bottom: 2px;
        }
        
        a:hover {
            color: #8ba1e8;
            border-bottom-color: #7289da;
        }
        
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
            margin: 30px auto;
            width: 200px;
        }
    </style>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <h1>Lunith</h1>
        <div class="status">API Status: Online</div>
        <div class="description">
            Secure script delivery and key management system serving Lunith services.
        </div>
        <div class="divider"></div>
        <p>
            <a href="https://key.napsy.dev">Get your activation key</a>
        </p>
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

// Main handler remains the same
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
