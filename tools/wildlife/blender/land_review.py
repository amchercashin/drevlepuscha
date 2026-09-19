import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];private=Path(args[0]).resolve();guide=json.loads(Path(args[1]).read_text());bpy.ops.wm.open_mainfile(filepath=str(private/'lod0-review.blend'))
mesh=bpy.data.objects[guide['meshName']];arm=bpy.data.objects['LandRig'];deps=bpy.context.evaluated_depsgraph_get();names=list(guide['clips']);moving=list(guide['locomotion']);poses=[(names[0],0),(moving[0],round(guide['fps']*guide['clips'][moving[0]]*.25)),(moving[0],round(guide['fps']*guide['clips'][moving[0]]*.75)),(moving[-1],round(guide['fps']*guide['clips'][moving[-1]]*.25))]
extent=guide.get('reviewSpacing',.75)
for i,(name,frame) in enumerate(poses):
    arm.animation_data.action=bpy.data.actions[name];bpy.context.scene.frame_set(frame);data=bpy.data.meshes.new_from_object(mesh.evaluated_get(deps));obj=bpy.data.objects.new(name+str(frame),data);bpy.context.collection.objects.link(obj);obj.location.x=(i-1.5)*extent;obj.rotation_euler.z=-math.pi/2
mesh.hide_render=True;arm.hide_render=True
center=Vector((0,0,guide.get('reviewHeight',.2)));cam_data=bpy.data.cameras.new('Review');cam=bpy.data.objects.new('Review',cam_data);bpy.context.collection.objects.link(cam);cam.location=center+Vector((0,-4,.7));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=extent*4.2;bpy.context.scene.camera=cam
for name,loc,power in [('Key',(-1,-2,3),180),('Fill',(1,-1,2),80)]:
    l=bpy.data.lights.new(name,'AREA');l.energy=power;l.size=3;obj=bpy.data.objects.new(name,l);bpy.context.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.world=bpy.data.worlds.new('Review world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.37,.32,1)
scene.render.resolution_x=1600;scene.render.resolution_y=500;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(private/'pose-review.png');scene.view_settings.view_transform='Standard';bpy.ops.render.render(write_still=True)
