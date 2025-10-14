local Luna = loadstring(game:HttpGet("https://raw.githubusercontent.com/Nebula-Softworks/Luna-Interface-Suite/refs/heads/master/source.lua", true))()

local Window = Luna:CreateWindow({
	Name = "FNAF COOP",
	Subtitle = "Iris",
	LogoID = nil,
	LoadingEnabled = true,
	LoadingTitle = "Loading",
	LoadingSubtitle = "by Napsy",
	ConfigSettings = {
		RootFolder = nil,
		ConfigFolder = "IrisHub"
	},
	KeySystem = false,
})

Window:CreateHomeTab({
	SupportedExecutors = {
		"Wave",
        "Synapse Z",
        "COdex",
	},
	DiscordInvite = nil,
	Icon = 1
})

-- Services
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Animatronics = workspace:WaitForChild("Animatronics")
local OfficeButtons = workspace:WaitForChild("GameTriggers"):WaitForChild("OfficeButtons")

-- Remotes
local playerSwitchCamsEvent = ReplicatedStorage.RemoteEvents.playerSwitchCamsEvent
local openCamerasEvent = ReplicatedStorage.RemoteEvents.openCamerasEvent

-- Animatronics
local Bonnie = Animatronics.Bonnie.BonnieNPC
local Chica = Animatronics.Chica.ChicaNPC
local Freddy = Animatronics.Freddy.FreddyNPC
local Foxy = Animatronics.Foxy.FoxyNPC

-- Window spots
local bonnieWindowSpot = workspace.Animatronics.Bonnie.Waypoints.OfficeWindow.Part
local chicaWindowSpot = workspace.Animatronics.Chica.Waypoints.OfficeWindow.Part
local freddyWindowSpot = workspace.Animatronics.Freddy.Waypoints.RightHallEnd.Part

-- States
local autoDoorEnabled = false
local stunlockEnabled = false
local espEnabled = false
local cameraOpen = false
local emergencyMode = false
local activeThreats = {}
local doorOperationInProgress = false

-- Settings
local detectionRange = 3
local minCloseTime = 4
local freddyDelay = 0.4
local foxyDelay = 0.4

-- Power system
local powerLevel = 100

-- ESP
local espHighlights = {}
local espLabels = {}

-- ESP Colors
local espColors = {
    Bonnie = Color3.fromRGB(0, 0, 255),
    Chica = Color3.fromRGB(255, 255, 0),
    Freddy = Color3.fromRGB(139, 69, 19),
    Foxy = Color3.fromRGB(255, 0, 0)
}

-- ESP Toggles
local espToggles = {
    Bonnie = true,
    Chica = true,
    Freddy = true,
    Foxy = true
}

-- Threat alerts
function sendAlert(animatronic, side)
    local sideText = side == "left" and "Left" or "Right"
    Luna:Notification({
        Title = "Threat Detected",
        Content = animatronic .. " - " .. sideText .. " Side",
        Icon = "warning"
    })
end

function sendClearAlert(animatronic, side)
    local sideText = side == "left" and "Left" or "Right"
    Luna:Notification({
        Title = "Threat Cleared",
        Content = animatronic .. " - " .. sideText .. " Side",
        Icon = "check_circle"
    })
end

-- Get real power from game
function getPower()
    local success, result = pcall(function()
        local powerScreen = game.workspace.GameTriggers.PercentageScreen.Screen.SurfaceGui.Frame.clock
        if powerScreen then
            local powerText = powerScreen.Text
            local power = tonumber(powerText:match("%d+"))
            return power or 100
        end
        return 100
    end)
    return success and result or 100
end

-- Power monitoring

function createESP(animatronic, name)
    if not animatronic or not animatronic.PrimaryPart then return end
    
    removeESP(animatronic)
    
    if not espToggles[name] then return end
    
    local highlight = Instance.new("Highlight")
    highlight.Name = "IrisESP"
    highlight.Adornee = animatronic
    highlight.FillColor = espColors[name]
    highlight.FillTransparency = 0.3
    highlight.OutlineColor = Color3.fromRGB(255, 255, 255)
    highlight.OutlineTransparency = 0
    highlight.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
    highlight.Parent = animatronic.PrimaryPart
    
    local billboard = Instance.new("BillboardGui")
    billboard.Name = "IrisLabel"
    billboard.Adornee = animatronic.PrimaryPart
    billboard.Size = UDim2.new(0, 200, 0, 50)
    billboard.StudsOffset = Vector3.new(0, 3, 0)
    billboard.AlwaysOnTop = true
    billboard.MaxDistance = 100
    
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundTransparency = 1
    label.Text = name
    label.TextColor3 = Color3.fromRGB(255, 255, 255)
    label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
    label.TextStrokeTransparency = 0
    label.TextSize = 14
    label.Font = Enum.Font.GothamBold
    label.Parent = billboard
    
    billboard.Parent = animatronic.PrimaryPart
    
    espHighlights[animatronic] = highlight
    espLabels[animatronic] = billboard
end

function removeESP(animatronic)
    if espHighlights[animatronic] then
        espHighlights[animatronic]:Destroy()
        espHighlights[animatronic] = nil
    end
    if espLabels[animatronic] then
        espLabels[animatronic]:Destroy()
        espLabels[animatronic] = nil
    end
end

function toggleESP(enabled)
    espEnabled = enabled
    
    if enabled then
        createESP(Bonnie, "Bonnie")
        createESP(Chica, "Chica")
        createESP(Freddy, "Freddy")
        createESP(Foxy, "Foxy")
    else
        for animatronic, _ in pairs(espHighlights) do
            removeESP(animatronic)
        end
        espHighlights = {}
        espLabels = {}
    end
end

function updateESP()
    if espEnabled then
        toggleESP(false)
        toggleESP(true)
    end
end

-- Door system
local leftDoorButton = OfficeButtons.LeftDoorButton.Part.ProximityPrompt
local rightDoorButton = OfficeButtons.RightDoorButton.Part.ProximityPrompt

function closeLeftDoor()
    if not ReplicatedStorage:GetAttribute("leftDoorClosed") then
        fireproximityprompt(leftDoorButton)
    end
end

function closeRightDoor()
    if not ReplicatedStorage:GetAttribute("rightDoorClosed") then
        fireproximityprompt(rightDoorButton)
    end
end

function openLeftDoor()
    if ReplicatedStorage:GetAttribute("leftDoorClosed") then
        fireproximityprompt(leftDoorButton)
    end
end

function openRightDoor()
    if ReplicatedStorage:GetAttribute("rightDoorClosed") then
        fireproximityprompt(rightDoorButton)
    end
end

-- Camera system
function openCams()
    if not cameraOpen and not doorOperationInProgress then
        openCamerasEvent:FireServer()
        cameraOpen = true
        wait(0.1)
    end
end

function closeCams()
    playerSwitchCamsEvent:FireServer("")
    cameraOpen = false
end

function startPowerMonitor()
    while true do
        powerLevel = getPower()
        
        -- Low power warnings
        if powerLevel <= 20 and powerLevel > 10 then
            Luna:Notification({
                Title = "Low Power",
                Content = powerLevel .. "% remaining",
                Icon = "battery_alert"
            })
        elseif powerLevel <= 10 and powerLevel > 0 then
            Luna:Notification({
                Title = "Critical Power",
                Content = powerLevel .. "% remaining",
                Icon = "battery_0_bar"
            })
        elseif powerLevel <= 0 then
            autoDoorEnabled = false
            stunlockEnabled = false
            closeCams()
            Luna:Notification({
                Title = "Power Outage",
                Content = "Systems offline",
                Icon = "power_off"
            })
        end
        
        wait(1)
    end
end

-- Freddy tracking
spawn(startPowerMonitor)
local waypointCams = {
    MainHall = "CAM1B",
    Stage = "CAM1A", 
    Toilets = "CAM7",
    Kitchen = "CAM6",
    RightHall = "CAM4A",
    RightHallEnd = "CAM4B"
}

local waypointPositions = {}
local freddyFolder = Animatronics:WaitForChild("Freddy")
if freddyFolder:FindFirstChild("Waypoints") then
    for _, waypoint in pairs(freddyFolder.Waypoints:GetChildren()) do
        local waypointPart = waypoint:FindFirstChild("Part") or waypoint:FindFirstChild("Position") or waypoint
        if waypointPart and waypointPart:IsA("BasePart") then
            waypointPositions[waypoint.Name] = waypointPart.Position
        end
    end
end

function getFreddyLocation()
    if not Freddy or not Freddy.PrimaryPart then return "Stage" end
    
    local freddyPos = Freddy.PrimaryPart.Position
    local closestLocation = "Stage"
    local closestDistance = math.huge
    
    for locationName, waypointPos in pairs(waypointPositions) do
        local distance = (freddyPos - waypointPos).Magnitude
        if distance < closestDistance then
            closestDistance = distance
            closestLocation = locationName
        end
    end
    
    return closestDistance < 15 and closestLocation or "Stage"
end

function getFreddyCamera()
    local location = getFreddyLocation()
    return waypointCams[location] or "CAM1A"
end

-- Threat system
local animatronics = {
    bonnie = {
        character = Bonnie,
        windowSpot = bonnieWindowSpot,
        firstSeen = 0,
        confirmed = false,
        doorShutTime = 0,
        doorClosed = false,
        closeDoor = closeLeftDoor,
        openDoor = openLeftDoor,
        side = "left"
    },
    freddy = {
        character = Freddy,
        windowSpot = freddyWindowSpot,
        firstSeen = 0,
        confirmed = false,
        doorShutTime = 0,
        doorClosed = false,
        closeDoor = closeRightDoor,
        openDoor = openRightDoor,
        side = "right"
    },
    chica = {
        character = Chica,
        windowSpot = chicaWindowSpot,
        firstSeen = 0,
        confirmed = false,
        doorShutTime = 0,
        doorClosed = false,
        closeDoor = closeRightDoor,
        openDoor = openRightDoor,
        side = "right"
    }
}

function isAtWindow(animatronic)
    if not animatronic.character then return false end
    local windowPos = animatronic.windowSpot.Position

    for _, part in pairs(animatronic.character:GetDescendants()) do
        if part:IsA("BasePart") then
            local distance = (part.Position - windowPos).Magnitude
            if distance <= detectionRange then
                return true
            end
        end
    end
    return false
end

function handleThreat(animatronic, name)
    local currentTime = tick()
    local atWindow = isAtWindow(animatronic)

    if atWindow then
        if animatronic.firstSeen == 0 then
            animatronic.firstSeen = currentTime
        else
            local timeWatching = currentTime - animatronic.firstSeen
            if not animatronic.confirmed and timeWatching >= 1.5 then
                doorOperationInProgress = true
                closeCams()
                
                animatronic.confirmed = true
                animatronic.doorShutTime = currentTime
                animatronic.closeDoor()
                animatronic.doorClosed = true
                
                sendAlert(name, animatronic.side)
                
                wait(0.5)
                doorOperationInProgress = false
            end
        end
    else
        if animatronic.firstSeen > 0 then
            if animatronic.confirmed then
                local timeSinceClosed = currentTime - animatronic.doorShutTime
                if timeSinceClosed >= minCloseTime then
                    doorOperationInProgress = true
                    closeCams()
                    
                    animatronic.openDoor()
                    animatronic.doorClosed = false
                    animatronic.confirmed = false
                    animatronic.firstSeen = 0
                    
                    sendClearAlert(name, animatronic.side)
                    
                    wait(0.5)
                    doorOperationInProgress = false
                end
            else
                animatronic.firstSeen = 0
            end
        end
    end
end

function startDoorSystem()
    while autoDoorEnabled do
        for name, animatronic in pairs(animatronics) do
            handleThreat(animatronic, name)
        end
        wait(0.2)
    end
end

-- Camera cycle system
function smartStunlockCycle()
    if doorOperationInProgress then
        wait(0.5)
        return
    end
    
    if emergencyMode then
        local immediateThreat = false
        
        for name, animatronic in pairs(animatronics) do
            if animatronic.confirmed and isAtWindow(animatronic) then
                immediateThreat = true
                break
            end
        end
        
        if not immediateThreat then
            openCams()
            
            local freddyCam = getFreddyCamera()
            playerSwitchCamsEvent:FireServer(freddyCam)
            wait(0.15)
            
            playerSwitchCamsEvent:FireServer("CAM1C")
            wait(0.15)
            
            closeCams()
        else
            closeCams()
            wait(0.3)
        end
    else
        openCams()
        
        local freddyCam = getFreddyCamera()
        playerSwitchCamsEvent:FireServer(freddyCam)
        wait(freddyDelay)
        
        playerSwitchCamsEvent:FireServer("CAM1C")
        wait(foxyDelay)
        
        closeCams()
        wait(0.2)
    end
end

function startStunlockSystem()
    while stunlockEnabled do
        smartStunlockCycle()
    end
end

-- Door controls
local leftDoorState = false
local rightDoorState = false

function toggleLeftDoor()
    leftDoorState = not leftDoorState
    if leftDoorState then
        closeLeftDoor()
    else
        openLeftDoor()
    end
end

function toggleRightDoor()
    rightDoorState = not rightDoorState
    if rightDoorState then
        closeRightDoor()
    else
        openRightDoor()
    end
end

-- Interface
local MainTab = Window:CreateTab({
	Name = "Control",
	Icon = "auto_mode",
	ImageSource = "Material",
	ShowTitle = true
})

local powerLabel = MainTab:CreateLabel({
	Text = "Power: 100%",
	Style = 1
})

-- Update power display
spawn(function()
    while true do
        powerLabel:SetText("Power: " .. powerLevel .. "%")
        wait(0.5)
    end
end)

MainTab:CreateSection("Automation")

MainTab:CreateToggle({
	Name = "Auto Doors",
	CurrentValue = false,
	Callback = function(Value)
		autoDoorEnabled = Value
		if Value then
			spawn(startDoorSystem)
		end
	end
})

MainTab:CreateToggle({
	Name = "Auto Cams",
	CurrentValue = false,
	Callback = function(Value)
		stunlockEnabled = Value
		if Value then
			spawn(startStunlockSystem)
		end
	end
})

MainTab:CreateSection("Doors")

MainTab:CreateToggle({
	Name = "Left Door",
	CurrentValue = false,
	Callback = function(Value)
		toggleLeftDoor()
	end
})

MainTab:CreateToggle({
	Name = "Right Door",
	CurrentValue = false,
	Callback = function(Value)
		toggleRightDoor()
	end
})

MainTab:CreateButton({
	Name = "Open All Doors",
	Callback = function()
		openLeftDoor()
		openRightDoor()
	end
})

local ESPTab = Window:CreateTab({
	Name = "Visual",
	Icon = "",
	ImageSource = "Material",
	ShowTitle = true
})

ESPTab:CreateSection("ESP")

ESPTab:CreateToggle({
	Name = "Enable ESP",
	CurrentValue = false,
	Callback = function(Value)
		toggleESP(Value)
	end
})

ESPTab:CreateSection("Animatronics")

ESPTab:CreateToggle({
	Name = "Bonnie",
	CurrentValue = true,
	Callback = function(Value)
		espToggles.Bonnie = Value
		updateESP()
	end
})

ESPTab:CreateToggle({
	Name = "Chica",
	CurrentValue = true,
	Callback = function(Value)
		espToggles.Chica = Value
		updateESP()
	end
})

ESPTab:CreateToggle({
	Name = "Freddy",
	CurrentValue = true,
	Callback = function(Value)
		espToggles.Freddy = Value
		updateESP()
	end
})

ESPTab:CreateToggle({
	Name = "Foxy",
	CurrentValue = true,
	Callback = function(Value)
		espToggles.Foxy = Value
		updateESP()
	end
})

ESPTab:CreateSection("Colors")

ESPTab:CreateColorPicker({
	Name = "Bonnie Color",
	CurrentValue = Color3.fromRGB(0, 0, 255),
	Callback = function(Value)
		espColors.Bonnie = Value
		updateESP()
	end
})

ESPTab:CreateColorPicker({
	Name = "Chica Color",
	CurrentValue = Color3.fromRGB(255, 255, 0),
	Callback = function(Value)
		espColors.Chica = Value
		updateESP()
	end
})

ESPTab:CreateColorPicker({
	Name = "Freddy Color",
	CurrentValue = Color3.fromRGB(139, 69, 19),
	Callback = function(Value)
		espColors.Freddy = Value
		updateESP()
	end
})

ESPTab:CreateColorPicker({
	Name = "Foxy Color",
	CurrentValue = Color3.fromRGB(255, 0, 0),
	Callback = function(Value)
		espColors.Foxy = Value
		updateESP()
	end
})

local SettingsTab = Window:CreateTab({
	Name = "Config",
	Icon = "settings",
	ImageSource = "Material",
	ShowTitle = true
})

SettingsTab:CreateSection("Doors")

SettingsTab:CreateSlider({
	Name = "Detection Range",
	Range = {1, 10},
	Increment = 0.5,
	CurrentValue = detectionRange,
	Callback = function(Value)
		detectionRange = Value
	end
})

SettingsTab:CreateSlider({
	Name = "Close Time",
	Range = {1, 10},
	Increment = 0.5,
	CurrentValue = minCloseTime,
	Callback = function(Value)
		minCloseTime = Value
	end
})

SettingsTab:CreateSection("Cameras")

SettingsTab:CreateSlider({
	Name = "Freddy Delay",
	Range = {0.1, 1},
	Increment = 0.05,
	CurrentValue = freddyDelay,
	Callback = function(Value)
		freddyDelay = Value
	end
})

SettingsTab:CreateSlider({
	Name = "Foxy Delay",
	Range = {0.1, 1},
	Increment = 0.05,
	CurrentValue = foxyDelay,
	Callback = function(Value)
	    foxyDelay = Value
	end
})

local ThemeTab = Window:CreateTab({
	Name = "Theme",
	Icon = "palette",
	ImageSource = "Material",
	ShowTitle = true
})

ThemeTab:BuildThemeSection()

local ConfigTab = Window:CreateTab({
	Name = "Profiles",
	Icon = "save",
	ImageSource = "Material",
	ShowTitle = true
})

ConfigTab:BuildConfigSection()

print("Loaded")
