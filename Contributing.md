# Contributing to ControlWorld

Thank you for improving ControlWorld. General contribution information for the World Snapshot organization is available in the [project documentation](https://world-snapshot.github.io/doc/index.html?page=S6_materials/04_questions.md#how-to-contribute). This file describes the ControlWorld-specific workflow and plugin interface.

Bug reports, interface proposals, documentation improvements, and model plugins are welcome. When possible, maintainers aim to respond to issues and pull requests within 36 hours.

## What Belongs in This Repository

ControlWorld is the shared WebUI host. Contributions here should improve one or more of the following:

- plugin discovery, installation, lifecycle, and compatibility;
- the shared FastAPI, WebSocket, or Viser services;
- the host interface, accessibility, responsive layout, and inherited plugin style;
- developer documentation and reproducible examples;
- small reference plugins or tests for the plugin contract.

Model-specific inference, checkpoints, task registries, readers, and training code should normally remain in the model repository. For example, WSM v1 keeps its WebUI implementation in **WSMs/WSM_v1/webui** and ControlWorld loads it through the WSMs plugin submodule.

## Development Setup

~~~bash
git clone --recursive git@github.com:World-Snapshot/ControlWorld.git
cd ControlWorld

conda create -n WSM python=3.11 -y
conda activate WSM
pip install -r env/requirements.txt

python start_modern.py
~~~

The main interface is served at **http://localhost:8080** and the shared Viser service at **http://localhost:8081**. For remote development:

~~~bash
python start_modern.py --frontend-port 8080 --viser-port 8081 --no-browser
~~~

## Plugin Discovery

ControlWorld supports both direct plugins and repositories that contain multiple versioned plugins.

~~~text
plugins/
├── MyPlugin/
│   └── webui/
│       ├── index.js
│       └── viser_backend.py
└── WSMs/                         # plugin collection repository
    ├── WSM_v1/
    │   └── webui/
    │       ├── index.js
    │       └── viser_backend.py
    └── WSM_v2/                   # discovered when available
~~~

The scanner follows these rules:

1. Every direct child of **plugins/** may be a plugin or a plugin collection.
2. A plugin entry may be placed in the plugin root, **webui_controlworld/**, or **webui/**.
3. If a direct child is a collection, ControlWorld examines exactly one additional directory level for versioned plugins.
4. A frontend plugin requires **index.js**.
5. A backend may be named **viser_backend.py**, **backend.py**, or **plugin_backend.py**.
6. Plugin IDs must be unique. A duplicate ID is reported and is not registered twice.
7. Ordinary model directories are not searched recursively, so internal source folders are not mistaken for plugins.

The server exposes each discovered plugin through a flat asset alias such as **/plugins/WSM_v1/**. A model can therefore live inside a collection repository without changing the relative imports used by its standalone plugin layout.

## Recommended Plugin Layout

~~~text
MyModel/
├── model source and assets
└── webui_controlworld/            # webui/ is also supported
    ├── index.js                   # required frontend entry
    ├── config.json                # optional display/configuration metadata
    ├── viser_backend.py           # optional Python message/Viser backend
    ├── requirements.txt           # optional plugin dependencies
    └── README.md                  # recommended
~~~

For backward compatibility, **requirement.txt** and **setup_venv.sh** are recognized by the repository installer.

## Frontend Plugin

The browser plugin must default-export a class derived from the host base class. The base class currently retains the historical API name **ControlWavePlugin**; import that symbol exactly as shown.

For a direct entry at **plugins/my-first-plugin/index.js**:

~~~javascript
import { ControlWavePlugin } from '../plugin-loader.js';

export default class MyFirstPlugin extends ControlWavePlugin {
    constructor() {
        super({
            id: 'my-first-plugin',
            name: 'My First Plugin',
            version: '1.0.0',
            author: 'Your Name',
            description: 'A minimal ControlWorld plugin.',
            order: 100,
            needsViser: false,
            styleMode: 'inherit',
        });
    }

    async render(container) {
        container.innerHTML = '';

        const panel = document.createElement('section');
        panel.className = 'plugin-panel';

        const title = document.createElement('h2');
        title.textContent = this.name;

        const button = document.createElement('button');
        button.className = 'action-btn';
        button.textContent = 'Run';
        button.addEventListener('click', () => {
            button.textContent = 'Ready';
        });

        panel.append(title, button);
        container.appendChild(panel);
    }

    async destroy() {
        // Release timers, listeners, workers, object URLs, and other resources.
    }
}
~~~

For an entry inside **webui/** or **webui_controlworld/**, use:

~~~javascript
import { ControlWavePlugin } from '../../plugin-loader.js';
~~~

Metadata fields should use literal values in the constructor. The server reads **id**, **name**, **version**, **author**, **description**, and **order** before dynamically importing the module.

### Host Styling

The default **styleMode: 'inherit'** makes the plugin inherit ControlWorld typography, spacing, buttons, inputs, and theme variables. Prefer the shared classes and CSS variables in **static/style/**.

Use **styleMode: 'custom'** only when the plugin genuinely requires an independent design system. A custom plugin remains responsible for readable light and dark states, responsive behavior, and avoiding CSS leakage into other tabs.

### Lifecycle

A plugin should:

- keep heavy work out of **render()**;
- register event listeners only once;
- cancel timers and workers in **destroy()**;
- revoke temporary object URLs;
- preserve user-facing errors instead of failing silently;
- avoid global CSS selectors and unnecessary global JavaScript state.

Disabling a plugin in the Plugin Manager removes its tab and calls its cleanup hook, but does not delete the local plugin directory.

## Python Backend

A plugin that needs inference, filesystem access, long-running jobs, or Viser integration may provide a Python backend.

~~~python
from typing import Any

from plugin_base import PluginBackendBase


class PluginBackend(PluginBackendBase):
    def __init__(self, server):
        super().__init__(server)
        self.name = "my-first-plugin"
        self.display_name = "My First Plugin"

    def setup_gui(self) -> None:
        if self.viser is None:
            return
        self.gui_controls["status"] = self.viser.gui.add_markdown(
            "Use the browser tab to run this plugin."
        )

    def handle_ping(self, data: dict[str, Any]) -> dict[str, Any]:
        return {
            "status": "ok",
            "message": data.get("message", "pong"),
        }
~~~

**PluginBackendBase** maps an action named **ping** to **handle_ping(data)**. Exceptions are returned as structured handler errors.

The backend class should normally be named **PluginBackend**. **Backend** is also accepted for compatibility. Set **self.name** to the same ID used by the frontend plugin.

## Frontend–Backend Messages

Messages use the shared WebSocket connection and the following envelope:

~~~javascript
window.controlWaveWebSocket.send({
    type: 'plugin_message',
    plugin: 'my-first-plugin',
    action: 'ping',
    data: { message: 'hello' },
});
~~~

ControlWorld routes the message to the matching Python backend and broadcasts a **plugin_response** message. Plugins should include a request or job ID when more than one operation may be active. Long inference tasks should return quickly, run in a worker or background thread, and expose explicit polling or progress actions.

Do not open a second WebSocket when the shared connection is sufficient.

## Viser Integration

Set **needsViser: true** only when the plugin requires the shared 3D scene. The host attaches the Viser iframe when the tab becomes active and hides it for non-Viser plugins.

Use the backend lifecycle methods when scene state depends on the active tab:

~~~python
class PluginBackend(PluginBackendBase):
    def on_activate(self) -> None:
        # Show or refresh this plugin's scene objects.
        pass

    def on_deactivate(self) -> None:
        # Hide plugin-specific controls or scene objects.
        pass

    def shutdown(self) -> None:
        # Release persistent backend resources.
        pass
~~~

Prefer browser-tab controls for ordinary inference options. Reserve the Viser control panel for controls that directly manipulate a 3D scene.

## Plugin Installation

A plugin can be supplied as:

- a direct folder under **plugins/**;
- a symbolic link to another local repository;
- a submodule, including a collection such as **plugins/WSMs**;
- a supported GitHub or Hugging Face repository installed through the Plugin Manager.

For an existing ControlWorld clone:

~~~bash
git submodule update --init --recursive
~~~

The Plugin Manager's **Uninstall** action is non-destructive: it disables the plugin in the browser and retains every local file. The plugin remains listed as available to install again.

## Testing

Before opening a pull request:

~~~bash
python -m py_compile start_modern.py viser_backend.py
git diff --check
~~~

Then start ControlWorld and verify:

1. the plugin appears once in the Plugin Manager;
2. its name, version, author, and description are correct;
3. installing it creates a visible tab;
4. disabling it removes the tab without deleting files;
5. refreshing the page preserves the enabled state and tab order;
6. frontend assets load without 404 errors;
7. backend messages reach the intended plugin;
8. **destroy()** cleans up listeners and background work;
9. Viser is attached only when **needsViser** is enabled;
10. the interface remains usable at desktop and narrow widths.

Collection repositories should additionally test every versioned plugin independently.

## Pull Requests

Keep pull requests focused. Include:

- the problem and intended behavior;
- the affected plugin or host component;
- commands used for validation;
- screenshots for visible interface changes;
- migration notes for any plugin-contract change;
- confirmation that local plugin removal remains non-destructive.

Do not commit model checkpoints, datasets, inference outputs, environment builds, caches, or private paths.

## Reporting Problems

Use a GitHub issue for reproducible bugs, compatibility problems, and feature proposals. Include the ControlWorld commit, browser, operating system, plugin ID and version, relevant terminal output, browser-console errors, and the smallest reproducible sequence.

Security-sensitive reports should not include credentials, access tokens, private model paths, or private data in a public issue.
