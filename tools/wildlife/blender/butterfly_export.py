import bpy,sys,json,math,hashlib
from pathlib import Path
from mathutils import Quaternion,Vector
sys.path.insert(0,str(Path(__file__).parent));from prepare import prepare
root=Path(__file__).resolve().parents[3];source=root/'.artwork/wildlife/butterfly-01/source.glb';private=source.parent;guide=json.loads((root/'config/wildlife/butterfly-rig-guide.json').read_text(encoding='utf-8-sig'));mesh,_=prepare(source,guide)
data=bpy.data.armatures.new('ButterflyDeform');arm=bpy.data.objects.new('ButterflyRig',data);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;mesh.select_set(False);arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
b=data.edit_bones.new('root');b.head=(0,0,0);b.tail=(0,.01,0)
for name,sign in [('wing.L',1),('wing.R',-1)]:
 b=data.edit_bones.new(name);b.head=(sign*.003,0,.0043);b.tail=(sign*.04,0,.0043);b.parent=data.edit_bones['root']
bpy.ops.object.mode_set(mode='OBJECT');groups={n:mesh.vertex_groups.new(name=n) for n in ['root','wing.L','wing.R']}
for v in mesh.data.vertices:
 w=max(0,min(1,(abs(v.co.x)-.003)/.005));groups['root'].add([v.index],1-w,'REPLACE');groups['wing.L' if v.co.x>0 else 'wing.R'].add([v.index],w,'REPLACE')
mod=mesh.modifiers.new('Skin','ARMATURE');mod.object=arm;mesh.parent=arm;arm.animation_data_create();action=bpy.data.actions.new('flutter');action.use_fake_user=True;arm.animation_data.action=action;bpy.context.scene.render.fps=guide['fps']
for frame in range(9):
 bpy.context.scene.frame_set(frame)
 for name,sign in [('wing.L',-1),('wing.R',1)]:
  bone=arm.pose.bones[name];basis=bone.bone.matrix_local.to_quaternion();bone.rotation_mode='QUATERNION';bone.rotation_quaternion=basis.inverted()@Quaternion(Vector((0,1,0)),math.radians(sign*(25+45*math.sin(frame/8*2*math.pi))))@basis
 for bone in arm.pose.bones:
  for prop in ['location','rotation_quaternion','scale']:bone.keyframe_insert(data_path=prop,frame=frame,group=bone.name)
bpy.context.scene.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str(private/'rig.blend'));bpy.context.view_layer.objects.active=mesh;mesh.select_set(True);arm.select_set(False)
mod=mesh.modifiers.new('Game reduction','DECIMATE');mod.ratio=guide['triangles']/sum(len(p.vertices)-2 for p in mesh.data.polygons);bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name);mod=mesh.modifiers.new('Triangles','TRIANGULATE');bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name)
arm.select_set(True);bpy.context.view_layer.objects.active=arm;out=root/'public/wildlife/woodland-butterfly/model.glb';out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_anim_slide_to_zero=True,export_skins=True,export_def_bones=True,export_leaf_bone=False,export_image_format='AUTO',export_yup=True)
(private/'export-report.json').write_text(json.dumps({'species':guide['species'],'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blender':bpy.app.version_string,'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'bytes':out.stat().st_size},indent=2));print('Butterfly exported')
