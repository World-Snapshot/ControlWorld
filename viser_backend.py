#!/usr/bin/env python3
"""Module implementation."""

import time
import importlib
import importlib.util
import sys
from pathlib import Path
from typing import Dict, Any, Optional
import threading

import viser


def _iter_plugin_entry_directories(plugin_dir: Path):
    """Yield the plugin root and supported one-level entry directories."""
    yield plugin_dir

    try:
        children = {
            child.name: child
            for child in plugin_dir.iterdir()
            if not child.name.startswith(('.', '__')) and child.is_dir()
        }
    except (FileNotFoundError, NotADirectoryError, PermissionError, OSError):
        return

    for name in ('webui_controlworld', 'webui'):
        child = children.pop(name, None)
        if child is not None:
            yield child

    for name in sorted(children):
        yield children[name]


def _iter_plugin_files(plugin_dir: Path, filenames):
    """Yield matching files from the root and one immediate child directory."""
    for entry_dir in _iter_plugin_entry_directories(plugin_dir):
        for filename in filenames:
            candidate = entry_dir / filename
            if candidate.is_file():
                yield candidate


def _has_scoped_plugin_file(plugin_dir: Path, filenames) -> bool:
    """Check a plugin root and its two canonical WebUI directories."""
    entry_dirs = (
        plugin_dir,
        plugin_dir / "webui_controlworld",
        plugin_dir / "webui",
    )
    return any((entry_dir / filename).is_file()
               for entry_dir in entry_dirs for filename in filenames)


def _iter_plugin_roots(container: Path, filenames):
    """Yield one plugin or the plugins inside a one-level collection repo."""
    if _has_scoped_plugin_file(container, filenames):
        yield container
        return
    try:
        children = sorted(container.iterdir())
    except (FileNotFoundError, NotADirectoryError, PermissionError, OSError):
        return
    for child in children:
        if (not child.name.startswith(('.', '__'))
                and child.is_dir()
                and _has_scoped_plugin_file(child, filenames)):
            yield child


class WaveVisualizationServer:
    """WaveVisualizationServer implementation."""
    
    def __init__(self, port: int = 8081):
        self.port = port
        self.server = None
        self.plugins = {}
        self.plugin_aliases = {}
        self.is_running = False
        self.plugin_dropdown = None  # Manage the plugin state.
        self.plugin_folders = {}  # Manage the plugin state (GUI).
        self.current_plugin = None  # Handle the conditional case.
        self.plugin_names = {}  # Convert the value to the required representation (ID).
        
        print(f"🔧 Initializing Viser backend (port: {port})")
    
    def start_server(self, background_mode=True):
        """Start server implementation."""
        if self.is_running:
            print("⚠️ Viser server is already running")
            return self.server
            
        try:
            # Create the required object (Viser).
            self.server = viser.ViserServer(host="0.0.0.0", port=self.port)
            self.server.gui.configure_theme(titlebar_content=None, control_layout="collapsible")
            self.is_running = True
            
            # Configure the required value.
            self.setup_basic_scene()
            
            # Create the required object (GUI).
            self._create_plugin_selector()
            
            # Load the required resource.
            self._load_plugin_backends()
            
            print(f"✅ Viser server started successfully (port: {self.port})")
            print(f"📦 Loaded {len(self.plugins)} plugin backends")
            
            if background_mode:
                # Start the required service.
                def server_loop():
                    try:
                        while self.is_running:
                            time.sleep(0.01)
                    except Exception as e:
                        print(f"❌ Server loop error: {e}")
                
                thread = threading.Thread(target=server_loop, daemon=True)
                thread.start()
                return self.server
            else:
                # Start the required service.
                try:
                    while self.is_running:
                        time.sleep(0.01)
                except KeyboardInterrupt:
                    print("\n👋 Shutting down the Viser backend...")
                    
        except Exception as e:
            print(f"❌ Failed to start the Viser server: {e}")
            self.is_running = False
            raise
    
    def setup_basic_scene(self):
        """Setup basic scene implementation."""
        # Configure the required value.
        if self.server:
            # Create the required object (Viser).
            import numpy as np
            bg_color = [13, 13, 38]  # Implementation note.
            width, height = 1920, 1080
            solid_color_image = np.full((height, width, 3), bg_color, dtype=np.uint8)
            self.server.scene.set_background_image(solid_color_image, format="png")
            
            # Configure the required value.
            @self.server.on_client_connect
            def handle_client_connect(client):
                print("🔗 Client connected; configuring the background")
                # Display the relevant element.
                solid_color_image = np.full((height, width, 3), bg_color, dtype=np.uint8)
                self.server.scene.set_background_image(solid_color_image, format="png")
    
    def _create_plugin_selector(self):
        """Create plugin selector implementation."""
        if self.server:
            # Create the required object.
            self.plugin_dropdown = self.server.gui.add_dropdown(
                "Active Plugin",
                options=["No Plugin"],  # Implementation note.
                initial_value="No Plugin"
            )
            
            # Register the event listener.
            @self.plugin_dropdown.on_update
            def on_plugin_select(event):
                plugin_name = self.plugin_dropdown.value
                # Manage the plugin state (ID).
                plugin_id = None
                for pid, pname in self.plugin_names.items():
                    if pname == plugin_name:
                        plugin_id = pid
                        break
                
                if plugin_id:
                    self._switch_plugin_gui(plugin_id)
            
            print("📁 Created the plugin-selection menu")
    
    def _load_plugin_backends(self):
        """Load plugin backends implementation."""
        plugins_dir = Path("plugins")
        if not plugins_dir.exists():
            print("⚠️ Plugin directory does not exist")
            return
            
        # Add the required entry (plugins, Python).
        if str(plugins_dir.absolute()) not in sys.path:
            sys.path.insert(0, str(plugins_dir.absolute()))
            
        backend_files = ("viser_backend.py", "backend.py", "plugin_backend.py")
        for container in sorted(plugins_dir.iterdir()):
            if container.is_dir() and not container.name.startswith('.'):
                for plugin_dir in _iter_plugin_roots(container, backend_files):
                    self._load_single_plugin(plugin_dir)
    
    def _load_single_plugin(self, plugin_dir: Path):
        """Load single plugin implementation."""
        plugin_name = plugin_dir.name
        
        # Find the required resource.
        backend_files = ["viser_backend.py", "backend.py", "plugin_backend.py"]
        
        for backend_path in _iter_plugin_files(plugin_dir, backend_files):
            if backend_path.is_file():
                try:
                    # Keep the complete relative module name so imports inside a
                    # child package such as webui continue to work.
                    relative_module = backend_path.relative_to(plugin_dir).with_suffix("")
                    plugin_parts = plugin_dir.relative_to(Path("plugins")).parts
                    module_name = ".".join(
                        ("plugins", *plugin_parts, *relative_module.parts)
                    )
                    spec = importlib.util.spec_from_file_location(module_name, backend_path)
                    if spec and spec.loader:
                        module = importlib.util.module_from_spec(spec)
                        sys.modules[module_name] = module
                        spec.loader.exec_module(module)
                        
                        # Initialize the required state.
                        plugin_instance = None
                        
                        # Implementation note.
                        class_names = ['PluginBackend', 'Backend', f'{plugin_name.title()}Backend']
                        for class_name in class_names:
                            if hasattr(module, class_name):
                                plugin_class = getattr(module, class_name)
                                plugin_instance = plugin_class(self)
                                break
                        
                        if plugin_instance:
                            canonical_id = getattr(plugin_instance, 'name', None) or plugin_name
                            canonical_id = canonical_id.strip() if isinstance(canonical_id, str) else plugin_name
                            canonical_id = canonical_id or plugin_name

                            if canonical_id in self.plugins and self.plugins[canonical_id] is not plugin_instance:
                                print(f"⚠️ Plugin ID {canonical_id} already exists; using folder name {plugin_name}")
                                canonical_id = plugin_name

                            self.plugins[canonical_id] = plugin_instance
                            self._register_plugin_aliases(canonical_id, plugin_name)
                            print(f"✅ Loaded plugin backend: {plugin_name}")
                            
                            # Create the required object (GUI).
                            self._create_plugin_gui(plugin_name, plugin_dir, plugin_instance, canonical_id)
                        else:
                            print(f"⚠️ Plugin {plugin_name} has no backend class")
                            
                except Exception as e:
                    print(f"❌ Failed to load plugin backend {plugin_name}: {e}")
                    import traceback
                    traceback.print_exc()
                break
    
    def _register_plugin_aliases(self, canonical_id: str, plugin_name: str):
        """Register plugin aliases implementation."""
        alias_candidates = set()
        for value in (canonical_id, plugin_name):
            if not value:
                continue
            alias_candidates.add(value)
            alias_candidates.add(value.lower())
            alias_candidates.add(value.replace('_', '-'))
            alias_candidates.add(value.replace('-', '_'))
        
        for alias in alias_candidates:
            if alias:
                self.plugin_aliases[alias] = canonical_id

    def _normalize_plugin_id(self, plugin_id: Optional[str]) -> Optional[str]:
        """Normalize plugin id implementation."""
        if not plugin_id:
            return None
        if plugin_id in self.plugin_aliases:
            return self.plugin_aliases[plugin_id]
        lowered = plugin_id.lower()
        return self.plugin_aliases.get(lowered, plugin_id)

    def _create_plugin_gui(self, plugin_name: str, plugin_dir: Path, plugin_instance, canonical_id: str):
        """Create plugin gui implementation."""
        if not self.server:
            return
            
        # Display the relevant element.
        display_name = getattr(plugin_instance, 'display_name', None)
        
        if not display_name:
            # Load the required resource (config.json).
            config_path = next(_iter_plugin_files(plugin_dir, ("config.json",)), None)
            if config_path is not None:
                try:
                    import json
                    with open(config_path, 'r', encoding='utf-8') as f:
                        config = json.load(f)
                        display_name = config.get('name', plugin_name.replace('-', ' ').title())
                except:
                    display_name = plugin_name.replace('-', ' ').title()
            else:
                display_name = plugin_name.replace('-', ' ').title()
        
        # Save the current result.
        primary_id = canonical_id or plugin_name
        self.plugin_names[primary_id] = display_name
        
        # Create the required object (GUI).
        folder = self.server.gui.add_folder(f"{display_name} Controls")
        self.plugin_folders[primary_id] = folder
        
        # Hide the inactive element.
        folder.visible = False
        
        # Configure the required value (GUI).
        if hasattr(plugin_instance, 'setup_gui'):
            with folder:
                plugin_instance.setup_gui()
        
        # Update the current state.
        if self.plugin_dropdown:
            options = list(self.plugin_names.values())
            if options:  # Ensure the required condition holds.
                self.plugin_dropdown.options = options
                # Use the default value.
                if len(options) == 1:
                    self.plugin_dropdown.value = display_name
                    folder.visible = True
                    self.current_plugin = plugin_name
                # Switch to the selected state.
                elif self.plugin_dropdown.value == "No Plugin" and options:
                    self.plugin_dropdown.value = options[0]
                    folder.visible = True
                    self.current_plugin = plugin_name
        
        print(f"🏷️ Created GUI folder for plugin {plugin_name}")
    
    def handle_message(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle message implementation."""
        plugin_id = message.get('plugin')
        canonical_id = self._normalize_plugin_id(plugin_id)
        action = message.get('action')
        
        # Handle the current operation.
        if canonical_id == 'viser_backend' and action == 'switch_plugin':
            plugin_to_switch = message.get('data', {}).get('plugin_id')
            return self.switch_active_plugin(plugin_to_switch)
        
        if not canonical_id:
            return {"error": "No plugin specified"}
            
        if canonical_id in self.plugins:
            try:
                return self.plugins[canonical_id].handle_message(message)
            except Exception as e:
                print(f"❌ Plugin {canonical_id} failed to process message: {e}")
                import traceback
                traceback.print_exc()
                return {"error": str(e)}
        else:
            available_plugins = list(self.plugins.keys())
            return {
                "error": f"Plugin not found: {plugin_id}",
                "available_plugins": available_plugins
            }
    
    def switch_active_plugin(self, plugin_id: str) -> Dict[str, Any]:
        """Switch active plugin implementation."""
        canonical_id = self._normalize_plugin_id(plugin_id)
        print(f"🎯 Switched to plugin: {canonical_id}")
        
        if not canonical_id or canonical_id not in self.plugins:
            return {"error": f"Plugin not found: {plugin_id}"}
        
        # Switch to the selected state (GUI).
        self._switch_plugin_gui(canonical_id)
        
        # Update the current state.
        if self.plugin_dropdown and canonical_id in self.plugin_names:
            self.plugin_dropdown.value = self.plugin_names[canonical_id]
        
        return {"status": "success", "active_plugin": canonical_id}
    
    def _switch_plugin_gui(self, plugin_id: str):
        """Switch plugin gui implementation."""
        canonical_id = self._normalize_plugin_id(plugin_id)
        if not canonical_id:
            return
        
        # Hide the inactive element (GUI).
        for pid, folder in self.plugin_folders.items():
            folder.visible = False
            # Invoke the required handler (on_deactivate).
            if pid == self.current_plugin and pid != canonical_id:
                plugin = self.plugins.get(pid)
                if plugin and hasattr(plugin, 'on_deactivate'):
                    plugin.on_deactivate()
        
        # Display the relevant element (GUI).
        if canonical_id in self.plugin_folders:
            self.plugin_folders[canonical_id].visible = True
        
        # Record the current state.
        self.current_plugin = canonical_id
        
        # Invoke the required handler (on_activate).
        plugin = self.plugins.get(canonical_id)
        if plugin and hasattr(plugin, 'on_activate'):
            plugin.on_activate()
    
    def get_plugin(self, plugin_name: str):
        """Get plugin implementation."""
        canonical_id = self._normalize_plugin_id(plugin_name)
        return self.plugins.get(canonical_id)
    
    def shutdown(self):
        """Shutdown implementation."""
        print("🔄 Shutting down the Viser server...")
        self.is_running = False
        
        # Shut down the resource.
        for plugin_name, plugin in self.plugins.items():
            if hasattr(plugin, 'shutdown'):
                try:
                    plugin.shutdown()
                except Exception as e:
                    print(f"⚠️ Error while closing plugin {plugin_name}: {e}")
        
        # Implementation note (Viser).
        if self.server:
            try:
                self.server.scene.reset()
            except:
                pass
            self.server = None
            
        print("✅ Viser server stopped")


# Implementation note.
_viser_instance = None
_viser_lock = threading.Lock()


def get_viser_server(port: int = 8081) -> WaveVisualizationServer:
    """Get viser server implementation."""
    global _viser_instance
    
    with _viser_lock:
        if _viser_instance is None:
            _viser_instance = WaveVisualizationServer(port)
            _viser_instance.start_server(background_mode=True)
        
        return _viser_instance


def shutdown_viser_server():
    """Shutdown viser server implementation."""
    global _viser_instance
    
    with _viser_lock:
        if _viser_instance:
            _viser_instance.shutdown()
            _viser_instance = None


# Implementation note.
if __name__ == "__main__":
    server = WaveVisualizationServer()
    server.start_server(background_mode=False)
