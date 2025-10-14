// api.ts - Using Deno KV with split environment variables
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

// Auto-generated script parts
const SCRIPT_PART1 = Deno.env.get("SCRIPT_PART1") || "";
const SCRIPT_PART2 = Deno.env.get("SCRIPT_PART2") || "";
const SCRIPT_PART3 = Deno.env.get("SCRIPT_PART3") || "";
const SCRIPT_PART4 = Deno.env.get("SCRIPT_PART4") || "";
const SCRIPT_PART5 = Deno.env.get("SCRIPT_PART5") || "";
const SCRIPT_PART6 = Deno.env.get("SCRIPT_PART6") || "";
const SCRIPT_PART7 = Deno.env.get("SCRIPT_PART7") || "";
const SCRIPT_PART8 = Deno.env.get("SCRIPT_PART8") || "";

// Debug logging
console.log("Environment variables loaded:");
const parts = [SCRIPT_PART1, SCRIPT_PART2, SCRIPT_PART3, SCRIPT_PART4, SCRIPT_PART5, SCRIPT_PART6, SCRIPT_PART7, SCRIPT_PART8];
parts.forEach((part, index) => {
  console.log(`PART${index + 1}: ${part.length} chars`);
});

const ORIGINAL_SCRIPT = parts.join('\n');
console.log(`Total script length: ${ORIGINAL_SCRIPT.length} chars`);

// Check if script is properly configured
function isScriptConfigured(): boolean {
  return ORIGINAL_SCRIPT.length > 1000; // Adjust this threshold based on your script size
}

// Simple obfuscation function - REPLACE WITH YOUR ACTUAL OBFUSCATION
function obfuscateScript(script: string): string {
  if (!script || script.length < 10) {
    return "-- Error: Script not properly configured in environment variables";
  }
  
  // Your actual obfuscation logic here
  let obfuscated = `-- OBFUSCATED SCRIPT --\n`;
  obfuscated += script;
  
  // Add garbage lines to reach ~30k
  for (let i = 0; i < 25000; i++) {
    obfuscated += `\n--${Math.random().toString(36).substring(2, 15)}--`;
  }
  
  return obfuscated;
}

function generateToken(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars[randomBytes[i] % chars.length];
  }
  return token;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Api-Key',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const kv = await Deno.openKv();

  try {
    // Clean up expired tokens
    const entries = kv.list({ prefix: ["token"] });
    const now = Date.now();
    
    for await (const entry of entries) {
      if (entry.value.expires_at < now) {
        await kv.delete(entry.key);
      }
    }

    // POST /publishScript
    if (url.pathname === '/publishScript' && req.method === 'POST') {
      const apiKey = req.headers.get('X-Admin-Api-Key');
      
      if (!apiKey || apiKey !== ADMIN_API_KEY) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }

      const body = await req.json();
      
      if (!body?.discord_userid) {
        return Response.json({ error: 'discord_userid required' }, { status: 400, headers: corsHeaders });
      }

      const token = generateToken();
      const expiresAt = Date.now() + TOKEN_TTL_MS;

      await kv.set(["token", token], {
        user_id: body.discord_userid,
        expires_at: expiresAt,
        created_at: Date.now()
      });

      const scriptUrl = `https://api.napsy.dev/scripts/${token}`;
      const loadstringStr = `loadstring(game:HttpGet("${scriptUrl}"))()`;

      return Response.json({
        success: true,
        script_url: scriptUrl,
        loadstring: loadstringStr,
        expires_at: new Date(expiresAt).toISOString(),
        script_configured: isScriptConfigured()
      }, { headers: corsHeaders });
    }

    // GET /scripts/:token
    if (url.pathname.startsWith('/scripts/') && req.method === 'GET') {
      const token = url.pathname.split('/')[2];
      
      if (!token) {
        return new Response('Token required', { status: 400 });
      }

      const entry = await kv.get(["token", token]);
      
      if (!entry.value) {
        return new Response('Token not found', { status: 404 });
      }

      const data = entry.value as any;
      
      if (data.expires_at < Date.now()) {
        await kv.delete(["token", token]);
        return new Response('Token expired', { status: 410 });
      }

      // Serve the script (obfuscated)
      const obfuscatedScript = obfuscateScript(ORIGINAL_SCRIPT);
      
      return new Response(obfuscatedScript, {
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    }

    // Debug endpoint to check environment variables
    if (url.pathname === '/debug' && req.method === 'GET') {
      return Response.json({
        script_configured: isScriptConfigured(),
        total_length: ORIGINAL_SCRIPT.length,
        parts: parts.map((part, index) => ({
          part: index + 1,
          length: part.length,
          preview: part.substring(0, 100) + '...'
        }))
      }, { headers: corsHeaders });
    }

    // Root endpoint
    if (url.pathname === '/' && req.method === 'GET') {
      return Response.json({ 
        message: 'NapsyScript API',
        status: 'running',
        script_configured: isScriptConfigured(),
        script_length: ORIGINAL_SCRIPT.length,
        endpoints: {
          'POST /publishScript': 'Create token (admin only)',
          'GET /scripts/:token': 'Get script with valid token',
          'GET /debug': 'Debug environment variables'
        }
      }, { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404 });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  } finally {
    kv.close();
  }
});
