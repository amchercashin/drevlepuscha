import bpy,math
from mathutils import Vector,Quaternion,Matrix
from prepare import convert

def animate_land(arm,guide):
    scene=bpy.context.scene;fps=guide['fps'];scene.render.fps=fps;arm.animation_data_create();actions={};p=guide['landmarks']
    def rot(name,axis,degrees):
        b=arm.pose.bones[name];basis=b.bone.matrix_local.to_quaternion();b.rotation_quaternion=basis.inverted()@Quaternion(Vector(axis),math.radians(degrees))@basis
    def ik(limb,side,target,offset):
        names=[f'{limb}.{part}.{side}' for part in ['upper','lower','foot']];a,b,foot=[arm.pose.bones[n] for n in names];head=a.head.copy();cannon=arm.pose.bones.get(f'{limb}.cannon.{side}');goal=target-(cannon.bone.tail_local-cannon.bone.head_local) if cannon else target
        v=goal-head;d=max(1e-6,min(v.length,a.length+b.length-.00001));direction=v.normalized();pole=Vector((0,guide.get('kneePole',{}).get(limb,1),0));perp=(pole-direction*pole.dot(direction)).normalized()
        x=(a.length*a.length-b.length*b.length+d*d)/(2*d);knee=head+direction*x+perp*math.sqrt(max(0,a.length*a.length-x*x));end=head+direction*d
        for bone,h,t in [(a,head,knee),(b,knee,end)]:
            q=(bone.bone.tail_local-bone.bone.head_local).normalized().rotation_difference((t-h).normalized())@bone.bone.matrix_local.to_quaternion();bone.matrix=Matrix.Translation(h)@q.to_matrix().to_4x4();bpy.context.view_layer.update()
        if cannon:
            q=(cannon.bone.tail_local-cannon.bone.head_local).normalized().rotation_difference((target-end).normalized())@cannon.bone.matrix_local.to_quaternion();cannon.matrix=Matrix.Translation(end)@q.to_matrix().to_4x4();bpy.context.view_layer.update();end=cannon.tail.copy()
        foot.matrix=Matrix.Translation(end)@foot.bone.matrix_local.to_quaternion().to_matrix().to_4x4()
    for name,duration in guide['clips'].items():
        action=bpy.data.actions.new(name);action.use_fake_user=True;arm.animation_data.action=action;steps=round(duration*fps)
        for f in range(steps+1):
            phase=f/steps;scene.frame_set(f)
            for b in arm.pose.bones:b.rotation_mode='QUATERNION';b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
            moving=name in guide['locomotion'];offset=Vector((0,0,0))
            if moving:
                settings=guide['locomotion'][name];offset.z=-guide.get('crouchM',.025)+(.008*math.sin(phase*2*math.pi) if name=='climb_up' else .014*math.cos(phase*4*math.pi))
                hips=arm.pose.bones['hips'];hips.location=hips.bone.matrix_local.to_quaternion().inverted()@offset
                bpy.context.view_layer.update()
                for limb in ['front','rear']:
                    for side,sign in [('L',1),('R',-1)]:
                        shift=guide.get('gaitOffsets',{}).get(name,{}).get(limb+side,(0 if limb=='front' else .5)+(0 if side=='L' else (.08 if name=='bound_ground' else .5)));t=(phase+shift)%1;stance=settings['stance'];stroke=settings['speedMps']*duration*stance
                        if t<stance:y=-stroke/2+stroke*t/stance;lift=0
                        else:u=(t-stance)/(1-stance);y=stroke/2-stroke*(u*u*(3-2*u));lift=settings['liftM']*math.sin(math.pi*u)
                        point=convert(p[limb+'Ankle'],guide);point.x*=sign;point.y+=y;point.z+=lift;ik(limb,side,point,offset)
            else:
                rot('head',(0,0,1),math.sin(phase*2*math.pi)*(5 if name in ['forage_idle','trunk_idle'] else 12))
                if name=='mount_trunk':rot('neck',(1,0,0),-12*math.sin(phase*math.pi))
                elif name=='forage_idle':rot('neck',(1,0,0),7*math.sin(phase*math.pi)**2)
            if guide['species']=='roe-deer':
                rot('head',(0,0,1),guide.get('headNeutralYaw',0)+(math.sin(phase*2*math.pi)*5 if name=='alert' else 0))
                if name=='graze_idle':rot('neck',(1,0,0),65+15*math.sin(phase*math.pi)**2)
            for i in range(len(p['tail'])-1):rot(f'tail.{i}',(0,0,1),math.sin(phase*2*math.pi-i*.2)*(2 if not moving else 3))
            for side,sign in [('L',1),('R',-1)]:rot('ear.'+side,(0,1,0),sign*math.sin(phase*2*math.pi)*3)
            for b in arm.pose.bones:
                if b.name!='root':
                    for prop in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=prop,frame=f,group=b.name)
        actions[name]=action
    arm.animation_data.action=next(iter(actions.values()));scene.frame_set(0);return actions
