"""Private geometry/weight review: actual exported LOD0 poses, no game camera changes."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
private=Path(sys.argv[sys.argv.index('--')+1]).resolve();bpy.ops.wm.open_mainfile(filepath=str(private/'lod0-review.blend'))
mesh=bpy.data.objects['WoodlandBird'];arm=bpy.data.objects['BirdRig'];deps=bpy.context.evaluated_depsgraph_get()
poses=[('perch_idle',0),('takeoff',10),('fly_loop',3),('fly_loop',9)]
for i,(name,frame) in enumerate(poses):
    arm.animation_data.action=bpy.data.actions[name];bpy.context.scene.frame_set(frame)
    data=bpy.data.meshes.new_from_object(mesh.evaluated_get(deps));obj=bpy.data.objects.new(name+str(frame),data);bpy.context.collection.objects.link(obj);obj.location.x=(i-1.5)*.57
mesh.hide_render=True;arm.hide_render=True
cam_data=bpy.data.cameras.new('Review');cam=bpy.data.objects.new('Review',cam_data);bpy.context.collection.objects.link(cam);cam.location=(.5,-2,1.0);center=Vector((0,0,.08));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.35;bpy.context.scene.camera=cam
for name,loc,power in [('Key',(-1,-2,3),180),('Fill',(1,-1,2),80)]:
    l=bpy.data.lights.new(name,'AREA');l.energy=power;l.size=3;obj=bpy.data.objects.new(name,l);bpy.context.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.world=bpy.data.worlds.new('Review world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.37,.32,1)
scene.render.resolution_x=1600;scene.render.resolution_y=500;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(private/'pose-review.png');scene.view_settings.view_transform='Standard';bpy.ops.render.render(write_still=True)
