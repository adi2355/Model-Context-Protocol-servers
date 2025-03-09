from typing import Any, Dict, List
from mcp.server.fastmcp import FastMCP
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from functools import lru_cache
import json
import glob
import sys
from time import time



mcp = FastMCP("codebase")  # Changed to "codebase" to match working version

@mcp.resource(uri="file/list/{directory}")  # Changed URI to match working version
async def list_files(directory: str) -> list[str]:
    """List files in a given directory."""
    try:
        if not os.path.isdir(directory):
            return [f"Error: Not a directory: {directory}"]
        return os.listdir(directory)
    except Exception as e:
        return [str(e)]

@mcp.resource(uri="file/read/{filepath}")  # Changed URI to match working version
async def read_file(filepath: str) -> str:
    """Read and return file contents as text."""
    try:
        if not os.path.isfile(filepath):
            return "File not found."
        return cached_read_file(filepath)
    except Exception as e:
        return f"Error: {str(e)}"

@lru_cache(maxsize=100)
def cached_read_file(filepath: str) -> str:
    """Caches file reads to avoid re-reading the same file repeatedly."""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()

@mcp.resource(uri="file/info/{filepath}")
async def get_file_info(filepath: str) -> Dict[str, Any]:
    """Get file metadata."""
    try:
        stat = os.stat(filepath)
        return {
            "size": stat.st_size,
            "modified": stat.st_mtime,
            "created": stat.st_ctime
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool()
async def search_function(filepath: str, function_name: str) -> str:
    """Search for a function definition in a code file."""
    try:
        if not os.path.isfile(filepath):
            return "File not found."
        
        file_content = cached_read_file(filepath)
        lines = file_content.splitlines()

        # Handle both Python and JavaScript/TypeScript functions
        def_patterns = ["def ", "function ", "const ", "async function "]
        matching_lines = [
            line.strip() for line in lines
            if function_name in line and any(line.strip().startswith(p) for p in def_patterns)
        ]
        
        return (
            "Found function definition(s):\n" + "\n".join(matching_lines)
            if matching_lines else "Function not found."
        )
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.tool()
async def search_code(directory: str, search_term: str) -> str:
    """Search for any text across all code files."""
    results = []
    try:
        for root, _, files in os.walk(directory):
            for file in files:
                if file.endswith(('.js', '.jsx', '.ts', '.tsx', '.py', '.json')):
                    filepath = os.path.join(root, file)
                    try:
                        content = cached_read_file(filepath)
                        lines = content.splitlines()
                        for i, line in enumerate(lines, 1):
                            if search_term in line:
                                results.append(f"{filepath}:{i}: {line.strip()}")
                    except Exception:
                        continue
        return "\n".join(results) if results else "No matches found."
    except Exception as e:
        return f"Error searching: {str(e)}"

@mcp.tool()
async def get_project_structure(directory: str) -> str:
    """Get a tree-like structure of the project."""
    def create_tree(path: str, prefix: str = "") -> List[str]:
        try:
            entries = os.listdir(path)
            tree = []
            for i, entry in enumerate(sorted(entries)):
                if entry.startswith(('.', 'node_modules', '__pycache__')):
                    continue
                    
                full_path = os.path.join(path, entry)
                is_last = i == len(entries) - 1
                
                if os.path.isdir(full_path):
                    tree.append(f"{prefix}{'└──' if is_last else '├──'} 📁 {entry}/")
                    tree.extend(create_tree(full_path, prefix + ('    ' if is_last else '│   ')))
                else:
                    tree.append(f"{prefix}{'└──' if is_last else '├──'} 📄 {entry}")
            return tree
        except Exception as e:
            return [f"Error: {str(e)}"]
            
    tree = create_tree(directory)
    return "\n".join(tree)

@mcp.tool()
async def analyze_dependencies(directory: str) -> str:
    """Analyze project dependencies from package.json or requirements.txt."""
    try:
        result = []
        
        # Check for package.json
        package_json = os.path.join(directory, 'package.json')
        if os.path.exists(package_json):
            with open(package_json, 'r') as f:
                data = json.load(f)
                result.append("📦 Node.js Dependencies:")
                if 'dependencies' in data:
                    result.append("\nDependencies:")
                    for dep, version in data['dependencies'].items():
                        result.append(f"  - {dep}: {version}")
                if 'devDependencies' in data:
                    result.append("\nDev Dependencies:")
                    for dep, version in data['devDependencies'].items():
                        result.append(f"  - {dep}: {version}")
                        
        # Check for requirements.txt
        requirements_txt = os.path.join(directory, 'requirements.txt')
        if os.path.exists(requirements_txt):
            result.append("\n📜 Python Dependencies:")
            with open(requirements_txt, 'r') as f:
                for line in f:
                    if line.strip() and not line.startswith('#'):
                        result.append(f"  - {line.strip()}")
                        
        return "\n".join(result) if result else "No dependency files found."
    except Exception as e:
        return f"Error analyzing dependencies: {str(e)}"

@mcp.tool()
async def find_components(directory: str) -> str:
    """Find React/React Native components in the project."""
    try:
        components = []
        for ext in ['.jsx', '.tsx', '.js', '.ts']:
            for filepath in glob.glob(f"{directory}/**/*{ext}", recursive=True):
                try:
                    content = cached_read_file(filepath)
                    lines = content.splitlines()
                    
                    for i, line in enumerate(lines):
                        # Look for component definitions
                        if ('class' in line and 'extends' in line and 'Component' in line) or \
                           ('function' in line and '(' in line) or \
                           ('const' in line and '=>' in line):
                            if any(kw in line for kw in ['render', 'return', 'props', 'useState']):
                                rel_path = os.path.relpath(filepath, directory)
                                components.append(f"{rel_path}:{i+1}: {line.strip()}")
                except Exception:
                    continue
                    
        return "\n".join(components) if components else "No components found."
    except Exception as e:
        return f"Error finding components: {str(e)}"

@mcp.tool()
async def get_imports(filepath: str) -> str:
    """Analyze imports/dependencies in a specific file."""
    try:
        if not os.path.isfile(filepath):
            return "File not found."
            
        content = cached_read_file(filepath)
        lines = content.splitlines()
        
        imports = []
        for line in lines:
            line = line.strip()
            if line.startswith(('import ', 'from ', 'require(')):
                imports.append(line)
                
        return "\n".join(imports) if imports else "No imports found."
    except Exception as e:
        return f"Error analyzing imports: {str(e)}"

class CodeChangeHandler(FileSystemEventHandler):
    def __init__(self, mcp_server):
        self.mcp = mcp_server
        self.changed_files = set()
        self.last_notification_time = time()
        self.NOTIFICATION_COOLDOWN = 2  # seconds
        
    def on_modified(self, event):
        if event.is_directory:
            return
            
        if any(event.src_path.endswith(ext) for ext in ['.js', '.jsx', '.ts', '.tsx', '.py', '.json']):
            print(f"File changed: {event.src_path}", file=sys.stderr)
            self.changed_files.add(event.src_path)
            
            # Only notify after cooldown period to avoid spam
            current_time = time()
            if current_time - self.last_notification_time >= self.NOTIFICATION_COOLDOWN:
                self.notify_changes()
                self.last_notification_time = current_time

    def notify_changes(self):
        if not self.changed_files:
            return
            
        try:
            directory = os.path.dirname(next(iter(self.changed_files)))
            # Notify using the file/read pattern for individual files
            for filepath in self.changed_files:
                relative_path = os.path.relpath(filepath)
                self.mcp.notify_resource_updated(uri=f"file/read/{relative_path}")
            
            # Also notify the changes resource for the directory
            self.mcp.notify_resource_updated(uri=f"file/changes/{directory}")
            
            print(f"Notified changes for {len(self.changed_files)} files", file=sys.stderr)
            self.changed_files.clear()
            
        except Exception as e:
            print(f"Error notifying changes: {e}", file=sys.stderr)

@mcp.resource(uri="file/changes/{directory}")  # Changed to match file/list/{directory} pattern
async def get_recent_changes(directory: str) -> Dict[str, Any]:
    """Get only recently modified files (last 5 minutes) in the given directory."""
    try:
        recent_changes = {}
        current_time = time()
        time_window = 300  # 5 minutes
        
        for root, _, files in os.walk(directory):
            for file in files:
                if any(file.endswith(ext) for ext in ['.js', '.jsx', '.ts', '.tsx', '.py', '.json']):
                    if 'node_modules' not in root and '.git' not in root:
                        filepath = os.path.join(root, file)
                        try:
                            mtime = os.path.getmtime(filepath)
                            if current_time - mtime <= time_window:
                                content = cached_read_file(filepath)
                                rel_path = os.path.relpath(filepath, directory)
                                recent_changes[rel_path] = {
                                    'content': content,
                                    'modified': mtime
                                }
                        except Exception:
                            continue
        return recent_changes
    except Exception as e:
        return {"error": str(e)}
    
if __name__ == "__main__":
    print("Starting MCP server with efficient change tracking...", file=sys.stderr)
    
    observer = Observer()
    handler = CodeChangeHandler(mcp)
    observer.schedule(handler, ".", recursive=True)
    observer.start()
    
    try:
        mcp.run(transport="stdio")
    except KeyboardInterrupt:
        observer.stop()
    observer.join()