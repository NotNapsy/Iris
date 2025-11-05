// api.ts - Production ready with all enhancements
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const KEY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours for unactivated keys
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";
const SUPER_ADMINS = ['']; 

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 60000, // 1 minute
  MAX_WORKINK_REQUESTS: 3, // Stricter limit for key generation
  WORKINK_WINDOW_MS: 300000 // 5 minutes
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
  errors: 0,
  blacklistChecks: 0,
  refills: 0
};

// Enhanced Blacklist System
interface BlacklistEntry {
  discord_id: string;
  ip: string;
  hwid?: string; // For future use
  vmac?: string; // For future use
  user_agent?: string;
  reason: string;
  created_at: number;
  expires_at?: number;
  created_by: string;
  identifiers: string[]; // All tracked identifiers
}

// User Session Management
// Enhanced User Session with linked Discord IDs
interface UserSession {
  ip: string;
  user_agent: string;
  last_active: number;
  current_key?: string;
  keys_generated: string[];
  linked_discord_ids: string[]; // Track Discord IDs that used this session
}

// Your script content - Lunith branding
const SCRIPT_CONTENT = `print("Lunith Loader Initialized")

-- Main script logic
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

if LocalPlayer then
    print("Lunith loaded for:", LocalPlayer.Name)
end

return "Lunith loaded successfully"`;

// Parse duration string (1Y, 1W, 1D, 1H, 1M, 1S)
function parseDuration(durationStr: string): number | null {
  const regex = /(\d+)([YWMDS])/gi;
  let totalMs = 0;
  let match;

  while ((match = regex.exec(durationStr)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
      case 'Y': totalMs += value * 365 * 24 * 60 * 60 * 1000; break;
      case 'W': totalMs += value * 7 * 24 * 60 * 60 * 1000; break;
      case 'D': totalMs += value * 24 * 60 * 60 * 1000; break;
      case 'H': totalMs += value * 60 * 60 * 1000; break;
      case 'M': totalMs += value * 60 * 1000; break;
      case 'S': totalMs += value * 1000; break;
      default: return null;
    }
  }

  return totalMs > 0 ? totalMs : null;
}

// Get all identifiers from a request/key data
function getAllIdentifiers(discordId: string, ip: string, userAgent: string, keyData?: any): string[] {
  const identifiers: string[] = [];
  
  // Always track these core identifiers
  if (discordId && discordId !== 'unknown') identifiers.push(`discord:${discordId}`);
  if (ip && ip !== 'unknown') identifiers.push(`ip:${ip}`);
  if (userAgent && userAgent !== 'unknown') identifiers.push(`user_agent:${userAgent}`);
  
  // Add HWID/VMAC when available from activated keys
  if (keyData?.activation_data?.hwid) {
    identifiers.push(`hwid:${keyData.activation_data.hwid}`);
  }
  if (keyData?.activation_data?.vmac) {
    identifiers.push(`vmac:${keyData.activation_data.vmac}`);
  }
  
  // Add session-based identifiers
  if (keyData?.workink_data?.session_id) {
    identifiers.push(`session:${keyData.workink_data.session_id}`);
  }
  
  return identifiers;
}

// Enhanced blacklist check with admin bypass and comprehensive checking
async function isBlacklisted(kv: Deno.Kv, discordId: string, ip: string, userAgent: string, keyData?: any): Promise<{ 
  blacklisted: boolean; 
  entry?: BlacklistEntry;
  matchedIdentifier?: string;
}> {
  metrics.blacklistChecks++;
  
  // Your Discord ID
  if (discordId !== 'unknown' && SUPER_ADMINS.includes(discordId)) {
    return { blacklisted: false };
  }
  
  const identifiers = getAllIdentifiers(discordId, ip, userAgent, keyData);
  
  for (const identifier of identifiers) {
    const entry = await kv.get(["blacklist", "identifiers", identifier]);
    if (entry.value) {
      const blacklistEntry = entry.value as BlacklistEntry;
      
      // Check if entry has expired
      if (blacklistEntry.expires_at && Date.now() > blacklistEntry.expires_at) {
        await kv.delete(["blacklist", "identifiers", identifier]);
        continue;
      }
      
      return { 
        blacklisted: true, 
        entry: blacklistEntry,
        matchedIdentifier: identifier
      };
    }
  }
  
  return { blacklisted: false };
}

// Add to blacklist with all identifiers
async function addToBlacklist(
  kv: Deno.Kv, 
  discordId: string, 
  ip: string, 
  userAgent: string,
  reason: string, 
  createdBy: string, 
  durationMs?: number,
  keyData?: any
): Promise<{ success: boolean; identifiers: string[]; linked_sessions: number }> {
  const now = Date.now();
  const expires_at = durationMs ? now + durationMs : undefined;
  
  let identifiers = getAllIdentifiers(discordId, ip, userAgent, keyData);
  
  // Find and add all sessions linked to this Discord ID with error handling
  let sessionCount = 0;
  try {
    const linkedSessions = await findUserSessions(kv, discordId);
    
    for (const session of linkedSessions) {
      // Add session IP to blacklist
      if (session.ip && session.ip !== 'unknown') {
        identifiers.push(`ip:${session.ip}`);
      }
      // Add session identifier
      const sessionId = `session:${session.ip}:${Buffer.from(session.user_agent).toString('base64').slice(0, 16)}`;
      identifiers.push(`session:${sessionId}`);
      sessionCount++;
    }
  } catch (error) {
    console.error('Error processing linked sessions for blacklist:', error);
    // Continue with blacklisting even if session lookup fails
  }
  
  // Remove duplicates
  identifiers = [...new Set(identifiers)];
  
  const entry: BlacklistEntry = {
    discord_id: discordId,
    ip: ip,
    user_agent: userAgent,
    reason,
    created_at: now,
    expires_at,
    created_by: createdBy,
    identifiers
  };
  
  // Store under each identifier for quick lookup
  for (const identifier of identifiers) {
    await kv.set(["blacklist", "identifiers", identifier], entry);
  }
  
  // Also store main entry for management
  await kv.set(["blacklist", "entries", discordId], entry);
  
  return { 
    success: true, 
    identifiers,
    linked_sessions: sessionCount
  };
}

// Remove from blacklist (whitelist)
async function removeFromBlacklist(kv: Deno.Kv, discordId: string): Promise<{ success: boolean; removed: number }> {
  let removed = 0;
  
  // Get the main entry to find all identifiers
  const mainEntry = await kv.get(["blacklist", "entries", discordId]);
  if (mainEntry.value) {
    const entry = mainEntry.value as BlacklistEntry;
    
    // Remove all identifier entries
    for (const identifier of entry.identifiers) {
      await kv.delete(["blacklist", "identifiers", identifier]);
      removed++;
    }
    
    // Remove main entry
    await kv.delete(["blacklist", "entries", discordId]);
    removed++;
  }
  
  return { success: true, removed };
}

// Get all blacklist entries
async function getBlacklistEntries(kv: Deno.Kv): Promise<BlacklistEntry[]> {
  const entries: BlacklistEntry[] = [];
  
  for await (const entry of kv.list({ prefix: ["blacklist", "entries"] })) {
    entries.push(entry.value as BlacklistEntry);
  }
  
  return entries;
}

// Find blacklist entry by Discord ID
async function getBlacklistEntry(kv: Deno.Kv, discordId: string): Promise<BlacklistEntry | null> {
  const entry = await kv.get(["blacklist", "entries", discordId]);
  return entry.value as BlacklistEntry || null;
}

// Enhanced session management
async function getUserSession(kv: Deno.Kv, ip: string, userAgent: string): Promise<UserSession> {
  const sessionId = `session:${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`;
  const entry = await kv.get(["sessions", sessionId]);
  
  if (entry.value) {
    const session = entry.value as UserSession;
    
    // Ensure session has all required properties
    if (!session.linked_discord_ids) {
      session.linked_discord_ids = [];
    }
    if (!session.keys_generated) {
      session.keys_generated = [];
    }
    
    // Update last active
    session.last_active = Date.now();
    await kv.set(["sessions", sessionId], session);
    return session;
  }
  
  // Create new session with all required properties
  const newSession: UserSession = {
    ip,
    user_agent: userAgent,
    last_active: Date.now(),
    keys_generated: [],
    linked_discord_ids: []
  };
  
  await kv.set(["sessions", sessionId], newSession);
  return newSession;
}
// Enhanced session update with Discord ID tracking
async function updateUserSession(kv: Deno.Kv, ip: string, userAgent: string, newKey?: string, discordId?: string): Promise<UserSession> {
  const session = await getUserSession(kv, ip, userAgent);
  
  if (newKey) {
    session.current_key = newKey;
    session.keys_generated.push(newKey);
    // Keep only last 10 keys
    if (session.keys_generated.length > 10) {
      session.keys_generated = session.keys_generated.slice(-10);
    }
  }
  
  // Track Discord ID if provided and not already tracked
  if (discordId && !session.linked_discord_ids.includes(discordId)) {
    session.linked_discord_ids.push(discordId);
    // Keep only last 5 Discord IDs
    if (session.linked_discord_ids.length > 5) {
      session.linked_discord_ids = session.linked_discord_ids.slice(-5);
    }
  }
  
  const sessionId = `session:${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`;
  await kv.set(["sessions", sessionId], session);
  
  return session;
}

async function findUserSessions(kv: Deno.Kv, discordId: string): Promise<UserSession[]> {
  const sessions: UserSession[] = [];
  
  try {
    for await (const entry of kv.list({ prefix: ["sessions"] })) {
      // Add null/undefined check and type validation
      if (!entry.value) {
        console.warn('Skipping undefined session entry:', entry.key);
        continue;
      }
      
      const session = entry.value as UserSession;
      
      // Validate session structure and ensure linked_discord_ids exists
      if (!session.linked_discord_ids || !Array.isArray(session.linked_discord_ids)) {
        console.warn('Session missing linked_discord_ids:', entry.key);
        continue;
      }
      
      if (session.linked_discord_ids.includes(discordId)) {
        sessions.push(session);
      }
    }
  } catch (error) {
    console.error('Error finding user sessions:', error);
  }
  
  return sessions;
}

// Enhanced HTML with User Panel - Fixed template literals
const keySiteHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lunith - Key System</title>
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
        
        /* Enhanced Panel Styles */
        .panel-section {
            background: rgba(30, 30, 30, 0.8);
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .panel-title {
            color: #7289da;
            font-size: 1.2rem;
            font-weight: 600;
        }
        
        .key-status {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 15px 0;
        }
        
        .status-item {
            background: rgba(255, 255, 255, 0.05);
            padding: 12px;
            border-radius: 8px;
            border-left: 4px solid #7289da;
        }
        
        .status-label {
            font-size: 0.9rem;
            color: #888;
            margin-bottom: 5px;
        }
        
        .status-value {
            font-size: 1.1rem;
            font-weight: 600;
            color: #e8e8e8;
        }
        
        .action-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin: 20px 0;
        }
        
        .btn-secondary {
            background: linear-gradient(135deg, #43b581 0%, #369a6d 100%) !important;
        }
        
        .btn-secondary:hover {
            background: linear-gradient(135deg, #369a6d 0%, #2d8a5c 100%) !important;
        }
        
        .history-item {
            background: rgba(255, 255, 255, 0.03);
            padding: 10px;
            border-radius: 6px;
            margin: 5px 0;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9rem;
        }
        
        .tab-container {
            display: flex;
            margin: 20px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .tab {
            padding: 12px 20px;
            cursor: pointer;
            border-bottom: 3px solid transparent;
            transition: all 0.2s ease;
        }
        
        .tab.active {
            border-bottom-color: #7289da;
            color: #7289da;
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
    </style>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>Lunith</h1>
            <p>Key Management System</p>
        </div>
        
        <div class="tab-container">
            <div class="tab active" onclick="switchTab('generate')">Generate Key</div>
            <div class="tab" onclick="switchTab('panel')">My Panel</div>
        </div>
        
        <!-- Generate Tab -->
        <div id="generateTab" class="tab-content active">
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
        
        <!-- User Panel Tab -->
        <div id="panelTab" class="tab-content">
            <div class="panel-section">
                <div class="panel-header">
                    <div class="panel-title">Session Overview</div>
                </div>
                
                <div id="panelContent">
                    <div class="key-status">
                        <div class="status-item">
                            <div class="status-label">Your IP</div>
                            <div class="status-value" id="panelIp">Loading...</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">Keys Generated</div>
                            <div class="status-value" id="panelKeys">0</div>
                        </div>
                    </div>
                    
                    <div id="currentKeyInfo" class="hidden">
                        <div class="step">
                            <div class="step-number">★</div>
                            <div>
                                <strong>Current Active Key</strong>
                                <div class="info-text">Your most recently generated key</div>
                            </div>
                        </div>
                        
                        <div class="key-display" id="panelCurrentKey">Loading...</div>
                        
                        <div class="action-buttons">
                            <button onclick="copyPanelKey()" class="btn-secondary">
                                Copy Key
                            </button>
                            <button onclick="refillKey()" id="refillBtn">
                                Refill Key
                            </button>
                        </div>
                        
                        <div class="warning">
                            <strong>Status:</strong> <span id="keyStatus">Loading...</span>
                        </div>
                    </div>
                    
                    <div id="noKeyInfo">
                        <div class="info-text">
                            No active key found. Generate a new key to get started.
                        </div>
                        <button onclick="switchTab('generate')" style="margin-top: 15px;">
                            Generate New Key
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="panel-section">
                <div class="panel-header">
                    <div class="panel-title">Key History</div>
                </div>
                <div id="keyHistory">
                    <div class="info-text">Loading key history...</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Tab switching
        function switchTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Show selected tab
            document.getElementById(tabName + 'Tab').classList.add('active');
            event.target.classList.add('active');
            
            // Load panel data if switching to panel
            if (tabName === 'panel') {
                loadUserPanel();
            }
        }
        
        // Load user panel data
        async function loadUserPanel() {
            try {
                const response = await fetch('/user-panel');
                const result = await response.json();
                
                if (result.success) {
                    // Update session info
                    document.getElementById('panelIp').textContent = result.session.ip;
                    document.getElementById('panelKeys').textContent = result.session.keys_generated;
                    
                    // Update current key info
                    if (result.current_key) {
                        document.getElementById('panelCurrentKey').textContent = result.current_key.key;
                        document.getElementById('keyStatus').textContent = 
                            result.current_key.activated ? 'Activated' : 'Not Activated';
                        document.getElementById('currentKeyInfo').classList.remove('hidden');
                        document.getElementById('noKeyInfo').classList.add('hidden');
                        
                        // Load key history
                        if (result.session.keys_generated > 0) {
                            const historyContainer = document.getElementById('keyHistory');
                            historyContainer.innerHTML = '';
                            result.session.keys_generated.forEach(key => {
                                const historyItem = document.createElement('div');
                                historyItem.className = 'history-item';
                                historyItem.textContent = key;
                                historyContainer.appendChild(historyItem);
                            });
                        }
                    } else {
                        document.getElementById('currentKeyInfo').classList.add('hidden');
                        document.getElementById('noKeyInfo').classList.remove('hidden');
                    }
                }
            } catch (error) {
                console.error('Failed to load panel:', error);
            }
        }
        
        // Refill key function
        async function refillKey() {
            const btn = document.getElementById('refillBtn');
            const originalText = btn.textContent;
            
            btn.disabled = true;
            btn.textContent = 'Refilling...';
            
            try {
                const response = await fetch('/refill', { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    // Update UI with new key
                    document.getElementById('panelCurrentKey').textContent = result.key;
                    document.getElementById('panelKeys').textContent = result.total_keys_generated;
                    document.getElementById('keyStatus').textContent = 'Not Activated';
                    
                    // Auto-copy new key
                    navigator.clipboard.writeText(result.key).then(() => {
                        btn.textContent = '✓ Refilled & Copied';
                        setTimeout(() => {
                            btn.textContent = 'Refill Key';
                            btn.disabled = false;
                        }, 2000);
                    });
                } else {
                    alert('Refill failed: ' + result.error);
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            } catch (error) {
                alert('Network error: ' + error.message);
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
        
        // Copy panel key
        function copyPanelKey() {
            const key = document.getElementById('panelCurrentKey').textContent;
            navigator.clipboard.writeText(key).then(() => {
                alert('Key copied to clipboard!');
            });
        }
        
        // Original functions
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

// API site HTML remains the same
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

    // Clean up expired blacklist entries
    const blacklistEntries = kv.list({ prefix: ["blacklist", "identifiers"] });
    for await (const entry of blacklistEntries) {
      const blacklistEntry = entry.value as BlacklistEntry;
      if (blacklistEntry && blacklistEntry.expires_at && blacklistEntry.expires_at < now) {
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

// Enhanced WorkInk endpoint with session tracking and blacklist checks
// Enhanced WorkInk endpoint with comprehensive blacklist checks
// Enhanced WorkInk endpoint with comprehensive blacklist checks - FIXED
async function handleWorkInk(kv: Deno.Kv, clientIP: string, userAgent: string, req: Request) {
  // Check blacklist for IP and User Agent first
  const blacklistCheck = await isBlacklisted(kv, 'unknown', clientIP, userAgent);
  if (blacklistCheck.blacklisted) {
    await logError(kv, `Blacklisted connection attempted key generation: ${clientIP}`, req, '/workink');
    return jsonResponse({ 
      error: "Access denied. Your connection is blacklisted.",
      reason: blacklistCheck.entry?.reason,
      matched_identifier: blacklistCheck.matchedIdentifier
    }, 403);
  }
  
  const session = await getUserSession(kv, clientIP, userAgent);
  
  // If session has previous keys, check if any were activated by blacklisted users
  if (session.keys_generated.length > 0) {
    for (const key of session.keys_generated) {
      const keyEntry = await kv.get(["keys", key]);
      if (keyEntry.value && keyEntry.value.activated) {
        const discordId = keyEntry.value.activation_data?.discord_id;
        if (discordId) {
          // Check if this Discord ID is blacklisted
          const userBlacklistCheck = await isBlacklisted(kv, discordId, 'unknown', 'unknown');
          if (userBlacklistCheck.blacklisted) {
            await logError(kv, `Session with blacklisted user attempted key generation: ${discordId}`, req, '/workink');
            return jsonResponse({ 
              error: "Access denied. Your session is linked to a blacklisted account.",
              reason: userBlacklistCheck.entry?.reason,
              linked_user: discordId
            }, 403);
          }
        }
      }
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
      session_id: `session:${clientIP}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`
    }
  };
  
  await kv.set(["keys", key], keyData);
  await updateUserSession(kv, clientIP, userAgent, key);
  
  return jsonResponse({
    success: true,
    key: key,
    expires_at: new Date(expiresAt).toISOString(),
    existing_session: session.keys_generated.length > 0,
    previous_keys: session.keys_generated.length,
    message: "Verification completed successfully"
  });
}

// Refill system - generate new key for existing session
async function handleRefill(kv: Deno.Kv, clientIP: string, userAgent: string) {
  // Check blacklist first
  const blacklistCheck = await isBlacklisted(kv, 'unknown', clientIP, userAgent);
  if (blacklistCheck.blacklisted) {
    return jsonResponse({ 
      error: "Access denied. Your connection is blacklisted.",
      reason: blacklistCheck.entry?.reason 
    }, 403);
  }
  
  const session = await getUserSession(kv, clientIP, userAgent);
  
  if (!session.current_key && session.keys_generated.length === 0) {
    return jsonResponse({ 
      error: "No existing key found. Please generate a new key first." 
    }, 400);
  }
  
  // Generate new key
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
      session_id: `session:${clientIP}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`,
      is_refill: true
    }
  };
  
  await kv.set(["keys", key], keyData);
  await updateUserSession(kv, clientIP, userAgent, key);
  metrics.refills++;
  
  return jsonResponse({
    success: true,
    key: key,
    expires_at: new Date(expiresAt).toISOString(),
    is_refill: true,
    total_keys_generated: session.keys_generated.length + 1,
    message: "Key refilled successfully"
  });
}
// User panel endpoint
async function handleUserPanel(kv: Deno.Kv, clientIP: string, userAgent: string) {
  const session = await getUserSession(kv, clientIP, userAgent);
  const currentKey = session.current_key;
  
  let keyInfo = null;
  if (currentKey) {
    const keyEntry = await kv.get(["keys", currentKey]);
    if (keyEntry.value) {
      keyInfo = keyEntry.value;
    }
  }
  
  return jsonResponse({
    success: true,
    session: {
      ip: session.ip,
      keys_generated: session.keys_generated.length,
      last_active: session.last_active,
      current_key: session.current_key
    },
    current_key: keyInfo ? {
      key: keyInfo.key,
      activated: keyInfo.activated,
      created_at: keyInfo.created_at,
      expires_at: keyInfo.expires_at
    } : null,
    can_refill: true // Always allow refill for now
  });
}

// Admin endpoints for blacklist management
// Admin endpoints for blacklist management - FIXED JSON PARSING
async function handleAdminBlacklist(kv: Deno.Kv, req: Request) {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch (error) {
      return jsonResponse({ error: 'Invalid JSON in request body' }, 400);
    }

    const { discord_id, reason, created_by, duration_ms, user_data } = body;
    
    if (!discord_id || !reason || !created_by) {
      return jsonResponse({ error: 'Missing required fields: discord_id, reason, created_by' }, 400);
    }

    try {
      const result = await addToBlacklist(
        kv, 
        discord_id, 
        user_data?.ip || 'unknown', 
        user_data?.user_agent || 'unknown',
        reason, 
        created_by, 
        duration_ms,
        user_data
      );

      return jsonResponse(result);
    } catch (error) {
      console.error('Blacklist creation error:', error);
      return jsonResponse({ error: 'Failed to create blacklist entry' }, 500);
    }
  }

  if (req.method === 'DELETE') {
    const discordId = url.searchParams.get('discord_id');
    if (!discordId) {
      return jsonResponse({ error: 'discord_id parameter required' }, 400);
    }

    try {
      const result = await removeFromBlacklist(kv, discordId);
      return jsonResponse(result);
    } catch (error) {
      console.error('Blacklist removal error:', error);
      return jsonResponse({ error: 'Failed to remove blacklist entry' }, 500);
    }
  }

  if (req.method === 'GET') {
    try {
      if (url.searchParams.get('discord_id')) {
        const discordId = url.searchParams.get('discord_id')!;
        const entry = await getBlacklistEntry(kv, discordId);
        return jsonResponse({ entry });
      } else {
        const entries = await getBlacklistEntries(kv);
        return jsonResponse({ entries });
      }
    } catch (error) {
      console.error('Blacklist query error:', error);
      return jsonResponse({ error: 'Failed to query blacklist' }, 500);
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}

// Get user info for blacklisting
async function handleAdminUserInfo(kv: Deno.Kv, req: Request) {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  const discordId = url.searchParams.get('discord_id');
  
  if (!discordId) {
    return jsonResponse({ error: 'discord_id parameter required' }, 400);
  }

  // Find keys activated by this user
  const userKeys = [];
  for await (const entry of kv.list({ prefix: ["keys"] })) {
    const keyData = entry.value;
    if (keyData.activated && keyData.activation_data?.discord_id === discordId) {
      userKeys.push(keyData);
    }
  }

  // Return success even if no keys found, just with empty data
  return jsonResponse({ 
    success: true,
    user_id: discordId,
    activated_keys: userKeys,
    total_activations: userKeys.length,
    found: userKeys.length > 0
  });
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
        return await handleWorkInk(kv, clientIP, userAgent, req);
      }

      if (url.pathname === '/refill' && req.method === 'POST') {
        return await handleRefill(kv, clientIP, userAgent);
      }

      if (url.pathname === '/user-panel' && req.method === 'GET') {
        return await handleUserPanel(kv, clientIP, userAgent);
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

  // CHECK IF USER IS BLACKLISTED BEFORE ACTIVATION
  const blacklistCheck = await isBlacklisted(kv, discord_id, 'unknown', 'unknown');
  if (blacklistCheck.blacklisted) {
    await logError(kv, `Blacklisted user attempted activation: ${discord_id}`, req, '/activate');
    return jsonResponse({ 
      error: "Activation denied. Your account is blacklisted.",
      reason: blacklistCheck.entry?.reason,
      expires: blacklistCheck.entry?.expires_at 
    }, 403);
  }

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
  await updateUserSession(kv, keyData.workink_data.ip, keyData.workink_data.user_agent, undefined, discord_id);
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

      // Admin blacklist management - FIXED ROUTING
      if (url.pathname === '/admin/blacklist') {
        return await handleAdminBlacklist(kv, req);
      }

      // Get user info for blacklisting - FIXED ROUTING
      if (url.pathname === '/admin/user-info' && req.method === 'GET') {
        return await handleAdminUserInfo(kv, req);
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
