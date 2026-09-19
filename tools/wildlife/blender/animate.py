import bpy,math
from mathutils import Quaternion,Vector
def animate(arm,guide):
    fps=guide['fps'];scene=bpy.context.scene;scene.render.fps=fps;arm.animation_data_create();actions={}
    def rotation(name,axis,degrees,combine=False):
        bone=arm.pose.bones[name];basis=bone.bone.matrix_local.to_quaternion();q=Quaternion(Vector(axis),math.radians(degrees));bone.rotation_mode='QUATERNION';local=basis.inverted()@q@basis;bone.rotation_quaternion=local@bone.rotation_quaternion if combine else local
    for name,duration in guide['clips'].items():
        action=bpy.data.actions.new(name);action.use_fake_user=True;arm.animation_data.action=action;steps=round(duration*fps)
        for f in range(steps+1):
            t=f/fps;phase=f/max(1,steps)
            for bone in arm.pose.bones:bone.rotation_mode='QUATERNION';bone.rotation_quaternion=(1,0,0,0);bone.location=(0,0,0);bone.scale=(1,1,1)
            if name in ['perch_idle','alert']:
                fold=1;flap=0;lean=0
                rotation('head',(0,0,1),math.sin(phase*2*math.pi)*(9 if name=='perch_idle' else 17))
                rotation('head',(1,0,0),-5 if name=='alert' else math.sin(phase*4*math.pi)*2,True)
                rotation('tail',(1,0,0),math.sin(phase*2*math.pi)*2)
            elif name=='takeoff':
                unfold=min(1,phase/.45);unfold=unfold*unfold*(3-2*unfold);fold=1-unfold;flap=math.sin(max(0,phase-.3)/.7*2*math.pi)*42;lean=35*unfold
                rotation('head',(1,0,0),-18*unfold)
            else:
                fold=0;flap=math.sin(phase*2*math.pi)*42;lean=35;rotation('head',(1,0,0),-18)
            rotation('body',(1,0,0),lean)
            rotation('tail',(1,0,0),25*fold+(math.sin(phase*2*math.pi)*2 if name=='perch_idle' else 0))
            for suffix,sign in [('L',1),('R',-1)]:
                rotation('wing.'+suffix,(0,0,1),sign*guide['foldDegrees'][0]*fold)
                bone=arm.pose.bones['wing.'+suffix];basis=bone.bone.matrix_local.to_quaternion();bone.rotation_quaternion=(basis.inverted()@Quaternion((0,1,0),math.radians(sign*(flap+85*fold)))@basis)@bone.rotation_quaternion
                bone.rotation_quaternion=(basis.inverted()@Quaternion((1,0,0),math.radians(-25*fold))@basis)@bone.rotation_quaternion
                rotation('forewing.'+suffix,(0,0,1),sign*guide['foldDegrees'][1]*fold)
                rotation('primaries.'+suffix,(0,0,1),sign*guide['foldDegrees'][2]*fold)
                # A compact feather fan closes along its length, avoiding a 165-degree skin fold.
                arm.pose.bones['forewing.'+suffix].scale.y=1-.5*fold
                arm.pose.bones['primaries.'+suffix].scale.y=1-.3*fold
                rotation('leg.'+suffix,(1,0,0),-40*(1-fold));rotation('foot.'+suffix,(1,0,0),35*(1-fold))
            for bone in arm.pose.bones:
                if bone.name!='root':bone.keyframe_insert(data_path='rotation_quaternion',frame=f,group=bone.name);bone.keyframe_insert(data_path='scale',frame=f,group=bone.name)
        actions[name]=action
    arm.animation_data.action=actions['perch_idle'];scene.frame_set(0);return actions
