import bpy,json,sys,hashlib,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from prepare import prepare
from land_rig import rig_land
from land_animate import animate_land
args=sys.argv[sys.argv.index('--')+1:];source=Path(args[0]).resolve();guide_path=Path(args[1]).resolve();guide=json.loads(guide_path.read_text());private=source.parent;root=Path(__file__).resolve().parents[3];output=root/'public/wildlife'/guide['species'];output.mkdir(parents=True,exist_ok=True)
mesh,points=prepare(source,guide);arm=rig_land(mesh,points,guide);actions=animate_land(arm,guide);bpy.ops.wm.save_as_mainfile(filepath=str(private/'rig.blend'))
original=mesh.data.copy();reports=[];deps=bpy.context.evaluated_depsgraph_get()
for lod,target in enumerate(guide['lodTriangles']):
    mesh.data=original.copy();bpy.context.view_layer.objects.active=mesh;arm.select_set(False);mesh.select_set(True)
    mod=mesh.modifiers.new('LOD reduction','DECIMATE');mod.ratio=target/sum(len(p.vertices)-2 for p in mesh.data.polygons);bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=mesh.modifiers.new('Final triangles','TRIANGULATE');bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name)
    arm.select_set(True);bpy.context.view_layer.objects.active=arm;bounds={};contacts={}
    for name,action in actions.items():
        arm.animation_data.action=action;lo=[float('inf')]*3;hi=[float('-inf')]*3;foot_min=[]
        for frame in range(round(guide['clips'][name]*guide['fps'])+1):
            bpy.context.scene.frame_set(frame);evaluated=mesh.evaluated_get(deps);geometry=evaluated.to_mesh()
            for v in geometry.vertices:
                if not all(math.isfinite(x) for x in v.co):raise ValueError('Nonfinite deformation')
                for k in range(3):lo[k]=min(lo[k],v.co[k]);hi[k]=max(hi[k],v.co[k])
            foot_min.append(min(v.co.z for v in geometry.vertices));evaluated.to_mesh_clear()
        bounds[name]={'min':lo,'max':hi};contacts[name]={'minimumVertexZ':min(foot_min),'maximumLowestVertexZ':max(foot_min)}
    arm.animation_data.action=next(iter(actions.values()));bpy.context.scene.frame_set(0)
    if lod==0:bpy.ops.wm.save_as_mainfile(filepath=str(private/'lod0-review.blend'))
    path=output/f'lod{lod}.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_anim_slide_to_zero=True,export_skins=True,export_def_bones=True,export_leaf_bone=False,export_image_format='AUTO',export_yup=True)
    reports.append({'lod':lod,'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'animationBoundsBlender':bounds,'contacts':contacts,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(private/'export-report.json').write_text(json.dumps({'species':guide['species'],'blender':bpy.app.version_string,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rigGuideSha256':hashlib.sha256(guide_path.read_bytes()).hexdigest(),'lods':reports},indent=2));print('LAND_EXPORT',json.dumps(reports))
