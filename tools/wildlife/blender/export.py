import bpy,json,sys,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from prepare import prepare
from rig import rig
from animate import animate
args=sys.argv[sys.argv.index('--')+1:];source=Path(args[0]).resolve();private=source.parent;root=Path(__file__).resolve().parents[3];guide=json.loads((root/'config/wildlife/bird-rig-guide.json').read_text());output=root/'public/wildlife/woodland-bird';output.mkdir(parents=True,exist_ok=True)
mesh,points=prepare(source,guide);arm=rig(mesh,points,guide);actions=animate(arm,guide)
bpy.ops.wm.save_as_mainfile(filepath=str(private/'bird-rig.blend'))
original=mesh.data.copy();reports=[];deps=bpy.context.evaluated_depsgraph_get();envelopes={};import math
for lod,target in enumerate(guide['lodTriangles']):
    mesh.data=original.copy();bpy.context.view_layer.objects.active=mesh;arm.select_set(False);mesh.select_set(True)
    mod=mesh.modifiers.new('LOD reduction','DECIMATE');mod.ratio=target/sum(len(p.vertices)-2 for p in mesh.data.polygons);bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name)
    triangulate=mesh.modifiers.new('Final triangles','TRIANGULATE');bpy.ops.object.modifier_move_up(modifier=triangulate.name);bpy.ops.object.modifier_apply(modifier=triangulate.name)
    arm.select_set(True);bpy.context.view_layer.objects.active=arm;arm.animation_data.action=actions['perch_idle'];bpy.context.scene.frame_set(0)
    bounds={};contacts={}
    for name,action in actions.items():
        arm.animation_data.action=action;lo=[float('inf')]*3;hi=[float('-inf')]*3
        for f in range(round(guide['clips'][name]*guide['fps'])+1):
            bpy.context.scene.frame_set(f);evaluated=mesh.evaluated_get(deps);evaluated_mesh=evaluated.to_mesh()
            for v in evaluated_mesh.vertices:
                if not all(__import__('math').isfinite(x) for x in v.co):raise ValueError('Nonfinite deformed vertex')
                for k in range(3):lo[k]=min(lo[k],v.co[k]);hi[k]=max(hi[k],v.co[k])
            envelope=envelopes.setdefault(name,{}).setdefault(f,{})
            for poly in evaluated_mesh.polygons:
                ps=[evaluated_mesh.vertices[i].co for i in poly.vertices];bottom=math.floor(min(p.z for p in ps)/.02);top=math.floor(max(p.z for p in ps)/.02);radius=max(math.hypot(p.x,p.y) for p in ps)
                for band in range(bottom,top+1):envelope[band]=max(envelope.get(band,0),radius)
            evaluated.to_mesh_clear()
        bounds[name]={'min':lo,'max':hi}
    arm.animation_data.action=actions['perch_idle'];bpy.context.scene.frame_set(0)
    if lod==0:bpy.ops.wm.save_as_mainfile(filepath=str(private/'lod0-review.blend'))
    path=output/f'lod{lod}.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_anim_slide_to_zero=True,export_skins=True,export_def_bones=True,export_leaf_bone=False,export_image_format='AUTO',export_yup=True)
    reports.append({'lod':lod,'targetTriangles':target,'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'animationBoundsBlender':bounds,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(private/'export-report.json').write_text(json.dumps({'blender':bpy.app.version_string,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'lods':reports},indent=2))
(root/'config/wildlife/bird-envelope.json').write_text(json.dumps({'fps':guide['fps'],'clips':{name:[{'frame':f,'bands':[{'bottom':round(b*.02,4),'top':round((b+1)*.02,4),'radius':round(r+.002,5)} for b,r in sorted(bands.items())]} for f,bands in sorted(frames.items())] for name,frames in envelopes.items()}},separators=(',',':'))+'\n')
print('WILDLIFE_EXPORT',json.dumps(reports))
