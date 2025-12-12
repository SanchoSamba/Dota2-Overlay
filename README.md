# Dota 2 Minimap and Info Overlay

A lightweight, customizable, and always-on-top overlay built with Electron for Dota 2. It integrates with Dota 2's Game State Integration (GSI) to provide real-time information such as creep wave positions, custom timing notifications, and unreliable gold display, visible only when the game is running.

## ✨ Features

* **Real-time Creep Tracking:** Displays the current position of enemy creep waves on the minimap based on game time, helping with lane timing and pulls.
* **Customizable Notifications:** Set time-based reminders for map events (e.g., Runes, Stack Timers) managed via multiple saveable templates.
* **Live Unreliable Gold Display:** Shows your current unreliable gold total directly on the overlay.
* **GSI Integration:** Utilizes the Dota 2 Game State Integration to pull live data such as game clock, hero status, and team name.
* **Configurable Overlay:**
    * **Resizable:** Easily change the width and height of the overlay/minimap canvas from the dedicated Settings window.
    * **Visibility Modes:** Toggle visibility (Visible, Hidden, or **Focused**—only visible when Dota 2 is the active window) via the system tray icon.
    * **Opacity Control:** Adjust the transparency of the entire overlay via the system tray menu.
* **Waypoint Editor:** Visually adjust creep pathing waypoints and segment timings directly within the Settings panel.

## 🛠️ Installation & Setup

### Prerequisites

1.  **Node.js:** Must have Node.js installed (LTS version recommended).
2.  **Dota 2 GSI Configuration:** You must set up Dota 2's GSI to send game data to the application.

### GSI Configuration

1.  Navigate to your Dota 2 configuration folder:
    * `C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta\game\dota\cfg\`
2.  Create a new folder named `gamestate_integration`.
3.  Inside the `gamestate_integration` folder, create a file named `gamestate_integration_overlay.cfg`.
4.  Paste the following content into the file:

```json
"Dota 2 Overlay"
{
	"uri" "[http://127.0.0.1:3000/gsi](http://127.0.0.1:3000/gsi)"
	"timeout" "5.0"
	"buffer" "0.1"
	"throttle" "0.1"
	"heartbeat" "30.0"
	"data"
	{
		"provider"      "1"
		"map"           "1"
		"player"        "1"
		"hero"          "1"
		"abilities"     "1"
		"items"         "1"
	}
}
