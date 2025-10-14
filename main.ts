// api.ts - FIXED VERSION
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

// Read ALL environment variables
const SCRIPT_PARTS = [
    Deno.env.get("SCRIPT_PART1"),
    Deno.env.get("SCRIPT_PART2"), 
    Deno.env.get("SCRIPT_PART3"),
    Deno.env.get("SCRIPT_PART4"),
    Deno.env.get("SCRIPT_PART5"),
    Deno.env.get("SCRIPT_PART6"),
    Deno.env.get("SCRIPT_PART7"),
    Deno.env.get("SCRIPT_PART8")
];

console.log("=== ENVIRONMENT VARIABLES ===");
SCRIPT_PARTS.forEach((part, index) => {
    console.log(`PART${index + 1}:`, part ? `${part.length} chars` : "NOT SET");
});

const ORIGINAL_SCRIPT = SCRIPT_PARTS.filter(part => part).join('\n');

console.log("TOTAL SCRIPT LENGTH:", ORIGINAL_SCRIPT.length);

// Fallback script
const FALLBACK_SCRIPT = `
print("Iris Hub - Environment Variables Issue")
print("If you see this, the environment variables are not being read properly")
`;

function getScript(): string {
    return ORIGINAL_SCRIPT.length > 1000 ? ORIGINAL_SCRIPT : FALLBACK_SCRIPT;
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

    // DEBUG ENDPOINT - This will show what's happening
    if (url.pathname === '/debug' && req.method === 'GET') {
        const debugInfo = {
            total_length: ORIGINAL_SCRIPT.length,
            using_fallback: ORIGINAL_SCRIPT.length <= 1000,
            parts: SCRIPT_PARTS.map((part, index) => ({
                name: `SCRIPT_PART${index + 1}`,
                length: part ? part.length : 0,
                set: !!part,
                preview: part ? part.substring(0, 50) + '...' : 'NOT SET'
            }))
        };
        return Response.json(debugInfo, { headers: corsHeaders });
    }

    const kv = await Deno.openKv();

    try {
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

            const scriptContent = getScript();
            return new Response(scriptContent, {
                headers: { 'Content-Type': 'text/plain', ...corsHeaders },
            });
        }

        // Root endpoint
        if (url.pathname === '/' && req.method === 'GET') {
            return Response.json({ 
                message: 'NapsyScript API',
                status: 'running',
                storage: 'deno-kv-persistent',
                script_source: 'environment-variable',
                script_loaded: ORIGINAL_SCRIPT.length > 1000
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
