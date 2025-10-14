// api.ts - Fixed JSONBin version
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

// JSONBin configuration - Use v2 API with your key
const JSONBIN_API_KEY = "$2a$10$PZxjzjnml42hhjCg7M/QeOrU9HIM1wQbEs.gbMOz9wpvi5cJACdEu";
const JSONBIN_BIN_ID = "68ee9d9f43b1c97be96804b1";

function generateToken(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars[randomBytes[i] % chars.length];
  }
  return token;
}

// Store token in JSONBin
async function storeToken(token: string, user_id: string, expires_at: number) {
  // First, get the current data using v2 API
  const getResponse = await fetch(`https://api.jsonbin.io/v2/b/${JSONBIN_BIN_ID}/latest`, {
    headers: {
      'secret-key': JSONBIN_API_KEY
    }
  });
  
  let tokens = {};
  
  if (getResponse.ok) {
    const currentData = await getResponse.json();
    tokens = currentData || {};
  }
  
  // Add new token
  tokens[token] = {
    user_id,
    script: MASTER_SCRIPT,
    expires_at,
    created_at: Date.now()
  };
  
  // Update bin using v2 API
  const updateResponse = await fetch(`https://api.jsonbin.io/v2/b/${JSONBIN_BIN_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'secret-key': JSONBIN_API_KEY,
      'versioning': 'false'
    },
    body: JSON.stringify(tokens)
  });
  
  if (!updateResponse.ok) {
    throw new Error(`Failed to store token: ${updateResponse.status}`);
  }
  
  return await updateResponse.json();
}

// Get token from JSONBin - FIXED VERSION
async function getToken(token: string) {
  try {
    const response = await fetch(`https://api.jsonbin.io/v2/b/${JSONBIN_BIN_ID}/latest`, {
      headers: {
        'secret-key': JSONBIN_API_KEY
      }
    });
    
    if (!response.ok) {
      console.log('JSONBin response not OK:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('All tokens in bin:', Object.keys(data));
    
    const entry = data[token];
    console.log('Looking for token:', token);
    console.log('Found entry:', entry);
    
    return entry || null;
  } catch (error) {
    console.error('Error fetching token:', error);
    return null;
  }
}

// Clean expired tokens
async function cleanupTokens() {
  try {
    const response = await fetch(`https://api.jsonbin.io/v2/b/${JSONBIN_BIN_ID}/latest`, {
      headers: {
        'secret-key': JSONBIN_API_KEY
      }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    const tokens = data;
    const now = Date.now();
    let updated = false;
    
    // Remove expired tokens
    for (const [token, entry] of Object.entries(tokens)) {
      if ((entry as any).expires_at < now) {
        delete tokens[token];
        updated = true;
      }
    }
    
    if (updated) {
      await fetch(`https://api.jsonbin.io/v2/b/${JSONBIN_BIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'secret-key': JSONBIN_API_KEY,
          'versioning': 'false'
        },
        body: JSON.stringify(tokens)
      });
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
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

  try {
    // Clean up expired tokens
    await cleanupTokens();

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

      console.log('Storing token:', token);
      // Store in JSONBin
      await storeToken(token, body.discord_userid, expiresAt);
      console.log('Token stored successfully');

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

      console.log('Fetching token:', token);
      const entry = await getToken(token);
      console.log('Retrieved entry:', entry);
      
      if (!entry) {
        return new Response('Token not found', { status: 404 });
      }

      if (entry.expires_at < Date.now()) {
        return new Response('Token expired', { status: 410 });
      }

      return new Response(entry.script, {
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    }

    // Root endpoint
    if (url.pathname === '/' && req.method === 'GET') {
      return Response.json({ 
        message: 'NapsyScript API',
        status: 'running',
        storage: 'jsonbin-v2'
      }, { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404 });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
});
