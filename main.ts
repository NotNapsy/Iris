// api.ts - Simple file-based storage
const MASTER_SCRIPT = `
print("Hello from Napsy.dev!")
local player = game.Players.LocalPlayer
if player then
    player.Character.Humanoid.WalkSpeed = 50
    print("Walk speed set to 50 for " .. player.Name)
end
`;

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

// Simple in-memory storage with file backup
let tokenStore: Map<string, { user_id: string; script: string; expires_at: number }> = new Map();

function generateToken(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars[randomBytes[i] % chars.length];
  }
  return token;
}

// Initialize storage (try to load from file)
async function initializeStorage() {
  try {
    // Try to load existing tokens from file
    const data = await Deno.readTextFile('./tokens.json');
    const parsed = JSON.parse(data);
    tokenStore = new Map(Object.entries(parsed));
    console.log('Loaded tokens from storage');
  } catch (_error) {
    // File doesn't exist yet, start fresh
    tokenStore = new Map();
    console.log('Starting with fresh storage');
  }
}

// Save tokens to file
async function saveTokens() {
  try {
    const data = Object.fromEntries(tokenStore);
    await Deno.writeTextFile('./tokens.json', JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save tokens:', error);
  }
}

// Clean expired tokens
function cleanupTokens() {
  const now = Date.now();
  let cleaned = false;
  
  for (const [token, data] of tokenStore.entries()) {
    if (data.expires_at < now) {
      tokenStore.delete(token);
      cleaned = true;
    }
  }
  
  if (cleaned) {
    saveTokens(); // Save after cleanup
  }
}

// Initialize storage when the server starts
await initializeStorage();

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

  try {
    // Clean up expired tokens on each request
    cleanupTokens();

    // POST /publishScript
    if (url.pathname === '/publishScript' && req.method === 'POST') {
      const apiKey = req.headers.get('X-Admin-Api-Key');
      
      if (!apiKey || apiKey !== ADMIN_API_KEY) {
        return Response.json({ error: 'Unauthorized' }, { 
          status: 401, 
          headers: corsHeaders 
        });
      }

      const body = await req.json();
      
      if (!body?.discord_userid) {
        return Response.json({ error: 'discord_userid required' }, { 
          status: 400, 
          headers: corsHeaders 
        });
      }

      const token = generateToken();
      const expiresAt = Date.now() + TOKEN_TTL_MS;

      // Store in memory
      tokenStore.set(token, {
        user_id: body.discord_userid,
        script: MASTER_SCRIPT,
        expires_at: expiresAt,
      });

      // Save to file
      await saveTokens();

      const scriptUrl = `https://api.napsy.dev/scripts/${token}`;
      const loadstringStr = `loadstring(game:HttpGet("${scriptUrl}"))()`;

      return Response.json({
        success: true,
        script_url: scriptUrl,
        loadstring: loadstringStr,
        expires_at: new Date(expiresAt).toISOString(),
      }, { headers: corsHeaders });
    }

    // GET /scripts/:token
    if (url.pathname.startsWith('/scripts/') && req.method === 'GET') {
      const token = url.pathname.split('/')[2];
      
      if (!token) {
        return new Response('Token required', { status: 400 });
      }

      const entry = tokenStore.get(token);
      if (!entry) {
        return new Response('Token not found', { status: 404 });
      }

      if (entry.expires_at < Date.now()) {
        tokenStore.delete(token);
        await saveTokens();
        return new Response('Token expired', { status: 410 });
      }

      return new Response(entry.script, {
        headers: { 
          'Content-Type': 'text/plain',
          ...corsHeaders 
        },
      });
    }

    // Root endpoint
    if (url.pathname === '/' && req.method === 'GET') {
      return Response.json({ 
        message: 'NapsyScript API',
        status: 'running',
        storage: 'file-based',
        token_count: tokenStore.size,
        endpoints: {
          publish: 'POST /publishScript',
          get_script: 'GET /scripts/:token'
        }
      }, { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404 });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
});
