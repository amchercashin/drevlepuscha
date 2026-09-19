import bpy
from mathutils import Vector
from prepare import convert
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def rig(mesh,points,guide):
    data=bpy.data.armatures.new('BirdDeform');arm=bpy.data.objects.new('BirdRig',data);bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm;mesh.select_set(False);arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,head,tail,parent=None):
        b=data.edit_bones.new(name);b.head=convert(head,guide);b.tail=convert(tail,guide)
        if parent:b.parent=data.edit_bones[parent]
    p=guide['landmarks'];bone('root',(0,0,guide['sourceGroundZ']),(0,0,guide['sourceGroundZ']+.06));bone('body',p['body'],(0,-.01,.08),'root');bone('head',p['head'],(0,-.15,.28),'body');bone('tail',p['tail'],(0,.33,-.14),'body')
    for suffix,sign in [('L',1),('R',-1)]:
        side=lambda v:(v[0]*sign,v[1],v[2])
        bone('wing.'+suffix,side(p['shoulder']),side(p['elbow']),'body');bone('forewing.'+suffix,side(p['elbow']),side(p['wrist']),'wing.'+suffix);bone('primaries.'+suffix,side(p['wrist']),side(p['tip']),'forewing.'+suffix)
        bone('leg.'+suffix,side(p['leg']),side(p['foot']),'body');bone('foot.'+suffix,side(p['foot']),(sign*.09,-.15,-.30),'leg.'+suffix)
    bpy.ops.object.mode_set(mode='OBJECT')
    groups={b.name:mesh.vertex_groups.new(name=b.name) for b in data.bones}
    for i,(x,y,z) in enumerate(points):
        a=abs(x);side='L' if x>=0 else 'R';weights={'body':1.0}
        if a>.13 and z>-.10:
            if a<.23:
                t=smooth(.13,.23,a);weights={'body':1-t,'wing.'+side:t}
            elif a<.38:
                t=smooth(.27,.38,a);weights={'wing.'+side:1-t,'forewing.'+side:t}
            else:
                t=smooth(.48,.60,a);weights={'forewing.'+side:1-t,'primaries.'+side:t}
        elif z<-.11 and y<.12:
            t=smooth(-.25,-.29,z);weights={'leg.'+side:1-t,'foot.'+side:t}
        elif y>.12 and z<.06:
            t=smooth(.12,.21,y);weights={'body':1-t,'tail':t}
        elif z>.11:
            t=smooth(.11,.22,z);weights={'body':1-t,'head':t}
        for name,weight in weights.items():
            if weight>0:groups[name].add([i],weight,'REPLACE')
    modifier=mesh.modifiers.new('BirdSkin','ARMATURE');modifier.object=arm;mesh.parent=arm
    return arm
