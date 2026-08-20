-- Pull in the wezterm API
local wezterm = require 'wezterm'
-- This will hold the configuration.
local config = wezterm.config_builder()

-- This is where you actually apply your config choices

-- For example, changing the color scheme:
config.color_scheme = 'catppuccin-mocha'
local catppuccin_theme = wezterm.color.get_builtin_schemes()["catppuccin-mocha"]
config.colors = {
    cursor_bg = catppuccin_theme.selection_bg,
    cursor_fg = catppuccin_theme.selection_fg,
    split = catppuccin_theme.ansi[5],
		background = catppuccin_theme.visual_bell
}
config.font = wezterm.font('Maple Mono NF CN', {
    weight = "Bold"
})
config.font_size = 24.0
config.line_height = 1.2
config.keys = {{
    key = '\\',
    mods = 'CMD',
    action = wezterm.action.SplitHorizontal {
        domain = 'CurrentPaneDomain'
    }
}, {
    key = 'w',
    mods = 'CMD',
    action = wezterm.action.CloseCurrentPane {
        confirm = true
    }
}, {
    key = ']',
    mods = 'CMD',
    action = wezterm.action.SplitVertical {
        domain = 'CurrentPaneDomain'
    }
}, {
    key = 'r',
    mods = 'CMD',
    action = wezterm.action.ClearScrollback 'ScrollbackAndViewport'
}}


config.window_frame = {
    font_size = 20.0
}
config.front_end = "WebGpu"
config.webgpu_power_preference = 'HighPerformance'
config.hide_tab_bar_if_only_one_tab = true
config.use_fancy_tab_bar = true
config.enable_tab_bar = true
config.tab_max_width = 32
config.macos_window_background_blur = 50
config.switch_to_last_active_tab_when_closing_tab = true
config.inactive_pane_hsb = {
    saturation = 0.9,
    brightness = 0.65,
--	hue = 0.68
}
config.window_padding = {
	left = 20,
	right = 20,
	top = 20,
	bottom = 20
}

-- 自定义状态栏内容
wezterm.on('update-status', function(window, pane)
    -- 左侧状态项（如时间）
    local left_status = wezterm.strftime("%H:%M ")

    -- 右侧状态项（可组合多个信息）
    local bat = ''
    for _, b in ipairs(wezterm.battery_info()) do
        bat = string.format("%.0f%% ", b.state_of_charge * 100)
    end

    local hostname = wezterm.hostname()
    local right_status = bat .. " | " .. hostname

    -- 设置状态栏文本
    window:set_left_status(left_status)
    window:set_right_status(right_status)
end)

return config
