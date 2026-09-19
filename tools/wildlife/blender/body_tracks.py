import bpy,json,sys
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:];private=Path(args[0]).resolve();guide=json.loads(Path(args[1]).read_text());bpy.ops.wm.open_mainfile(filepath=str(private/'lod0-review.blend'));mesh=bpy.data.objects[guide['meshName']];arm=bpy.data.objects['LandRig'];deps=bpy.context.evaluated_depsgraph_get();tracks={}
for clip in ['bound_ground','mount_trunk','climb_up']:
 arm.animation_data.action=bpy.data.actions[clip];poses=[]
 for frame in range(round(guide['fps']*guide['clips'][clip])+1):
  bpy.context.scene.frame_set(frame);obj=mesh.evaluated_get(deps);geometry=obj.to_mesh();poses.append([[round(v.co[k],6) for k in range(3)] for v in geometry.vertices]);obj.to_mesh_clear()
 tracks[clip]=poses
(private/'body-tracks.json').write_text(json.dumps({'fps':guide['fps'],'clips':tracks},separators=(',',':')));print('body tracks saved')
