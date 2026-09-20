"""Blender background preparation. Raw downloads stay private; only normalized LODs ship.
Usage: blender -b --python tools/regions/prepare-visual-assets.py -- [asset-id ...]
"""
import bpy, sys, json, gzip, hashlib, math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/regions/brandywine-bridge/assets'
OUT.mkdir(parents=True, exist_ok=True)
RAW = ROOT / 'references/private/meshy-runs/brandywine-20260920'
# Canonical width, height, depth. Vegetation retains natural width at specified height.
SPECS = {
 'bridge-span': [18, 8, 6], 'bridge-abutment': [4, 6, 6], 'bridge-parapet': [9, 1.1, .4],
 'inn': [17,6,11], 'stable': [12,4,7], 'gate-post': [.5,3.2,.5], 'gate-leaf': [7,2.5,.28],
 'rowboat': [1.3,.7,3.5], 'shelter': [5,2.5,4], 'fishing-kit': [1.6,1,1.2], 'signpost': [.9,2.4,.2],
 'alder': [None,15,None], 'oak': [None,21,None], 'willow': [None,13,None],
 'hazel': [None,3,None], 'dogrose': [None,1.5,None], 'fallen-willow': [5,1.3,1.8], 'birch': [None,12,None]
}
FREE = {'grass-short': ('Grass_Common_Short',.42), 'grass-tall': ('Grass_Wispy_Tall',.75),
 'flowers-cream': ('Flower_3_Group',.55), 'flowers-blue': ('Flower_4_Group',.45), 'fern': ('Fern_1',.8)}
ids = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(SPECS)+list(FREE)
index_file = OUT/'index.json'
index = json.loads(index_file.read_text()) if index_file.exists() else {}
def round_values(values): return [round(float(x),5) for x in values]
for asset_id in ids:
 free = asset_id in FREE
 source = ROOT/'assets/vegetation/quaternius'/f'{FREE[asset_id][0]}.gltf' if free else RAW/f'{asset_id}.glb'
 if not source.exists(): continue
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(source))
 objects = [o for o in bpy.context.scene.objects if o.type=='MESH']
 # glTF Y-up -> Blender Z-up -> game Y-up; normalize all objects together.
 def game(p): return Vector((p.x,p.z,-p.y))
 points=[game(o.matrix_world@v.co) for o in objects for v in o.data.vertices]
 lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
 hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
 dims=hi-lo; target=[None,FREE[asset_id][1],None] if free else SPECS[asset_id]
 # Generated long bridge modules and boats may come with their long axis reversed.
 rotate = not free and ((asset_id.startswith('bridge-') and dims.z>dims.x) or (asset_id=='rowboat' and dims.x>dims.z))
 if rotate:
  def game(p): return Vector((-p.y,p.z,-p.x))
  points=[game(o.matrix_world@v.co) for o in objects for v in o.data.vertices]
  lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)));dims=hi-lo
 scale=Vector(tuple((target[i]/dims[i]) if target[i] else target[1]/dims.y for i in range(3)))
 centre=Vector(((lo.x+hi.x)/2,lo.y,(lo.z+hi.z)/2))
 materials=[]; material_indices={}
 for obj in objects:
  for mat in obj.data.materials:
   if mat.name in material_indices: continue
   material_indices[mat.name]=len(materials)
   images=[n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name!='Non-Color']
   tex=None
   if images:
    im=images[0]; limit=512 if free else 1024
    if max(im.size)>limit:
     ratio=limit/max(im.size);im.scale(max(1,int(im.size[0]*ratio)),max(1,int(im.size[1]*ratio)))
    # Preserve alpha for the CC0 plants; opaque Meshy assets use JPEG.
    fmt='PNG' if free else 'JPEG';ext='png' if free else 'jpg'
    tex=f'{asset_id}-{len(materials)}.{ext}';im.filepath_raw=str(OUT/tex);im.file_format=fmt;im.save()
   materials.append({'texture':tex,'doubleSided':not mat.use_backface_culling,'alpha':free})
 levels=[]
 for level,ratio in enumerate([1] if free else [1,.4,.28] if asset_id=='bridge-span' else [1,.28,.075]):
  parts=[]
  for obj in objects:
   work=obj.copy();work.data=obj.data.copy();bpy.context.collection.objects.link(work)
   if ratio<1:
    dec=work.modifiers.new('runtime-lod','DECIMATE');dec.ratio=ratio;dec.use_collapse_triangulate=True
   dep=bpy.context.evaluated_depsgraph_get();ev=work.evaluated_get(dep);mesh=ev.to_mesh();mesh.calc_loop_triangles()
   norm=work.matrix_world.to_3x3().inverted().transposed();uv=mesh.uv_layers.active
   vertex_colors=mesh.color_attributes.active_color
   for mi,mat in enumerate(work.data.materials):
    part={'material':material_indices[mat.name],'positions':[],'normals':[],'uvs':[],'colors':[],'indices':[]};lookup={}
    for tri in mesh.loop_triangles:
     if tri.material_index!=mi:continue
     for li in tri.loops:
      vi=mesh.loops[li].vertex_index;p=game(work.matrix_world@mesh.vertices[vi].co)-centre;p=Vector(tuple(p[i]*scale[i] for i in range(3)))
      normal=game(norm@mesh.corner_normals[li].vector);normal=Vector(tuple(normal[i]/scale[i] for i in range(3))).normalized()
      # Meshy coping stones are higher than its paving. Match the authored walk plane exactly.
      if asset_id=='bridge-span' and p.y>7.3:
       p.y=8
       if normal.y>.5: normal=Vector((0,1,0))
      texuv=(uv.data[li].uv.x,1-uv.data[li].uv.y) if uv else (0,0)
      color=tuple(vertex_colors.data[li if vertex_colors.domain=='CORNER' else vi].color) if vertex_colors else (1,1,1,1)
      # Muted meadow palette retains the source silhouette and UVs.
      values=round_values((*p,*normal,*texuv,*color));key=tuple(values)
      if key not in lookup:
       lookup[key]=len(part['positions'])//3;part['positions']+=values[:3];part['normals']+=values[3:6];part['uvs']+=values[6:8];part['colors']+=values[8:12]
      part['indices'].append(lookup[key])
    if part['indices']:parts.append(part)
   ev.to_mesh_clear();bpy.data.objects.remove(work,do_unlink=True)
  levels.append(parts)
 payload={'levels':levels,'materials':materials};raw=json.dumps(payload,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest()[:12]
 filename=f'{asset_id}-{digest}.json.pack';(OUT/filename).write_bytes(gzip.compress(raw,mtime=0))
 index[asset_id]={'data':filename,'triangles':[sum(len(p['indices'])//3 for p in l) for l in levels],
  'dimensions':round_values(tuple(dims[i]*scale[i] for i in range(3))),'sourceHash':hashlib.sha256(source.read_bytes()).hexdigest(),
  'source':'Quaternius Stylized Nature MegaKit Standard (CC0 1.0)' if free else 'Meshy 7; task provenance in meshy-jobs.json'}
 index_file.write_text(json.dumps(index,indent=2)+'\n',encoding='utf8')
 print('REGION_ASSET',asset_id,index[asset_id]['triangles'],flush=True)
