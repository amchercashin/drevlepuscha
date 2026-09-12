"""Rebuild the ranger in Blender 5.2 from the user's original Meshy ZIP.

blender --background --python tools/prepare-ranger.py -- --source /path/to/Meshy.zip
The editable blend and intermediate files stay under ignored tmp/ranger.
"""
import argparse, sys, zipfile
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1])
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=args.repo/'tmp'/'ranger'
root.mkdir(parents=True,exist_ok=True)
output=args.repo/'assets'/'characters'/'ranger'
output.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(args.source) as archive:
    for entry in archive.infolist():
        if entry.filename.endswith('.glb'):
            (root/Path(entry.filename).name).write_bytes(archive.read(entry))
import bpy, json, struct, pathlib, numpy as np
from mathutils import Matrix, Vector, Quaternion

def read_glb(path):
    raw=path.read_bytes(); n=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+n]),bytearray(raw[28+n:])
def accessor(g,data,i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    return np.frombuffer(data,dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']],count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape((-1,width))
for clip in ['Walking','Running']:
    g,data=read_glb(next(root.rglob(f'*{clip}*withSkin.glb')))
    joints=g['skins'][0]['joints']; nodes=g['nodes']; hips=next(i for i,n in enumerate(nodes) if n.get('name')=='spine')
    arm=next(i for i,n in enumerate(nodes) if n.get('name')=='Armature'); nodes[arm]['scale']=[1,1,1]
    for i in joints:
        factor=.01 if i==hips else .0001
        nodes[i]['translation']=[v*factor for v in nodes[i].get('translation',[0,0,0])]
    worlds={}
    def world(i):
        if i in worlds:return worlds[i]
        n=nodes[i];q=n.get('rotation',[0,0,0,1]);local=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
        parent=next((j for j,n in enumerate(nodes) if i in n.get('children',[])),None)
        worlds[i]=world(parent)@local if parent is not None else local
        return worlds[i]
    ibm=accessor(g,data,g['skins'][0]['inverseBindMatrices'])
    for k,i in enumerate(joints):ibm[k]=np.array(world(i).inverted()).T.flatten()
    for a in g['animations']:
        for ch in a['channels']:
            target=ch['target'];i=target['node'];path=target['path'];s=a['samplers'][ch['sampler']];arr=accessor(g,data,s['output'])
            if path=='translation':
                if i==hips:arr[:]*=.01
                else:arr[:]=nodes[i].get('translation',[0,0,0])
            elif path=='scale':arr[:]=1
    js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data+=b'\0'*((-len(data))%4)
    out=struct.pack('<III',0x46546c67,2,28+len(js)+len(data))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data
    (root/f'normalized-{clip}.glb').write_bytes(out)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'normalized-Walking.glb'))
for o in list(bpy.data.objects):
    if o.type=='MESH' and len(o.data.vertices)<100:bpy.data.objects.remove(o,do_unlink=True)
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.name='RangerRig'
bpy.context.scene.frame_set(1)
for b in rig.data.bones:print('REST',b.name,list(b.head_local))
bpy.ops.wm.save_as_mainfile(filepath=str(root/'normalized.blend'))


import bpy, math, pathlib, json
from mathutils import Matrix, Vector, Quaternion

bpy.ops.wm.open_mainfile(filepath=str(root/'normalized.blend'))
scene=bpy.context.scene;scene.render.fps=30
rig=bpy.data.objects['RangerRig'];mesh=next(o for o in bpy.data.objects if o.type=='MESH')
rig.animation_data_clear()
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
rig.data.pose_position='REST';bpy.context.view_layer.update()
# Widen the relaxed fingers slightly and soften the compressed tips without
# changing the character's sculpted gloves or attempting a new finger rig.
hand_groups={g.index for g in mesh.vertex_groups if g.name in ['hand.L','hand.R']}
for v in mesh.data.vertices:
    weight=sum(g.weight for g in v.groups if g.group in hand_groups)
    t=max(0,min(1,(.86-v.co.z)/.09))*weight
    if t:
        side=1 if v.co.x>0 else -1
        v.co.z-=.009*t
        v.co.x+=side*.003*t
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
heads={n:m.translation.copy() for n,m in rest.items()}
hierarchy=[b.name for b in rig.data.bones]
rig.data.pose_position='POSE'
I=Quaternion((1,0,0,0))
def rotation(axis,angle):return Quaternion(Vector(axis),angle)
def place(name,head,delta=I):
    m=delta.to_matrix().to_4x4()@rest[name];m.translation=head
    rig.pose.bones[name].matrix=m
    bpy.context.view_layer.update()
def aim(name,end_name,start,end):
    delta=(heads[end_name]-heads[name]).rotation_difference(end-start)
    place(name,start,delta)
    return delta
def solve_joint(start,end,l1,l2,pole):
    dvec=end-start;d=min(dvec.length,l1+l2-.001);d=max(d,abs(l1-l2)+.001)
    axis=dvec.normalized();end=start+axis*d
    a=(l1*l1-l2*l2+d*d)/(2*d);h=math.sqrt(max(0,l1*l1-a*a))
    bend=pole-axis*pole.dot(axis);bend.normalize()
    return start+axis*a+bend*h,end
def smooth(x):return x*x*(3-2*x)
def foot_cycle(p,running):
    stance=.40 if running else .62
    half=.43 if running else .29
    if p<stance:
        u=p/stance;forward=half*(1-2*u);lift=0
        pitch=.16*max(0,1-u*5)-.28*max(0,(u-.72)/.28)
    else:
        u=(p-stance)/(1-stance);forward=half*(2*smooth(u)-1)
        lift=(.23 if running else .085)*math.sin(math.pi*u)**1.5
        pitch=-.16*math.sin(math.pi*u)
    return forward,lift,pitch
def pose(phase,mode):
    running=mode=='Run';idle=mode=='Idle';a=phase*math.tau
    sway=(.004 if idle else .006)*math.sin(a)
    bob=(.0015 if idle else .010 if running else .005)*math.cos(2*a)
    # Feet are solved below the hips, with a small body drop at full extension.
    shift=Vector((sway,0,(-.052 if running else -.032 if not idle else -.01)+bob))
    lean=rotation((1,0,0),math.radians(6 if running else 1.5 if not idle else 0))
    hip_delta=rotation((0,0,1),(.025 if idle else .035)*math.sin(a))
    place('spine',heads['spine']+shift,hip_delta)
    torso=lean@rotation((0,0,1),(-.04 if running else -.02)*math.sin(a))
    pivot=heads['spine']
    upper={}
    for n in ['spine.001','spine.002','spine.003','spine.004','spine.005','shoulder.L','shoulder.R']:
        upper[n]=pivot+torso@(heads[n]-pivot)+shift
        place(n,upper[n],torso if n!='spine.005' else torso.slerp(I,.45))
    for side,sign,offset in [('L',1,0),('R',-1,.5)]:
        p=(phase+offset)%1
        forward,lift,pitch=(0,0,0) if idle else foot_cycle(p,running)
        thigh,shin,foot,toe=[f'{n}.{side}' for n in ['thigh','shin','foot','toe']]
        hip=heads['spine']+shift+hip_delta@(heads[thigh]-heads['spine'])
        target=Vector((sign*(.105 if running else .115),-.035-forward,.112+lift))
        knee,target=solve_joint(hip,target,(heads[shin]-heads[thigh]).length,(heads[foot]-heads[shin]).length,Vector((0,-1,0)))
        aim(thigh,shin,hip,knee);aim(shin,foot,knee,target)
        # Aim both boots down the travel line instead of keeping the source's
        # outward splay; retain the sole's vertical offset in the bind pose.
        bind_dir=heads[toe]-heads[foot]
        straight=Vector((sign*.009,-math.hypot(bind_dir.x,bind_dir.y),bind_dir.z))
        ankle_delta=rotation((1,0,0),pitch)@bind_dir.rotation_difference(straight)
        place(foot,target,ankle_delta);place(toe,target+ankle_delta@bind_dir,ankle_delta)
        arm,forearm,hand=[f'{n}.{side}' for n in ['upper_arm','forearm','hand']]
        shoulder=pivot+torso@(heads[arm]-pivot)+shift
        swing=0 if idle else math.cos((phase+offset)*math.tau)
        wrist=Vector((sign*(.29 if running else .285),-.12+(.14 if running else .115)*swing,1.04 if running else .91)) + shift
        elbow,wrist=solve_joint(shoulder,wrist,(heads[forearm]-heads[arm]).length,(heads[hand]-heads[forearm]).length,Vector((sign*.30,-1,-.2)))
        aim(arm,forearm,shoulder,elbow);lower=aim(forearm,hand,elbow,wrist)
        # Damped wrist motion and a small outward release at both palms.
        wrist_delta=lower.slerp(I,.48)@rotation((0,0,1),sign*math.radians(7))
        place(hand,wrist,wrist_delta)
    bpy.context.view_layer.update()
    # Place the lowest sole on the ground; retain the run's brief flight phase.
    evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    sole=min(v.co.z for v in evaluated.data.vertices)
    flight=0
    if running:
        p=phase% .5
        if p>.4:flight=.045*math.sin(math.pi*(p-.4)/.1)
    correction=.004+flight-sole
    corrected={n:rig.pose.bones[n].matrix.copy() for n in hierarchy}
    for n in hierarchy:
        m=corrected[n];m.translation.z+=correction
        rig.pose.bones[n].matrix=m;bpy.context.view_layer.update()

for mode,frames in [('Idle',90),('Walk',27),('Run',21)]:
    rig.animation_data_create();rig.animation_data.action=None
    for frame in range(frames+1):
        scene.frame_set(frame+1);pose(frame/frames,mode)
        for bone in rig.pose.bones:
            bone.rotation_mode='QUATERNION'
            bone.keyframe_insert('location',frame=frame+1,group=bone.name)
            bone.keyframe_insert('rotation_quaternion',frame=frame+1,group=bone.name)
    action=rig.animation_data.action;action.name=mode;action.use_fake_user=True
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='LINEAR'
    print('CREATED',mode,list(action.frame_range))
rig.animation_data.action=bpy.data.actions['Walk'];scene.frame_start=1;scene.frame_end=28;scene.frame_set(4)
# Blender file retains the full-resolution authored texture. Runtime export
# reduces image dimensions separately, so detailed source work stays editable.
for img in bpy.data.images:
    if img.source=='FILE':img.pack()
rig.show_in_front=True
mesh.name='RangerBody';mesh.data.name='RangerBodyMesh'
# Meshy supplied an emissive material: remove its self-lighting so the ranger
# receives the forest's sunlight, shade and night lighting like the environment.
for material in mesh.data.materials:
    if not material or not material.use_nodes:continue
    bsdf=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not bsdf:continue
    for name in ['Emission Color','Emission Strength']:
        socket=bsdf.inputs[name]
        for link in list(socket.links):material.node_tree.links.remove(link)
    bsdf.inputs['Emission Color'].default_value=(0,0,0,1)
    bsdf.inputs['Emission Strength'].default_value=0
    bsdf.inputs['Metallic'].default_value=0
    bsdf.inputs['Roughness'].default_value=.82
    bsdf.inputs['Specular IOR Level'].default_value=.5
    bsdf.inputs['IOR'].default_value=1.5
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig

rig.scale=(1.78/1.70,)*3
rig.animation_data.action=bpy.data.actions['Idle']
scene.frame_set(1)
bpy.data.orphans_purge(do_recursive=True)
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=2.8
        area.spaces.active.region_3d.view_location=Vector((0,0,.9))
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(root/'ranger.blend'),compress=True)
for image in bpy.data.images:
    if image.type=='IMAGE' and max(image.size)>2048:
        factor=2048/max(image.size)
        image.scale(round(image.size[0]*factor),round(image.size[1]*factor))
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True);mesh.select_set(True)
bpy.context.view_layer.objects.active=rig
with bpy.context.temp_override(window=bpy.context.window_manager.windows[0],active_object=rig,object=rig):
    bpy.ops.export_scene.gltf(filepath=str(output/'ranger.glb'),export_format='GLB',
        use_selection=True,export_animations=True,export_animation_mode='ACTIONS',
        export_frame_range=False,export_force_sampling=True,export_skins=True,
        export_image_format='JPEG',export_jpeg_quality=88)
print('RANGER_READY',str(output/'ranger.glb'),(output/'ranger.glb').stat().st_size)
