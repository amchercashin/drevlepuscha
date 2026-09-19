import bpy
from mathutils import Vector
def prepare(source, guide):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name=guide.get('meshName','WoodlandBird')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=0.000001);bpy.ops.object.mode_set(mode='OBJECT')
    source_points=[v.co.copy() for v in mesh.data.vertices]
    for v in mesh.data.vertices:v.co=convert(v.co,guide)
    for p in mesh.data.polygons:p.use_smooth=True
    for material in mesh.data.materials:
        material.name=guide.get('meshName','WoodlandBird')+'_atlas';material.use_backface_culling=False
        bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=1
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image:
                node.image.scale(guide['textureSize'],guide['textureSize']);node.image.file_format='PNG';node.image.pack()
    return mesh,source_points
def convert(point,guide):
    return Vector((point[0],point[1],point[2]-guide['sourceGroundZ']))*guide['sourceUnitsToMetres']
