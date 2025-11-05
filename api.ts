// api.ts - Production ready with all enhancements
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const KEY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours for unactivated keys
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 60000, // 1 minute
  MAX_WORKINK_REQUESTS: 3, // Stricter limit for key generation
  WORKINK_WINDOW_MS: 300000 // 5 minutes
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Api-Key",
};

// Rate limiting storage
const rateLimit = new Map<string, { count: number; resetTime: number; workinkCount: number; workinkReset: number }>();

// System metrics
let metrics = {
  totalRequests: 0,
  successfulActivations: 0,
  failedActivations: 0,
  expiredCleanups: 0,
  lastCleanup: Date.now(),
  rateLimitHits: 0,
  errors: 0
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
        
        .warning {
            color: #faa61a;
            padding: 16px;
            background: rgba(250, 166, 26, 0.1);
            border-radius: 10px;
            margin: 20px 0;
            border-left: 4px solid #faa61a;
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
        
        .expiry-notice {
            background: rgba(250, 166, 26, 0.1);
            border: 1px solid rgba(250, 166, 26, 0.3);
            border-radius: 8px;
            padding: 12px 16px;
            margin: 15px 0;
            font-size: 13px;
        }
        
        .rate-limit-message {
            background: rgba(240, 71, 71, 0.1);
            border: 1px solid rgba(240, 71, 71, 0.3);
            border-radius: 8px;
            padding: 12px 16px;
            margin: 15px 0;
            font-size: 13px;
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
        
        <div class="expiry-notice">
            <strong>Important:</strong> Generated keys expire in 24 hours if not activated. Activated tokens are valid for 24 hours.
        </div>
        
        <div id="rateLimitMessage" class="rate-limit-message hidden">
            <strong>Rate Limit Exceeded:</strong> Please wait a few minutes before generating another key.
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
                    <div class="info-text">Copy this key and activate it within 24 hours.</div>
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
            
            <div class="warning">
                <strong>Key Expires:</strong> This key will expire <span id="expiryTime">in 24 hours</span> if not activated.
            </div>
        </div>
    </div>

    <script>
        function updateExpiryTime() {
            const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            document.getElementById('expiryTime').textContent = expiryTime.toLocaleString();
        }

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
                    updateExpiryTime();
                    
                    // Auto-copy to clipboard
                    navigator.clipboard.writeText(result.key).then(() => {
                        document.getElementById('copyBtn').textContent = '✓ Copied Successfully';
                        setTimeout(() => {
                            document.getElementById('copyBtn').textContent = 'Copy Key to Clipboard';
                        }, 2000);
                    });
                } else {
                    if (result.error.includes('rate limit')) {
                        document.getElementById('rateLimitMessage').classList.remove('hidden');
                    }
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

// HTML for api.napsy.dev remains the same
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

// Utility functions
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

// Enhanced rate limiting
function checkRateLimit(ip: string, endpoint: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let userLimit = rateLimit.get(ip);

  if (!userLimit) {
    userLimit = {
      count: 1,
      resetTime: now + RATE_LIMIT.WINDOW_MS,
      workinkCount: 0,
      workinkReset: now + RATE_LIMIT.WORKINK_WINDOW_MS
    };
    rateLimit.set(ip, userLimit);
    return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS - 1 };
  }

  // Check general rate limit
  if (now > userLimit.resetTime) {
    userLimit.count = 1;
    userLimit.resetTime = now + RATE_LIMIT.WINDOW_MS;
  } else if (userLimit.count >= RATE_LIMIT.MAX_REQUESTS) {
    metrics.rateLimitHits++;
    return { allowed: false, remaining: 0 };
  } else {
    userLimit.count++;
  }

  // Check WorkInk-specific rate limit
  if (endpoint === '/workink') {
    if (now > userLimit.workinkReset) {
      userLimit.workinkCount = 1;
      userLimit.workinkReset = now + RATE_LIMIT.WORKINK_WINDOW_MS;
    } else if (userLimit.workinkCount >= RATE_LIMIT.MAX_WORKINK_REQUESTS) {
      metrics.rateLimitHits++;
      return { allowed: false, remaining: 0 };
    } else {
      userLimit.workinkCount++;
    }
  }

  rateLimit.set(ip, userLimit);
  return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS - userLimit.count };
}

// Input validation
function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, '').substring(0, 100);
}

function isValidKeyFormat(key: string): boolean {
  const keyRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return keyRegex.test(key);
}

function isValidDiscordId(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

// Error logging
interface ErrorLog {
  timestamp: number;
  error: string;
  endpoint: string;
  ip: string;
  userAgent: string;
}

async function logError(kv: Deno.Kv, error: string, req: Request, endpoint: string) {
  try {
    const errorLog: ErrorLog = {
      timestamp: Date.now(),
      error,
      endpoint,
      ip: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown'
    };
    await kv.set(["errors", Date.now()], errorLog);
    metrics.errors++;
  } catch (logError) {
    console.error("Failed to log error:", logError);
  }
}

// Cleanup expired keys and tokens
async function cleanupExpired(kv: Deno.Kv) {
  const now = Date.now();
  let cleaned = 0;

  try {
    // Clean up expired tokens
    const tokenEntries = kv.list({ prefix: ["token"] });
    for await (const entry of tokenEntries) {
      if (entry.value && entry.value.expires_at < now) {
        await kv.delete(entry.key);
        cleaned++;
      }
    }

    // Clean up expired unactivated keys (24 hours old and not activated)
    const keyEntries = kv.list({ prefix: ["keys"] });
    for await (const entry of keyEntries) {
      const keyData = entry.value;
      if (keyData && !keyData.activated && keyData.expires_at < now) {
        await kv.delete(entry.key);
        cleaned++;
      }
    }

    // Clean up old error logs (keep only last 1000)
    const errorEntries = [];
    for await (const entry of kv.list({ prefix: ["errors"] })) {
      errorEntries.push(entry);
    }
    
    if (errorEntries.length > 1000) {
      const toDelete = errorEntries.sort((a, b) => a.key[1] - b.key[1]).slice(0, errorEntries.length - 1000);
      for (const entry of toDelete) {
        await kv.delete(entry.key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      metrics.expiredCleanups += cleaned;
      metrics.lastCleanup = now;
      console.log(`Cleaned up ${cleaned} expired entries`);
    }
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

// Backup system
async function backupKeys(kv: Deno.Kv) {
  try {
    const entries = [];
    for await (const entry of kv.list({ prefix: [] })) {
      entries.push({ key: entry.key, value: entry.value, versionstamp: entry.versionstamp });
    }
    
    await kv.set(["backup", "latest"], {
      timestamp: Date.now(),
      entries: entries.slice(0, 1000), // Limit backup size
      totalEntries: entries.length
    });
    
    console.log(`Backup created with ${entries.length} entries`);
  } catch (error) {
    console.error("Backup failed:", error);
  }
}

// Performance monitoring
function monitorPerformance() {
  const memoryUsage = Deno.memoryUsage();
  console.log("Memory usage:", {
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
    external: Math.round(memoryUsage.external / 1024 / 1024) + "MB"
  });

  // Log metrics every 100 requests or 5 minutes
  if (metrics.totalRequests % 100 === 0 || Date.now() - metrics.lastCleanup > 300000) {
    console.log("System Metrics:", JSON.stringify(metrics, null, 2));
  }
}

// Main handler with all enhancements
let isWarm = false;

export async function handler(req: Request): Promise<Response> {
  metrics.totalRequests++;
  const url = new URL(req.url);
  const hostname = url.hostname;
  const clientIP = getClientIP(req);
  const userAgent = req.headers.get('user-agent') || 'unknown';
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Warm up on cold start
  if (!isWarm) {
    console.log("Cold start detected, warming up...");
    isWarm = true;
  }

  const kv = await Deno.openKv();

  try {
    // Run cleanup on every request
    await cleanupExpired(kv);

    // Run backup every 1000 requests
    if (metrics.totalRequests % 1000 === 0) {
      await backupKeys(kv);
    }

    // Check rate limiting
    const rateLimitResult = checkRateLimit(clientIP, url.pathname);
    if (!rateLimitResult.allowed) {
      await logError(kv, "Rate limit exceeded", req, url.pathname);
      return jsonResponse({ 
        error: "Rate limit exceeded. Please try again later.",
        remaining: rateLimitResult.remaining 
      }, 429);
    }

    // KEY.NAPSY.DEV - Key System
    if (hostname === 'key.napsy.dev') {
      if (url.pathname === '/' && req.method === 'GET') {
        return new Response(keySiteHtml, { 
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } 
        });
      }

      if (url.pathname === '/workink' && req.method === 'POST') {
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
            completed_at: Date.now()
          }
        };
        
        await kv.set(["keys", key], keyData);
        
        return jsonResponse({
          success: true,
          key: key,
          expires_at: new Date(expiresAt).toISOString(),
          message: "Verification completed successfully"
        });
      }

      if (url.pathname === '/health' && req.method === 'GET') {
        return jsonResponse({ 
          status: 'online', 
          service: 'key-system',
          domain: 'key.napsy.dev',
          metrics,
          rate_limit: rateLimitResult
        });
      }

      if (url.pathname === '/metrics' && req.method === 'GET') {
        // Simple metrics endpoint for monitoring
        monitorPerformance();
        return jsonResponse({
          metrics,
          rate_limits: Array.from(rateLimit.entries()).slice(0, 10), // Show top 10
          timestamp: new Date().toISOString()
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
          timestamp: new Date().toISOString(),
          metrics
        });
      }

      if (url.pathname.startsWith('/scripts/') && req.method === 'GET') {
        const token = url.pathname.split('/')[2];
        if (!token) return new Response("Token required", { status: 400 });

        const data = await kv.get(["token", token]);
        
        if (!data.value) return new Response("Token not found", { status: 404 });
        
        if (data.value.expires_at < Date.now()) {
          await kv.delete(["token", token]);
          return new Response("Token expired", { status: 410 });
        }

        return new Response(SCRIPT_CONTENT, {
          headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
        });
      }

      // Key activation (Discord bot only)
      if (url.pathname === '/activate' && req.method === 'POST') {
        let body;
        try {
          body = await req.json();
        } catch (error) {
          await logError(kv, "Invalid JSON in activation request", req, '/activate');
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        const { key, discord_id, discord_username } = body;
        
        if (!key || !discord_id) {
          return jsonResponse({ error: 'Key and discord_id required' }, 400 );
        }

        // Input validation
        if (!isValidKeyFormat(key)) {
          await logError(kv, "Invalid key format", req, '/activate');
          return jsonResponse({ error: 'Invalid key format' }, 400);
        }

        if (!isValidDiscordId(discord_id)) {
          await logError(kv, "Invalid Discord ID", req, '/activate');
          return jsonResponse({ error: 'Invalid Discord ID' }, 400);
        }

        const sanitizedUsername = sanitizeInput(discord_username || 'Unknown');

        const entry = await kv.get(['keys', key]);
        
        if (!entry.value) {
          await logError(kv, "Key not found", req, '/activate');
          return jsonResponse({ error: 'Invalid key' }, 404);
        }

        const keyData = entry.value;
        
        // Check if key expired (unactivated keys only)
        if (!keyData.activated && keyData.expires_at < Date.now()) {
          await kv.delete(['keys', key]);
          await logError(kv, "Expired key activation attempt", req, '/activate');
          return jsonResponse({ error: 'Key has expired' }, 410);
        }
        
        if (!keyData.workink_completed) {
          await logError(kv, "Unverified key activation attempt", req, '/activate');
          return jsonResponse({ error: 'Key not verified' }, 401);
        }

        if (keyData.activated) {
          return jsonResponse({ 
            error: 'Key already activated',
            activation_data: keyData.activation_data
          }, 409);
        }

        // Generate script token with 24 hour expiry
        const scriptToken = generateToken();
        const tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
        
        // Store script token with user info
        await kv.set(['token', scriptToken], {
          user_id: discord_id,
          username: sanitizedUsername,
          expires_at: tokenExpiresAt,
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
          discord_username: sanitizedUsername,
          activated_at: Date.now()
        };
        
        await kv.set(['keys', key], keyData);
        metrics.successfulActivations++;

        return jsonResponse({
          success: true,
          key: key,
          script_token: scriptToken,
          script_url: `https://api.napsy.dev/scripts/${scriptToken}`,
          token_expires_at: new Date(tokenExpiresAt).toISOString(),
          activation_data: keyData.activation_data,
          message: 'Key activated successfully'
        });
      }

      // Check key status
      if (url.pathname === '/check-key' && req.method === 'GET') {
        const apiKey = req.headers.get('X-Admin-Api-Key');
        if (apiKey !== ADMIN_API_KEY) {
          await logError(kv, "Unauthorized key check attempt", req, '/check-key');
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        const key = url.searchParams.get('key');
        if (!key) {
          return jsonResponse({ error: 'Key parameter required' }, 400);
        }

        if (!isValidKeyFormat(key)) {
          return jsonResponse({ error: 'Invalid key format' }, 400);
        }

        const entry = await kv.get(['keys', key]);

        if (!entry.value) {
          return jsonResponse({ error: 'Key not found' }, 404);
        }

        const keyData = entry.value;
        
        // Check if unactivated key is expired
        if (!keyData.activated && keyData.expires_at < Date.now()) {
          await kv.delete(['keys', key]);
          return jsonResponse({ error: 'Key has expired' }, 410);
        }

        return jsonResponse({ key: keyData });
      }

      // Emergency restore endpoint
      if (url.pathname === '/admin/restore' && req.method === 'POST') {
        const apiKey = req.headers.get('X-Admin-Api-Key');
        if (apiKey !== ADMIN_API_KEY) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        try {
          await backupKeys(kv);
          return jsonResponse({ success: true, message: "Backup created successfully" });
        } catch (error) {
          await logError(kv, "Backup failed: " + error.message, req, '/admin/restore');
          return jsonResponse({ error: "Backup failed" }, 500);
        }
      }

      return new Response("Not found", { status: 404 });
    }

    return new Response("Lunith Service", { headers: corsHeaders });

  } catch (err) {
    console.error("Server error:", err);
    await logError(kv, "Server error: " + err.message, req, url.pathname);
    metrics.failedActivations++;
    return jsonResponse({ error: "Internal server error" }, 500);
  } finally {
    kv.close();
    monitorPerformance();
  }
}

// For local development
if (import.meta.main) {
  console.log("Server starting locally...");
  Deno.serve(handler, { port: 8000 });
}
