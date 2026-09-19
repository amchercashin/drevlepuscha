"""Read-only inspection of the generated source, in a separate background Blender."""
import bpy, json, sys, math
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]; source=Path(args[0]).resolve(); out=Path(args[1]).resolve(); out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
report=[]
for o in meshes:
    p=[o.matrix_world@v.co for v in o.data.vertices]
    lo=[min(v[k] for v in p) for k in range(3)]; hi=[max(v[k] for v in p) for k in range(3)]
    report.append(dict(name=o.name,vertices=len(p),triangles=sum(len(f.vertices)-2 for f in o.data.polygons),min=lo,max=hi))
points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]; center=sum(points,Vector())/len(points)
lo=Vector([min(v[k] for v in points) for k in range(3)]);hi=Vector([max(v[k] for v in points) for k in range(3)]); center=(lo+hi)/2; extent=max(hi-lo)
cam_data=bpy.data.cameras.new('Inspection');cam=bpy.data.objects.new('Inspection',cam_data);bpy.context.collection.objects.link(cam)
cam.location=center+Vector((.4,-1.4,.65))*extent;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=extent*1.2;bpy.context.scene.camera=cam
for name,offset,power,size in [('Key',(-1,-2,3),450,3),('Fill',(2,-1,1),250,3)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size*extent;obj=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(obj);obj.location=center+Vector(offset)*extent;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.world=bpy.data.worlds.new('Inspection world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.4,.4,.4,1)
scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/'source-inspect.png');scene.view_settings.view_transform='Standard'
(out/'source-inspect.json').write_text(json.dumps(report,indent=2));bpy.ops.render.render(write_still=True)
