"""Run with runpy.run_path through Blender MCP in an open Blender session."""

from pathlib import Path
import math
import shutil
import sys

from mathutils import Matrix

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import convert_blender

convert_blender.AXIS = Matrix.Diagonal((-1, 1, 1, 1)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
output = SOURCE / 'converted'
report = convert_blender.import_weapon(SOURCE / 'fixed_v_ak47.mdl', output)
destination = SOURCE.parents[1] / 'assets/scene/weapons/ak47-view.glb'
destination.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(output / 'fixed_v_ak47.glb', destination)
shutil.copy2(output / 'fixed_v_ak47.json', SOURCE / 'conversion.json')
shutil.copy2(output / 'fixed_v_ak47.blend', SOURCE / 'ak47.blend')
result = {'output': str(destination), 'conversion': report}
