--[[
    BALEREOT COMMUNITY  |  Asset Importer
    - Scan .rbxm / .rbxmx / .rbxl / .rbxlx dari workspace executor
    - Import ke Folder baru di Workspace (model, tool, part, script)
    - Mode utama : GetObjects / LoadLocalAsset
    - Mode cadangan "Rebuild": membaca isi file sendiri (struktur, part, properti, script)
      dipakai otomatis kalau GetObjects kosong / tidak lengkap (mis. .rbxl, Tool)
    Taruh file di: workspace/ImporterAssets (dibuat otomatis)
]]

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UIS = game:GetService("UserInputService")
local lp = Players.LocalPlayer

local ASSET_FOLDER = "ImporterAssets"
local SCAN_FOLDERS = { ASSET_FOLDER, "" }

-- ============ KEY USERNAME (WHITELIST) ============
-- Tulis username Roblox (bukan display name) yang boleh memakai script ini.
-- Bisa juga angka UserId. Tidak peka huruf besar / kecil.
local ALLOWED_USERS = {
    "gahheyhdgdg",
    "usernameteman1",
    "usernameteman2",
    -- 123456789, -- contoh pakai UserId
}
-- Opsional: daftar online supaya tidak perlu bagi ulang script tiap tambah user.
-- Isi dengan link teks mentah (satu username per baris, baris diawali # = komentar).
local WHITELIST_URL = ""

-- Trial gratis 1 hari per akun (dihitung sejak pertama kali dipakai).
-- Setelah habis, user diarahkan ke Discord untuk mendapatkan key.
local DISCORD_URL = "https://discord.gg/EZFMQA6s67"
local TRIAL_SECONDS = 24 * 60 * 60

local ICON = {
    PACKAGE = "rbxassetid://128864012857079",
    FOLDER = "rbxassetid://88761476236687",
    SETTINGS = "rbxassetid://11956055886",
    FILE = "rbxassetid://17109896197",
    GAMEPAD = "rbxassetid://115836418226834",
    REFRESH = "rbxassetid://13492317101",
    CHECK = "rbxassetid://18349889388",
    ALERT = "rbxassetid://7634887649",
    LOGO = "rbxassetid://133871331523241",
}

local C = {
    surface = Color3.fromRGB(15, 19, 33),
    surface2 = Color3.fromRGB(24, 30, 52),
    line = Color3.fromRGB(46, 56, 92),
    a1 = Color3.fromRGB(226, 230, 250),
    a2 = Color3.fromRGB(168, 178, 232),
    text = Color3.fromRGB(236, 242, 255),
    muted = Color3.fromRGB(126, 140, 172),
    ink = Color3.fromRGB(7, 10, 24),
    ok = Color3.fromRGB(82, 232, 164),
    err = Color3.fromRGB(255, 92, 112),
}
local WHITE = Color3.new(1, 1, 1)

local settings = { anchor = true, force = false }

-- ============ Helper UI ============
local function new(class, props, parent)
    local o = Instance.new(class)
    for k, v in pairs(props or {}) do o[k] = v end
    o.Parent = parent
    return o
end
local function corner(p, r) return new("UICorner", {CornerRadius = UDim.new(0, r or 8)}, p) end
local function stroke(p, col, tr, th)
    return new("UIStroke", {
        Color = col or C.line, Transparency = tr or 0.5, Thickness = th or 1,
        ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
    }, p)
end
local function gradient(p, c0, c1, rot)
    return new("UIGradient", {Color = ColorSequence.new(c0, c1), Rotation = rot or 0}, p)
end
local function gradient3(p, c0, c1, c2, rot)
    return new("UIGradient", {Color = ColorSequence.new({
        ColorSequenceKeypoint.new(0, c0), ColorSequenceKeypoint.new(0.5, c1), ColorSequenceKeypoint.new(1, c2),
    }), Rotation = rot or 0}, p)
end
local function label(p, text, size, pos, sz, col, font)
    return new("TextLabel", {
        BackgroundTransparency = 1, Text = text, TextSize = size or 12,
        Font = font or Enum.Font.GothamBold, TextColor3 = col or C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        Position = pos or UDim2.new(), Size = sz or UDim2.new(1, 0, 0, 20),
    }, p)
end
local function tween(o, t, props)
    TweenService:Create(o, TweenInfo.new(t, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props):Play()
end
local function spin(g, t)
    task.spawn(function()
        while g.Parent do
            g.Rotation = 0
            TweenService:Create(g, TweenInfo.new(t, Enum.EasingStyle.Linear), {Rotation = 360}):Play()
            task.wait(t)
        end
    end)
end

-- Tombol 3D: sisi bawah (depth) + permukaan yang turun saat ditekan.
local DEPTH_COL = Color3.fromRGB(86, 92, 148)
local function gradButton(parent, text, pos, size, textSize)
    local LIP = 3
    local b = new("TextButton", {
        Position = pos, Size = size, BackgroundTransparency = 1, Text = "",
        AutoButtonColor = false, BorderSizePixel = 0,
    }, parent)
    local depth = new("Frame", {Size = UDim2.fromScale(1, 1), BackgroundColor3 = DEPTH_COL, BorderSizePixel = 0}, b)
    corner(depth, 9)
    local face = new("Frame", {Size = UDim2.new(1, 0, 1, -LIP), BackgroundColor3 = WHITE, BorderSizePixel = 0, ZIndex = 2}, b)
    corner(face, 9)
    gradient(face, Color3.fromRGB(248, 249, 255), Color3.fromRGB(172, 183, 238), 90)
    local st = stroke(face, WHITE, 0.45, 1)
    new("Frame", {
        Size = UDim2.new(1, -14, 0, 1), Position = UDim2.fromOffset(7, 1), BackgroundColor3 = WHITE,
        BackgroundTransparency = 0.3, BorderSizePixel = 0, ZIndex = 3,
    }, face)
    local lb = new("TextLabel", {
        Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = text,
        Font = Enum.Font.GothamBold, TextSize = textSize or 11, TextColor3 = C.ink, ZIndex = 4,
    }, face)
    local function press(on)
        tween(face, 0.07, {Position = UDim2.fromOffset(0, on and (LIP - 1) or 0)})
    end
    b.MouseButton1Down:Connect(function() press(true) end)
    b.MouseButton1Up:Connect(function() press(false) end)
    b.MouseEnter:Connect(function() tween(st, 0.15, {Transparency = 0.1}) end)
    b.MouseLeave:Connect(function() press(false); tween(st, 0.15, {Transparency = 0.45}) end)
    return b, lb
end

local function makeDraggable(handle, target, clickCb)
    local dragging, moved, startPos, startUI
    handle.InputBegan:Connect(function(i)
        if i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch then
            dragging, moved = true, false
            startPos, startUI = i.Position, target.Position
        end
    end)
    UIS.InputChanged:Connect(function(i)
        if dragging and (i.UserInputType == Enum.UserInputType.MouseMovement or i.UserInputType == Enum.UserInputType.Touch) then
            local d = i.Position - startPos
            if d.Magnitude > 6 then moved = true end
            if moved then
                target.Position = UDim2.new(startUI.X.Scale, startUI.X.Offset + d.X, startUI.Y.Scale, startUI.Y.Offset + d.Y)
            end
        end
    end)
    UIS.InputEnded:Connect(function(i)
        if dragging and (i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch) then
            dragging = false
            if not moved and clickCb then clickCb() end
        end
    end)
end

local function getParent()
    local ok, ui = pcall(function() return gethui and gethui() end)
    if ok and ui then return ui end
    ok, ui = pcall(function() return game:GetService("CoreGui") end)
    if ok and ui then return ui end
    return lp:WaitForChild("PlayerGui")
end

local old = getParent():FindFirstChild("BalereotCommunityUI")
if old then old:Destroy() end

local gui = new("ScreenGui", {
    Name = "BalereotCommunityUI", ResetOnSpawn = false, IgnoreGuiInset = true,
    DisplayOrder = 100, ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
}, getParent())

-- ============ Notifikasi ============
local function notify(title, msg, isErr)
    local col = isErr and C.err or C.ok
    local f = new("Frame", {
        Size = UDim2.fromOffset(320, 60), AnchorPoint = Vector2.new(0.5, 0),
        Position = UDim2.new(0.5, 0, 0, -80), BackgroundColor3 = C.surface, BorderSizePixel = 0, ZIndex = 60,
    }, gui)
    corner(f, 14)
    stroke(f, col, 0.3, 1.2)
    gradient(f, C.surface2, C.surface, 90)
    local bar = new("Frame", {Size = UDim2.new(0, 3, 1, -20), Position = UDim2.fromOffset(9, 10), BackgroundColor3 = col, BorderSizePixel = 0}, f)
    corner(bar, 2)
    new("ImageLabel", {
        Size = UDim2.fromOffset(18, 18), Position = UDim2.fromOffset(22, 21), BackgroundTransparency = 1,
        Image = isErr and ICON.ALERT or ICON.CHECK, ImageColor3 = col,
    }, f)
    label(f, title, 12, UDim2.fromOffset(50, 8), UDim2.new(1, -60, 0, 16))
    local m = label(f, msg, 10, UDim2.fromOffset(50, 25), UDim2.new(1, -60, 0, 32), C.muted, Enum.Font.Gotham)
    m.TextWrapped = true; m.TextYAlignment = Enum.TextYAlignment.Top
    tween(f, 0.4, {Position = UDim2.new(0.5, 0, 0, 14)})
    task.delay(4.5, function()
        tween(f, 0.3, {Position = UDim2.new(0.5, 0, 0, -80)})
        task.wait(0.35)
        f:Destroy()
    end)
end

-- ============ Cek akses ============
local function isAllowed()
    local names, ids = {}, {}
    local function add(v)
        if type(v) == "number" then
            ids[v] = true
        elseif type(v) == "string" then
            v = v:match("^%s*(.-)%s*$")
            if v ~= "" and v:sub(1, 1) ~= "#" then
                local num = tonumber(v)
                if num then ids[num] = true else names[v:lower()] = true end
            end
        end
    end
    for _, v in ipairs(ALLOWED_USERS) do add(v) end
    if WHITELIST_URL ~= "" then
        local ok, body = pcall(function() return game:HttpGet(WHITELIST_URL) end)
        if ok and type(body) == "string" then
            for line in body:gmatch("[^\r\n]+") do add(line) end
        end
    end
    return names[lp.Name:lower()] == true or ids[lp.UserId] == true
end

-- sisa detik trial; nil = executor tidak bisa menyimpan file; <= 0 = habis
local function trialLeftSeconds()
    if not (readfile and writefile and isfile) then return nil end
    local file = "BALEREOT_TRIAL_" .. lp.UserId .. ".dat"
    local now = os.time()
    local started
    local okF, exists = pcall(isfile, file)
    if okF and exists then
        local okR, data = pcall(readfile, file)
        started = (okR and tonumber(data)) or 0 -- file rusak = dianggap habis
    else
        started = now
        pcall(writefile, file, tostring(now))
    end
    if now < started then return 0 end -- jam dimundurkan = dianggap habis
    return started + TRIAL_SECONDS - now
end

local function showDenied(reason)
    local f = new("Frame", {
        Size = UDim2.fromOffset(330, 176), AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
        BackgroundColor3 = Color3.fromRGB(14, 16, 30), BorderSizePixel = 0,
    }, gui)
    corner(f, 16)
    stroke(f, C.line, 0.1, 1)
    local img = new("ImageLabel", {
        Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Image = ICON.LOGO,
        ScaleType = Enum.ScaleType.Crop, ImageTransparency = 0.55,
    }, f)
    corner(img, 16)
    label(f, "AKSES DITOLAK", 13, UDim2.fromOffset(18, 14), UDim2.new(1, -36, 0, 18), C.err)
    local m = label(f, reason .. "\nAkun: @" .. lp.Name, 10, UDim2.fromOffset(18, 38), UDim2.new(1, -36, 0, 52), C.text, Enum.Font.Gotham)
    m.TextWrapped = true; m.TextYAlignment = Enum.TextYAlignment.Top
    label(f, DISCORD_URL, 10, UDim2.fromOffset(18, 96), UDim2.new(1, -36, 0, 14), C.a1, Enum.Font.GothamMedium)
    local copy = gradButton(f, "SALIN LINK DISCORD", UDim2.fromOffset(18, 124), UDim2.new(0.5, -22, 0, 32))
    local close = gradButton(f, "TUTUP", UDim2.new(0.5, 4, 0, 124), UDim2.new(0.5, -22, 0, 32))
    copy.MouseButton1Click:Connect(function()
        pcall(function() game:GetService("GuiService"):OpenBrowserWindow(DISCORD_URL) end)
        if setclipboard then
            pcall(setclipboard, DISCORD_URL)
            notify("Tersalin", "Link Discord disalin. Buka dan minta key di sana.", false)
        else
            notify("Discord", DISCORD_URL, false)
        end
    end)
    close.MouseButton1Click:Connect(function() gui:Destroy() end)
end

local accessInfo = ""
local allowed = isAllowed()
if allowed then
    accessInfo = "Member"
    notify("Akses diterima", "Selamat datang, @" .. lp.Name, false)
else
    local left = trialLeftSeconds()
    if left and left > 0 then
        local h = math.floor(left / 3600)
        local mnt = math.floor((left % 3600) / 60)
        accessInfo = "Trial " .. h .. "j " .. mnt .. "m"
        notify("Trial gratis 1 hari", "Sisa " .. h .. " jam " .. mnt .. " menit. Setelah itu minta key di Discord.", false)
    else
        if left == nil then
            showDenied("Executor tidak mendukung trial.\nDapatkan key di Discord.")
        else
            showDenied("Trial gratis 1 hari sudah habis.\nDapatkan key di Discord.")
        end
        return
    end
end

-- ============ Window ============
local W, H = 540, 340
local main = new("Frame", {
    Size = UDim2.fromOffset(W, H), AnchorPoint = Vector2.new(0.5, 0.5),
    Position = UDim2.fromScale(0.5, 0.5), BackgroundColor3 = WHITE,
    BorderSizePixel = 0, ClipsDescendants = true,
}, gui)
corner(main, 18)
gradient(main, Color3.fromRGB(18, 22, 40), Color3.fromRGB(7, 9, 18), 120)
local mainStroke = stroke(main, C.line, 0.1, 1)
local scale = new("UIScale", {}, main)

-- background gambar + lapisan gelap tipis agar teks tetap terbaca
local bgImg = new("ImageLabel", {
    Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Image = "rbxassetid://133871331523241",
    ScaleType = Enum.ScaleType.Crop, ImageTransparency = 0.3,
}, main)
corner(bgImg, 18)
local bgShade = new("Frame", {
    Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(5, 7, 14),
    BackgroundTransparency = 0.4, BorderSizePixel = 0,
}, main)
corner(bgShade, 18)

local baseScale = 1
local function fit()
    local cam = workspace.CurrentCamera
    if cam then
        local v = cam.ViewportSize
        baseScale = math.min(v.X / (W + 60), v.Y / (H + 50), 1)
        if main.Visible then scale.Scale = baseScale end
    end
end
fit()
scale.Scale = baseScale
if workspace.CurrentCamera then
    workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(fit)
end

local isOpen = true
local function openMain()
    isOpen = true
    main.Visible = true
    scale.Scale = baseScale * 0.9
    tween(scale, 0.25, {Scale = baseScale})
end
local function closeMain()
    isOpen = false
    tween(scale, 0.18, {Scale = baseScale * 0.9})
    task.delay(0.19, function() if not isOpen then main.Visible = false end end)
end

-- ---- Title bar ----
local bar = new("Frame", {Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1}, main)
local logo = new("Frame", {Size = UDim2.fromOffset(30, 30), Position = UDim2.fromOffset(14, 7), BackgroundColor3 = WHITE, BorderSizePixel = 0}, bar)
corner(logo, 10)
logo.BackgroundColor3 = Color3.fromRGB(12, 10, 26)
stroke(logo, WHITE, 0.5, 1)
local logoImg = new("ImageLabel", {
    Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Image = ICON.LOGO,
    ScaleType = Enum.ScaleType.Crop,
}, logo)
corner(logoImg, 10)
label(bar, "BALEREOT COMMUNITY", 12, UDim2.fromOffset(52, 7), UDim2.fromOffset(200, 16))
label(bar, "Asset Importer", 9, UDim2.fromOffset(52, 24), UDim2.fromOffset(200, 12), C.muted, Enum.Font.Gotham)

local closeBtn = new("TextButton", {
    Size = UDim2.fromOffset(28, 28), Position = UDim2.new(1, -42, 0, 8), BackgroundColor3 = C.surface2,
    Text = "X", Font = Enum.Font.GothamBold, TextSize = 12, TextColor3 = C.text, AutoButtonColor = false, ZIndex = 5,
}, bar)
corner(closeBtn, 14); stroke(closeBtn, C.line, 0.3)
closeBtn.MouseEnter:Connect(function() tween(closeBtn, 0.15, {BackgroundColor3 = C.err}) end)
closeBtn.MouseLeave:Connect(function() tween(closeBtn, 0.15, {BackgroundColor3 = C.surface2}) end)
closeBtn.MouseButton1Click:Connect(closeMain)
makeDraggable(bar, main)

local divider = new("Frame", {Size = UDim2.new(1, -28, 0, 1), Position = UDim2.fromOffset(14, 44), BackgroundColor3 = WHITE, BorderSizePixel = 0}, main)
gradient3(divider, C.a1, C.a2, Color3.fromRGB(18, 22, 40), 0)

-- ---- Tabs + stat chips ----
local tabs, views = {}, {}
local function showTab(name)
    for n, v in pairs(views) do v.Visible = (n == name) end
    for n, t in pairs(tabs) do
        local on = (n == name)
        tween(t.btn, 0.2, {BackgroundTransparency = on and 0 or 1})
        tween(t.depth, 0.2, {BackgroundTransparency = on and 0 or 1})
        tween(t.lbl, 0.2, {TextColor3 = on and C.ink or C.muted})
    end
end
local function tabButton(name, idx)
    local depth = new("Frame", {
        Size = UDim2.fromOffset(78, 28), Position = UDim2.fromOffset(14 + (idx - 1) * 84, 53),
        BackgroundColor3 = DEPTH_COL, BackgroundTransparency = 1, BorderSizePixel = 0,
    }, main)
    corner(depth, 14)
    local b = new("TextButton", {
        Size = UDim2.fromOffset(78, 28), Position = UDim2.fromOffset(14 + (idx - 1) * 84, 50),
        BackgroundColor3 = WHITE, BackgroundTransparency = 1, Text = "", AutoButtonColor = false,
    }, main)
    corner(b, 14)
    gradient(b, Color3.fromRGB(248, 249, 255), Color3.fromRGB(172, 183, 238), 90)
    local lb = new("TextLabel", {
        Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = name,
        Font = Enum.Font.GothamBold, TextSize = 11, TextColor3 = C.muted,
    }, b)
    tabs[name] = {btn = b, lbl = lb, depth = depth}
    b.MouseButton1Click:Connect(function() showTab(name) end)
end
tabButton("Library", 1)
tabButton("Scripts", 2)
tabButton("Settings", 3)

local function chip(idx, title)
    local f = new("Frame", {
        Size = UDim2.fromOffset(76, 24), Position = UDim2.fromOffset(W - 14 - 240 + (idx - 1) * 82, 52),
        BackgroundColor3 = C.surface, BorderSizePixel = 0,
    }, main)
    f.BackgroundTransparency = 1
    label(f, title, 8, UDim2.fromOffset(9, 0), UDim2.new(0, 44, 1, 0), C.muted)
    local v = label(f, "0", 11, UDim2.new(0, 44, 0, 0), UDim2.new(1, -53, 1, 0), C.a1)
    v.TextXAlignment = Enum.TextXAlignment.Right
    return v
end
local statFiles = chip(1, "FILES")
local statImported = chip(2, "IMPORT")
local statScripts = chip(3, "SCRIPT")
local importedTotal, scriptTotal = 0, 0

-- ---- Footer (status + progress) ----
local execName = "Executor"
pcall(function()
    if identifyexecutor then execName = tostring((identifyexecutor())) end
end)
local readyText = "Siap  |  " .. execName .. ((accessInfo ~= "") and ("  |  " .. accessInfo) or "")
local statusLbl = label(main, readyText, 10, UDim2.fromOffset(14, H - 30), UDim2.new(1, -100, 0, 14), C.muted, Enum.Font.GothamMedium)
statusLbl.TextTruncate = Enum.TextTruncate.AtEnd
local pctLbl = label(main, "", 10, UDim2.new(1, -74, 0, H - 30), UDim2.fromOffset(60, 14), C.a1)
pctLbl.TextXAlignment = Enum.TextXAlignment.Right
local progTrack = new("Frame", {Size = UDim2.new(1, -28, 0, 4), Position = UDim2.fromOffset(14, H - 13), BackgroundColor3 = C.surface2, BorderSizePixel = 0}, main)
corner(progTrack, 2)
local progFill = new("Frame", {Size = UDim2.new(0, 0, 1, 0), BackgroundColor3 = WHITE, BorderSizePixel = 0}, progTrack)
corner(progFill, 2)
gradient(progFill, C.a1, C.a2, 0)

local function setProg(frac, text)
    if text then statusLbl.Text = text end
    frac = math.clamp(frac or 0, 0, 1)
    tween(progFill, 0.15, {Size = UDim2.new(frac, 0, 1, 0)})
    pctLbl.Text = (frac > 0) and (math.floor(frac * 100) .. "%") or ""
end
local function resetProg()
    setProg(0, readyText)
end

-- ---- Body ----
local function makeView(name)
    local v = new("Frame", {
        Size = UDim2.new(1, -28, 0, H - 82 - 34), Position = UDim2.fromOffset(14, 82),
        BackgroundTransparency = 1, Visible = false,
    }, main)
    views[name] = v
    return v
end
local BW, BH = W - 28, H - 82 - 34 -- 512 x 224

-- ===== Library =====
local lib = makeView("Library")
local rows, filterKind, searchText = {}, "ALL", ""

local searchBox = new("TextBox", {
    Size = UDim2.fromOffset(BW - 150 - 30 - 16, 30), Position = UDim2.fromOffset(0, 0), BackgroundColor3 = C.surface, BackgroundTransparency = 0.3,
    Text = "", PlaceholderText = "Cari asset...", PlaceholderColor3 = C.muted, TextColor3 = C.text,
    Font = Enum.Font.Gotham, TextSize = 11, TextXAlignment = Enum.TextXAlignment.Left, ClearTextOnFocus = false,
}, lib)
corner(searchBox, 15); stroke(searchBox, C.line, 0.4)
new("UIPadding", {PaddingLeft = UDim.new(0, 14)}, searchBox)

local seg = new("Frame", {Size = UDim2.fromOffset(150, 30), Position = UDim2.fromOffset(BW - 150 - 30 - 8, 0), BackgroundColor3 = C.surface, BackgroundTransparency = 0.3, BorderSizePixel = 0}, lib)
corner(seg, 15); stroke(seg, C.line, 0.4)
local segBtns = {}
for i, nmk in ipairs({"ALL", "MODEL", "PLACE"}) do
    local b = new("TextButton", {
        Size = UDim2.fromOffset(46, 24), Position = UDim2.fromOffset(3 + (i - 1) * 48, 3),
        BackgroundColor3 = WHITE, BackgroundTransparency = (i == 1) and 0 or 1, Text = "", AutoButtonColor = false,
    }, seg)
    corner(b, 12)
    gradient(b, C.a1, C.a2, 0)
    local lb = new("TextLabel", {
        Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = nmk, Font = Enum.Font.GothamBold,
        TextSize = 9, TextColor3 = (i == 1) and C.ink or C.text,
    }, b)
    segBtns[nmk] = {btn = b, lbl = lb}
end

local rescanDepth = new("Frame", {
    Size = UDim2.fromOffset(30, 30), Position = UDim2.fromOffset(BW - 30, 3),
    BackgroundColor3 = DEPTH_COL, BorderSizePixel = 0,
}, lib)
corner(rescanDepth, 15)
local rescan = new("TextButton", {
    Size = UDim2.fromOffset(30, 30), Position = UDim2.fromOffset(BW - 30, 0), BackgroundColor3 = WHITE,
    Text = "", AutoButtonColor = false,
}, lib)
corner(rescan, 15)
gradient(rescan, Color3.fromRGB(248, 249, 255), Color3.fromRGB(172, 183, 238), 90)
local rescanIcon = new("ImageLabel", {
    Size = UDim2.fromOffset(16, 16), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5),
    BackgroundTransparency = 1, Image = ICON.REFRESH, ImageColor3 = C.ink,
}, rescan)

local emptyLbl = new("TextLabel", {
    Size = UDim2.new(1, 0, 1, -38), Position = UDim2.fromOffset(0, 38), BackgroundTransparency = 1,
    Text = "", Font = Enum.Font.Gotham, TextSize = 11, TextColor3 = C.muted, TextWrapped = true,
}, lib)

local listFrame = new("ScrollingFrame", {
    Size = UDim2.new(1, 0, 1, -38), Position = UDim2.fromOffset(0, 38), BackgroundTransparency = 1,
    BorderSizePixel = 0, ScrollBarThickness = 3, ScrollBarImageColor3 = C.a1,
    AutomaticCanvasSize = Enum.AutomaticSize.Y, CanvasSize = UDim2.new(),
}, lib)
new("UIGridLayout", {
    CellSize = UDim2.fromOffset(248, 92), CellPadding = UDim2.fromOffset(8, 8),
    SortOrder = Enum.SortOrder.LayoutOrder,
}, listFrame)

local function applyFilter()
    local vis = 0
    for _, r in ipairs(rows) do
        local okK = (filterKind == "ALL") or (r.kind == filterKind)
        local okS = (searchText == "") or (r.name:lower():find(searchText, 1, true) ~= nil)
        r.frame.Visible = okK and okS
        if okK and okS then vis += 1 end
    end
    emptyLbl.Visible = (vis == 0)
    if #rows == 0 then
        emptyLbl.Text = "Belum ada file.\nLetakkan .rbxm / .rbxl di workspace/" .. ASSET_FOLDER
    else
        emptyLbl.Text = "Tidak ada hasil."
    end
end
for nmk, s in pairs(segBtns) do
    s.btn.MouseButton1Click:Connect(function()
        filterKind = nmk
        for n2, s2 in pairs(segBtns) do
            local on = (n2 == nmk)
            tween(s2.btn, 0.2, {BackgroundTransparency = on and 0 or 1})
            tween(s2.lbl, 0.2, {TextColor3 = on and C.ink or C.text})
        end
        applyFilter()
    end)
end
searchBox:GetPropertyChangedSignal("Text"):Connect(function()
    searchText = searchBox.Text:lower()
    applyFilter()
end)

-- ===== Scripts =====
local scv = makeView("Scripts")
local scList = new("ScrollingFrame", {
    Size = UDim2.fromOffset(190, BH), BackgroundColor3 = C.surface, BackgroundTransparency = 0.3, BorderSizePixel = 0,
    ScrollBarThickness = 3, ScrollBarImageColor3 = C.a1,
    AutomaticCanvasSize = Enum.AutomaticSize.Y, CanvasSize = UDim2.new(),
}, scv)
corner(scList, 12); stroke(scList, C.line, 0.4)
new("UIPadding", {PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6), PaddingTop = UDim.new(0, 6), PaddingBottom = UDim.new(0, 6)}, scList)
new("UIListLayout", {Padding = UDim.new(0, 4)}, scList)

local codeBox = new("TextBox", {
    Size = UDim2.fromOffset(314, BH - 38), Position = UDim2.fromOffset(198, 0), BackgroundColor3 = Color3.fromRGB(10, 12, 22), BackgroundTransparency = 0.2,
    Text = "Import file dulu, lalu pilih script di kiri.", TextColor3 = C.text, Font = Enum.Font.Code, TextSize = 11,
    TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top,
    ClearTextOnFocus = false, TextEditable = false, MultiLine = true, TextWrapped = false, ClipsDescendants = true,
}, scv)
corner(codeBox, 12); stroke(codeBox, C.line, 0.4)
new("UIPadding", {PaddingLeft = UDim.new(0, 10), PaddingTop = UDim.new(0, 8)}, codeBox)
local pathLbl = label(scv, "", 9, UDim2.fromOffset(198, BH - 28), UDim2.fromOffset(196, 26), C.muted, Enum.Font.Gotham)
pathLbl.TextTruncate = Enum.TextTruncate.AtEnd
local copyBtn = gradButton(scv, "COPY", UDim2.fromOffset(198 + 314 - 108, BH - 30), UDim2.fromOffset(108, 28))

local currentSrc = ""
local function showSource(path, src)
    currentSrc = src
    pathLbl.Text = path
    if #src > 20000 then
        codeBox.Text = src:sub(1, 20000) .. "\n-- [dipotong, pakai COPY untuk isi penuh]"
    else
        codeBox.Text = src
    end
end
copyBtn.MouseButton1Click:Connect(function()
    if setclipboard and currentSrc ~= "" then
        pcall(setclipboard, currentSrc)
        notify("Tersalin", "Isi script disalin ke clipboard.", false)
    else
        notify("Gagal", "Pilih script dulu / executor tanpa setclipboard.", true)
    end
end)

local function registerScript(path, class, src)
    scriptTotal += 1
    statScripts.Text = tostring(scriptTotal)
    local b = new("TextButton", {
        Size = UDim2.new(1, 0, 0, 24), BackgroundColor3 = C.surface2, Text = "  [" .. class:sub(1, 1) .. "]  " .. path,
        Font = Enum.Font.GothamMedium, TextSize = 10, TextColor3 = C.text, TextXAlignment = Enum.TextXAlignment.Left,
        TextTruncate = Enum.TextTruncate.AtEnd, AutoButtonColor = false,
    }, scList)
    corner(b, 8)
    b.MouseEnter:Connect(function() tween(b, 0.12, {BackgroundColor3 = C.line}) end)
    b.MouseLeave:Connect(function() tween(b, 0.12, {BackgroundColor3 = C.surface2}) end)
    b.MouseButton1Click:Connect(function() showSource(path, src) end)
end

-- ===== Settings =====
local sv = makeView("Settings")
local card1 = new("Frame", {Size = UDim2.fromOffset(BW, 112), BackgroundColor3 = C.surface, BackgroundTransparency = 0.3, BorderSizePixel = 0}, sv)
corner(card1, 14); stroke(card1, C.line, 0.4)

local function toggleRow(y, title, desc, key)
    label(card1, title, 12, UDim2.fromOffset(16, y), UDim2.new(1, -90, 0, 16))
    local d = label(card1, desc, 9, UDim2.fromOffset(16, y + 17), UDim2.new(1, -90, 0, 24), C.muted, Enum.Font.Gotham)
    d.TextWrapped = true; d.TextYAlignment = Enum.TextYAlignment.Top
    local track = new("TextButton", {
        Size = UDim2.fromOffset(44, 22), Position = UDim2.new(1, -60, 0, y + 8), BackgroundColor3 = C.surface2,
        Text = "", AutoButtonColor = false,
    }, card1)
    corner(track, 11); stroke(track, C.line, 0.4)
    local g = gradient(track, C.a1, C.a2, 0)
    local knob = new("Frame", {Size = UDim2.fromOffset(16, 16), Position = UDim2.fromOffset(3, 3), BackgroundColor3 = WHITE, BorderSizePixel = 0}, track)
    corner(knob, 8)
    local function render(v, animate)
        g.Enabled = v
        local pos = v and UDim2.fromOffset(25, 3) or UDim2.fromOffset(3, 3)
        if animate then
            tween(knob, 0.15, {Position = pos})
            tween(track, 0.15, {BackgroundColor3 = v and WHITE or C.surface2})
        else
            knob.Position = pos
            track.BackgroundColor3 = v and WHITE or C.surface2
        end
    end
    render(settings[key], false)
    track.MouseButton1Click:Connect(function()
        settings[key] = not settings[key]
        render(settings[key], true)
    end)
end
toggleRow(10, "Anchor semua part", "Mode Rebuild: part dikunci supaya tidak jatuh / berantakan.", "anchor")
toggleRow(60, "Paksa mode Rebuild", "Lewati GetObjects, selalu baca isi file sendiri.", "force")

local card2 = new("Frame", {Size = UDim2.fromOffset(BW, 100), Position = UDim2.fromOffset(0, 122), BackgroundColor3 = C.surface, BackgroundTransparency = 0.3, BorderSizePixel = 0}, sv)
corner(card2, 14); stroke(card2, C.line, 0.4)
label(card2, "BALEREOT COMMUNITY", 12, UDim2.fromOffset(16, 12), UDim2.new(1, -32, 0, 16))
local ab = label(card2, "Import file .rbxm / .rbxl dari folder workspace executor ke Workspace (lokal / client). RightShift untuk buka / tutup panel.", 9, UDim2.fromOffset(16, 32), UDim2.new(1, -150, 0, 46), C.muted, Enum.Font.Gotham)
ab.TextWrapped = true; ab.TextYAlignment = Enum.TextYAlignment.Top
local unload = gradButton(card2, "UNLOAD GUI", UDim2.new(1, -126, 1, -40), UDim2.fromOffset(110, 28))
unload.MouseButton1Click:Connect(function() gui:Destroy() end)

-- ============ Tombol bulat buka / tutup ============
local launcher = new("Frame", {
    Size = UDim2.fromOffset(46, 50), Position = UDim2.new(0, 14, 0, 120), BackgroundTransparency = 1, ZIndex = 20,
}, gui)
local lDepth = new("Frame", {
    Size = UDim2.fromOffset(46, 46), Position = UDim2.fromOffset(0, 4),
    BackgroundColor3 = Color3.fromRGB(40, 36, 84), BorderSizePixel = 0, ZIndex = 20,
}, launcher)
corner(lDepth, 23)
local toggle = new("TextButton", {
    Size = UDim2.fromOffset(46, 46), BackgroundColor3 = Color3.fromRGB(12, 10, 26),
    AutoButtonColor = false, Text = "", ZIndex = 21,
}, launcher)
corner(toggle, 23)
stroke(toggle, WHITE, 0.35, 1.2)
local toggleImg = new("ImageLabel", {
    Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Image = ICON.LOGO,
    ScaleType = Enum.ScaleType.Crop, ZIndex = 22,
}, toggle)
corner(toggleImg, 23)
toggle.MouseButton1Down:Connect(function() tween(toggle, 0.07, {Position = UDim2.fromOffset(0, 3)}) end)
toggle.MouseButton1Up:Connect(function() tween(toggle, 0.07, {Position = UDim2.fromOffset(0, 0)}) end)
makeDraggable(toggle, launcher, function()
    if isOpen then closeMain() else openMain() end
end)
UIS.InputBegan:Connect(function(i, gp)
    if not gp and i.KeyCode == Enum.KeyCode.RightShift then
        if isOpen then closeMain() else openMain() end
    end
end)

-- ============ Logic ============
local SCRIPT_CLASSES = {Script = true, LocalScript = true, ModuleScript = true}
local SKIP_CLASSES = {Terrain = true, Camera = true}

local spack, sunpack = string.pack, string.unpack
local byte = string.byte

-- ---------- LZ4 / ZSTD ----------
local function lz4block(src)
    local out, o, i, n = {}, 0, 1, #src
    while i <= n do
        local token = byte(src, i); i += 1
        local lit = bit32.rshift(token, 4)
        if lit == 15 then
            local b
            repeat b = byte(src, i); i += 1; lit += b until b ~= 255
        end
        for k = 0, lit - 1 do out[o + k + 1] = byte(src, i + k) end
        o += lit; i += lit
        if i > n then break end
        local off = byte(src, i) + byte(src, i + 1) * 256; i += 2
        local ml = bit32.band(token, 15)
        if ml == 15 then
            local b
            repeat b = byte(src, i); i += 1; ml += b until b ~= 255
        end
        ml += 4
        local start = o - off
        for k = 1, ml do out[o + k] = out[start + k] end
        o += ml
    end
    local parts = {}
    for st = 1, o, 4096 do
        parts[#parts + 1] = string.char(table.unpack(out, st, math.min(st + 4095, o)))
    end
    return table.concat(parts)
end

local function decompressChunk(comp, raw)
    if comp == 0 then return raw end
    if raw:sub(1, 4) == "\40\181\47\253" then
        assert(zstddecompress, "executor tidak support zstddecompress")
        return zstddecompress(raw)
    end
    return lz4block(raw)
end

-- ---------- Pembaca array biner (interleaved) ----------
local function readRaw(data, pos, n)
    local res = table.create(n)
    for i = 0, n - 1 do
        res[i + 1] = byte(data, pos + i) * 16777216 + byte(data, pos + n + i) * 65536
            + byte(data, pos + 2 * n + i) * 256 + byte(data, pos + 3 * n + i)
    end
    return res, pos + n * 4
end
local function readInts(data, pos, n)
    local res, np = readRaw(data, pos, n)
    for i = 1, n do
        local x = res[i]
        res[i] = (x % 2 == 0) and (x / 2) or (-(x + 1) / 2)
    end
    return res, np
end
local function readRefs(data, pos, n)
    local ints, np = readInts(data, pos, n)
    local acc = 0
    for i = 1, n do acc += ints[i]; ints[i] = acc end
    return ints, np
end
local function decF(x)
    local bits = bit32.rshift(x, 1) + (x % 2) * 2147483648
    return (sunpack(">f", spack(">I4", bits)))
end
local function readFloats(data, pos, n)
    local res, np = readRaw(data, pos, n)
    for i = 1, n do res[i] = decF(res[i]) end
    return res, np
end

-- tabel rotasi CFrame (id -> R00,R01,R02,R10,R11,R12,R20,R21,R22)
local ROT = {
    [0x02] = {1,0,0, 0,1,0, 0,0,1},   [0x03] = {1,0,0, 0,0,-1, 0,1,0},
    [0x05] = {1,0,0, 0,-1,0, 0,0,-1}, [0x06] = {1,0,0, 0,0,1, 0,-1,0},
    [0x07] = {0,1,0, 1,0,0, 0,0,-1},  [0x09] = {0,0,1, 1,0,0, 0,1,0},
    [0x0A] = {0,-1,0, 1,0,0, 0,0,1},  [0x0C] = {0,0,-1, 1,0,0, 0,-1,0},
    [0x0D] = {0,1,0, 0,0,1, 1,0,0},   [0x0E] = {0,0,-1, 0,1,0, 1,0,0},
    [0x10] = {0,-1,0, 0,0,-1, 1,0,0}, [0x11] = {0,0,1, 0,-1,0, 1,0,0},
    [0x14] = {-1,0,0, 0,1,0, 0,0,-1}, [0x15] = {-1,0,0, 0,0,1, 0,1,0},
    [0x17] = {-1,0,0, 0,-1,0, 0,0,1}, [0x18] = {-1,0,0, 0,0,-1, 0,-1,0},
    [0x19] = {0,1,0, -1,0,0, 0,0,1},  [0x1B] = {0,0,-1, -1,0,0, 0,1,0},
    [0x1C] = {0,-1,0, -1,0,0, 0,0,-1},[0x1E] = {0,0,1, -1,0,0, 0,-1,0},
    [0x1F] = {0,1,0, 0,0,-1, -1,0,0}, [0x20] = {0,0,1, 0,1,0, -1,0,0},
    [0x22] = {0,-1,0, 0,0,1, -1,0,0}, [0x23] = {0,0,-1, 0,-1,0, -1,0,0},
}

-- decode satu chunk PROP (tipe yang didukung). Return tabel nilai 1..n atau nil
local function decodeProp(ptype, chunk, p, n)
    local v = table.create(n)
    if ptype == 1 then
        for i = 1, n do local s; s, p = sunpack("<s4", chunk, p); v[i] = s end
    elseif ptype == 2 then
        for i = 1, n do v[i] = byte(chunk, p + i - 1) ~= 0 end
    elseif ptype == 3 then
        v = readInts(chunk, p, n)
    elseif ptype == 4 then
        v = readFloats(chunk, p, n)
    elseif ptype == 5 then
        for i = 1, n do v[i] = (sunpack("<d", chunk, p)); p += 8 end
    elseif ptype == 6 then
        local s, o
        s, p = readFloats(chunk, p, n); o, p = readInts(chunk, p, n)
        for i = 1, n do v[i] = UDim.new(s[i], o[i]) end
    elseif ptype == 7 then
        local sx, sy, ox, oy
        sx, p = readFloats(chunk, p, n); sy, p = readFloats(chunk, p, n)
        ox, p = readInts(chunk, p, n); oy, p = readInts(chunk, p, n)
        for i = 1, n do v[i] = UDim2.new(sx[i], ox[i], sy[i], oy[i]) end
    elseif ptype == 11 then
        local r = readRaw(chunk, p, n)
        for i = 1, n do
            local ok, bc = pcall(BrickColor.new, r[i])
            if ok then v[i] = bc end
        end
    elseif ptype == 12 then
        local r, g, b
        r, p = readFloats(chunk, p, n); g, p = readFloats(chunk, p, n); b, p = readFloats(chunk, p, n)
        for i = 1, n do v[i] = Color3.new(r[i], g[i], b[i]) end
    elseif ptype == 13 then
        local x, y
        x, p = readFloats(chunk, p, n); y, p = readFloats(chunk, p, n)
        for i = 1, n do v[i] = Vector2.new(x[i], y[i]) end
    elseif ptype == 14 then
        local x, y, z
        x, p = readFloats(chunk, p, n); y, p = readFloats(chunk, p, n); z, p = readFloats(chunk, p, n)
        for i = 1, n do v[i] = Vector3.new(x[i], y[i], z[i]) end
    elseif ptype == 16 then
        local rots = {}
        for i = 1, n do
            local id = byte(chunk, p); p += 1
            if id == 0 then
                local m = {}
                for k = 1, 9 do m[k] = (sunpack("<f", chunk, p)); p += 4 end
                rots[i] = m
            else
                rots[i] = ROT[id]
            end
        end
        local x, y, z
        x, p = readFloats(chunk, p, n); y, p = readFloats(chunk, p, n); z, p = readFloats(chunk, p, n)
        for i = 1, n do
            local m = rots[i] or ROT[0x02]
            v[i] = CFrame.new(x[i], y[i], z[i], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9])
        end
    elseif ptype == 18 then
        local r = readRaw(chunk, p, n)
        for i = 1, n do v[i] = {tok = r[i]} end
    elseif ptype == 19 then
        v = readRefs(chunk, p, n)
    elseif ptype == 23 then
        for i = 1, n do
            local a, b = sunpack("<ff", chunk, p); p += 8
            v[i] = NumberRange.new(a, b)
        end
    elseif ptype == 26 then
        for i = 1, n do
            v[i] = Color3.fromRGB(byte(chunk, p + i - 1), byte(chunk, p + n + i - 1), byte(chunk, p + 2 * n + i - 1))
        end
    elseif ptype == 34 then
        local types
        types, p = readRaw(chunk, p, n)
        for i = 1, n do
            if types[i] == 1 then
                local s; s, p = sunpack("<s4", chunk, p); v[i] = s
            end
        end
    else
        return nil
    end
    return v
end

local function chainPath(insts, inst)
    local names, cur, guard = {}, inst, 0
    while cur and guard < 200 do
        table.insert(names, 1, cur.name)
        cur = insts[cur.parent]
        guard += 1
    end
    return table.concat(names, "/")
end

-- return: list script, tree {insts, order}
local function parseBinary(data)
    if data:sub(1, 8) ~= "<roblox!" then return nil end
    local pos = 33
    local classes, insts, order = {}, {}, {}
    local chunks = 0
    while pos <= #data do
        local name = data:sub(pos, pos + 3)
        local comp, unc = sunpack("<I4I4", data, pos + 4)
        pos += 16
        local raw
        if comp == 0 then
            raw = data:sub(pos, pos + unc - 1); pos += unc
        else
            raw = data:sub(pos, pos + comp - 1); pos += comp
        end
        if name == "END\0" then break end
        chunks += 1
        if chunks % 20 == 0 then task.wait() end
        if name == "INST" or name == "PROP" or name == "PRNT" then
            local chunk = decompressChunk(comp, raw)
            if name == "INST" then
                local cid, p = sunpack("<I4", chunk, 1)
                local cname; cname, p = sunpack("<s4", chunk, p)
                p += 1
                local count; count, p = sunpack("<I4", chunk, p)
                local refs = readRefs(chunk, p, count)
                classes[cid] = {name = cname, refs = refs}
                for _, r in ipairs(refs) do
                    insts[r] = {class = cname, name = cname, parent = -1}
                    order[#order + 1] = r
                end
            elseif name == "PROP" then
                local cid, p = sunpack("<I4", chunk, 1)
                local pname; pname, p = sunpack("<s4", chunk, p)
                local ptype = byte(chunk, p); p += 1
                local cls = classes[cid]
                if cls then
                    local okD, vals = pcall(decodeProp, ptype, chunk, p, #cls.refs)
                    if okD and vals then
                        for i, r in ipairs(cls.refs) do
                            local val = vals[i]
                            local it = insts[r]
                            if val ~= nil and it then
                                if pname == "Name" and ptype == 1 then
                                    it.name = val
                                elseif pname == "Source" and ptype == 1 then
                                    it.source = val
                                elseif ptype == 19 then
                                    if val >= 0 then
                                        it.refprops = it.refprops or {}
                                        it.refprops[pname] = val
                                    end
                                else
                                    it.props = it.props or {}
                                    it.props[pname] = val
                                end
                            end
                        end
                    end
                end
            else -- PRNT
                local p = 2
                local count; count, p = sunpack("<I4", chunk, p)
                local kids; kids, p = readRefs(chunk, p, count)
                local pars = readRefs(chunk, p, count)
                for i = 1, count do
                    local k = insts[kids[i]]
                    if k then k.parent = pars[i] end
                end
            end
        end
    end
    local list = {}
    for _, r in ipairs(order) do
        local it = insts[r]
        if SCRIPT_CLASSES[it.class] and it.source and #it.source > 0 then
            list[#list + 1] = {path = chainPath(insts, it), class = it.class, source = it.source}
        end
    end
    return list, {insts = insts, order = order}
end

-- ---------- Parser XML (rbxmx / rbxlx) ----------
local function unesc(str)
    return (str:gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&quot;", '"'):gsub("&apos;", "'"):gsub("&amp;", "&"))
end
local function xmlStr(inner)
    return inner:match("^%s*<!%[CDATA%[(.*)%]%]>%s*$") or unesc(inner)
end
local function xn(inner, tag) return tonumber(inner:match("<" .. tag .. ">%s*(.-)%s*</" .. tag .. ">")) or 0 end
local function c3u(n)
    n = n or 0
    return Color3.fromRGB(bit32.band(bit32.rshift(n, 16), 255), bit32.band(bit32.rshift(n, 8), 255), bit32.band(n, 255))
end

local function applyXmlProp(node, tag, pname, inner)
    if not pname then return end
    node.props = node.props or {}
    local props = node.props
    if tag == "string" or tag == "ProtectedString" then
        local v = xmlStr(inner)
        if pname == "Name" then node.name = v
        elseif pname == "Source" then node.source = v
        else props[pname] = v end
    elseif tag == "bool" then
        props[pname] = inner:find("true", 1, true) ~= nil
    elseif tag == "int" or tag == "float" or tag == "double" or tag == "int64" then
        local n = tonumber(inner)
        if n then props[pname] = n end
    elseif tag == "token" then
        local n = tonumber(inner)
        if n then props[pname] = {tok = n} end
    elseif tag == "Color3uint8" then
        props[pname] = c3u(tonumber(inner))
    elseif tag == "Color3" then
        if inner:find("<R>", 1, true) then
            props[pname] = Color3.new(xn(inner, "R"), xn(inner, "G"), xn(inner, "B"))
        else
            props[pname] = c3u(tonumber(inner))
        end
    elseif tag == "Vector3" then
        props[pname] = Vector3.new(xn(inner, "X"), xn(inner, "Y"), xn(inner, "Z"))
    elseif tag == "Vector2" then
        props[pname] = Vector2.new(xn(inner, "X"), xn(inner, "Y"))
    elseif tag == "CoordinateFrame" then
        props[pname] = CFrame.new(xn(inner, "X"), xn(inner, "Y"), xn(inner, "Z"),
            xn(inner, "R00"), xn(inner, "R01"), xn(inner, "R02"),
            xn(inner, "R10"), xn(inner, "R11"), xn(inner, "R12"),
            xn(inner, "R20"), xn(inner, "R21"), xn(inner, "R22"))
    elseif tag == "UDim2" then
        props[pname] = UDim2.new(xn(inner, "XS"), xn(inner, "XO"), xn(inner, "YS"), xn(inner, "YO"))
    elseif tag == "UDim" then
        props[pname] = UDim.new(xn(inner, "S"), xn(inner, "O"))
    elseif tag == "BrickColor" then
        local ok, bc = pcall(BrickColor.new, tonumber(inner) or 194)
        if ok then props[pname] = bc end
    elseif tag == "Content" then
        local url = inner:match("<url>(.-)</url>")
        if url and url ~= "" then props[pname] = unesc(url) end
    elseif tag == "NumberRange" then
        local a, b = inner:match("([%-%d%.eE]+)%s+([%-%d%.eE]+)")
        if a and b then props[pname] = NumberRange.new(tonumber(a), tonumber(b)) end
    elseif tag == "Ref" then
        node.refname = node.refname or {}
        node.refname[pname] = inner:match("^%s*(.-)%s*$")
    end
end

local function parseXml(data)
    local insts, order, stack, refMap, list = {}, {}, {}, {}, {}
    local idc, pos, steps = 0, 1, 0
    local find = string.find
    while true do
        local s, e, closing, tag, attrs = find(data, "<(/?)([%w_]+)([^>]*)>", pos)
        if not s then break end
        pos = e + 1
        steps += 1
        if steps % 600 == 0 then task.wait() end
        if tag == "Item" then
            local selfClose = attrs:sub(-1) == "/"
            if closing == "" then
                idc += 1
                local top = stack[#stack]
                local node = {
                    id = idc, class = attrs:match('class="([^"]*)"') or "Folder", name = "?",
                    parent = top and top.id or -1,
                }
                node.name = node.class
                local rf = attrs:match('referent="([^"]*)"')
                if rf then refMap[rf] = idc end
                insts[idc] = node
                order[#order + 1] = idc
                if not selfClose then table.insert(stack, node) end
            else
                local it = table.remove(stack)
                if it and SCRIPT_CLASSES[it.class] and it.source and #it.source > 0 then
                    local names = {}
                    for _, a in ipairs(stack) do names[#names + 1] = a.name end
                    names[#names + 1] = it.name
                    list[#list + 1] = {path = table.concat(names, "/"), class = it.class, source = it.source}
                end
            end
        elseif closing == "" and #stack > 0 and tag ~= "Properties" and attrs:sub(-1) ~= "/" then
            local cs, ce = find(data, "</" .. tag .. ">", pos, true)
            if cs then
                local inner = data:sub(pos, cs - 1)
                pos = ce + 1
                applyXmlProp(stack[#stack], tag, attrs:match('name="([^"]*)"'), inner)
            end
        end
    end
    for _, it in pairs(insts) do
        if it.refname then
            it.refprops = {}
            for k, rf in pairs(it.refname) do
                if refMap[rf] then it.refprops[k] = refMap[rf] end
            end
            it.refname = nil
        end
    end
    return list, {insts = insts, order = order}
end

-- ---------- Studio Lite editor ----------
local function pathOf(inst, stopAt)
    local names, cur = {}, inst
    while cur and cur ~= stopAt do
        table.insert(names, 1, cur.Name)
        cur = cur.Parent
    end
    return table.concat(names, "/")
end

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TEMPLATE_KEY = {
    Script = "InsertScriptScript",
    LocalScript = "InsertLocalScriptLocalScript",
    ModuleScript = "InsertModuleScriptModuleScript",
}
local templateCache = {}

local function getServerFunctions()
    local f = ReplicatedStorage:FindFirstChild("StudioLiteFolder")
    return f and f:FindFirstChild("ServerFunctions")
end

local function getTemplate(className)
    if templateCache[className] then return templateCache[className] end
    local sf, key = getServerFunctions(), TEMPLATE_KEY[className]
    if not (sf and key) then return nil end
    pcall(function() sf:InvokeServer("LoadAssetToPlayerGui", key) end)
    local holder = lp:WaitForChild("PlayerGui"):WaitForChild(key, 3)
    if not holder then return nil end
    local list = {}
    for _, c in ipairs(holder:GetChildren()) do table.insert(list, c:Clone()) end
    pcall(function() sf:InvokeServer("ClearAssetFromPlayerGui", key) end)
    templateCache[className] = list
    return list
end

local function applySource(inst, text)
    if not inst:FindFirstChild("SL_CodeTextBox") then
        local tpl = getTemplate(inst.ClassName)
        if tpl then
            for _, c in ipairs(tpl) do c:Clone().Parent = inst end
        end
    end
    local box = inst:FindFirstChild("SL_CodeTextBox")
    if not box then
        box = Instance.new("TextBox")
        box.Name = "SL_CodeTextBox"
        box.MultiLine = true
        box.ClearTextOnFocus = false
        box.Visible = false
        box.Parent = inst
    end
    box.Text = text
    if inst.ClassName == "ModuleScript" then
        local ro = inst:FindFirstChild("SL_1ReadOnly")
        if ro then
            pcall(function() ro.ContentText = text end)
            pcall(function() ro.Text = text end)
        end
    end
end

local function cleanSource(src)
    if src:find("<font color=", 1, true) or src:find("<b><font", 1, true) then
        src = src:gsub("</?font[^>]*>", ""):gsub("</?[biu]>", "")
        src = src:gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&quot;", '"'):gsub("&apos;", "'"):gsub("&amp;", "&")
    end
    return src
end

local function pushSource(inst, folderName, path, class, source)
    local env = (getgenv and getgenv()) or _G
    env.ImportedSources = env.ImportedSources or {}
    pcall(function()
        if setscriptable then setscriptable(inst, "Source", true) end
        inst.Source = source
    end)
    local text = #source > 150000 and source:sub(1, 150000) or source
    applySource(inst, text)
    env.ImportedSources[folderName .. "/" .. path] = source
    registerScript(path, class, source)
end

-- jalur GetObjects: cocokkan script berdasar path
local function attachSources(objs, folder, parsed)
    local queues = {}
    for _, sc in ipairs(parsed) do
        sc.source = cleanSource(sc.source)
        local key = sc.path .. "|" .. sc.class
        queues[key] = queues[key] or {}
        table.insert(queues[key], sc)
    end
    local n = 0
    local function handle(inst)
        if SCRIPT_CLASSES[inst.ClassName] then
            local q = queues[pathOf(inst, folder) .. "|" .. inst.ClassName]
            local sc = q and table.remove(q, 1)
            if sc then
                n += 1
                pushSource(inst, folder.Name, sc.path, sc.class, sc.source)
            end
        end
    end
    local visited = 0
    for _, obj in ipairs(objs) do
        handle(obj)
        for _, d in ipairs(obj:GetDescendants()) do
            handle(d)
            visited += 1
            if visited % 150 == 0 then task.wait() end
        end
    end
    return n
end

-- ---------- Rebuild: bangun instance asli dari isi file ----------
local MAX_NODES = 60000
local ALIAS = {size = "Size", Color3uint8 = "Color", MeshContent = "MeshId", TextureContent = "TextureID"}

local function buildFromTree(folder, tree, opts, prog)
    local insts, order = tree.insts, tree.order
    local skipMemo = {}
    local function isSkipped(r)
        local m = skipMemo[r]
        if m ~= nil then return m end
        local it = insts[r]
        local res = false
        if not it then
            res = true
        elseif SKIP_CLASSES[it.class] then
            res = true
        elseif it.parent and it.parent ~= -1 and insts[it.parent] then
            res = isSkipped(it.parent)
        end
        skipMemo[r] = res
        return res
    end

    local list, truncated = {}, false
    for _, r in ipairs(order) do
        if #list >= MAX_NODES then truncated = true; break end
        if not isSkipped(r) then list[#list + 1] = r end
    end
    local total = #list
    local made = {}
    local st = {objects = 0, scripts = 0, parts = 0, meshFail = 0, unions = 0, truncated = truncated}

    -- 1) buat instance + set properti
    for idx, r in ipairs(list) do
        local it = insts[r]
        local okN, inst = pcall(Instance.new, it.class)
        if not okN then inst = Instance.new("Folder") end
        pcall(function() inst.Name = it.name end)
        made[r] = inst
        if it.props then
            local hasC3 = it.props.Color3uint8 ~= nil
            for pname, val in pairs(it.props) do
                if not (pname == "BrickColor" and hasC3) then
                    local target = ALIAS[pname] or pname
                    if type(val) == "table" and val.tok ~= nil then
                        pcall(function()
                            local cur = inst[target]
                            if typeof(cur) == "EnumItem" then
                                inst[target] = cur.EnumType:FromValue(val.tok)
                            end
                        end)
                    else
                        local ok = pcall(function() inst[target] = val end)
                        if not ok and target == "MeshId" then st.meshFail += 1 end
                    end
                end
            end
        end
        if inst:IsA("BasePart") then
            st.parts += 1
            if opts.anchor then pcall(function() inst.Anchored = true end) end
        end
        if it.class == "UnionOperation" or it.class == "NegateOperation" then st.unions += 1 end
        if idx % 200 == 0 then
            prog(0.30 + 0.35 * idx / total, "Membuat object " .. idx .. " / " .. total)
            task.wait()
        end
    end

    -- 2) susun hierarki (anak ke induk dulu, root terakhir supaya masuk Workspace sekali jalan)
    for idx, r in ipairs(list) do
        local par = made[insts[r].parent]
        if par then pcall(function() made[r].Parent = par end) end
        if idx % 400 == 0 then task.wait() end
    end
    for idx, r in ipairs(list) do
        if not made[insts[r].parent] then
            pcall(function() made[r].Parent = folder end)
            st.objects += 1
        end
        if idx % 400 == 0 then task.wait() end
    end
    st.objects = total

    -- 3) referensi (PrimaryPart, Part0/Part1 weld, dll)
    prog(0.70, "Menyambung referensi...")
    for _, r in ipairs(list) do
        local it = insts[r]
        if it.refprops then
            for pname, id in pairs(it.refprops) do
                local target = made[id]
                if target then pcall(function() made[r][pname] = target end) end
            end
        end
    end

    -- 4) script
    local sc = 0
    local scriptTotalCount = 0
    for _, r in ipairs(list) do
        local it = insts[r]
        if SCRIPT_CLASSES[it.class] and it.source and #it.source > 0 then scriptTotalCount += 1 end
    end
    for idx, r in ipairs(list) do
        local it = insts[r]
        local inst = made[r]
        if SCRIPT_CLASSES[it.class] and it.source and #it.source > 0 and inst.ClassName == it.class then
            sc += 1
            pushSource(inst, folder.Name, chainPath(insts, it), it.class, cleanSource(it.source))
            if sc % 10 == 0 then
                prog(0.75 + 0.22 * sc / math.max(scriptTotalCount, 1), "Script " .. sc .. " / " .. scriptTotalCount)
                task.wait()
            end
        end
    end
    st.scripts = sc
    return st
end

-- ---------- Import ----------
local function tryLoad(path)
    local okA, asset = pcall(getcustomasset, path)
    if not okA then return nil end
    local ok1, o1 = pcall(function() return game:GetObjects(asset) end)
    if ok1 and type(o1) == "table" and #o1 > 0 then return o1 end
    local ok2, o2 = pcall(function() return game:GetService("InsertService"):LoadLocalAsset(asset) end)
    if ok2 and typeof(o2) == "Instance" then return {o2} end
    return nil
end

local function importFile(info, prog)
    if not (readfile and getcustomasset) then
        return false, "Executor tidak support readfile/getcustomasset"
    end
    prog(0.04, "Membaca file...")
    local okR, data = pcall(readfile, info.path)
    if not (okR and type(data) == "string") then return false, "Gagal membaca file" end

    prog(0.10, "Membaca struktur file...")
    local parsed, tree, perr
    local okP, a, b = pcall(function()
        if data:sub(1, 8) == "<roblox!" then return parseBinary(data) end
        if data:find("<roblox", 1, true) then return parseXml(data) end
    end)
    if okP then parsed, tree = a, b else perr = tostring(a) end
    data = nil

    local base = info.name:gsub("%.[^%.]+$", "")
    local name, n = base, 1
    while workspace:FindFirstChild(name) do n += 1; name = base .. "_" .. n end
    local folder = new("Folder", {Name = name}, workspace)

    local count, via, scriptCount, detail = 0, "GetObjects", 0, ""
    local expected = tree and #tree.order or 0

    -- cara 1: GetObjects / LoadLocalAsset
    if not settings.force then
        prog(0.20, "Memuat model...")
        local objs = tryLoad(info.path)
        if objs then
            local function adopt(obj)
                local okp = pcall(function() obj.Parent = folder end)
                if okp and obj.Parent == folder then count += 1 return end
                local sub = Instance.new("Folder")
                sub.Name = obj.Name
                local moved = 0
                for _, ch in ipairs(obj:GetChildren()) do
                    if pcall(function() ch.Parent = sub end) and ch.Parent == sub then moved += 1 end
                end
                if moved > 0 then sub.Parent = folder; count += moved else sub:Destroy() end
            end
            for _, obj in ipairs(objs) do
                if typeof(obj) == "Instance" then
                    if obj:IsA("DataModel") then
                        for _, svc in ipairs(obj:GetChildren()) do adopt(svc) end
                    else
                        adopt(obj)
                    end
                end
            end
            local totalDesc = #folder:GetDescendants() + #folder:GetChildren()
            if expected > 0 and totalDesc < expected * 0.7 then
                -- hasil GetObjects tidak lengkap -> buang, pakai Rebuild
                folder:ClearAllChildren()
                count = 0
            end
        end
    end

    if count > 0 then
        if parsed then
            prog(0.70, "Memasukkan script ke editor...")
            local okA, res = pcall(attachSources, {folder}, folder, parsed)
            if okA then scriptCount = res else detail = " (error script: " .. tostring(res):sub(1, 50) .. ")" end
        end
    else
        -- cara 2: Rebuild dari isi file
        if not tree or #tree.order == 0 then
            folder:Destroy()
            return false, perr and ("Gagal parse: " .. perr:sub(1, 70)) or "File kosong / format tidak didukung"
        end
        via = "Rebuild"
        prog(0.30, "Membangun ulang model & part...")
        local okB, st = pcall(buildFromTree, folder, tree, {anchor = settings.anchor}, prog)
        if not okB then
            folder:Destroy()
            return false, "Rebuild gagal: " .. tostring(st):sub(1, 80)
        end
        count, scriptCount = st.objects, st.scripts
        detail = " | " .. st.parts .. " part"
        if st.meshFail > 0 then detail = detail .. " | " .. st.meshFail .. " mesh gagal di-set" end
        if st.unions > 0 then detail = detail .. " | " .. st.unions .. " union kosong" end
        if st.truncated then detail = detail .. " | dipotong " .. MAX_NODES .. " node" end
    end

    if count == 0 then
        folder:Destroy()
        return false, "File kosong / format tidak didukung executor"
    end
    prog(1, "Selesai")
    return true, count .. " object, " .. scriptCount .. " script [" .. via .. "]" .. detail .. " -> Workspace." .. name
end

-- ---------- Scan + daftar file ----------
local function kindOf(name)
    local l = name:lower()
    if l:match("%.rbxmx?$") then return "MODEL" end
    if l:match("%.rbxlx?$") then return "PLACE" end
end
local function fileName(path) return path:match("([^/\\]+)$") or path end

local function scanFiles()
    local found, seen = {}, {}
    if not listfiles then return found end
    for _, folder in ipairs(SCAN_FOLDERS) do
        local ok, list = pcall(listfiles, folder)
        if ok and type(list) == "table" then
            for _, path in ipairs(list) do
                local kind = kindOf(path)
                if kind and not seen[path] then
                    seen[path] = true
                    table.insert(found, {name = fileName(path), path = path, kind = kind})
                end
            end
        end
    end
    table.sort(found, function(x, y) return x.name:lower() < y.name:lower() end)
    return found
end

local importing = false
local function addRow(info, order)
    local isPlace = info.kind == "PLACE"
    local col = isPlace and C.a2 or C.a1
    local f = new("Frame", {BackgroundColor3 = WHITE, BackgroundTransparency = 0.25, BorderSizePixel = 0, LayoutOrder = order}, listFrame)
    corner(f, 14)
    local st = stroke(f, C.line, 0.35, 1)
    gradient(f, C.surface2, C.surface, 135)
    f.MouseEnter:Connect(function() tween(st, 0.15, {Color = col, Transparency = 0.1}) end)
    f.MouseLeave:Connect(function() tween(st, 0.15, {Color = C.line, Transparency = 0.35}) end)

    local tile = new("Frame", {Size = UDim2.fromOffset(34, 34), Position = UDim2.fromOffset(10, 10), BackgroundColor3 = col, BackgroundTransparency = 0.8, BorderSizePixel = 0}, f)
    corner(tile, 10)
    new("ImageLabel", {
        Size = UDim2.fromOffset(18, 18), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5),
        BackgroundTransparency = 1, Image = isPlace and ICON.GAMEPAD or ICON.FILE, ImageColor3 = col,
    }, tile)
    local nl = label(f, info.name, 11, UDim2.fromOffset(52, 9), UDim2.new(1, -62, 0, 16))
    nl.TextTruncate = Enum.TextTruncate.AtEnd
    local tag = new("TextLabel", {
        Size = UDim2.fromOffset(44, 14), Position = UDim2.fromOffset(52, 29), BackgroundColor3 = col,
        Text = info.kind, Font = Enum.Font.GothamBold, TextSize = 8, TextColor3 = C.ink, BorderSizePixel = 0,
    }, f)
    corner(tag, 7)
    local ext = info.name:match("(%.[^%.]+)$") or ""
    label(f, ext, 9, UDim2.fromOffset(102, 28), UDim2.fromOffset(60, 16), C.muted, Enum.Font.Gotham)

    local btn, btnLbl = gradButton(f, "IMPORT", UDim2.fromOffset(10, 56), UDim2.new(1, -20, 0, 26))
    btn.MouseButton1Click:Connect(function()
        if importing then
            notify("Sibuk", "Tunggu import sebelumnya selesai.", true)
            return
        end
        importing = true
        btnLbl.Text = "LOADING..."
        task.spawn(function()
            local pok, ok, msg = pcall(importFile, info, setProg)
            if not pok then
                msg = "Error: " .. tostring(ok):sub(1, 90)
                ok = false
            end
            btnLbl.Text = ok and "DONE" or "FAIL"
            if ok then
                importedTotal += 1
                statImported.Text = tostring(importedTotal)
            end
            setProg(ok and 1 or 0, ok and "Selesai" or "Gagal")
            notify(ok and "Berhasil" or "Gagal", msg, not ok)
            importing = false
            task.wait(2.5)
            resetProg()
            if btn.Parent then btnLbl.Text = "IMPORT" end
        end)
    end)
    table.insert(rows, {frame = f, kind = info.kind, name = info.name})
end

local scanning = false
local function refresh()
    if scanning then return end
    scanning = true
    for _, r in ipairs(rows) do r.frame:Destroy() end
    table.clear(rows)
    if makefolder and isfolder and not isfolder(ASSET_FOLDER) then pcall(makefolder, ASSET_FOLDER) end
    setProg(0.5, "Memindai file...")
    local files = scanFiles()
    for i, info in ipairs(files) do addRow(info, i) end
    statFiles.Text = tostring(#files)
    applyFilter()
    resetProg()
    if #files > 0 then
        notify("Pemindaian selesai", "Ditemukan " .. #files .. " file asset.", false)
    else
        notify("Kosong", "Tidak ada file asset di workspace/" .. ASSET_FOLDER, true)
    end
    scanning = false
end
rescan.MouseButton1Click:Connect(function()
    tween(rescanIcon, 0.4, {Rotation = rescanIcon.Rotation + 360})
    refresh()
end)

showTab("Library")
openMain()
task.defer(refresh)
