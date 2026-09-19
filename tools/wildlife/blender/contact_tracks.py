import bpy,json,sys
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:];private=Path(args[0]).resolve();guide=json.loads(Path(args[1]).read_text());lod=int(args[2]) if len(args)>2 else 0;bpy.ops.wm.open_mainfile(filepath=str(private/('rig.blend' if lod else 'lod0-review.blend')))
mesh=bpy.data.objects[guide['meshName']];arm=bpy.data.objects['LandRig'];deps=bpy.context.evaluated_depsgraph_get();groups={g.index:g.name for g in mesh.vertex_groups};feet={}
if lod:
 bpy.context.view_layer.objects.active=mesh;arm.select_set(False);mesh.select_set(True);mod=mesh.modifiers.new('LOD reduction','DECIMATE');mod.ratio=guide['lodTriangles'][lod]/sum(len(p.vertices)-2 for p in mesh.data.polygons);bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name);mod=mesh.modifiers.new('Final triangles','TRIANGULATE');bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name)
for limb in ['front','rear']:
 for side in ['L','R']:
  name=f'{limb}.foot.{side}';indices=[v.index for v in mesh.data.vertices if v.co.z<.045 and any(groups[g.group]==name and g.weight>.3 for g in v.groups)]
  if not indices:raise ValueError('Missing foot vertices '+name)
  feet[name]=indices
tracks={}
for name in guide['locomotion']:
 arm.animation_data.action=bpy.data.actions[name];poses=[]
 for f in range(round(guide['clips'][name]*guide['fps'])+1):
  bpy.context.scene.frame_set(f);obj=mesh.evaluated_get(deps);geometry=obj.to_mesh();pose={}
  for foot,indices in feet.items():
   points=[geometry.vertices[i].co for i in indices];z=min(p.z for p in points);low=[p for p in points if p.z<z+.004];pose[foot]=[sum(p[k] for p in low)/len(low) for k in range(3)]
  poses.append(pose);obj.to_mesh_clear()
 tracks[name]=poses
(private/('contact-tracks.json' if lod==0 else f'contact-tracks-lod{lod}.json')).write_text(json.dumps({'fps':guide['fps'],'clips':tracks}));print('Contact vertices', {k:len(v) for k,v in feet.items()})
