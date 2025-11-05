// keys.ts - Integrated with your existing script system
import { ADMIN_API_KEY, corsHeaders, generateToken, jsonResponse } from "./config.ts";

interface KeyData {
  key: string;
  created_at: number;
  activated: boolean;
  activation_data?: {
    ip: string;
    discord_id?: string;
    hwid?: string;
    vmac?: string;
    activated_at: number;
  };
  workink_completed: boolean;
  workink_data?: {
    ip: string;
    user_agent: string;
    completed_at: number;
  };
  script_token?: string; // Link to your existing script system
}

// Get client IP
function getClientIP(req: Request): string {
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  return cfConnectingIP || xForwardedFor?.split(',')[0] || 'unknown';
}

// Generate formatted key
function generateFormattedKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 16; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${key.slice(0, 4)}-${key.slice(4, 8)}-${key.slice(8, 12)}-${key.slice(12)}`;
}

// HTML template for key.napsy.dev
const keySiteHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Iris Hub - Key Activation</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #1a1a1a; color: white; }
        .container { background: #2d2d2d; padding: 30px; border-radius: 10px; border: 1px solid #444; }
        input, button { padding: 12px; margin: 10px 0; border: none; border-radius: 5px; width: 100%; box-sizing: border-box; }
        input { background: #1a1a1a; color: white; border: 1px solid #444; }
        button { background: #7289da; color: white; cursor: pointer; font-weight: bold; }
        button:hover { background: #5b73c4; }
        .key-display { background: #1a1a1a; padding: 15px; border-radius: 5px; margin: 10px 0; font-family: monospace; word-break: break-all; }
        .success { color: #43b581; border-left: 4px solid #43b581; padding-left: 10px; }
        .error { color: #f04747; border-left: 4px solid #f04747; padding-left: 10px; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔑 Iris Hub Key System</h1>
        <p>Complete the WorkInk verification to get your activation key.</p>
        
        <div id="workinkSection">
            <button onclick="startWorkInk()" id="workinkBtn">Start WorkInk Verification</button>
        </div>
        
        <div id="keySection" class="hidden">
            <div class="success">✅ WorkInk completed! Your key:</div>
            <div class="key-display" id="generatedKey">Loading...</div>
            <button onclick="copyKey()">Copy Key</button>
            <p><small>Use this key in our Discord bot to get your loader.</small></p>
        </div>
    </div>

    <script>
        async function startWorkInk() {
            const btn = document.getElementById('workinkBtn');
            btn.disabled = true;
            btn.textContent = 'Verifying...';
            
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
                    btn.textContent = 'Start WorkInk Verification';
                }
            } catch (error) {
                alert('Network error: ' + error.message);
                btn.disabled = false;
                btn.textContent = 'Start WorkInk Verification';
            }
        }
        
        function copyKey() {
            const key = document.getElementById('generatedKey').textContent;
            navigator.clipboard.writeText(key).then(() => {
                alert('Key copied to clipboard!');
            });
        }
    </script>
</body>
</html>`;

// Main handler
export async function handleKeyRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const clientIP = getClientIP(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const kv = await Deno.openKv();

  try {
    // 🏠 Key website homepage
    if (url.pathname === '/' && req.method === 'GET') {
      return new Response(keySiteHtml, { 
        headers: { 'Content-Type': 'text/html', ...corsHeaders } 
      });
    }

    // 🔐 WorkInk verification
    if (url.pathname === '/workink' && req.method === 'POST') {
      const key = generateFormattedKey();
      
      const keyData: KeyData = {
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
      
      return jsonResponse({
        success: true,
        key: key,
        message: "WorkInk completed successfully"
      });
    }

    // 🤖 Discord Bot: Activate key and generate script token
    if (url.pathname === '/activate' && req.method === 'POST') {
      const body = await req.json();
      const { key, discord_id, hwid, vmac } = body;
      
      if (!key || !discord_id) {
        return jsonResponse({ error: 'Key and discord_id required' }, 400);
      }

      const entry = await kv.get(["keys", key]);
      if (!entry.value) {
        return jsonResponse({ error: 'Invalid key' }, 404);
      }

      const keyData = entry.value as KeyData;
      
      if (!keyData.workink_completed) {
        return jsonResponse({ error: 'Key not verified with WorkInk' }, 401);
      }

      if (keyData.activated) {
        return jsonResponse({ 
          error: 'Key already activated',
          activation_data: keyData.activation_data
        }, 409);
      }

      // Generate a script token for your existing system
      const scriptToken = generateToken();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      
      // Store in your existing token system
      await kv.set(["token", scriptToken], {
        user_id: discord_id,
        expires_at: expiresAt,
        created_at: Date.now(),
        key: key, // Link back to the key
        activation_ip: keyData.workink_data!.ip
      });

      // Activate the key
      keyData.activated = true;
      keyData.script_token = scriptToken;
      keyData.activation_data = {
        ip: keyData.workink_data!.ip,
        discord_id,
        hwid: hwid || null,
        vmac: vmac || null,
        activated_at: Date.now()
      };
      
      await kv.set(["keys", key], keyData);

      return jsonResponse({
        success: true,
        key: key,
        script_token: scriptToken,
        script_url: `https://api.napsy.dev/scripts/${scriptToken}`,
        activation_data: keyData.activation_data,
        message: "Key activated successfully"
      });
    }

    // 🔍 Check key status
    if (url.pathname === '/check' && req.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) {
        return jsonResponse({ error: 'Key parameter required' }, 400);
      }

      const entry = await kv.get(["keys", key]);
      if (!entry.value) {
        return jsonResponse({ error: 'Key not found' }, 404);
      }

      const keyData = entry.value as KeyData;
      return jsonResponse({ key: keyData });
    }

    // 🔧 Admin: Generate keys
    if (url.pathname === '/admin/generate' && req.method === 'POST') {
      const adminKey = req.headers.get('X-Admin-Api-Key');
      if (!adminKey || adminKey !== ADMIN_API_KEY) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      const body = await req.json();
      const { count = 1 } = body;
      
      const keys: string[] = [];
      
      for (let i = 0; i < count; i++) {
        const key = generateFormattedKey();
        const keyData: KeyData = {
          key,
          created_at: Date.now(),
          activated: false,
          workink_completed: false
        };
        
        await kv.set(["keys", key], keyData);
        keys.push(key);
      }

      return jsonResponse({ 
        success: true, 
        keys,
        count 
      });
    }

    // 🔄 Link to check script token (for your existing system)
    if (url.pathname === '/script-token' && req.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) {
        return jsonResponse({ error: 'Key parameter required' }, 400);
      }

      const entry = await kv.get(["keys", key]);
      if (!entry.value) {
        return jsonResponse({ error: 'Key not found' }, 404);
      }

      const keyData = entry.value as KeyData;
      if (!keyData.script_token) {
        return jsonResponse({ error: 'No script token associated' }, 404);
      }

      // Get the script token data from your existing system
      const scriptEntry = await kv.get(["token", keyData.script_token]);
      
      return jsonResponse({
        key: keyData.key,
        script_token: keyData.script_token,
        script_data: scriptEntry.value,
        activation_data: keyData.activation_data
      });
    }

    return jsonResponse({ error: 'Not found' }, 404);

  } catch (error) {
    console.error('Key system error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      details: error.message 
    }, 500);
  } finally {
    kv.close();
  }
}
