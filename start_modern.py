#!/usr/bin/env python3
"""Module implementation."""

import asyncio
import contextlib
import os
import sys
from pathlib import Path
import threading
import json
from typing import Optional, Dict, Any
import signal
import numpy as np
import subprocess

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Add the required entry (Python).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from viser_backend import WaveVisualizationServer

# Handle the current operation (JSON, numpy).
class NumpyJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, (np.generic, np.number)):
            return obj.item()
        elif isinstance(obj, (np.floating, np.complexfloating)):
            return float(obj)
        elif isinstance(obj, (np.integer, np.bool_)):
            return int(obj)
        return super().default(obj)


class ModernControlWave:
    def __init__(self, frontend_port=8080, viser_port=8081):
        self.frontend_port = frontend_port
        self.viser_port = viser_port
        self.base_dir = Path(__file__).resolve().parent
        self.workspace_dir = self.base_dir.parent
        
        # Implementation note (FastAPI).
        self.app = FastAPI(title="ControlWorld")
        self.setup_middleware()
        self.setup_routes()
        
        # Implementation note (Viser).
        self.viser_server = None
        self.viser_thread = None
        
        # Implementation note (WebSocket).
        self.active_connections: list[WebSocket] = []
        
        # Implementation note.
        self.is_shutting_down = False

    @staticmethod
    def _is_plugin_directory(folder: Path) -> bool:
        if folder.name.startswith('.') or folder.name.startswith('__'):
            return False
        if folder.is_dir():
            return True
        if folder.is_symlink():
            with contextlib.suppress(Exception):
                return folder.resolve().is_dir()
        return False

    @staticmethod
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

    @classmethod
    def _find_plugin_file(cls, plugin_dir: Path, filenames):
        """Find a plugin file in the root or one immediate child directory."""
        if isinstance(filenames, str):
            filenames = (filenames,)
        for entry_dir in cls._iter_plugin_entry_directories(plugin_dir):
            for filename in filenames:
                candidate = entry_dir / filename
                if candidate.is_file():
                    return candidate
        return None

    @staticmethod
    def _has_scoped_plugin_file(plugin_dir: Path, filenames) -> bool:
        """Check a plugin root and its two canonical WebUI directories."""
        if isinstance(filenames, str):
            filenames = (filenames,)
        entry_dirs = (
            plugin_dir,
            plugin_dir / "webui_controlworld",
            plugin_dir / "webui",
        )
        return any((entry_dir / filename).is_file()
                   for entry_dir in entry_dirs for filename in filenames)

    @classmethod
    def _iter_plugin_roots(cls, container: Path, filenames=("index.js",)):
        """Yield one plugin or the plugins inside a one-level collection repo."""
        if cls._has_scoped_plugin_file(container, filenames):
            yield container
            return
        try:
            children = sorted(container.iterdir())
        except (FileNotFoundError, NotADirectoryError, PermissionError, OSError):
            return
        for child in children:
            if (cls._is_plugin_directory(child)
                    and cls._has_scoped_plugin_file(child, filenames)):
                yield child

    @staticmethod
    def _plugin_asset_url(plugin_dir: Path, asset_path: Path) -> str:
        relative_path = asset_path.relative_to(plugin_dir).as_posix()
        return f"/plugins/{plugin_dir.name}/{relative_path}"

    @staticmethod
    def _has_core_space_entries(folder: Path) -> bool:
        if not folder.exists() or not folder.is_dir():
            return False
        return any(item.is_dir() and not item.name.startswith('.') for item in folder.iterdir())

    def _resolve_core_space_path(self) -> Path:
        env_path = os.environ.get("CONTROLWORLD_CORE_SPACE")
        raw_candidates = []
        if env_path:
            raw_candidates.append(Path(env_path))
        raw_candidates.extend([
            self.base_dir / "core_space",
            self.workspace_dir / "core_space",
            Path.cwd() / "core_space",
        ])

        candidates = []
        seen = set()
        for candidate in raw_candidates:
            resolved = candidate.expanduser().resolve()
            if str(resolved) in seen:
                continue
            seen.add(str(resolved))
            candidates.append(resolved)

        for candidate in candidates:
            if self._has_core_space_entries(candidate):
                return candidate

        for candidate in candidates:
            if candidate.exists() and candidate.is_dir():
                return candidate

        return candidates[0]
    
    def setup_middleware(self):
        """Setup middleware implementation."""
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    
    def setup_routes(self):
        """Setup routes implementation."""
        
        @self.app.get("/")
        async def root():
            """Root implementation."""
            # Load the required resource (HTML).
            with open("controlworld_index.html", "r", encoding="utf-8") as f:
                html_content = f.read()
            
            # Add the required entry (script, link).
            import time
            timestamp = int(time.time())
            
            # Add the required entry (script, src).
            html_content = html_content.replace('.js"', f'.js?t={timestamp}"')
            # Add the required entry (link, href).
            html_content = html_content.replace('.css"', f'.css?t={timestamp}"')
            
            return HTMLResponse(content=html_content)
        
        @self.app.get("/api/status")
        async def get_status():
            """Get status implementation."""
            return {
                "status": "running",
                "viser_port": self.viser_port,
                "viser_active": self.viser_server is not None
            }
        
        @self.app.get("/api/waves")
        async def get_waves():
            """Get waves implementation."""
            if self.viser_server:
                return {"waves": self.viser_server.waves}
            return {"waves": []}
        
        @self.app.get("/api/core_space/list")
        async def list_core_space():
            """List core space implementation."""
            core_space_path = self._resolve_core_space_path()
            if not core_space_path.exists():
                return {"folders": []}
            
            folders = []
            for folder in sorted(core_space_path.iterdir(), reverse=True):
                if folder.is_dir() and not folder.name.startswith('.'):
                    # Parse the required value.
                    parts = folder.name.split('_')
                    
                    # Handle the current operation.
                    # Implementation note (1, _182640_epoch0_step100_stage0_waves1).
                    # Implementation note (2, _202510_step20_stage0_waves1).
                    
                    folder_info = {
                        "name": folder.name,
                        "timestamp": parts[0] + '_' + parts[1] if len(parts) >= 2 else '',
                    }
                    
                    # Find the required resource.
                    epoch_idx = -1
                    step_idx = -1
                    stage_idx = -1
                    waves_idx = -1
                    
                    for i, part in enumerate(parts):
                        if 'epoch' in part:
                            epoch_idx = i
                        elif 'step' in part:
                            step_idx = i
                        elif 'stage' in part:
                            stage_idx = i
                        elif 'waves' in part:
                            waves_idx = i
                    
                    # Parse the required value.
                    folder_info["epoch"] = parts[epoch_idx].replace('epoch', '') if epoch_idx != -1 else 'N/A'
                    folder_info["step"] = parts[step_idx].replace('step', '') if step_idx != -1 else 'N/A'
                    folder_info["stage"] = parts[stage_idx].replace('stage', '') if stage_idx != -1 else 'N/A'
                    folder_info["waves"] = parts[waves_idx].replace('waves', '') if waves_idx != -1 else '1'
                    
                    folders.append(folder_info)
            
            return {"folders": folders}
        
        @self.app.get("/api/core_space/samples/{folder}")
        async def list_samples(folder: str):
            """List samples implementation."""
            folder_path = self._resolve_core_space_path() / folder
            if not folder_path.exists():
                return {"samples": []}
            
            samples = set()
            for file in folder_path.iterdir():
                if file.name.startswith("sample_") and file.name.endswith("_text.txt"):
                    sample_id = file.name.replace("_text.txt", "")
                    samples.add(sample_id)
            
            return {"samples": sorted(list(samples))}
        
        @self.app.get("/api/plugins/scan")
        async def scan_plugins():
            """Scan plugins implementation."""
            plugins_path = Path("plugins")
            if not plugins_path.exists():
                return {"plugins": [], "duplicates": []}
            
            plugins = []
            seen_ids = {}  # Record the current state (ID).
            duplicates = []  # Record the current state.
            
            # Scan the available resources.
            plugin_roots = []
            for container in sorted(plugins_path.iterdir()):
                if not self._is_plugin_directory(container):
                    continue
                plugin_roots.extend(self._iter_plugin_roots(container))

            for folder in plugin_roots:
                index_js = self._find_plugin_file(folder, "index.js")
                    
                if index_js is not None:
                    try:
                        # Load the required resource (index.js).
                        with open(index_js, 'r', encoding='utf-8') as f:
                            content = f.read()
                        
                        mtime_tag = int(index_js.stat().st_mtime)
                        # Parse the required value.
                        plugin_info = {
                            "folder": folder.name,
                            "path": f"{self._plugin_asset_url(folder, index_js)}?t={mtime_tag}",
                            "hasViserBackend": self._find_plugin_file(
                                folder, ("viser_backend.py", "backend.py", "plugin_backend.py")
                            ) is not None,
                            "hasApiHandler": self._find_plugin_file(folder, "api_handler.py") is not None
                        }
                        
                        # Parse the required value (ID).
                        # Find the required resource (id, xxx).
                        import re
                        id_match = re.search(r"id\s*:\s*['\"]([^'\"]+)['\"]", content)
                        name_match = re.search(r"name\s*:\s*['\"]([^'\"]+)['\"]", content)
                        version_match = re.search(r"version\s*:\s*['\"]([^'\"]+)['\"]", content)
                        author_match = re.search(r"author\s*:\s*['\"]([^'\"]+)['\"]", content)
                        description_match = re.search(r"description\s*:\s*['\"]([^'\"]+)['\"]", content)
                        order_match = re.search(r"order\s*:\s*(\d+)", content)
                        
                        if id_match:
                            plugin_id = id_match.group(1)
                            plugin_info["id"] = plugin_id
                            
                            # Validate the current state (ID).
                            if plugin_id in seen_ids:
                                duplicates.append({
                                    "id": plugin_id,
                                    "folders": [seen_ids[plugin_id]["folder"], folder.name],
                                    "message": f"插件ID '{plugin_id}' 在文件夹 '{seen_ids[plugin_id]['folder']}' 和 '{folder.name}' 中重复"
                                })
                                continue  # Manage the plugin state.
                            else:
                                seen_ids[plugin_id] = plugin_info
                        else:
                            # Handle the conditional case (ID).
                            plugin_info["id"] = folder.name
                        
                        plugin_info["name"] = name_match.group(1) if name_match else folder.name
                        plugin_info["version"] = version_match.group(1) if version_match else "1.0.0"
                        plugin_info["author"] = author_match.group(1) if author_match else "Unknown"
                        plugin_info["description"] = description_match.group(1) if description_match else ""
                        plugin_info["order"] = int(order_match.group(1)) if order_match else 999
                        plugin_info["isLocal"] = True
                        plugin_info["isOfficial"] = False  # Implementation note.
                        
                        plugins.append(plugin_info)
                        
                    except Exception as e:
                        print(f"❌ 无法解析插件 {folder.name}: {e}")
                        # Add the required entry.
                        plugins.append({
                            "id": folder.name,
                            "name": folder.name,
                            "folder": folder.name,
                            "path": f"{self._plugin_asset_url(folder, index_js)}?t={mtime_tag}",
                            "version": "1.0.0",
                            "author": "Unknown",
                            "description": "",
                            "order": 999,
                            "hasViserBackend": self._find_plugin_file(
                                folder, ("viser_backend.py", "backend.py", "plugin_backend.py")
                            ) is not None,
                            "hasApiHandler": self._find_plugin_file(folder, "api_handler.py") is not None,
                            "isLocal": True,
                            "isOfficial": False
                        })
            
            # Sort the entries (order).
            plugins.sort(key=lambda x: x.get("order", 999))
            
            return {"plugins": plugins, "duplicates": duplicates}
        
        @self.app.post("/api/plugins/download")
        async def download_plugin(request: Request):
            """Download plugin implementation."""
            import subprocess
            import shutil
            import tempfile
            from urllib.parse import urlparse
            
            # Get the required value (JSON).
            data = await request.json()
            url = data.get('url', '')
            
            if not url:
                return {
                    "status": "error",
                    "message": "URL参数缺失"
                }
            
            def parse_repo_url(raw_url: str):
                parsed = urlparse(raw_url)
                if parsed.scheme not in ("http", "https") or not parsed.netloc:
                    return None, "请提供有效的GitHub或Hugging Face仓库URL"

                host = parsed.netloc.lower()
                if host.startswith("www."):
                    host = host[4:]

                allowed_hosts = {"github.com", "huggingface.co", "hf.co"}
                if host not in allowed_hosts:
                    return None, "请提供有效的GitHub或Hugging Face仓库URL"

                path_parts = [part for part in parsed.path.split('/') if part]
                if not path_parts:
                    return None, "仓库URL缺少路径"

                tree_index = path_parts.index("tree") if "tree" in path_parts else None
                subfolder_path = None

                if tree_index is not None:
                    if len(path_parts) <= tree_index + 1:
                        return None, "无效的仓库子文件夹URL"
                    subfolder_parts = path_parts[tree_index + 2:]
                    subfolder_path = "/".join(subfolder_parts) if subfolder_parts else None
                    base_parts = path_parts[:tree_index]
                else:
                    base_parts = path_parts

                if not base_parts:
                    return None, "仓库URL缺少仓库名"

                base_parts[-1] = base_parts[-1].removesuffix(".git")
                repo_name = base_parts[-1]

                if host == "github.com" and len(base_parts) < 2:
                    return None, "GitHub仓库URL应包含用户名和仓库名"

                if host in {"huggingface.co", "hf.co"}:
                    # Implementation note (spaces, datasets, models, user, repo).
                    if base_parts[0] in {"spaces", "datasets", "models"}:
                        if len(base_parts) < 3:
                            return None, "Hugging Face仓库URL格式不完整"
                    # Handle the current operation (repo_name).

                repo_url = f"{parsed.scheme}://{parsed.netloc}/{'/'.join(base_parts)}"
                if host == "github.com" and not repo_url.endswith(".git"):
                    repo_url = f"{repo_url}.git"

                return {
                    "host": host,
                    "repo_url": repo_url,
                    "repo_name": repo_name,
                    "subfolder_path": subfolder_path
                }, None

            parsed_info, parse_error = parse_repo_url(url)
            if parse_error:
                return {
                    "status": "error",
                    "message": parse_error
                }
            
            try:
                repo_url = parsed_info["repo_url"]
                repo_name = parsed_info["repo_name"]
                subfolder_path = parsed_info["subfolder_path"]
                
                plugins_path = Path("plugins")
                plugins_path.mkdir(exist_ok=True)
                
                # Use a temporary value.
                with tempfile.TemporaryDirectory() as temp_dir:
                    temp_path = Path(temp_dir)
                    
                    print(f"🔄 克隆仓库: {repo_url}")
                    
                    # Implementation note (git, clone).
                    result = subprocess.run(
                        ['git', 'clone', '--depth', '1', repo_url, str(temp_path / repo_name)],
                        capture_output=True,
                        text=True
                    )
                    
                    if result.returncode != 0:
                        return {
                            "status": "error",
                            "message": f"Git克隆失败: {result.stderr}"
                        }
                    
                    # Manage the required filesystem resource.
                    if subfolder_path:
                        source_path = temp_path / repo_name / subfolder_path
                        plugin_name = subfolder_path.split('/')[-1]
                    else:
                        source_path = temp_path / repo_name
                        plugin_name = repo_name
                    
                    # Validate the current state.
                    if not source_path.exists():
                        return {
                            "status": "error",
                            "message": f"找不到插件路径: {source_path}"
                        }
                    
                    # Validate the current state (index.js).
                    if self._find_plugin_file(source_path, "index.js") is None:
                        return {
                            "status": "error",
                            "message": "该目录不是有效的插件（缺少index.js文件）"
                        }
                    
                    # Manage the required filesystem resource.
                    target_path = plugins_path / plugin_name
                    
                    # Handle the conditional case.
                    if target_path.exists():
                        # Implementation note (API).
                        shutil.rmtree(target_path)
                    
                    # Copy the required data.
                    shutil.copytree(source_path, target_path,
                                   symlinks=True,
                                   ignore_dangling_symlinks=True)

                    # Update the current state.
                    venv_dirs = list(target_path.glob('.venv*')) + list(target_path.glob('venv*'))
                    for venv_dir in venv_dirs:
                        if venv_dir.is_dir() and (venv_dir / 'pyvenv.cfg').exists():
                            print(f"🔧 检测到虚拟环境 {venv_dir.name}，正在修复符号链接...")
                            try:
                                bin_dir = venv_dir / 'bin'
                                if not bin_dir.exists():
                                    bin_dir = venv_dir / 'Scripts'  # Windows

                                if bin_dir.exists():
                                    # Remove the obsolete entry (python).
                                    for link in bin_dir.glob('python*'):
                                        if link.is_symlink():
                                            link.unlink()

                                    # Create the required object (Python).
                                    python_exe = Path(sys.executable)
                                    (bin_dir / 'python').symlink_to(python_exe)
                                    (bin_dir / 'python3').symlink_to(python_exe)

                                    # Update the current state (pyvenv.cfg, home).
                                    cfg_file = venv_dir / 'pyvenv.cfg'
                                    if cfg_file.exists():
                                        cfg_content = cfg_file.read_text()
                                        # Update the current state (home, Python).
                                        import re
                                        python_home = str(python_exe.parent)
                                        cfg_content = re.sub(
                                            r'home = .*',
                                            f'home = {python_home}',
                                            cfg_content
                                        )
                                        cfg_file.write_text(cfg_content)

                                    print(f"✅ 虚拟环境 {venv_dir.name} 符号链接已修复")

                                    # Validate the current state.
                                    setup_script = self._find_plugin_file(target_path, 'setup_venv.sh')
                                    requirements_file = self._find_plugin_file(
                                        target_path, ('requirements.txt', 'requirement.txt')
                                    )

                                    if setup_script is not None:
                                        print(f"📦 检测到 setup_venv.sh，正在运行安装脚本...")
                                        result = subprocess.run(
                                            ['bash', setup_script.name],
                                            cwd=str(setup_script.parent),
                                            capture_output=True,
                                            text=True,
                                            timeout=600  # Implementation note.
                                        )
                                        if result.returncode == 0:
                                            print(f"✅ 依赖安装成功")
                                        else:
                                            print(f"⚠️  依赖安装失败: {result.stderr}")
                                    elif requirements_file is not None:
                                        print(f"📦 检测到 {requirements_file.name}，正在安装依赖...")
                                        pip_exe = bin_dir / 'pip'
                                        if not pip_exe.exists():
                                            pip_exe = bin_dir / 'pip3'
                                        result = subprocess.run(
                                            [str(bin_dir / 'python'), '-m', 'pip', 'install', '-r', str(requirements_file)],
                                            cwd=str(target_path),
                                            capture_output=True,
                                            text=True,
                                            timeout=600
                                        )
                                        if result.returncode == 0:
                                            print(f"✅ 依赖安装成功")
                                        else:
                                            print(f"⚠️  依赖安装失败: {result.stderr}")
                                else:
                                    print(f"⚠️  虚拟环境 {venv_dir.name} 缺少 bin 目录")
                            except subprocess.TimeoutExpired:
                                print(f"⚠️  依赖安装超时（超过10分钟）")
                            except Exception as e:
                                print(f"⚠️  虚拟环境 {venv_dir.name} 修复失败: {str(e)}")

                    print(f"✅ 插件安装成功: {plugin_name}")
                    
                    # Generate the required output (index.js, iframe).
                    index_js_path = self._find_plugin_file(target_path, "index.js")
                    if index_js_path is None:
                        index_js_path = target_path / "index.js"
                        iframe_src = f"/plugins/{plugin_name}/index.html"
                        wrapper = f"""import {{ ControlWavePlugin }} from '../plugin-loader.js';

export default class HFSpaceWrapper extends ControlWavePlugin {{
    constructor() {{
        super({{
            id: '{plugin_name}',
            name: '{plugin_name}',
            version: '0.0.1',
            author: 'HF Import',
            description: 'Imported from HF Space',
            needsViser: false
        }});
    }}

    async render(container) {{
        container.innerHTML = '';
        container.className = 'tab-content active';
        const frame = document.createElement('iframe');
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.border = 'none';
        frame.src = '{iframe_src}';
        container.appendChild(frame);
    }}
}}
"""
                        try:
                            index_js_path.write_text(wrapper, encoding="utf-8")
                            print(f"ℹ️ 插件缺少 index.js，已生成 iframe 包装指向 {iframe_src}")
                        except Exception as e:
                            print(f"⚠️ 生成包装 index.js 失败: {e}")
                    
                    # Load the required resource.
                    plugin_info = {"id": plugin_name, "name": plugin_name}
                    try:
                        with open(index_js_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            
                        import re
                        id_match = re.search(r"id\s*:\s*['\"]([^'\"]+)['\"]", content)
                        name_match = re.search(r"name\s*:\s*['\"]([^'\"]+)['\"]", content)
                        
                        if id_match:
                            plugin_info["id"] = id_match.group(1)
                        if name_match:
                            plugin_info["name"] = name_match.group(1)
                    except:
                        pass
                    
                    return {
                        "status": "success",
                        "message": f"插件 '{plugin_info['name']}' 安装成功",
                        "pluginId": plugin_info["id"],
                        "pluginName": plugin_info["name"],
                        "pluginPath": str(target_path)
                    }
                    
            except subprocess.CalledProcessError as e:
                return {
                    "status": "error",
                    "message": f"执行git命令失败: {str(e)}"
                }
            except Exception as e:
                import traceback
                traceback.print_exc()
                return {
                    "status": "error",
                    "message": f"安装插件时发生错误: {str(e)}"
                }
        
        @self.app.delete("/api/plugins/{plugin_id}")
        async def disable_plugin(plugin_id: str):
            """Compatibility endpoint: unregister only; never delete plugin files."""
            return {
                "status": "success",
                "pluginId": plugin_id,
                "message": f"Plugin {plugin_id} was disabled; local files were retained.",
                "filesRetained": True,
            }

        @self.app.get("/api/core_space/load/{folder}/{sample}")
        async def load_sample(folder: str, sample: str, frame: int = 0):
            """Load sample implementation."""
            import numpy as np
            
            folder_path = self._resolve_core_space_path() / folder
            if not folder_path.exists():
                return {"error": "Folder not found"}, 404
            
            result = {}
            
            # Load the required resource.
            text_file = folder_path / f"{sample}_text.txt"
            if text_file.exists():
                with open(text_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    lines = content.strip().split('\n')
                    
                    # Parse the required value.
                    result["text"] = ""
                    result["sequence"] = ""
                    result["world_info"] = {}
                    
                    for line in lines:
                        if line.startswith("Text:"):
                            result["text"] = line.replace("Text:", "").strip()
                        elif line.startswith("Sequence:"):
                            result["sequence"] = line.replace("Sequence:", "").strip()
                        elif line.startswith("Ground Truth:"):
                            if "world_scale_gt" not in result["world_info"]:
                                result["world_info"]["world_scale_gt"] = line.replace("Ground Truth:", "").strip()
                        elif line.startswith("Predicted (mean):"):
                            result["world_info"]["world_scale_pred_mean"] = line.replace("Predicted (mean):", "").strip()
                        elif line.startswith("Predicted (range):"):
                            result["world_info"]["world_scale_pred_range"] = line.replace("Predicted (range):", "").strip()
                        elif line.startswith("Error:"):
                            result["world_info"]["world_scale_error"] = line.replace("Error:", "").strip()
            
            # Load the required resource.
            gen_file = folder_path / f"{sample}_generated.npz"
            if gen_file.exists():
                data = np.load(gen_file, allow_pickle=True)
                # Handle the current operation.
                wave_params = []
                if "wave_params" in data:
                    wp = data["wave_params"]
                    # Handle the current operation.
                    if wp.ndim == 3:  # (batch, num_waves, params)
                        wave_params = wp[0].tolist()  # Implementation note (batch).
                    elif wp.ndim == 2:  # (num_waves, params)
                        wave_params = wp.tolist()
                    else:
                        wave_params = []
                
                result["generated"] = {
                    "wave_params": wave_params,
                    "camera_position": data["camera_position"].tolist() if "camera_position" in data else [0, 0, 0],
                    "camera_rotation": data["camera_rotation"].tolist() if "camera_rotation" in data else [0, 0, 0],
                    "camera_fov": float(data["camera_fov"]) if "camera_fov" in data else 60.0,
                    "camera_near": float(data["camera_near"]) if "camera_near" in data else 0.1,
                    "camera_far": float(data["camera_far"]) if "camera_far" in data else 1000.0,
                    "camera_scene_scale": float(data["camera_scene_scale"]) if "camera_scene_scale" in data else 10.0,
                }
                
                # Parse the required value (decay_params).
                if "decay_params" in data:
                    decay_params = data["decay_params"]
                    if isinstance(decay_params, list):
                        result["generated"]["decay_params"] = [
                            item.tolist() if hasattr(item, 'tolist') else item 
                            for item in decay_params
                        ]
                    else:
                        result["generated"]["decay_params"] = decay_params.tolist()
            
            # Initialize the required state (GT).
            result["gt"] = {}
            
            # Get the required value (COLMAP).
            cameras_bin_path = folder_path / f"{sample}_cameras.bin"
            images_bin_path = folder_path / f"{sample}_images.bin"
            images_folder = folder_path / f"{sample}_images"
            
            # Get the required value.
            if images_folder.exists():
                image_files = list(images_folder.glob("*.jpg")) + list(images_folder.glob("*.png"))
                result["gt"]["total_frames"] = len(image_files)
            else:
                result["gt"]["total_frames"] = 1
            
            result["gt"]["current_frame"] = frame
            
            # Load the required resource (GT).
            gt_file = folder_path / f"{sample}_gt.npz"
            if gt_file.exists():
                data = np.load(gt_file)
                
                # Configure the camera state.
                if "camera_poses" in data:
                    poses = data["camera_poses"]
                    if len(poses.shape) == 3:  # [T, 4, 4]
                        result["gt"]["camera_poses"] = poses.tolist()  # Implementation note.
                        # Update the current state.
                        result["gt"]["total_frames"] = poses.shape[0]
                    else:
                        result["gt"]["camera_poses"] = [poses.tolist()]  # Implementation note.
                
                # Handle the conditional case (VGGT).
                if "vggt_pose_enc" in data:
                    vggt_poses = data["vggt_pose_enc"]  # [T, 9] format
                    result["gt"]["vggt_pose_enc"] = vggt_poses.tolist()
                    # Parse the required value (VGGT, T, D, quaternion, FoV).
                    if len(vggt_poses.shape) == 2 and vggt_poses.shape[1] == 9:
                        # Parse the required value.
                        first_pose = vggt_poses[0]
                        result["gt"]["vggt_camera_info"] = {
                            "translation": first_pose[:3].tolist(),
                            "quaternion": first_pose[3:7].tolist(),  # [w, x, y, z]
                            "fov": first_pose[7:9].tolist()  # [fov_x, fov_y]
                        }
            else:
                # Load the required resource (GT, COLMAP).
                if images_bin_path.exists() and cameras_bin_path.exists():
                    try:
                        # Load the required resource (COLMAP).
                        # Return the resulting value.
                        result["gt"]["camera_poses"] = []
                    except:
                        result["gt"]["camera_poses"] = []
                else:
                    result["gt"]["camera_poses"] = []
            
            # Add the required entry.
            result["file_paths"] = {
                "ply": str(folder_path / f"{sample}_points.ply") if (folder_path / f"{sample}_points.ply").exists() else None,
                "cameras": str(folder_path / f"{sample}_cameras.bin") if (folder_path / f"{sample}_cameras.bin").exists() else None,
                "images": str(folder_path / f"{sample}_images.bin") if (folder_path / f"{sample}_images.bin").exists() else None,
                "images_folder": str(folder_path / f"{sample}_images") if (folder_path / f"{sample}_images").exists() else None,
            }
            
            return result
        
        @self.app.post("/api/generate")
        async def generate(params: Dict[str, Any]):
            """Generate implementation."""
            # Handle the current operation.
            await self.broadcast({
                "type": "generation_started",
                "params": params
            })
            
            # Generate the required output (TODO).
            
            return {"status": "success", "message": "Generation started"}
        
        @self.app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            """Websocket endpoint implementation."""
            await websocket.accept()
            self.active_connections.append(websocket)
            
            try:
                # Send the message.
                await self.send_json_with_numpy(websocket, {
                    "type": "connected",
                    "viser_port": self.viser_port
                })
                
                while True:
                    # Receive the message.
                    data = await websocket.receive_json()
                    await self.handle_websocket_message(websocket, data)
                    
            except WebSocketDisconnect:
                self.active_connections.remove(websocket)
            except Exception as e:
                print(f"WebSocket error: {e}")
                if websocket in self.active_connections:
                    self.active_connections.remove(websocket)
        
        # Manage the required filesystem resource.
        if Path("static").exists():
            self.app.mount("/static", StaticFiles(directory="static"), name="static")
        
        # Ensure the required condition holds.
        plugins_dir = Path("plugins")
        if plugins_dir.exists():
            for container in sorted(plugins_dir.iterdir()):
                if not self._is_plugin_directory(container):
                    continue
                for folder in self._iter_plugin_roots(container):
                    try:
                        resolved = folder.resolve()
                    except FileNotFoundError:
                        continue
                    if resolved.is_dir():
                        mount_path = f"/plugins/{folder.name}"
                        # Implementation note.
                        if mount_path not in [route.path for route in self.app.routes if hasattr(route, "path")]:
                            self.app.mount(mount_path, StaticFiles(directory=str(resolved)), name=f"plugin-{folder.name}")

            # Manage the required filesystem resource (plugins, plugin-system.js).
            self.app.mount("/plugins", StaticFiles(directory="plugins"), name="plugins")
        
        # Manage the required filesystem resource (JS, CSS).
        for ext in ["js", "css"]:
            if Path(ext).exists():
                self.app.mount(f"/{ext}", StaticFiles(directory=ext), name=ext)
    
    async def handle_websocket_message(self, websocket: WebSocket, data: Dict[str, Any]):
        """Handle websocket message implementation."""
        msg_type = data.get("type")
        print(f"📨 收到WebSocket消息: {msg_type}")
        
        if msg_type == "update_visualization":
            # Implementation note (Viser).
            if self.viser_server:
                self.viser_server.update_visualization(
                    wave_index=data.get("waveIndex"),
                    time_value=data.get("time"),
                    use_phase_color=data.get("usePhaseColor")
                )
                await self.send_json_with_numpy(websocket, {
                    "type": "visualization_updated",
                    "status": "success"
                })
        
        elif msg_type == "get_viser_status":
            # Return the resulting value (Viser).
            await self.send_json_with_numpy(websocket, {
                "type": "viser_status",
                "active": self.viser_server is not None,
                "port": self.viser_port
            })
        
        elif msg_type == "plugin_message":
            # Handle the current operation.
            if self.viser_server:
                try:
                    response = self.viser_server.handle_message(data)
                    await self.send_json_with_numpy(websocket, {
                        "type": "plugin_response",
                        "plugin": data.get("plugin"),
                        "action": data.get("action"),  # Add the required entry (action).
                        "requestId": data.get("requestId"),  # Implementation note (requestId).
                        "status": "success",
                        "response": response
                    })
                except Exception as e:
                    await self.send_json_with_numpy(websocket, {
                        "type": "plugin_response",
                        "plugin": data.get("plugin"),
                        "requestId": data.get("requestId"),  # Implementation note (requestId).
                        "status": "error",
                        "message": str(e)
                    })
            else:
                await self.send_json_with_numpy(websocket, {
                    "type": "plugin_response",
                    "requestId": data.get("requestId"),  # Implementation note (requestId).
                    "status": "error",
                    "message": "Viser server not available"
                })
        
        elif msg_type == "update_training_visualization":
            # Maintain backward compatibility.
            # Convert the value to the required representation.
            plugin_message = {
                "plugin": "training-visualization",
                "action": "update_visualization",
                "data": data.get("data", {})
            }
            
            if self.viser_server:
                try:
                    response = self.viser_server.handle_message(plugin_message)
                    await self.send_json_with_numpy(websocket, {
                        "type": "training_visualization_updated",
                        "status": "success"
                    })
                except Exception as e:
                    await self.send_json_with_numpy(websocket, {
                        "type": "training_visualization_updated",
                        "status": "error",
                        "message": str(e)
                    })
    
    async def send_json_with_numpy(self, websocket: WebSocket, data: Dict[str, Any]):
        """Send json with numpy implementation."""
        json_str = json.dumps(data, cls=NumpyJSONEncoder)
        await websocket.send_text(json_str)
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast implementation."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await self.send_json_with_numpy(connection, message)
            except:
                disconnected.append(connection)
        
        # Implementation note.
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)
    
    def start_viser_backend(self):
        """Start viser backend implementation."""
        def run_viser():
            try:
                self.viser_server = WaveVisualizationServer(port=self.viser_port)
                self.viser_server.start_server(background_mode=False)
            except Exception as e:
                print(f"❌ Failed to start Viser: {e}")
        
        self.viser_thread = threading.Thread(target=run_viser, daemon=True)
        self.viser_thread.start()
        
        # Start the required service (Viser).
        import time
        time.sleep(3)
        print(f"✅ Viser backend started successfully (port: {self.viser_port})")
    
    def run(self, open_browser=True):
        """Run implementation."""
        print("🚀 Starting ControlWorld...")
        
        # Start the required service (Viser).
        self.start_viser_backend()
        
        # Get the required value (IP).
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except:
            local_ip = "localhost"
        
        print("\n" + "="*60)
        print("✅ ControlWorld started successfully!")
        print("="*60)
        print(f"🌐 Main interface: http://localhost:{self.frontend_port}")
        print(f"🌐 Network access: http://{local_ip}:{self.frontend_port}")
        print(f"🔧 Viser 3D: http://localhost:{self.viser_port}")
        print(f"📚 API documentation: http://localhost:{self.frontend_port}/docs")
        print("="*60)
        
        # Implementation note (SSH).
        is_ssh = bool(os.environ.get('SSH_CLIENT') or 
                     os.environ.get('SSH_TTY') or 
                     os.environ.get('SSH_CONNECTION'))
        
        # Implementation note.
        if open_browser:
            import webbrowser
            import threading
            import time
            
            def open_browser_delayed():
                time.sleep(2)  # Start the required service.
                url = f"http://localhost:{self.frontend_port}"
                print(f"\n🌐 Opening browser: {url}")
                try:
                    webbrowser.open(url)
                except Exception as e:
                    if is_ssh:
                        print("⚠️ Cannot open a browser over SSH; use the network URL above")
                    else:
                        print(f"⚠️ Could not open the browser automatically: {e}")
            
            threading.Thread(target=open_browser_delayed, daemon=True).start()
            
        if is_ssh:
            print("\n💡 SSH connection detected; use the network URL above")
        
        print("\nPress Ctrl+C to stop the server\n")
        
        # Start the required service (FastAPI).
        config = uvicorn.Config(
            self.app,
            host="0.0.0.0",
            port=self.frontend_port,
            log_level="info"
        )
        server = uvicorn.Server(config)
        
        # Handle the current operation.
        def signal_handler(signum, frame):
            print("\n🛑 Shutting down the server...")
            self.is_shutting_down = True
            if self.viser_server:
                self.viser_server.shutdown()
            server.should_exit = True
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Start the required service.
        server.run()



def main():
    """Main implementation."""
    import argparse
    
    parser = argparse.ArgumentParser(description="ControlWorld launcher")
    parser.add_argument("--frontend-port", type=int, default=8080, help="Frontend port")
    parser.add_argument("--viser-port", type=int, default=8081, help="Viser port")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser")
    
    args = parser.parse_args()
    
    # Validate the current state.
    try:
        import fastapi
        import uvicorn
    except ImportError:
        print("❌ Install the required dependencies: pip install fastapi uvicorn[standard]")
        sys.exit(1)
    
    # Create the required object.
    system = ModernControlWave(
        frontend_port=args.frontend_port,
        viser_port=args.viser_port
    )
    system.run(open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
